import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { buildResponse } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || "SgAuditLogs";

export async function fetchAllAuditLogs(client = docClient, tableName = AUDIT_LOG_TABLE, options = {}) {
  const { limit = 100, sgId = null, maxScanItems = 2000 } = options;
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const scanParams = {
      TableName: tableName
    };
    if (sgId) {
      scanParams.FilterExpression = "sgId = :sgId";
      scanParams.ExpressionAttributeValues = { ":sgId": sgId };
    }
    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await client.send(new ScanCommand(scanParams));
    if (result.Items && result.Items.length > 0) {
      items.push(...result.Items);
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey && items.length < maxScanItems);

  // Sort items by timestamp descending (newest first)
  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return limit ? items.slice(0, limit) : items;
}

export const handler = async (event) => {
  try {
    const limitParam = parseInt(event?.queryStringParameters?.limit, 10);
    const limit = (!isNaN(limitParam) && limitParam > 0) ? Math.min(limitParam, 500) : 100;
    const sgId = event?.queryStringParameters?.sgId || null;

    const items = await fetchAllAuditLogs(docClient, AUDIT_LOG_TABLE, { limit, sgId });

    return buildResponse(200, { logs: items }, {}, event);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return buildResponse(500, { message: "Failed to fetch audit logs", error: error.message }, {}, event);
  }
};
