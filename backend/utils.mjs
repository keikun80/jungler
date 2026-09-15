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

export function isValidRoleArn(arn) {
  if (!arn || typeof arn !== "string") return false;
  const roleArnPattern = /^arn:aws:iam::\d{12}:role\/JungleToolsCrossAccountRole$/;
  return roleArnPattern.test(arn.trim());
}

export async function getAwsClient(ClientClass, event) {
  const targetRoleArn = event.headers?.["x-target-role-arn"] || event.headers?.["X-Target-Role-Arn"];
  const region = event.headers?.["x-target-region"] || event.headers?.["X-Target-Region"] || process.env.AWS_REGION || "ap-northeast-2";

  if (!targetRoleArn) {
    return new ClientClass({ region });
  }

  // Security Validation: Enforce exact role ARN pattern to prevent unauthorized assume role injection
  const trimmedRoleArn = targetRoleArn.trim();
  if (!isValidRoleArn(trimmedRoleArn)) {
    console.error(`Security Violation: Unauthorized or malformed targetRoleArn '${targetRoleArn}'`);
    throw new Error("Invalid or unauthorized target role ARN.");
  }

  try {
    console.log(`Assuming role: ${trimmedRoleArn} in region: ${region} for ${ClientClass.name}`);
    const stsClient = new STSClient({ region });
    const externalId = process.env.CROSS_ACCOUNT_EXTERNAL_ID;
    const assumeRoleParams = {
      RoleArn: trimmedRoleArn,
      RoleSessionName: "JungleToolsSession",
      DurationSeconds: 900,
      ...(externalId && { ExternalId: externalId })
    };
    const assumeRoleResponse = await stsClient.send(
      new AssumeRoleCommand(assumeRoleParams)
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

export function parseCookies(event) {
  const cookies = {};
  if (Array.isArray(event?.cookies)) {
    event.cookies.forEach((c) => {
      if (!c) return;
      const parts = c.split(";");
      const [name, ...valParts] = parts[0].split("=");
      if (name) cookies[name.trim()] = decodeURIComponent(valParts.join("=").trim());
    });
  } else {
    const rawCookie = event?.headers?.cookie || event?.headers?.Cookie || "";
    rawCookie.split(";").forEach((c) => {
      if (!c) return;
      const [name, ...valParts] = c.split("=");
      if (name) cookies[name.trim()] = decodeURIComponent(valParts.join("=").trim());
    });
  }
  return cookies;
}

export function buildResponse(statusCode, body, customHeaders = {}, event = null) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Target-Role-Arn,X-Target-Region,Cookie",
      ...customHeaders
    },
    body: JSON.stringify(body)
  };
}

export async function recordAuditLog(docClient, tableName, { sgId, action, details, status = "SUCCESS" }) {
  const timestamp = new Date().toISOString();
  const safeSgId = sgId || "UNKNOWN";
  const detailsObj = typeof details === "object" ? details : { raw: details || "" };
  const detailsStr = typeof details === "object" ? JSON.stringify(details) : (details || "");

  const auditBucket = process.env.AUDIT_LOG_BUCKET;
  let s3Key = null;
  let s3Location = null;

  if (auditBucket) {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const sanitizedSgId = safeSgId.replace(/[^a-zA-Z0-9-_]/g, "_");
    const sanitizedAction = (action || "ACTION").replace(/[^a-zA-Z0-9-_]/g, "_");
    const sanitizedStatus = (status || "UNKNOWN").replace(/[^a-zA-Z0-9-_]/g, "_");
    const timeFormatted = timestamp.replace(/[:.]/g, "-");
    s3Key = `audit-logs/year=${year}/month=${month}/day=${day}/${sanitizedSgId}_${timeFormatted}_${sanitizedAction}_${sanitizedStatus}.json`;
    s3Location = `s3://${auditBucket}/${s3Key}`;
  }

  // 1. Record to DynamoDB for fast UI querying
  if (docClient && tableName) {
    try {
      const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
      const ddbItem = {
        sgId: safeSgId,
        timestamp,
        action,
        status,
        details: detailsStr
      };
      if (s3Location) {
        ddbItem.s3Location = s3Location;
        ddbItem.s3Key = s3Key;
        ddbItem.s3Bucket = auditBucket;
      }
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: ddbItem
        })
      );
    } catch (err) {
      console.error(`Failed to record audit log to DynamoDB [${action}] (${status}):`, err.message);
    }
  }

  // 2. Record to S3 with Object Lock for immutable WORM compliance
  if (auditBucket && s3Key) {
    try {
      const s3Client = getLocalS3Client();
      const logPayload = {
        sgId: safeSgId,
        timestamp,
        action,
        status,
        details: detailsObj,
        s3Location,
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
      console.log(`Successfully archived audit log to S3 with Object Lock: ${s3Location}`);
    } catch (s3Err) {
      console.error(`Failed to record audit log to S3 [${action}] (${status}):`, s3Err.message);
    }
  }
}
