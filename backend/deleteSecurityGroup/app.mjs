import { DeleteSecurityGroupCommand } from "@aws-sdk/client-ec2";
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

    // 1. Delete Security Group in AWS EC2
    await ec2Client.send(new DeleteSecurityGroupCommand({ GroupId: sgId }));

    // 2. Log the successful action to DynamoDB
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId,
      action: "DELETE",
      details: { message: `Security Group ${sgId} was deleted successfully.` },
      status: "SUCCESS",
      event
    });

    return buildResponse(200, {
      message: "Security group deleted successfully",
      sgId
    });

  } catch (error) {
    console.error("Error deleting security group:", error);

    // Log the failed action to DynamoDB
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: sgId || "UNKNOWN",
      action: "DELETE",
      details: { error: error.message, message: `Failed to delete Security Group ${sgId || "UNKNOWN"}` },
      status: "FAILED",
      event
    });

    return buildResponse(500, { message: "Failed to delete security group", error: error.message });
  }
};
