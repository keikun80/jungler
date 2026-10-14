import {
  DescribeNetworkInterfacesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupRulesCommand,
  DescribeSecurityGroupsCommand
} from "@aws-sdk/client-ec2";
import { buildResponse, getEc2Client } from "../utils.mjs";

/**
 * Classifies an ENI into a high-level AWS resource representation
 * (EC2, ALB, NLB, RDS, Lambda, VPC Endpoint, NAT Gateway, etc.)
 */
export function parseEniResource(eni, instanceMap = {}) {
  const desc = eni.Description || "";
  const ifaceType = eni.InterfaceType || "interface";
  const instanceId = eni.Attachment?.InstanceId;

  // 1. EC2 Instance
  if (instanceId) {
    const inst = instanceMap[instanceId];
    const nameTag = inst?.Tags?.find((t) => t.Key === "Name")?.Value;
    return {
      resourceType: "EC2",
      typeLabel: "EC2 Instance",
      icon: "server",
      resourceId: instanceId,
      resourceName: nameTag || instanceId,
      details: inst ? `${inst.State?.Name || "unknown"} (${inst.InstanceType || "N/A"})` : "Attached",
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 2. Application / Network / Classic Load Balancers
  if (
    desc.startsWith("ELB app/") ||
    desc.startsWith("ELB net/") ||
    desc.startsWith("ELB gwy/") ||
    desc.startsWith("ELB ") ||
    ifaceType === "network_load_balancer" ||
    ifaceType === "gateway_load_balancer"
  ) {
    let lbType = "ELB";
    let lbName = desc;
    if (desc.startsWith("ELB app/")) {
      lbType = "ALB";
      const parts = desc.split("/");
      lbName = parts[1] || desc;
    } else if (desc.startsWith("ELB net/") || ifaceType === "network_load_balancer") {
      lbType = "NLB";
      const parts = desc.split("/");
      lbName = parts[1] || desc;
    } else if (desc.startsWith("ELB gwy/") || ifaceType === "gateway_load_balancer") {
      lbType = "GWLB";
      const parts = desc.split("/");
      lbName = parts[1] || desc;
    } else {
      lbName = desc.replace(/^ELB\s+/, "");
    }

    return {
      resourceType: lbType,
      typeLabel: lbType === "ALB" ? "Application Load Balancer" : (lbType === "NLB" ? "Network Load Balancer" : "Elastic Load Balancer"),
      icon: "network",
      resourceId: lbName,
      resourceName: lbName,
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 3. RDS Database / Aurora
  if (desc.includes("RDSNetworkInterface") || desc.toLowerCase().includes("rds")) {
    return {
      resourceType: "RDS",
      typeLabel: "RDS Database",
      icon: "database",
      resourceId: eni.NetworkInterfaceId,
      resourceName: desc || "RDS Instance / Cluster",
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 4. AWS Lambda (VPC Integration)
  if (desc.includes("AWS Lambda VPC ENI") || ifaceType === "lambda") {
    return {
      resourceType: "Lambda",
      typeLabel: "Lambda Function (VPC)",
      icon: "zap",
      resourceId: eni.NetworkInterfaceId,
      resourceName: "Lambda VPC Interface",
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 5. VPC Endpoint (PrivateLink)
  if (ifaceType === "vpc_endpoint" || desc.includes("VPC Endpoint Interface")) {
    const vpceMatch = desc.match(/vpce-[0-9a-f]+/);
    const vpceId = vpceMatch ? vpceMatch[0] : eni.NetworkInterfaceId;
    return {
      resourceType: "VPCEndpoint",
      typeLabel: "VPC Endpoint (PrivateLink)",
      icon: "plug",
      resourceId: vpceId,
      resourceName: vpceId,
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 6. NAT Gateway
  if (ifaceType === "nat_gateway" || desc.includes("NAT Gateway")) {
    const natMatch = desc.match(/nat-[0-9a-f]+/);
    const natId = natMatch ? natMatch[0] : eni.NetworkInterfaceId;
    return {
      resourceType: "NATGateway",
      typeLabel: "NAT Gateway",
      icon: "arrow-up-right",
      resourceId: natId,
      resourceName: natId,
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 7. ElastiCache
  if (desc.toLowerCase().includes("elasticache")) {
    return {
      resourceType: "ElastiCache",
      typeLabel: "ElastiCache Cluster",
      icon: "layers",
      resourceId: eni.NetworkInterfaceId,
      resourceName: desc || "ElastiCache Node",
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // 8. Redshift
  if (desc.toLowerCase().includes("redshift")) {
    return {
      resourceType: "Redshift",
      typeLabel: "Redshift Cluster",
      icon: "hard-drive",
      resourceId: eni.NetworkInterfaceId,
      resourceName: desc || "Redshift Node",
      details: desc,
      privateIp: eni.PrivateIpAddress || "-",
      networkInterfaceId: eni.NetworkInterfaceId,
      status: eni.Status || "in-use",
      subnetId: eni.SubnetId || "-",
      vpcId: eni.VpcId || "-"
    };
  }

  // Fallback: Generic Network Interface
  const fallbackName = desc || eni.NetworkInterfaceId;
  return {
    resourceType: "ENI",
    typeLabel: ifaceType !== "interface" ? ifaceType : "Network Interface",
    icon: "cpu",
    resourceId: eni.NetworkInterfaceId,
    resourceName: fallbackName,
    details: desc || ifaceType,
    privateIp: eni.PrivateIpAddress || "-",
    networkInterfaceId: eni.NetworkInterfaceId,
    status: eni.Status || "in-use",
    subnetId: eni.SubnetId || "-",
    vpcId: eni.VpcId || "-"
  };
}

export const handler = async (event) => {
  const sgId = event.pathParameters?.id;
  const targetRoleArn = event.headers?.["x-target-role-arn"] || event.headers?.["X-Target-Role-Arn"] || "";
  const region = event.headers?.["x-target-region"] || event.headers?.["X-Target-Region"] || process.env.AWS_REGION || "ap-northeast-2";
  const logs = [];

  const addLog = (msg, level = "INFO") => {
    const timestamp = new Date().toISOString();
    logs.push(`[${timestamp}] [${level}] ${msg}`);
  };

  try {
    if (!sgId || !/^sg-[0-9a-f]+$/i.test(sgId.trim())) {
      addLog(`Validation failed: Invalid Security Group ID '${sgId}'`, "ERROR");
      return buildResponse(400, {
        message: "Invalid or missing Security Group ID (id)",
        logs
      });
    }

    const targetSgId = sgId.trim();
    addLog(`Initiating inspection for Security Group: ${targetSgId}`);
    addLog(`Target Account Role: ${targetRoleArn ? targetRoleArn : "Local Hub Account"}, Region: ${region}`);

    const ec2Client = await getEc2Client(event);
    addLog(`EC2Client successfully initialized`);

    // 1. Fetch Network Interfaces (ENIs) using this Security Group
    addLog(`Calling ec2:DescribeNetworkInterfaces with filter group-id=${targetSgId}...`);
    const eniRes = await ec2Client.send(
      new DescribeNetworkInterfacesCommand({
        Filters: [{ Name: "group-id", Values: [targetSgId] }]
      })
    );
    const enis = eniRes.NetworkInterfaces || [];
    addLog(`Found ${enis.length} Network Interface(s) attached to ${targetSgId}`);

    // 2. Fetch EC2 Instance metadata if any instances are attached
    const instanceIds = enis
      .map((e) => e.Attachment?.InstanceId)
      .filter(Boolean);

    const instanceMap = {};
    if (instanceIds.length > 0) {
      const uniqueIds = [...new Set(instanceIds)];
      addLog(`Querying EC2 instance metadata for ${uniqueIds.length} instance(s): ${uniqueIds.join(", ")}`);
      try {
        const instRes = await ec2Client.send(
          new DescribeInstancesCommand({ InstanceIds: uniqueIds })
        );
        for (const res of instRes.Reservations || []) {
          for (const inst of res.Instances || []) {
            instanceMap[inst.InstanceId] = inst;
          }
        }
        addLog(`Successfully retrieved metadata for ${Object.keys(instanceMap).length} instance(s)`);
      } catch (err) {
        addLog(`Could not describe instances details: ${err.message}`, "WARN");
      }
    }

    // 3. Classify all connected ENIs
    const connectedResources = enis.map((eni) => parseEniResource(eni, instanceMap));
    addLog(`Classified ${connectedResources.length} connected resource(s)`);

    // 4. Check if other Security Groups reference this Security Group in their rules
    let referencedByRules = [];
    try {
      addLog(`Checking cross-group references for ${targetSgId}...`);

      // Inbound references
      const inboundSgRes = await ec2Client.send(
        new DescribeSecurityGroupsCommand({
          Filters: [{ Name: "ip-permission.group-id", Values: [targetSgId] }]
        })
      );
      for (const sg of inboundSgRes.SecurityGroups || []) {
        for (const rule of sg.IpPermissions || []) {
          const matchedPair = (rule.UserIdGroupPairs || []).find((p) => p.GroupId === targetSgId);
          if (matchedPair) {
            referencedByRules.push({
              ruleId: `${sg.GroupId}-in-${rule.IpProtocol}-${rule.FromPort || "all"}`,
              groupId: sg.GroupId,
              groupName: sg.GroupName,
              isEgress: false,
              direction: "Inbound",
              ipProtocol: rule.IpProtocol === "-1" ? "All" : rule.IpProtocol,
              fromPort: rule.FromPort === -1 || rule.FromPort == null ? "All" : rule.FromPort,
              toPort: rule.ToPort === -1 || rule.ToPort == null ? "All" : rule.ToPort,
              description: matchedPair.Description || rule.Description || ""
            });
          }
        }
      }

      // Outbound references
      const outboundSgRes = await ec2Client.send(
        new DescribeSecurityGroupsCommand({
          Filters: [{ Name: "egress.ip-permission.group-id", Values: [targetSgId] }]
        })
      );
      for (const sg of outboundSgRes.SecurityGroups || []) {
        for (const rule of sg.IpPermissionsEgress || []) {
          const matchedPair = (rule.UserIdGroupPairs || []).find((p) => p.GroupId === targetSgId);
          if (matchedPair) {
            referencedByRules.push({
              ruleId: `${sg.GroupId}-out-${rule.IpProtocol}-${rule.FromPort || "all"}`,
              groupId: sg.GroupId,
              groupName: sg.GroupName,
              isEgress: true,
              direction: "Outbound",
              ipProtocol: rule.IpProtocol === "-1" ? "All" : rule.IpProtocol,
              fromPort: rule.FromPort === -1 || rule.FromPort == null ? "All" : rule.FromPort,
              toPort: rule.ToPort === -1 || rule.ToPort == null ? "All" : rule.ToPort,
              description: matchedPair.Description || rule.Description || ""
            });
          }
        }
      }

      addLog(`Found ${referencedByRules.length} rule(s) referencing ${targetSgId}`);
    } catch (err) {
      addLog(`Could not check referencing security groups: ${err.message}`, "WARN");
    }

    const isInUse = connectedResources.length > 0 || referencedByRules.length > 0;
    addLog(`Inspection complete. Result: isInUse=${isInUse}, resources=${connectedResources.length}, references=${referencedByRules.length}`);

    return buildResponse(200, {
      sgId: targetSgId,
      isInUse,
      totalConnectedResources: connectedResources.length,
      totalReferencingRules: referencedByRules.length,
      resources: connectedResources,
      referencedByRules,
      logs
    });
  } catch (error) {
    console.error(`Error fetching resources for security group ${sgId}:`, error);
    addLog(`AWS API Call Failed: [${error.name || "Error"}] ${error.message}`, "ERROR");
    if (error.message?.includes("DescribeNetworkInterfaces")) {
      addLog(`TROUBLESHOOTING: Target IAM role '${targetRoleArn || "Default"}' is missing permission 'ec2:DescribeNetworkInterfaces'. Please update the spoke IAM role policy (./scripts/setup-all-spokes.sh).`, "ERROR");
    }
    return buildResponse(500, {
      message: "Failed to fetch security group connected resources",
      error: error.message,
      errorCode: error.name || error.Code || "InternalError",
      targetSgId: sgId,
      targetRoleArn: targetRoleArn || "local",
      logs
    });
  }
};
