import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";
import { buildResponse } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const SESSIONS_TABLE = process.env.USER_SESSIONS_TABLE || "UserSessions";

export const handler = async (event) => {
  try {
    let body = {};
    if (event.body) {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    }

    const { accessKeyId, secretAccessKey, sessionToken, region = "ap-northeast-2" } = body;

    if (!accessKeyId || !secretAccessKey) {
      return buildResponse(400, {
        message: "AWS Access Key ID와 Secret Access Key는 필수 항목입니다."
      }, {}, event);
    }

    // 1. Verify credentials via AWS STS GetCallerIdentity
    const stsCredentials = {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      ...(sessionToken && { sessionToken: sessionToken.trim() })
    };

    let callerIdentity;
    try {
      const sts = new STSClient({ region, credentials: stsCredentials });
      callerIdentity = await sts.send(new GetCallerIdentityCommand({}));
    } catch (stsErr) {
      console.error("STS verification failed:", stsErr.message);
      return buildResponse(401, {
        message: `AWS 자격 증명 검증 실패: ${stsErr.message}`
      }, {}, event);
    }

    // 2. Generate secure 256-bit session token
    const sessionId = crypto.randomBytes(32).toString("hex");
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const ttlHours = 8;
    const expiresAt = nowInSeconds + ttlHours * 3600;

    const userProfile = {
      account: callerIdentity.Account,
      arn: callerIdentity.Arn,
      userId: callerIdentity.UserId,
      region
    };

    // 3. Save session in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: {
          sessionId,
          account: callerIdentity.Account,
          arn: callerIdentity.Arn,
          userId: callerIdentity.UserId,
          region,
          createdAt: new Date().toISOString(),
          expiresAt
        }
      })
    );

    // 4. Return HttpOnly, Secure, SameSite=None session cookie
    const cookieHeader = `jungle_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${ttlHours * 3600}`;

    return buildResponse(
      200,
      {
        authenticated: true,
        user: userProfile,
        expiresAt: new Date(expiresAt * 1000).toISOString()
      },
      {
        "Set-Cookie": cookieHeader
      },
      event
    );
  } catch (err) {
    console.error("Error during login:", err);
    return buildResponse(500, { message: "Internal server error during login", error: err.message }, {}, event);
  }
};
