import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { buildResponse, parseCookies } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const SESSIONS_TABLE = process.env.USER_SESSIONS_TABLE || "UserSessions";

export const handler = async (event) => {
  try {
    const cookies = parseCookies(event);
    const sessionId = cookies.jungle_session;

    if (sessionId) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: SESSIONS_TABLE,
            Key: { sessionId }
          })
        );
      } catch (ddbErr) {
        console.warn("Failed to delete session from DynamoDB:", ddbErr.message);
      }
    }

    // Clear cookie header
    const clearCookieHeader = "jungle_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0";

    return buildResponse(
      200,
      {
        authenticated: false,
        message: "성공적으로 로그아웃되었습니다."
      },
      {
        "Set-Cookie": clearCookieHeader
      },
      event
    );
  } catch (err) {
    console.error("Error during logout:", err);
    return buildResponse(500, { message: "Internal server error during logout", error: err.message }, {}, event);
  }
};
