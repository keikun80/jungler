import { EC2Client, DescribeSnapshotsCommand, DescribeVolumesCommand, DescribeImagesCommand } from "@aws-sdk/client-ec2";
import { buildResponse, getAwsClient } from "../utils.mjs";

export const handler = async (event) => {
  try {
    const ec2Client = await getAwsClient(EC2Client, event);

    // 1. Fetch all snapshots owned by this account (with pagination)
    let snapshots = [];
    try {
      let nextToken;
      do {
        const params = { OwnerIds: ["self"], ...(nextToken ? { NextToken: nextToken } : {}) };
        const snapshotsData = await ec2Client.send(new DescribeSnapshotsCommand(params));
        if (snapshotsData.Snapshots) {
          snapshots.push(...snapshotsData.Snapshots);
        }
        nextToken = snapshotsData.NextToken;
      } while (nextToken);
    } catch (err) {
      console.error("Error describing snapshots:", err.message);
      return buildResponse(200, {
        summary: { totalSnapshots: 0, orphaned: 0, protected: 0, volumeProtected: 0, amiProtected: 0 },
        snapshots: [],
        error: `Failed to list snapshots: ${err.message}`
      });
    }

    // 2. Fetch all existing volumes in the account/region (with pagination)
    let volumes = {};
    try {
      let nextToken;
      do {
        const params = nextToken ? { NextToken: nextToken } : {};
        const volumesData = await ec2Client.send(new DescribeVolumesCommand(params));
        (volumesData.Volumes || []).forEach(vol => {
          volumes[vol.VolumeId] = vol;
        });
        nextToken = volumesData.NextToken;
      } while (nextToken);
    } catch (err) {
      console.warn("Error describing volumes:", err.message);
    }

    // 3. Fetch active AMIs owned by this account to detect snapshots backing AMIs
    const amiSnapshotMap = {};
    try {
      const imagesData = await ec2Client.send(
        new DescribeImagesCommand({ Owners: ["self"] })
      );
      (imagesData.Images || []).forEach(img => {
        (img.BlockDeviceMappings || []).forEach(bdm => {
          if (bdm.Ebs?.SnapshotId) {
            amiSnapshotMap[bdm.Ebs.SnapshotId] = {
              imageId: img.ImageId,
              imageName: img.Name || img.ImageId,
              state: img.State
            };
          }
        });
      });
    } catch (err) {
      console.warn("Error describing images:", err.message);
    }

    // 4. Cross-reference: for each snapshot, determine if source volume exists or if backed by AMI
    let orphanedCount = 0;
    let volumeProtectedCount = 0;
    let amiProtectedCount = 0;
    let protectedCount = 0;

    let totalStorageGiB = 0;
    let orphanedStorageGiB = 0;
    let volumeProtectedStorageGiB = 0;
    let amiProtectedStorageGiB = 0;

    const PRICE_PER_GIB_MONTH = 0.05; // AWS Standard EBS Snapshot pricing ($0.05 / GiB-month)

    const formattedSnapshots = snapshots.map(snap => {
      const volumeId = snap.VolumeId;
      const volume = volumeId ? volumes[volumeId] : null;
      const volumeExists = !!volume;

      // Check if snapshot is currently in-use by an active AMI
      const inUseAmi = amiSnapshotMap[snap.SnapshotId] || null;
      const isAmiInUse = !!inUseAmi;

      // Protected if either source volume exists or is used by an active AMI
      const isProtected = volumeExists || isAmiInUse;
      const sizeGiB = snap.VolumeSize || 0;
      totalStorageGiB += sizeGiB;

      if (isProtected) {
        protectedCount++;
        if (volumeExists) {
          volumeProtectedCount++;
          volumeProtectedStorageGiB += sizeGiB;
        }
        if (isAmiInUse && !volumeExists) {
          amiProtectedCount++;
          amiProtectedStorageGiB += sizeGiB;
        }
      } else {
        orphanedCount++;
        orphanedStorageGiB += sizeGiB;
      }

      // Extract volume Name tag if volume exists
      const volumeName = volume
        ? (volume.Tags?.find(t => t.Key === "Name")?.Value || volumeId)
        : "";

      return {
        snapshotId: snap.SnapshotId,
        volumeId: volumeId || "",
        volumeExists,
        volumeName,
        inUseAmi: inUseAmi ? { imageId: inUseAmi.imageId, imageName: inUseAmi.imageName } : null,
        isAmiInUse,
        startTime: snap.StartTime,
        state: snap.State,
        progress: snap.Progress,
        volumeSize: snap.VolumeSize,
        description: snap.Description || "",
        tags: snap.Tags || []
      };
    });

    // Sort by creation time descending (newest first)
    formattedSnapshots.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    const totalCost = Number((totalStorageGiB * PRICE_PER_GIB_MONTH).toFixed(2));
    const orphanedCost = Number((orphanedStorageGiB * PRICE_PER_GIB_MONTH).toFixed(2));
    const protectedCost = Number(((totalStorageGiB - orphanedStorageGiB) * PRICE_PER_GIB_MONTH).toFixed(2));

    const summary = {
      totalSnapshots: formattedSnapshots.length,
      orphaned: orphanedCount,
      protected: protectedCount,
      volumeProtected: volumeProtectedCount,
      amiProtected: amiProtectedCount,
      totalStorageGiB,
      orphanedStorageGiB,
      protectedStorageGiB: totalStorageGiB - orphanedStorageGiB,
      estimatedMonthlyCost: totalCost,
      orphanedMonthlyCost: orphanedCost,
      protectedMonthlyCost: protectedCost,
      pricePerGiB: PRICE_PER_GIB_MONTH,
      currency: "USD"
    };

    return buildResponse(200, { summary, snapshots: formattedSnapshots });
  } catch (error) {
    console.error("Error in Snapshot Tracer:", error);
    return buildResponse(200, {
      summary: {
        totalSnapshots: 0, orphaned: 0, protected: 0, volumeProtected: 0, amiProtected: 0,
        totalStorageGiB: 0, orphanedStorageGiB: 0, protectedStorageGiB: 0,
        estimatedMonthlyCost: 0, orphanedMonthlyCost: 0, protectedMonthlyCost: 0
      },
      snapshots: [],
      error: error.message
    });
  }
};
