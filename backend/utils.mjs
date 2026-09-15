import { EC2Client } from "@aws-sdk/client-ec2";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let localEc2Client = null;
let localS3Client = null;

function getLocalS3Client() {
  if (!localS3Client) {
    localS3Client = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
  }
  return localS3Client;
}

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
  const timestamp = new Date().toISOString();
  const safeSgId = sgId || "UNKNOWN";
  const detailsObj = typeof details === "object" ? details : { raw: details || "" };
  const detailsStr = typeof details === "object" ? JSON.stringify(details) : (details || "");

  // 1. Record to DynamoDB for fast UI querying
  if (docClient && tableName) {
    try {
      const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            sgId: safeSgId,
            timestamp,
            action,
            status,
            details: detailsStr
          }
        })
      );
    } catch (err) {
      console.error(`Failed to record audit log to DynamoDB [${action}] (${status}):`, err.message);
    }
  }

  // 2. Record to S3 with Object Lock for immutable WORM compliance
  const auditBucket = process.env.AUDIT_LOG_BUCKET;
  if (auditBucket) {
    try {
      const s3Client = getLocalS3Client();
      const date = new Date(timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const sanitizedSgId = safeSgId.replace(/[^a-zA-Z0-9-_]/g, "_");
      const sanitizedAction = (action || "ACTION").replace(/[^a-zA-Z0-9-_]/g, "_");
      const sanitizedStatus = (status || "UNKNOWN").replace(/[^a-zA-Z0-9-_]/g, "_");
      const timeFormatted = timestamp.replace(/[:.]/g, "-");
      const s3Key = `audit-logs/year=${year}/month=${month}/day=${day}/${sanitizedSgId}_${timeFormatted}_${sanitizedAction}_${sanitizedStatus}.json`;

      const logPayload = {
        sgId: safeSgId,
        timestamp,
        action,
        status,
        details: detailsObj,
        recordedAt: new Date().toISOString()
      };

      await s3Client.send(
        new PutObjectCommand({
          Bucket: auditBucket,
          Key: s3Key,
          Body: JSON.stringify(logPayload, null, 2),
          ContentType: "application/json"
        })
      );
      console.log(`Successfully archived audit log to S3 with Object Lock: s3://${auditBucket}/${s3Key}`);
    } catch (s3Err) {
      console.error(`Failed to record audit log to S3 [${action}] (${status}):`, s3Err.message);
    }
  }
}
