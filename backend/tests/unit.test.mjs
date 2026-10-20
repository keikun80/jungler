import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  areAllValidEmails,
  isValidSlackWebhookUrl,
  buildResponse,
  parseCookies,
  isValidRoleArn,
  extractActor
} from '../utils.mjs';
import { parseEniResource } from '../getSecurityGroupResources/app.mjs';
import { fetchAllAuditLogs } from '../getAuditLogs/app.mjs';

describe('1. Email Validation (RFC 5322 Standard)', () => {
  it('should accept valid standard email addresses', () => {
    assert.equal(isValidEmail('admin@example.com'), true);
    assert.equal(isValidEmail('john.doe@company.co.kr'), true);
    assert.equal(isValidEmail('dev+test123@domain.org'), true);
    assert.equal(isValidEmail('security_team@cloud.aws.internal'), true);
  });

  it('should reject invalid email formats', () => {
    assert.equal(isValidEmail('plainaddress'), false);
    assert.equal(isValidEmail('@missingusername.com'), false);
    assert.equal(isValidEmail('username@.missingdomain.com'), false);
    assert.equal(isValidEmail('username@domain..com'), false);
    assert.equal(isValidEmail('user with spaces@domain.com'), false);
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail(null), false);
    assert.equal(isValidEmail(undefined), false);
  });

  it('should validate multiple delimited emails', () => {
    assert.equal(areAllValidEmails('a@test.com, b@test.com'), true);
    assert.equal(areAllValidEmails('a@test.com; b@test.com; c@test.com'), true);
    assert.equal(areAllValidEmails('a@test.com\n b@test.com'), true);
    assert.equal(areAllValidEmails('a@test.com, invalid-email, c@test.com'), false);
    assert.equal(areAllValidEmails(''), false);
    assert.equal(areAllValidEmails('   '), false);
    assert.equal(areAllValidEmails(null), false);
  });
});

describe('2. Slack Webhook URL Validation', () => {
  it('should accept valid Slack incoming webhook and workflow URLs', () => {
    assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'), true);
    assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com/workflows/T00000000/A00000000/000000000000000000'), true);
    assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com/triggers/T00000000/0000000000000/XXXXXXXXXXXXXXXXXXXXXXXX'), true);
  });

  it('should reject invalid or spoofed Slack webhook URLs', () => {
    assert.equal(isValidSlackWebhookUrl('http://hooks.slack.com/services/T000/B000/XXX'), false); // HTTP instead of HTTPS
    assert.equal(isValidSlackWebhookUrl('https://evil-hooks.slack.com/services/T000/B000/XXX'), false); // Phishing sub-domain
    assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com.evil.com/services/T000/B000/XXX'), false); // Domain spoofing
    assert.equal(isValidSlackWebhookUrl('https://hooks.slack.com/unauthorized/path'), false); // Wrong path
    assert.equal(isValidSlackWebhookUrl('https://google.com'), false);
    assert.equal(isValidSlackWebhookUrl(''), false);
    assert.equal(isValidSlackWebhookUrl(null), false);
  });
});

describe('3. HTTP Response Builder & Security Headers', () => {
  it('should construct valid JSON response with required CORS and Charset headers', () => {
    const payload = { success: true, count: 42 };
    const response = buildResponse(200, payload);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
    assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET,POST,PUT,DELETE,OPTIONS');
    assert.equal(response.body, JSON.stringify(payload));
  });

  it('should reflect request Origin for CORS with credentials', () => {
    const event = { headers: { origin: 'http://localhost:3000' } };
    const response = buildResponse(200, { ok: true }, {}, event);

    assert.equal(response.headers['Access-Control-Allow-Origin'], 'http://localhost:3000');
    assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
  });

  it('should correctly format 400 and 500 error responses', () => {
    const errorResponse = buildResponse(400, { message: 'Bad Request' });
    assert.equal(errorResponse.statusCode, 400);
    assert.deepEqual(JSON.parse(errorResponse.body), { message: 'Bad Request' });
  });
});

describe('4. Cookie Parsing & BFF Session Helpers', () => {
  it('should parse Cookie from HTTP API v2 cookies array', () => {
    const event = {
      cookies: [
        'jungle_session=abc123sessionid; Path=/',
        'other_cookie=value123'
      ]
    };
    const cookies = parseCookies(event);
    assert.equal(cookies.jungle_session, 'abc123sessionid');
    assert.equal(cookies.other_cookie, 'value123');
  });

  it('should parse Cookie from headers.cookie string', () => {
    const event = {
      headers: {
        cookie: 'jungle_session=xyz789token; theme=dark'
      }
    };
    const cookies = parseCookies(event);
    assert.equal(cookies.jungle_session, 'xyz789token');
    assert.equal(cookies.theme, 'dark');
  });

  it('should handle empty or missing cookies gracefully', () => {
    assert.deepEqual(parseCookies({}), {});
    assert.deepEqual(parseCookies(null), {});
    assert.deepEqual(parseCookies({ headers: {} }), {});
  });
});

