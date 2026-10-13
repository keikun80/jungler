import {
  EC2Client,
  DescribeImagesCommand,
  DeregisterImageCommand,
  DeleteSnapshotCommand
} from "@aws-sdk/client-ec2";
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
    const { imageId, deleteSnapshots = true } = body;

    if (!imageId) {
      return buildResponse(400, { message: "imageId is required" });
    }

    // 1. Fetch AMI details to find associated snapshot IDs before deregistering
    let snapshotIds = [];
    let imageName = imageId;
    try {
      const imgData = await ec2Client.send(
        new DescribeImagesCommand({ ImageIds: [imageId] })
      );
      const img = imgData.Images?.[0];
      if (img) {
        imageName = img.Name || imageId;
        (img.BlockDeviceMappings || []).forEach(bdm => {
          if (bdm.Ebs?.SnapshotId) {
            snapshotIds.push(bdm.Ebs.SnapshotId);
          }
        });
      }
    } catch (descErr) {
      console.warn(`Could not describe image ${imageId} before deregistration:`, descErr.message);
    }

    // 2. Deregister the AMI
    await ec2Client.send(new DeregisterImageCommand({ ImageId: imageId }));

    // 3. Clean Deregister: If requested, delete associated EBS snapshots now that they are unlocked
    const deletedSnapshots = [];
    const failedSnapshots = [];

    if (deleteSnapshots && snapshotIds.length > 0) {
      for (const snapId of snapshotIds) {
        try {
          await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapId }));
          deletedSnapshots.push(snapId);
        } catch (snapErr) {
          console.error(`Failed to delete associated snapshot ${snapId}:`, snapErr.message);
          failedSnapshots.push({ snapshotId: snapId, error: snapErr.message });
        }
      }
    }

    // 4. Record audit log
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: imageId,
      action: "DEREGISTER_AMI",
      details: {
        imageId,
        imageName,
        deleteSnapshotsRequested: !!deleteSnapshots,
        deletedSnapshots,
        failedSnapshots,
        allAssociatedSnapshots: snapshotIds,
        message: `AMI ${imageId} (${imageName}) was deregistered. ${deletedSnapshots.length} associated snapshot(s) deleted.`
      },
      status: failedSnapshots.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
      event
    });

    return buildResponse(200, {
      message: `AMI ${imageId} deregistered successfully.`,
      imageId,
      imageName,
      deletedSnapshots,
      failedSnapshots
    });

  } catch (error) {
    console.error("Error deregistering AMI:", error);

    const body = (() => {
      try { return JSON.parse(event.body || "{}"); } catch { return {}; }
    })();
    const imageId = body.imageId || "UNKNOWN";

    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: imageId,
      action: "DEREGISTER_AMI",
      details: {
        imageId,
        error: error.message,
        message: `Failed to deregister AMI ${imageId}`
      },
      status: "FAILED",
      event
    });

    return buildResponse(500, { message: "Failed to deregister AMI", error: error.message });
  }
};
