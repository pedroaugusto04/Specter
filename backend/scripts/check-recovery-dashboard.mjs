import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Serve frontend/out locally first. All API and event traffic uses controlled fixtures.
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const now = new Date().toISOString();
const valid = {
  id: 'valid',
  jobId: 'monitor',
  contractRevision: 'v1',
  status: 'SUCCESS',
  hasChanges: 'NO',
  extractedData: { title: 'Last verified reading' },
  extractionReport: { quality: 'COMPLETE' },
  errorMessage: null,
  httpStatus: 200,
  durationMs: 30,
  screenshotUrl: null,
  executedAt: now,
};
const run = {
  ...valid,
  id: 'cycle',
  status: 'RUNNING',
  phase: 'CHECKING',
  extractedData: null,
  extractionReport: null,
};
const job = {
  id: 'monitor',
  name: 'Recovery fixture',
  url: 'https://example.com/item',
  userPrompt: 'Watch title',
  notificationEmail: '',
  webhookUrl: null,
  cronExpression: '0 0 * * *',
  extractionPlan: {
    intent: {
      scope: 'page',
      identityFields: [],
      fields: { title: { type: 'string', displayName: 'Title' } },
      triggerRules: [],
      triggerMatchMode: 'all',
    },
  },
  contractRevision: 'v1',
  status: 'ACTIVE',
  currentRun: run,
  lastError: null,
  captureScreenshotOnChange: false,
  createdAt: now,
  updatedAt: now,
};
let quotaReads = 0;
let secondPageRead = false;
await page.addInitScript(() => {
  window.EventSource = class extends EventTarget {
    constructor() {
      super();
      window.fixtureEvents = this;
      setTimeout(() => this.onopen?.(), 20);
    }
    close() {}
  };
});
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  let data;
  if (url.pathname === '/api/auth/me')
    data = {
      id: 'user',
      email: 'fixture@example.com',
      name: 'Fixture',
      timezone: 'UTC',
      createdAt: now,
    };
  else if (url.pathname === '/api/jobs') data = [job];
  else if (url.pathname.includes('/runs')) {
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    secondPageRead ||= pageNumber === 2;
    data = {
      runs:
        pageNumber === 1
          ? [run]
          : [{ ...valid, id: 'old', extractedData: { title: 'Older reading' } }],
      latestSuccessfulRun: valid,
      latestDiff: null,
      summary: { totalRuns: 21, changedRuns: 0, lastChange: null, averageDurationMs: 30 },
      pagination: {
        page: pageNumber,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
        hasNextPage: pageNumber === 1,
        hasPrevPage: pageNumber === 2,
      },
    };
  } else if (url.pathname.includes('/timeseries'))
    data = { jobId: job.id, points: [], totalPoints: 0, range: 'all' };
  else if (url.pathname === '/api/quotas') {
    quotaReads++;
    data = Object.fromEntries(
      ['activeMonitors', 'monthlyCompilations', 'monthlyExecutions'].map((key) => [
        key,
        { used: 1, limit: 100, remaining: 99 },
      ])
    );
  } else
    data = {
      totalJobs: 1,
      activeJobs: 1,
      recoveringOrCompilingJobs: 0,
      failedOrPausedJobs: 0,
      totalRuns: 1,
      DetectedChangesCount: 0,
    };
  await route.fulfill({ json: { data } });
});
const emit = (type) =>
  page.evaluate(
    (type) =>
      window.fixtureEvents.dispatchEvent(
        new MessageEvent(type, { data: JSON.stringify({ type, jobId: 'monitor' }) })
      ),
    type
  );
try {
  await page.goto(process.env.DASHBOARD_TEST_URL ?? 'http://127.0.0.1:3109/dashboard/');
  await page.getByText('CHECKING', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'User account menu' }).click();
  await page.getByRole('menuitem', { name: 'Profile' }).click();
  await page.getByText('User Profile', { exact: true }).waitFor();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  run.phase = 'RETRYING';
  await emit('JOB_UPDATED');
  await page.getByText('RETRYING', { exact: true }).waitFor();
  run.phase = 'RECOVERING';
  job.status = 'RECOVERING';
  await page.evaluate(() => window.fixtureEvents.onopen());
  await page.getByText('RECOVERING', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'View snapshots, compiled selectors and diff history' })
    .click();
  await page.locator('#run-card-cycle').waitFor();
  Object.assign(run, valid, { id: 'cycle', phase: null, recoveredAutomatically: true });
  job.currentRun = null;
  job.status = 'ACTIVE';
  await emit('JOB_RUN_COMPLETED');
  await page.getByText('Recovered automatically', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Go to next page' }).last().click();
  await page.getByText('Older reading', { exact: false }).waitFor();
  assert(secondPageRead);
  await page.getByRole('button', { name: 'Monitored data' }).click();
  await page.getByText('Last verified reading', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'User account menu' }).click();
  await page.getByRole('menuitem', { name: 'Profile' }).click();
  await page.waitForTimeout(100);
  assert(quotaReads > 1, 'Completion should invalidate quotas');
  await page.screenshot({ path: '/tmp/specter-recovery-dashboard.png', fullPage: true });
  console.log(
    'Dashboard checks passed: persisted progress, SSE update/reconnect, recovered badge, independent last reading, quota refresh.'
  );
} catch (error) {
  await page.screenshot({ path: '/tmp/specter-recovery-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
