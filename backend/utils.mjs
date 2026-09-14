import { EC2Client } from "@aws-sdk/client-ec2";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

let localEc2Client = null;

export async function getAwsClient(ClientClass, event) {
  const targetRoleArn = event.headers?.["x-target-role-arn"] || event.headers?.["X-Target-Role-Arn"];
  const region = event.headers?.["x-target-region"] || event.headers?.["X-Target-Region"] || process.env.AWS_REGION || "ap-northeast-2";

  if (!targetRoleArn) {
    return new ClientClass({ region });
  }

  // Security Validation: Enforce exact role ARN pattern to prevent unauthorized assume role injection
  const roleArnPattern = /^arn:aws:iam::\d{12}:role\/JungleToolsCrossAccountRole$/;
  const trimmedRoleArn = targetRoleArn.trim();
  if (!roleArnPattern.test(trimmedRoleArn)) {
    console.error(`Security Violation: Unauthorized or malformed targetRoleArn '${targetRoleArn}'`);
    throw new Error("Invalid or unauthorized target role ARN.");
  }

  try {
    console.log(`Assuming role: ${trimmedRoleArn} in region: ${region} for ${ClientClass.name}`);
    const stsClient = new STSClient({ region });
    const assumeRoleResponse = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: trimmedRoleArn,
        RoleSessionName: "JungleToolsSession",
        DurationSeconds: 900
      })
    );

    const credentials = assumeRoleResponse.Credentials;
    return new ClientClass({
      region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken
      }
    });
  } catch (error) {
    console.error(`Failed to assume role ${targetRoleArn}:`, error);
    throw new Error(`Failed to assume target role: ${error.message}`);
  }
}

export async function getEc2Client(event) {
  return getAwsClient(EC2Client, event);
}

export function isValidSlackWebhookUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "hooks.slack.com") return false;
    if (
      !parsed.pathname.startsWith("/services/") &&
      !parsed.pathname.startsWith("/workflows/") &&
      !parsed.pathname.startsWith("/triggers/")
    ) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

export function areAllValidEmails(emailString) {
  if (!emailString || typeof emailString !== "string") return false;
  const list = emailString
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  if (list.length === 0) return false;
  return list.every((email) => isValidEmail(email));
}

export function buildResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Target-Role-Arn,X-Target-Region"
    },
    body: JSON.stringify(body)
  };
}
export async function recordAuditLog(docClient, tableName, { sgId, action, details, status = "SUCCESS" }) {
  if (!docClient || !tableName) return;
  try {
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    const timestamp = new Date().toISOString();
    const detailsStr = typeof details === "object" ? JSON.stringify(details) : (details || "");
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          sgId: sgId || "UNKNOWN",
          timestamp,
          action,
          status,
          details: detailsStr
        }
      })
    );
  } catch (err) {
    console.error(`Failed to record audit log [${action}] (${status}):`, err.message);
  }
}
