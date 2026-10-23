import {
  EC2Client,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplateVersionsCommand
} from "@aws-sdk/client-ec2";
import { buildResponse, getAwsClient } from "../utils.mjs";

const PRICE_PER_GIB_MONTH = 0.05; // Standard EBS snapshot pricing in ap-northeast-2 (~$0.05/GB-month)

export const handler = async (event) => {
  try {
    const ec2Client = await getAwsClient(EC2Client, event);

    // 1. Fetch all AMIs owned by this account (including disabled and deprecated)
    let images = [];
    try {
      const imagesData = await ec2Client.send(
        new DescribeImagesCommand({
          Owners: ["self"],
          IncludeDisabled: true,
          IncludeDeprecated: true
        })
      );
      images = imagesData.Images || [];
    } catch (err) {
      console.error("Error describing images:", err.message);
      return buildResponse(200, {
        summary: {
          totalAmis: 0,
          unusedAmis: 0,
          inUseAmis: 0,
          totalStorageGiB: 0,
          unusedStorageGiB: 0,
          inUseStorageGiB: 0,
          estimatedMonthlyCost: 0,
          unusedMonthlyCost: 0,
          inUseMonthlyCost: 0,
          potentialMonthlySavings: 0,
          totalSnapshotStorage: 0,
          unusedSnapshotStorage: 0
        },
        amis: [],
        error: `Failed to list AMIs: ${err.message}`
      });
    }

    // 2. Fetch EC2 instances to find AMIs currently in use
    const instanceMapByAmi = {};
    try {
      const instancesData = await ec2Client.send(new DescribeInstancesCommand({}));
      (instancesData.Reservations || []).forEach(res => {
        (res.Instances || []).forEach(inst => {
          const imageId = inst.ImageId;
          if (imageId) {
            if (!instanceMapByAmi[imageId]) instanceMapByAmi[imageId] = [];
            const nameTag = inst.Tags?.find(t => t.Key === "Name")?.Value || inst.InstanceId;
            instanceMapByAmi[imageId].push({
              instanceId: inst.InstanceId,
              name: nameTag,
              state: inst.State?.Name || "unknown"
            });
          }
        });
      });
    } catch (instErr) {
      console.warn("Error describing instances:", instErr.message);
    }

    // 3. Fetch Launch Templates to find AMIs referenced in Launch Templates
    const launchTemplateMapByAmi = {};
    try {
      const ltData = await ec2Client.send(new DescribeLaunchTemplatesCommand({}));
      const templates = ltData.LaunchTemplates || [];
      for (const lt of templates) {
        try {
          const versionsData = await ec2Client.send(
            new DescribeLaunchTemplateVersionsCommand({
              LaunchTemplateId: lt.LaunchTemplateId,
              Versions: ["$Default", "$Latest"]
            })
          );
          (versionsData.LaunchTemplateVersions || []).forEach(ver => {
            const imageId = ver.LaunchTemplateData?.ImageId;
            if (imageId) {
              if (!launchTemplateMapByAmi[imageId]) launchTemplateMapByAmi[imageId] = [];
              if (!launchTemplateMapByAmi[imageId].some(item => item.templateId === lt.LaunchTemplateId)) {
                launchTemplateMapByAmi[imageId].push({
                  templateId: lt.LaunchTemplateId,
                  templateName: lt.LaunchTemplateName
                });
              }
            }
          });
        } catch (verErr) {
          console.warn(`Error describing versions for LT ${lt.LaunchTemplateId}:`, verErr.message);
        }
      }
    } catch (ltErr) {
      console.warn("Error describing launch templates:", ltErr.message);
    }

    // 4. Cross-reference AMI usage and underlying snapshots
    let totalSnapshotsCount = 0;
    let totalStorageGiB = 0;
    let unusedCount = 0;
    let inUseCount = 0;
    let unusedStorageGiB = 0;
    let inUseStorageGiB = 0;

    const now = new Date();

    const formattedAmis = images.map(img => {
      const imageId = img.ImageId;
      const instances = instanceMapByAmi[imageId] || [];
      const launchTemplates = launchTemplateMapByAmi[imageId] || [];

      const isUsedByInstances = instances.length > 0;
      const isUsedByTemplates = launchTemplates.length > 0;
      const isUnused = !isUsedByInstances && !isUsedByTemplates;

      // Extract snapshots in block device mappings
      const snapshots = [];
      let amiSnapshotSize = 0;
      (img.BlockDeviceMappings || []).forEach(bdm => {
        if (bdm.Ebs?.SnapshotId) {
          const size = bdm.Ebs.VolumeSize || 0;
          snapshots.push({
            snapshotId: bdm.Ebs.SnapshotId,
            volumeSize: size,
            device: bdm.DeviceName || ""
          });
          amiSnapshotSize += size;
        }
      });

      totalSnapshotsCount += snapshots.length;
      totalStorageGiB += amiSnapshotSize;

      if (isUnused) {
        unusedCount++;
        unusedStorageGiB += amiSnapshotSize;
      } else {
        inUseCount++;
        inUseStorageGiB += amiSnapshotSize;
      }

      const creationDate = img.CreationDate ? new Date(img.CreationDate) : null;
      const ageDays = creationDate ? Math.floor((now - creationDate) / (1000 * 60 * 60 * 24)) : 0;
      const monthlyCost = Number((amiSnapshotSize * PRICE_PER_GIB_MONTH).toFixed(2));

      return {
        imageId,
        name: img.Name || imageId,
        description: img.Description || "",
        state: img.State,
        creationDate: img.CreationDate,
        ageDays,
        architecture: img.Architecture || "",
        rootDeviceName: img.RootDeviceName || "",
        snapshots,
        snapshotCount: snapshots.length,
        totalSnapshotSize: amiSnapshotSize,
        estimatedMonthlyCost: monthlyCost,
        inUseByInstances: instances,
        inUseByLaunchTemplates: launchTemplates,
        isUnused,
        tags: img.Tags || []
      };
    });

    // Sort newest first
    formattedAmis.sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));

    const totalCost = Number((totalStorageGiB * PRICE_PER_GIB_MONTH).toFixed(2));
    const unusedCost = Number((unusedStorageGiB * PRICE_PER_GIB_MONTH).toFixed(2));
    const inUseCost = Number((inUseStorageGiB * PRICE_PER_GIB_MONTH).toFixed(2));

    const summary = {
      totalAmis: formattedAmis.length,
      unusedAmis: unusedCount,
      inUseAmis: inUseCount,
      totalStorageGiB,
      unusedStorageGiB,
      inUseStorageGiB,
      estimatedMonthlyCost: totalCost,
      unusedMonthlyCost: unusedCost,
      inUseMonthlyCost: inUseCost,
      potentialMonthlySavings: unusedCost,
      pricePerGiB: PRICE_PER_GIB_MONTH,
      currency: "USD",
      // Backwards-compatible aliases
      totalSnapshotStorage: totalStorageGiB,
      unusedSnapshotStorage: unusedStorageGiB
    };

    return buildResponse(200, { summary, amis: formattedAmis });
  } catch (error) {
    console.error("Error in AMI Tracer:", error);
    return buildResponse(200, {
      summary: {
        totalAmis: 0,
        unusedAmis: 0,
        inUseAmis: 0,
        totalStorageGiB: 0,
        unusedStorageGiB: 0,
        inUseStorageGiB: 0,
        estimatedMonthlyCost: 0,
        unusedMonthlyCost: 0,
        inUseMonthlyCost: 0,
        potentialMonthlySavings: 0,
        totalSnapshotStorage: 0,
        unusedSnapshotStorage: 0
      },
      amis: [],
      error: error.message
    });
  }
};
