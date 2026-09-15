import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { buildResponse, parseCookies } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const SESSIONS_TABLE = process.env.USER_SESSIONS_TABLE || "UserSessions";

export const handler = async (event) => {
  try {
    const cookies = parseCookies(event);
    const sessionId = cookies.jungle_session;

    if (!sessionId) {
      return buildResponse(401, {
        authenticated: false,
        message: "세션 쿠키가 존재하지 않습니다."
      }, {}, event);
    }

    const res = await docClient.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId }
      })
    );

    const session = res.Item;
    if (!session) {
      return buildResponse(401, {
        authenticated: false,
        message: "세션이 만료되었거나 유효하지 않습니다."
      }, {}, event);
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (session.expiresAt && session.expiresAt < nowInSeconds) {
      return buildResponse(401, {
        authenticated: false,
        message: "세션이 만료되었습니다. 다시 로그인해주세요."
      }, {}, event);
    }

    return buildResponse(200, {
      authenticated: true,
      user: {
        account: session.account,
        arn: session.arn,
        userId: session.userId,
        region: session.region || "ap-northeast-2"
      },
      expiresAt: session.expiresAt ? new Date(session.expiresAt * 1000).toISOString() : null
    }, {}, event);
  } catch (err) {
    console.error("Error in /auth/me:", err);
    return buildResponse(500, { message: "Internal server error", error: err.message }, {}, event);
  }
};
