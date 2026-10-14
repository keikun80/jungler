import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const htmlContent = fs.readFileSync(path.join(rootDir, 'frontend/index.html'), 'utf8');
const configContent = fs.readFileSync(path.join(rootDir, 'frontend/config.js'), 'utf8');
const appJsContent = fs.readFileSync(path.join(rootDir, 'frontend/app.js'), 'utf8');

describe('Frontend UI Menu Navigation & Feature Tests (JSDOM)', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    // Setup Virtual DOM environment
    dom = new JSDOM(htmlContent, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/',
      beforeParse(window) {
        window.lucide = { createIcons: () => {} };
        window.showToast = () => {};
      }
    });
    window = dom.window;
    document = window.document;

    // Mock global objects
    window.lucide = { createIcons: () => {} };
    window.showToast = () => {};
    window.fetch = async (url) => {
      if (url.includes('/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            authenticated: true,
            user: { account: '132949884230', arn: 'arn:aws:iam::132949884230:user/admin' }
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    // Execute config.js and app.js inside the window context
    window.eval(configContent);
    window.eval(appJsContent);

    // Fire DOMContentLoaded
    const event = document.createEvent('Event');
    event.initEvent('DOMContentLoaded', true, true);
    window.dispatchEvent(event);
  });

  test('1. Initial Load: Home view is active, Breadcrumb is "Home", Account options loaded', () => {
    const viewHome = document.getElementById('view-home');
    const navHome = document.getElementById('nav-home');
    const activeBreadcrumb = document.getElementById('breadcrumb-active');
    const parentBreadcrumb = document.getElementById('breadcrumb-parent');
    const targetAccountSelect = document.getElementById('target-account-select');
    const apiDisplay = document.getElementById('api-endpoint-display');
    const roleDisplay = document.getElementById('target-role-display');

    assert.ok(viewHome.classList.contains('active'), 'Home view should be active on load');
    assert.ok(navHome.classList.contains('active'), 'Nav Home button should have active class');
    assert.equal(activeBreadcrumb.textContent, 'Home', 'Breadcrumb active text should be Home');
    assert.equal(parentBreadcrumb.style.display, 'none', 'Parent breadcrumb should be hidden on Home');

    assert.ok(targetAccountSelect.options.length > 0, 'Target account options should be populated');
    assert.equal(targetAccountSelect.options[0].textContent, 'Hub (l-iam-s2)', 'First option should be simplified Hub label');
    assert.ok(!targetAccountSelect.options[0].textContent.includes('132949884230'), 'Label should not contain account ID');

    assert.ok(apiDisplay.textContent.includes('https://'), 'API Endpoint display should show API Gateway URL');
    assert.equal(roleDisplay.textContent, 'JungleToolsCrossAccountRole', 'Role display should show default role');
  });

  test('2. SG Manage & Top-level Audit Logs Menu: Click Dashboard and Audit Trail tabs', () => {
    const navSgDashboard = document.getElementById('nav-sg-dashboard');
    const navAuditLogs = document.getElementById('nav-audit-logs');
    const viewSgDashboard = document.getElementById('view-sg-dashboard');
    const viewAuditLogs = document.getElementById('view-sg-logs');
    const parentBreadcrumb = document.getElementById('breadcrumb-parent');
    const activeBreadcrumb = document.getElementById('breadcrumb-active');

    // Click SG Dashboard
    navSgDashboard.click();
    assert.ok(viewSgDashboard.classList.contains('active'), 'view-sg-dashboard must be active');
    assert.equal(parentBreadcrumb.textContent, 'SG Manage', 'Parent breadcrumb should be SG Manage');
    assert.equal(activeBreadcrumb.textContent, 'Dashboard', 'Active breadcrumb should be Dashboard');

    // Click Top-level Audit Logs
    navAuditLogs.click();
    assert.ok(viewAuditLogs.classList.contains('active'), 'view-sg-logs must be active');
    assert.equal(parentBreadcrumb.textContent, 'Audit Logs', 'Parent breadcrumb should be Audit Logs');
    assert.equal(activeBreadcrumb.textContent, 'Audit Trail', 'Active breadcrumb should be Audit Trail');
  });

  test('3. Backup Monitor Menu: Click Dashboard, Slack Webhook, Slack Email, SMTP, and Recipients', () => {
    const navBackupDashboard = document.getElementById('nav-backup-dashboard');
    const navNotiSlackWebhook = document.getElementById('nav-noti-slack-webhook');
    const navNotiSlackEmail = document.getElementById('nav-noti-slack-email');
    const navNotiEmailSmtp = document.getElementById('nav-noti-email-smtp');
    const navNotiEmailRecipients = document.getElementById('nav-noti-email-recipients');

    const viewBackupDashboard = document.getElementById('view-backup-dashboard');
    const viewNotiSlackWebhook = document.getElementById('view-noti-slack-webhook');
    const viewNotiSlackEmail = document.getElementById('view-noti-slack-email');
    const viewNotiEmailSmtp = document.getElementById('view-noti-email-smtp');
    const viewNotiEmailRecipients = document.getElementById('view-noti-email-recipients');

    const parentBreadcrumb = document.getElementById('breadcrumb-parent');
    const activeBreadcrumb = document.getElementById('breadcrumb-active');

    // 1) Backup Dashboard
    navBackupDashboard.click();
    assert.ok(viewBackupDashboard.classList.contains('active'), 'view-backup-dashboard must be active');
    assert.equal(parentBreadcrumb.textContent, 'Backup Monitor');
    assert.equal(activeBreadcrumb.textContent, 'Dashboard');

    // 2) Slack Webhook
    navNotiSlackWebhook.click();
    assert.ok(viewNotiSlackWebhook.classList.contains('active'), 'view-noti-slack-webhook must be active');
    assert.equal(parentBreadcrumb.textContent, 'Notification / Slack');
    assert.equal(activeBreadcrumb.textContent, '웹훅');

    // 3) Slack Email
    navNotiSlackEmail.click();
    assert.ok(viewNotiSlackEmail.classList.contains('active'), 'view-noti-slack-email must be active');
    assert.equal(parentBreadcrumb.textContent, 'Notification / Slack');
    assert.equal(activeBreadcrumb.textContent, 'Email');

    // 4) Email SMTP
    navNotiEmailSmtp.click();
    assert.ok(viewNotiEmailSmtp.classList.contains('active'), 'view-noti-email-smtp must be active');
    assert.equal(parentBreadcrumb.textContent, 'Notification / Email');
    assert.equal(activeBreadcrumb.textContent, 'SMTP');

    // 5) Email Recipients
    navNotiEmailRecipients.click();
    assert.ok(viewNotiEmailRecipients.classList.contains('active'), 'view-noti-email-recipients must be active');
    assert.equal(parentBreadcrumb.textContent, 'Notification / Email');
    assert.equal(activeBreadcrumb.textContent, '주소 등록');
  });

  test('4. Home Quick Access Jump Buttons: Navigate correctly to target views', () => {
    const btnHomeGotoSg = document.getElementById('btn-home-goto-sg');
    const btnHomeGotoBackup = document.getElementById('btn-home-goto-backup');
    const btnHomeGotoSlack = document.getElementById('btn-home-goto-slack');
    const btnHomeGotoEmail = document.getElementById('btn-home-goto-email');
    const btnHomeGotoLogs = document.getElementById('btn-home-goto-logs');

    // Jump to SG
    btnHomeGotoSg.click();
    assert.ok(document.getElementById('view-sg-dashboard').classList.contains('active'));

    // Jump to Backup
    btnHomeGotoBackup.click();
    assert.ok(document.getElementById('view-backup-dashboard').classList.contains('active'));

    // Jump to Slack
    btnHomeGotoSlack.click();
    assert.ok(document.getElementById('view-noti-slack-webhook').classList.contains('active'));

    // Jump to Email
    btnHomeGotoEmail.click();
    assert.ok(document.getElementById('view-noti-email-recipients').classList.contains('active'));

    // Jump to Logs
    btnHomeGotoLogs.click();
    assert.ok(document.getElementById('view-sg-logs').classList.contains('active'));
  });

  test('5. Target Account (Profile) Selection & LocalStorage persistence', () => {
    const targetAccountSelect = document.getElementById('target-account-select');
    targetAccountSelect.value = '515303172277';

    // Dispatch change event
    const changeEvent = document.createEvent('HTMLEvents');
    changeEvent.initEvent('change', true, true);
    targetAccountSelect.dispatchEvent(changeEvent);

    assert.equal(window.localStorage.getItem('sg_target_account'), '515303172277', 'Target account should persist in localStorage');
  });

  test('6. Modal LifeCycle: Open and Close Create SG & Webhook modals', () => {
    // 1) Create SG Modal
    const btnOpenCreateSg = document.getElementById('btn-open-create-sg');
    const btnCloseCreateModal = document.getElementById('btn-close-create-modal');
    const modalCreateSg = document.getElementById('modal-create-sg');

    btnOpenCreateSg.click();
    assert.ok(modalCreateSg.classList.contains('open'), 'Create SG Modal should open');

    btnCloseCreateModal.click();
    assert.ok(!modalCreateSg.classList.contains('open'), 'Create SG Modal should close');

    // 2) Add Webhook Modal
    const btnOpenAddWebhook = document.getElementById('btn-open-add-webhook');
    const btnCloseWebhookModal = document.getElementById('btn-close-webhook-modal');
    const modalWebhook = document.getElementById('modal-webhook');

    btnOpenAddWebhook.click();
    assert.ok(modalWebhook.classList.contains('open'), 'Add Webhook Modal should open');

    btnCloseWebhookModal.click();
    assert.ok(!modalWebhook.classList.contains('open'), 'Add Webhook Modal should close');
  });

  test('7. AMI Lifecycle Tracer: Storage & Cost metrics and table rendering', () => {
    const elTotal = document.getElementById('ami-metric-total');
    const elTotalStorage = document.getElementById('ami-metric-total-storage');
    const elTotalCost = document.getElementById('ami-metric-total-cost');
    const elUnused = document.getElementById('ami-metric-unused');
    const elUnusedSub = document.getElementById('ami-metric-unused-sub');
    const elInUse = document.getElementById('ami-metric-inuse');
    const elInUseSub = document.getElementById('ami-metric-inuse-sub');
    const elSavings = document.getElementById('ami-metric-savings');

    assert.ok(elTotal, 'Total AMIs metric element must exist');
    assert.ok(elTotalStorage, 'Total Storage metric element must exist');
    assert.ok(elTotalCost, 'Total Cost metric element must exist');
    assert.ok(elUnused, 'Unused AMIs metric element must exist');
    assert.ok(elUnusedSub, 'Unused sub element must exist');
    assert.ok(elInUse, 'In-use AMIs metric element must exist');
    assert.ok(elInUseSub, 'In-use sub element must exist');
    assert.ok(elSavings, 'Savings metric element must exist');

    // Test updateAmiTracerMetrics helper function directly inside window
    window.updateAmiTracerMetrics({
      totalAmis: 5,
      unusedAmis: 2,
      inUseAmis: 3,
      totalStorageGiB: 100,
      unusedStorageGiB: 40,
      inUseStorageGiB: 60,
      estimatedMonthlyCost: 5.0,
      unusedMonthlyCost: 2.0,
      inUseMonthlyCost: 3.0,
      potentialMonthlySavings: 2.0
    });

    assert.equal(elTotal.textContent, '5');
    assert.equal(elTotalStorage.textContent, '100 GiB');
    assert.equal(elTotalCost.textContent, '$5.00');
    assert.equal(elUnused.textContent, '2');
    assert.equal(elUnusedSub.textContent, '40 GiB (-$2.00/월)');
    assert.equal(elInUse.textContent, '3');
    assert.equal(elInUseSub.textContent, '60 GiB ($3.00/월)');
    assert.equal(elSavings.textContent, '-$2.00/월');
  });

  test('8. Security Group Connected Resources: Tab navigation and elements exist', () => {
    const tabInbound = document.getElementById('tab-inbound');
    const tabOutbound = document.getElementById('tab-outbound');
    const tabResources = document.getElementById('tab-resources');
    const paneInbound = document.getElementById('pane-inbound');
    const paneOutbound = document.getElementById('pane-outbound');
    const paneResources = document.getElementById('pane-resources');
    const usageBadge = document.getElementById('detail-sg-usage-badge');
    const countResources = document.getElementById('count-resources');
    const tableBodyResources = document.getElementById('table-body-resources');

    assert.ok(tabResources, 'tab-resources button must exist');
    assert.ok(paneResources, 'pane-resources container must exist');
    assert.ok(usageBadge, 'detail-sg-usage-badge element must exist');
    assert.ok(countResources, 'count-resources element must exist');
    assert.ok(tableBodyResources, 'table-body-resources must exist');

    // Click Connected Resources tab
    tabResources.click();
    assert.ok(tabResources.classList.contains('active'), 'Connected Resources tab should be active');
    assert.ok(paneResources.classList.contains('active'), 'Connected Resources pane should be active');
    assert.ok(!tabInbound.classList.contains('active'), 'Inbound tab should be inactive');
    assert.ok(!paneInbound.classList.contains('active'), 'Inbound pane should be inactive');

    // Click Inbound Rules tab back
    tabInbound.click();
    assert.ok(tabInbound.classList.contains('active'), 'Inbound tab should be active');
    assert.ok(paneInbound.classList.contains('active'), 'Inbound pane should be active');
    assert.ok(!tabResources.classList.contains('active'), 'Resources tab should be inactive');
    assert.ok(!paneResources.classList.contains('active'), 'Resources pane should be inactive');
  });
});

