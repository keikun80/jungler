#!/usr/bin/env node
/**
 * Jungle Tools Automated End-to-End (E2E) Test Suite
 * Tests all 11 backend Lambda functions, API Gateway endpoints, DynamoDB, and S3 Object Lock.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { S3Client, GetObjectRetentionCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, 'env.json');

// Terminal Colors
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Test Stats Tracker
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now(),
  results: []
};

async function loadConfig() {
  let env = {};
  if (fs.existsSync(ENV_FILE)) {
    try {
      env = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
    } catch (e) {
      console.warn('Could not parse env.json');
    }
  }

  // Branch check
  let defaultStack = 'jungle-tools-stack';
  try {
    const branch = fs.readFileSync(path.join(ROOT_DIR, '.git', 'HEAD'), 'utf8');
    if (branch.includes('develop')) {
      defaultStack = 'dev-jungle';
    }
  } catch (e) {}

  const profile = process.env.AWS_PROFILE || env.HUB_PROFILE || 'l-iam-s2';
  const region = process.env.AWS_REGION || env.REGION || 'ap-northeast-2';
  const stackName = process.env.STACK_NAME || env.STACK_NAME || defaultStack;

  return { profile, region, stackName };
}

async function getStackOutputs(profile, region, stackName) {
  const credentials = fromIni({ profile });
  const cfn = new CloudFormationClient({ region, credentials });

  try {
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = res.Stacks?.[0];
    if (!stack) throw new Error(`Stack ${stackName} not found`);

    const outputs = {};
    for (const out of stack.Outputs || []) {
      outputs[out.OutputKey] = out.OutputValue;
    }
    return outputs;
  } catch (err) {
    throw new Error(`Failed to describe stack ${stackName}: ${err.message}`);
  }
}

function createSignedFetcher(apiEndpoint, region, profile) {
  const credentialsProvider = fromIni({ profile });
  const signer = new SignatureV4({
    credentials: credentialsProvider,
    region,
    service: 'execute-api',
    sha256: Sha256
  });

  return async function signedFetch(path, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined;
    const url = new URL(path.startsWith('http') ? path : `${apiEndpoint}${path}`);

    const headers = {
      'host': url.host,
      'accept': 'application/json',
      ...(options.headers || {})
    };

    if (body) {
      headers['content-type'] = 'application/json';
    }

    const httpRequest = new HttpRequest({
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : undefined,
      path: url.pathname + url.search,
      headers,
      body
    });

    const signedRequest = await signer.sign(httpRequest);

    const fetchHeaders = {};
    for (const [k, v] of Object.entries(signedRequest.headers)) {
      fetchHeaders[k] = v;
    }

    const response = await fetch(url.toString(), {
      method,
      headers: fetchHeaders,
      body
    });

    let json = null;
    const rawText = await response.text();
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      json = { raw: rawText };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: json
    };
  };
}

async function runTest(category, name, testFn) {
  stats.total++;
  const testStart = Date.now();
  process.stdout.write(`  ${C.cyan}▶${C.reset} [${category}] ${name}... `);

  try {
    await testFn();
    const duration = Date.now() - testStart;
    stats.passed++;
    stats.results.push({ category, name, status: 'PASS', duration });
    console.log(`${C.green}✔ PASS${C.reset} ${C.dim}(${duration}ms)${C.reset}`);
  } catch (err) {
    const duration = Date.now() - testStart;
    stats.failed++;
    stats.results.push({ category, name, status: 'FAIL', duration, error: err.message });
    console.log(`${C.red}✖ FAIL${C.reset} ${C.dim}(${duration}ms)${C.reset}`);
    console.log(`    ${C.red}Error: ${err.message}${C.reset}`);
  }
}

async function main() {
  console.log(`\n${C.bright}${C.magenta}============================================================${C.reset}`);
  console.log(`${C.bright}${C.magenta} Jungle Tools Automated End-to-End Test Suite ${C.reset}`);
  console.log(`${C.bright}${C.magenta}============================================================${C.reset}\n`);

  const { profile, region, stackName } = await loadConfig();
  console.log(`${C.dim}Environment Profile :${C.reset} ${C.white}${profile}${C.reset}`);
  console.log(`${C.dim}AWS Region          :${C.reset} ${C.white}${region}${C.reset}`);
  console.log(`${C.dim}CloudFormation Stack:${C.reset} ${C.white}${stackName}${C.reset}\n`);

  console.log(`${C.yellow}[1/3] Resolving CloudFormation Stack Outputs...${C.reset}`);
  const outputs = await getStackOutputs(profile, region, stackName);
  const apiEndpoint = outputs.ApiEndpoint;
  const auditBucket = outputs.AuditLogsBucketName;

  if (!apiEndpoint) {
    console.error(`${C.red}Error: ApiEndpoint not found in stack outputs!${C.reset}`);
    process.exit(1);
  }

  console.log(`  ${C.green}✔${C.reset} API Endpoint   : ${C.cyan}${apiEndpoint}${C.reset}`);
  console.log(`  ${C.green}✔${C.reset} WORM S3 Bucket : ${C.cyan}${auditBucket || 'N/A'}${C.reset}\n`);

  const signedFetch = createSignedFetcher(apiEndpoint, region, profile);
  const s3Client = new S3Client({ region, credentials: fromIni({ profile }) });

  console.log(`${C.yellow}[2/3] Executing Automated Feature Test Cases...${C.reset}\n`);

  let targetVpcId = null;
  let testSgId = null;
  const testGroupName = `jungle-e2e-test-${Date.now()}`;
  let originalSlackConfig = null;

  // 1. Security Groups & VPCs Discovery
  await runTest('SG Manage', 'GET /security-groups (List VPCs & Security Groups)', async () => {
    const res = await signedFetch('/security-groups');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data.vpcs)) throw new Error('Response vpcs is not an array');
    if (res.data.vpcs.length === 0) throw new Error('No VPCs returned in the account');

    targetVpcId = res.data.vpcs[0].vpcId;
    if (!targetVpcId) throw new Error('Could not find a valid vpcId');
  });

  // 2. Create Security Group
  await runTest('SG Manage', 'POST /security-groups (Create Temporary SG)', async () => {
    if (!targetVpcId) throw new Error('Skipped due to missing targetVpcId');
    const res = await signedFetch('/security-groups', {
      method: 'POST',
      body: {
        groupName: testGroupName,
        description: 'Automated E2E Test SG for Jungle Tools',
        vpcId: targetVpcId
      }
    });

    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    testSgId = res.data.securityGroup?.groupId || res.data.groupId || res.data.group?.groupId || res.data.sgId;
    if (!testSgId || !testSgId.startsWith('sg-')) {
      throw new Error(`Invalid groupId returned: ${JSON.stringify(res.data)}`);
    }
  });

  // 3. Update Security Group Rules
  await runTest('SG Manage', 'PUT /security-groups/{id}/rules (Add Inbound Rule)', async () => {
    if (!testSgId) throw new Error('Skipped due to missing testSgId');
    const res = await signedFetch(`/security-groups/${testSgId}/rules`, {
      method: 'PUT',
      body: {
        inboundRules: [
          {
            ipProtocol: 'tcp',
            fromPort: 8080,
            toPort: 8080,
            ipRanges: [{ cidrIp: '10.0.0.0/16', description: 'E2E Test Rule' }]
          }
        ],
        outboundRules: []
      }
    });

    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // 4. Delete Security Group
  await runTest('SG Manage', 'DELETE /security-groups/{id} (Delete Temporary SG)', async () => {
    if (!testSgId) throw new Error('Skipped due to missing testSgId');
    const res = await signedFetch(`/security-groups/${testSgId}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // 5. Audit Logs & S3 Object Lock Verification
  await runTest('Audit & WORM', 'GET /audit-logs & S3 Object Lock Governance Retention', async () => {
    // Wait 1.5s for async audit logging to complete
    await new Promise(r => setTimeout(r, 1500));

    const res = await signedFetch('/audit-logs');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data.logs)) throw new Error('logs field is not an array');

    // Find the log item for our test SG
    const recentLog = res.data.logs.find(l => l.sgId === testSgId || (l.details && l.details.includes(testGroupName)));
    if (!recentLog) {
      throw new Error(`Audit log for ${testSgId || testGroupName} not found in DynamoDB!`);
    }

    if (!recentLog.s3Location) {
      throw new Error(`Audit log entry does not have s3Location populated: ${JSON.stringify(recentLog)}`);
    }

    // Direct S3 Object Lock verification if bucket is present
    if (auditBucket && recentLog.s3Key) {
      const lockRes = await s3Client.send(new GetObjectRetentionCommand({
        Bucket: auditBucket,
        Key: recentLog.s3Key
      }));

      const mode = lockRes.Retention?.Mode;
      if (mode !== 'GOVERNANCE' && mode !== 'COMPLIANCE') {
        throw new Error(`Expected S3 Object Lock GOVERNANCE or COMPLIANCE mode, got: ${mode}`);
      }
    }
  });

  // 6. EBS Backups Monitor
  await runTest('Backup Monitor', 'GET /backups/ebs (Fetch EBS Snapshots & Volumes)', async () => {
    const res = await signedFetch('/backups/ebs');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data.volumes)) throw new Error('volumes is not an array');
    if (!Array.isArray(res.data.snapshots)) throw new Error('snapshots is not an array');
  });

  // 7. EFS Backups Monitor
  await runTest('Backup Monitor', 'GET /backups/efs (Fetch EFS File Systems)', async () => {
    const res = await signedFetch('/backups/efs');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data.fileSystems)) throw new Error('fileSystems is not an array');
  });

  // 8. RDS Backups Monitor
  await runTest('Backup Monitor', 'GET /backups/rds (Fetch RDS DB Snapshots)', async () => {
    const res = await signedFetch('/backups/rds');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data.instances)) throw new Error('instances is not an array');
    if (!Array.isArray(res.data.snapshots)) throw new Error('snapshots is not an array');
  });

  // 9. Slack & Email Config Lifecycle
  await runTest('Notifications', 'GET & POST /slack/config (Read, Update, and Restore)', async () => {
    // 1) Read original
    const getRes = await signedFetch('/slack/config');
    if (!getRes.ok) throw new Error(`GET /slack/config failed: ${getRes.status}`);
    originalSlackConfig = getRes.data.config || {};

    // 2) Save test update with email recipients
    const testConfigPayload = {
      webhookUrl: originalSlackConfig.webhookUrl || 'https://hooks.slack.com/services/T00000000/B00000000/TESTTESTTESTTESTTESTTEST',
      enabled: true,
      emailEnabled: true,
      emailRecipients: 'test.admin@example.com, security.ops@company.co.kr',
      smtpHost: 'smtp.mailgun.org',
      smtpPort: 587,
      smtpUser: 'postmaster@example.com',
      smtpFrom: 'no-reply@company.co.kr'
    };

    const postRes = await signedFetch('/slack/config', {
      method: 'POST',
      body: testConfigPayload
    });
    if (!postRes.ok) throw new Error(`POST /slack/config failed: ${postRes.status} ${JSON.stringify(postRes.data)}`);

    // 3) Restore original
    if (originalSlackConfig && Object.keys(originalSlackConfig).length > 0) {
      await signedFetch('/slack/config', {
        method: 'POST',
        body: originalSlackConfig
      });
    }
  });

  // 10. Notification Report Preview Generation
  await runTest('Notifications', 'GET /slack/preview (Generate Daily Report Preview)', async () => {
    const res = await signedFetch('/slack/preview');
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // Summary Report
  const totalDuration = Date.now() - stats.startTime;
  console.log(`\n${C.yellow}[3/3] Test Execution Summary${C.reset}`);
  console.log(`${C.dim}============================================================${C.reset}`);
  console.log(`  ${C.bright}Total Tests${C.reset} : ${stats.total}`);
  console.log(`  ${C.green}Passed${C.reset}      : ${stats.passed}`);
  console.log(`  ${C.red}Failed${C.reset}      : ${stats.failed}`);
  console.log(`  ${C.dim}Elapsed Time: ${(totalDuration / 1000).toFixed(2)}s${C.reset}`);
  console.log(`${C.dim}============================================================${C.reset}\n`);

  if (stats.failed > 0) {
    console.log(`${C.red}✖ Some tests failed. Please review the errors above.${C.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${C.green}✔ ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 🚀${C.reset}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`\n${C.red}Fatal Test Runner Error:${C.reset}`, err);
  process.exit(1);
});
