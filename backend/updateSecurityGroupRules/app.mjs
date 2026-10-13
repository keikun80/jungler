import {
  DescribeSecurityGroupsCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  RevokeSecurityGroupEgressCommand
} from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { buildResponse, getEc2Client, recordAuditLog } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || "SgAuditLogs";

export const handler = async (event) => {
  const sgId = event.pathParameters?.id;
  try {
    const ec2Client = await getEc2Client(event);
    if (!sgId) {
      return buildResponse(400, { message: "Security Group ID (id) path parameter is missing" });
    }

    if (!event.body) {
      return buildResponse(400, { message: "Request body is missing" });
    }

    const { inboundRules, outboundRules } = JSON.parse(event.body);
    if (!Array.isArray(inboundRules) || !Array.isArray(outboundRules)) {
      return buildResponse(400, { message: "inboundRules and outboundRules must be arrays" });
    }

    // 0. Fetch existing rules to enable full replacement & rollback
    const descResult = await ec2Client.send(new DescribeSecurityGroupsCommand({
      GroupIds: [sgId]
    }));
    const sg = descResult.SecurityGroups?.[0];
    if (!sg) {
      return buildResponse(404, { message: `Security Group ${sgId} not found.` });
    }
    const oldInbound = sg.IpPermissions || [];
    const oldOutbound = sg.IpPermissionsEgress || [];

    // 1. Map frontend rule structure to AWS EC2 IpPermission objects with strict validation
    const mapRules = (rules, ruleTypeName) => {
      return rules.map((r, idx) => {
        const ruleNum = idx + 1;
        const rawProtocol = (r.ipProtocol || "tcp").toLowerCase().trim();
        const fromP = Number(r.fromPort);
        const toP = Number(r.toPort);

        const ipPerm = {
          IpProtocol: rawProtocol
        };

        if (rawProtocol === "-1" || rawProtocol === "all") {
          ipPerm.IpProtocol = "-1";
        } else if (rawProtocol === "tcp" || rawProtocol === "udp") {
          if (isNaN(fromP) || fromP < 0 || fromP > 65535) {
            throw new Error(`${ruleTypeName} #${ruleNum}: 시작 포트(From Port)는 0~65535 사이의 유효한 정수여야 합니다. (입력값: ${r.fromPort})`);
          }
          if (isNaN(toP) || toP < 0 || toP > 65535) {
            throw new Error(`${ruleTypeName} #${ruleNum}: 종료 포트(To Port)는 0~65535 사이의 유효한 정수여야 합니다. (입력값: ${r.toPort})`);
          }
          if (fromP > toP) {
            throw new Error(`${ruleTypeName} #${ruleNum}: 시작 포트(${fromP})는 종료 포트(${toP})보다 클 수 없습니다.`);
          }
          ipPerm.FromPort = fromP;
          ipPerm.ToPort = toP;
        } else if (rawProtocol === "icmp") {
          ipPerm.FromPort = !isNaN(fromP) ? fromP : -1;
          ipPerm.ToPort = !isNaN(toP) ? toP : -1;
        } else {
          ipPerm.IpProtocol = rawProtocol;
          if (!isNaN(fromP) && !isNaN(toP)) {
            ipPerm.FromPort = fromP;
            ipPerm.ToPort = toP;
          }
        }

        if (r.ipRanges && Array.isArray(r.ipRanges) && r.ipRanges.length > 0) {
          const validRanges = r.ipRanges.filter(ip => ip && typeof ip.cidrIp === "string" && ip.cidrIp.trim().length > 0);
          if (validRanges.length > 0) {
            ipPerm.IpRanges = validRanges.map((ip) => ({
              CidrIp: ip.cidrIp.trim(),
              Description: ip.description || ""
            }));
          }
        }

        if (r.ipv6Ranges && Array.isArray(r.ipv6Ranges) && r.ipv6Ranges.length > 0) {
          const validIpv6 = r.ipv6Ranges.filter(ip => ip && typeof ip.cidrIpv6 === "string" && ip.cidrIpv6.trim().length > 0);
          if (validIpv6.length > 0) {
            ipPerm.Ipv6Ranges = validIpv6.map((ip) => ({
              CidrIpv6: ip.cidrIpv6.trim(),
              Description: ip.description || ""
            }));
          }
        }

        if (r.prefixListIds && Array.isArray(r.prefixListIds) && r.prefixListIds.length > 0) {
          const validPrefixes = r.prefixListIds.filter(ip => ip && typeof ip.prefixListId === "string" && ip.prefixListId.trim().length > 0);
          if (validPrefixes.length > 0) {
            ipPerm.PrefixListIds = validPrefixes.map((ip) => ({
              PrefixListId: ip.prefixListId.trim(),
              Description: ip.description || ""
            }));
          }
        }

        if (r.userIdGroupPairs && Array.isArray(r.userIdGroupPairs) && r.userIdGroupPairs.length > 0) {
          const validPairs = r.userIdGroupPairs.filter(pair => pair && typeof pair.groupId === "string" && pair.groupId.trim().length > 0);
          if (validPairs.length > 0) {
            ipPerm.UserIdGroupPairs = validPairs.map((pair) => ({
              GroupId: pair.groupId.trim(),
              Description: pair.description || ""
            }));
          }
        }

        if (!ipPerm.IpRanges && !ipPerm.Ipv6Ranges && !ipPerm.PrefixListIds && !ipPerm.UserIdGroupPairs) {
          ipPerm.IpRanges = [{ CidrIp: "0.0.0.0/0", Description: r.description || "" }];
        }

        return ipPerm;
      });
    };

    // 2. Validate & construct new rules
    let newInbound = [];
    let newOutbound = [];
    try {
      newInbound = mapRules(inboundRules, "인바운드");
      newOutbound = mapRules(outboundRules, "아웃바운드");
    } catch (valErr) {
      return buildResponse(400, { message: valErr.message });
    }

    // 3. DryRun validation: verify that all new rules are valid in AWS EC2
    try {
      if (newInbound.length > 0) {
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
          GroupId: sgId,
          IpPermissions: newInbound,
          DryRun: true
        }));
      }
      if (newOutbound.length > 0) {
        await ec2Client.send(new AuthorizeSecurityGroupEgressCommand({
          GroupId: sgId,
          IpPermissions: newOutbound,
          DryRun: true
        }));
      }
    } catch (dryErr) {
      if (dryErr.name !== "DryRunOperation" && !dryErr.message?.includes("DryRun flag is set") && dryErr.name !== "InvalidPermission.Duplicate") {
        console.error("DryRun authorization check failed:", dryErr);
        return buildResponse(400, { message: `보안 그룹 규칙 검증 오류: ${dryErr.message}`, error: dryErr.message });
      }
    }

    // 4. Safe Apply: Revoke old rules & Apply new rules with Rollback Protection
    try {
      if (oldInbound.length > 0) {
        await ec2Client.send(new RevokeSecurityGroupIngressCommand({
          GroupId: sgId,
          IpPermissions: oldInbound
        }));
      }
      if (oldOutbound.length > 0) {
        await ec2Client.send(new RevokeSecurityGroupEgressCommand({
          GroupId: sgId,
          IpPermissions: oldOutbound
        }));
      }

      if (newInbound.length > 0) {
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
          GroupId: sgId,
          IpPermissions: newInbound
        }));
      }
      if (newOutbound.length > 0) {
        await ec2Client.send(new AuthorizeSecurityGroupEgressCommand({
          GroupId: sgId,
          IpPermissions: newOutbound
        }));
      }
    } catch (applyErr) {
      console.error("Failed to apply new rules, rolling back to previous rules:", applyErr);
      try {
        if (oldInbound.length > 0) {
          await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpPermissions: oldInbound
          }));
        }
        if (oldOutbound.length > 0) {
          await ec2Client.send(new AuthorizeSecurityGroupEgressCommand({
            GroupId: sgId,
            IpPermissions: oldOutbound
          }));
        }
      } catch (rollbackErr) {
        console.error("Critical: Rollback also failed:", rollbackErr);
      }

      // Log FAILED status with rollback details to DynamoDB
      await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
        sgId,
        action: "UPDATE_RULES",
        details: {
          error: applyErr.message,
          rollback: "RESTORED_TO_PREVIOUS_RULES",
          before: { inbound: oldInbound, outbound: oldOutbound },
          attempted: { inbound: newInbound, outbound: newOutbound }
        },
        status: "FAILED",
        event
      });

      return buildResponse(500, { message: `보안 그룹 규칙 적용 실패 (기존 규칙으로 복구됨): ${applyErr.message}`, error: applyErr.message });
    }

    // 5. Log SUCCESS changes to DynamoDB
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId,
      action: "UPDATE_RULES",
      details: {
        before: { inbound: oldInbound, outbound: oldOutbound },
        after: { inbound: newInbound, outbound: newOutbound }
      },
      status: "SUCCESS",
      event
    });

    return buildResponse(200, {
      message: "Security Group rules updated successfully",
      sgId,
      inboundRules: newInbound,
      outboundRules: newOutbound
    });

  } catch (error) {
    console.error("Error updating security group rules:", error);

    // Log general failure
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: sgId || "UNKNOWN",
      action: "UPDATE_RULES",
      details: { error: error.message },
      status: "FAILED",
      event
    });

    return buildResponse(500, { message: "Failed to update security group rules", error: error.message });
  }
};
