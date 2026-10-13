import { CreateSecurityGroupCommand, CreateTagsCommand } from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { buildResponse, getEc2Client, recordAuditLog } from "../utils.mjs";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || "SgAuditLogs";

export const handler = async (event) => {
  let parsedBody = {};
  try {
    const ec2Client = await getEc2Client(event);
    if (!event.body) {
      return buildResponse(400, { message: "Request body is missing" });
    }

    parsedBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { groupName, description, vpcId, name } = parsedBody;

    if (!groupName || !description || !vpcId) {
      return buildResponse(400, { message: "groupName, description, and vpcId are required fields" });
    }

    // 1. Create Security Group in AWS EC2
    const createParams = {
      GroupName: groupName,
      Description: description,
      VpcId: vpcId
    };
    const createResult = await ec2Client.send(new CreateSecurityGroupCommand(createParams));
    const sgId = createResult.GroupId;

    // 2. Add Name Tag if specified
    if (name || groupName) {
      const tagParams = {
        Resources: [sgId],
        Tags: [
          {
            Key: "Name",
            Value: name || groupName
          }
        ]
      };
      await ec2Client.send(new CreateTagsCommand(tagParams));
    }

    // 3. Log the successful action to DynamoDB
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId,
      action: "CREATE",
      details: {
        groupName,
        description,
        vpcId,
        name: name || groupName
      },
      status: "SUCCESS",
      event
    });

    return buildResponse(201, {
      message: "Security group created successfully",
      securityGroup: {
        groupId: sgId,
        groupName,
        description,
        vpcId,
        name: name || groupName
      }
    });

  } catch (error) {
    console.error("Error creating security group:", error);

    // Log the failed action to DynamoDB
    await recordAuditLog(docClient, AUDIT_LOG_TABLE, {
      sgId: "N/A",
      action: "CREATE",
      details: {
        error: error.message,
        requested: parsedBody
      },
      status: "FAILED",
      event
    });

    return buildResponse(500, { message: "Failed to create security group", error: error.message });
  }
};