describe('5. Cross-Account IAM Security Pattern', () => {
  it('should match valid Cross-Account Role ARN pattern', () => {
    assert.equal(isValidRoleArn('arn:aws:iam::123456789012:role/JungleToolsCrossAccountRole'), true);
    assert.equal(isValidRoleArn('arn:aws:iam::999888777666:role/JungleToolsCrossAccountRole'), true);
  });

  it('should reject unauthorized role ARNs or arbitrary IAM entities', () => {
    assert.equal(isValidRoleArn('arn:aws:iam::123456789012:role/AdminRole'), false);
    assert.equal(isValidRoleArn('arn:aws:iam::123456789012:user/Alice'), false);
    assert.equal(isValidRoleArn('arn:aws:iam::123456789012:root'), false);
    assert.equal(isValidRoleArn('arn:aws:iam::123456789012:role/AdministratorAccess'), false);
    assert.equal(isValidRoleArn('arn:aws:s3:::sensitive-bucket'), false);
    assert.equal(isValidRoleArn(''), false);
    assert.equal(isValidRoleArn(null), false);
    assert.equal(isValidRoleArn(undefined), false);
  });
});

describe('6. Actor Identification for Audit Logs', () => {
  it('should extract actor from Lambda Authorizer context (BFF session)', () => {
    const event = {
      requestContext: {
        authorizer: {
          lambda: {
            arn: 'arn:aws:iam::132949884230:user/admin',
            userId: 'AIDA123456789',
            account: '132949884230'
          }
        }
      }
    };
    assert.equal(extractActor(event), 'arn:aws:iam::132949884230:user/admin');
  });

  it('should extract actor from IAM SigV4 authorizer context', () => {
    const event = {
      requestContext: {
        authorizer: {
          iam: {
            callerArn: 'arn:aws:sts::132949884230:assumed-role/Operator/session1'
          }
        }
      }
    };
    assert.equal(extractActor(event), 'arn:aws:sts::132949884230:assumed-role/Operator/session1');
  });

  it('should extract actor from X-Actor-Id header', () => {
    const event = {
      headers: {
        'x-actor-id': 'arn:aws:iam::132949884230:user/deployer'
      }
    };
    assert.equal(extractActor(event), 'arn:aws:iam::132949884230:user/deployer');
  });

  it('should fallback to SYSTEM when no actor info is available', () => {
    assert.equal(extractActor({}), 'SYSTEM');
    assert.equal(extractActor(null), 'SYSTEM');
    assert.equal(extractActor(undefined), 'SYSTEM');
  });
});

describe('7. Security Group Connected Resources (ENI Parser)', () => {
  it('should correctly classify EC2 Instance ENI with tag Name', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0123456789abcdef0',
      Description: 'Primary network interface',
      InterfaceType: 'interface',
      Status: 'in-use',
      PrivateIpAddress: '10.0.1.50',
      SubnetId: 'subnet-0123',
      VpcId: 'vpc-0123',
      Attachment: {
        InstanceId: 'i-0abcdef1234567890'
      }
    };
    const instanceMap = {
      'i-0abcdef1234567890': {
        InstanceId: 'i-0abcdef1234567890',
        InstanceType: 't3.medium',
        State: { Name: 'running' },
        Tags: [{ Key: 'Name', Value: 'prod-api-server' }]
      }
    };
    const parsed = parseEniResource(eni, instanceMap);
    assert.equal(parsed.resourceType, 'EC2');
    assert.equal(parsed.resourceId, 'i-0abcdef1234567890');
    assert.equal(parsed.resourceName, 'prod-api-server');
    assert.equal(parsed.privateIp, '10.0.1.50');
    assert.equal(parsed.status, 'in-use');
  });

  it('should correctly classify Application Load Balancer (ALB)', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0234567890abcdef1',
      Description: 'ELB app/my-prod-alb/1234567890abcdef',
      InterfaceType: 'interface',
      Status: 'in-use',
      PrivateIpAddress: '10.0.1.100'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'ALB');
    assert.equal(parsed.resourceName, 'my-prod-alb');
    assert.equal(parsed.icon, 'network');
  });

  it('should correctly classify Network Load Balancer (NLB)', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0345678901abcdef2',
      Description: 'ELB net/my-prod-nlb/9876543210fedcba',
      InterfaceType: 'network_load_balancer',
      Status: 'in-use',
      PrivateIpAddress: '10.0.2.100'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'NLB');
    assert.equal(parsed.resourceName, 'my-prod-nlb');
  });

  it('should correctly classify RDS Database ENI', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0456789012abcdef3',
      Description: 'RDSNetworkInterface',
      InterfaceType: 'interface',
      Status: 'in-use',
      PrivateIpAddress: '10.0.3.50'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'RDS');
    assert.equal(parsed.icon, 'database');
  });

  it('should correctly classify AWS Lambda VPC ENI', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0567890123abcdef4',
      Description: 'AWS Lambda VPC ENI-4a7b8c9d-1234-5678-90ab-cdef12345678',
      InterfaceType: 'lambda',
      Status: 'in-use',
      PrivateIpAddress: '10.0.4.20'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'Lambda');
    assert.equal(parsed.icon, 'zap');
  });

  it('should correctly classify VPC Endpoint (vpce-...) ENI', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0678901234abcdef5',
      Description: 'VPC Endpoint Interface vpce-0123456789abcdef0',
      InterfaceType: 'vpc_endpoint',
      Status: 'in-use',
      PrivateIpAddress: '10.0.5.10'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'VPCEndpoint');
    assert.equal(parsed.resourceId, 'vpce-0123456789abcdef0');
    assert.equal(parsed.icon, 'plug');
  });

  it('should fallback gracefully for generic Network Interfaces', () => {
    const eni = {
      NetworkInterfaceId: 'eni-0789012345abcdef6',
      Description: 'Custom appliance interface',
      InterfaceType: 'interface',
      Status: 'in-use',
      PrivateIpAddress: '10.0.6.99'
    };
    const parsed = parseEniResource(eni);
    assert.equal(parsed.resourceType, 'ENI');
    assert.equal(parsed.resourceId, 'eni-0789012345abcdef6');
    assert.equal(parsed.resourceName, 'Custom appliance interface');
  });
});

