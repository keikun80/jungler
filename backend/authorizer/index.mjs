import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { parseCookies } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const SESSIONS_TABLE = process.env.USER_SESSIONS_TABLE || "UserSessions";

export const handler = async (event) => {
  try {
    const cookies = parseCookies(event);
    const sessionId = cookies.jungle_session;

    if (!sessionId) {
      console.log("Authorizer: No jungle_session cookie found.");
      return {
        isAuthorized: false
      };
    }

    const res = await docClient.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId }
      })
    );

    const session = res.Item;
    if (!session) {
      console.log(`Authorizer: Session '${sessionId.substring(0, 8)}...' not found in DynamoDB.`);
      return {
        isAuthorized: false
      };
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (session.expiresAt && session.expiresAt < nowInSeconds) {
      console.log(`Authorizer: Session '${sessionId.substring(0, 8)}...' expired.`);
      return {
        isAuthorized: false
      };
    }

    return {
      isAuthorized: true,
      context: {
        account: session.account || "",
        arn: session.arn || "",
        userId: session.userId || "",
        region: session.region || "ap-northeast-2"
      }
    };
  } catch (err) {
    console.error("Authorizer error:", err);
    return {
      isAuthorized: false
    };
  }
};
