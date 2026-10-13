import { DeleteSnapshotCommand } from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { buildResponse, getEc2Client, recordAuditLog } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || "SgAuditLogs";

export const handler = async (event) => {
  try {
    const ec2Client = await getEc2Client(event);

    const body = JSON.parse(event.body || "{}");
    const { snapshotId, volumeId } = body;

    if (!snapshotId) {
      return buildResponse(400, { message: "snapshotId is required" });
    }

    // 1. Delete the EBS snapshot
    await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapshotId }));

    // 2. Log the successful action to DynamoDB + S3 Object Lock
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: snapshotId,
      action: "DELETE_SNAPSHOT",
      details: {
        snapshotId,
        volumeId: volumeId || "unknown",
        reason: "orphan",
        message: `Orphan snapshot ${snapshotId} (source volume: ${volumeId || "unknown"}) was deleted successfully.`
      },
      status: "SUCCESS",
      event
    });

    return buildResponse(200, {
      message: "Snapshot deleted successfully",
      snapshotId
    });

  } catch (error) {
    console.error("Error deleting orphan snapshot:", error);

    const body = (() => {
      try { return JSON.parse(event.body || "{}"); } catch { return {}; }
    })();
    const snapshotId = body.snapshotId || "UNKNOWN";
    const volumeId = body.volumeId || "unknown";

    // Log the failed action
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: snapshotId,
      action: "DELETE_SNAPSHOT",
      details: {
        snapshotId,
        volumeId,
        reason: "orphan",
        error: error.message,
        message: `Failed to delete snapshot ${snapshotId}`
      },
      status: "FAILED",
      event
    });

    return buildResponse(500, { message: "Failed to delete snapshot", error: error.message });
  }
};