describe('8. Audit Logs Pagination & Chronological Ordering', () => {
  it('should paginate across multiple DynamoDB pages and sort items descending (newest first)', async () => {
    // Mock DynamoDB client simulating 2 pages of scanned records
    const page1 = {
      Items: [
        { sgId: 'sg-old1', timestamp: '2026-09-01T10:00:00.000Z', action: 'UPDATE_RULES', actor: 'user1' },
        { sgId: 'sg-old2', timestamp: '2026-09-05T12:00:00.000Z', action: 'CREATE', actor: 'user2' }
      ],
      LastEvaluatedKey: { sgId: 'sg-old2', timestamp: '2026-09-05T12:00:00.000Z' }
    };
    const page2 = {
      Items: [
        { sgId: 'sg-new1', timestamp: '2026-10-20T02:22:05.812Z', action: 'UPDATE_RULES', actor: 'logged-in-user' },
        { sgId: 'sg-mid1', timestamp: '2026-10-15T08:30:00.000Z', action: 'DELETE_SNAPSHOT', actor: 'system' }
      ],
      LastEvaluatedKey: undefined
    };

    let callCount = 0;
    const mockClient = {
      send: async () => {
        callCount++;
        return callCount === 1 ? page1 : page2;
      }
    };

    const logs = await fetchAllAuditLogs(mockClient, 'TestAuditTable', { limit: 100 });
    assert.equal(callCount, 2, 'Should have made 2 calls to paginate through all items');
    assert.equal(logs.length, 4, 'Should have retrieved all 4 items across both pages');
    assert.equal(logs[0].sgId, 'sg-new1', 'Newest item from 2026-10-20 must be first in the array');
    assert.equal(logs[0].actor, 'logged-in-user');
    assert.equal(logs[3].sgId, 'sg-old1', 'Oldest item from 2026-09-01 must be last');
  });

  it('should correctly filter by sgId and enforce return limit without dropping newer records', async () => {
    const mockItems = [
      { sgId: 'sg-target', timestamp: '2026-10-20T03:00:00.000Z', action: 'UPDATE_RULES' },
      { sgId: 'sg-target', timestamp: '2026-10-20T01:00:00.000Z', action: 'UPDATE_RULES' },
      { sgId: 'sg-target', timestamp: '2026-10-19T00:00:00.000Z', action: 'CREATE' }
    ];

    let lastSentCommand = null;
    const mockClient = {
      send: async (cmd) => {
        lastSentCommand = cmd;
        return { Items: mockItems, LastEvaluatedKey: undefined };
      }
    };

    const logs = await fetchAllAuditLogs(mockClient, 'TestAuditTable', { limit: 2, sgId: 'sg-target' });
    assert.equal(logs.length, 2, 'Should slice to requested limit of 2');
    assert.equal(logs[0].timestamp, '2026-10-20T03:00:00.000Z', 'Top item should be the most recent');
    assert.equal(lastSentCommand.input.FilterExpression, 'sgId = :sgId');
    assert.equal(lastSentCommand.input.ExpressionAttributeValues[':sgId'], 'sg-target');
  });
});



