import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  areAllValidEmails,
  isValidSlackWebhookUrl,
  buildResponse
} from '../utils.mjs';

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
    assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET,POST,PUT,DELETE,OPTIONS');
    assert.equal(response.body, JSON.stringify(payload));
  });

  it('should correctly format 400 and 500 error responses', () => {
    const errorResponse = buildResponse(400, { message: 'Bad Request' });
    assert.equal(errorResponse.statusCode, 400);
    assert.deepEqual(JSON.parse(errorResponse.body), { message: 'Bad Request' });
  });
});

describe('4. Cross-Account IAM Security Pattern', () => {
  const roleArnPattern = /^arn:aws:iam::\d{12}:role\/JungleToolsCrossAccountRole$/;

  it('should match valid Cross-Account Role ARN pattern', () => {
    assert.equal(roleArnPattern.test('arn:aws:iam::123456789012:role/JungleToolsCrossAccountRole'), true);
    assert.equal(roleArnPattern.test('arn:aws:iam::999888777666:role/JungleToolsCrossAccountRole'), true);
  });

  it('should reject unauthorized role ARNs or arbitrary IAM entities', () => {
    assert.equal(roleArnPattern.test('arn:aws:iam::123456789012:role/AdminRole'), false);
    assert.equal(roleArnPattern.test('arn:aws:iam::123456789012:user/Alice'), false);
    assert.equal(roleArnPattern.test('arn:aws:iam::123456789012:root'), false);
    assert.equal(roleArnPattern.test('arn:aws:iam::123456789012:role/AdministratorAccess'), false);
    assert.equal(roleArnPattern.test('arn:aws:s3:::sensitive-bucket'), false);
  });
});
