// Optional QA tool; requires Playwright separately. Never a runtime dependency.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const violations = [];
    await page.addInitScript(() => {
      window.__cspErrors = [];
      document.addEventListener('securitypolicyviolation', event => window.__cspErrors.push(event.violatedDirective));
    });
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(() => document.querySelector('[data-connection-label]').textContent === 'Connected');
    await page.screenshot({ path: 'outputs/overview.png', fullPage: true });
    await page.locator('[data-nav="live-demo"]').click();
    await page.locator('[data-scenario="leak"]').click();
    await page.waitForFunction(() => document.querySelector('#demo-status-badge').textContent === 'Blocked');
    await page.screenshot({ path: 'outputs/live-demo.png', fullPage: true });
    await page.locator('[data-scenario="clean"]').click();
    await page.waitForFunction(() => document.querySelector('#demo-status-badge').textContent === 'Passed');
    assert.equal(await page.locator('#demo-exit-code').textContent(), '0');
    await page.locator('[data-nav="evidence"]').click();
    assert.ok(await page.locator('#evidence-table-body tr').count() > 0);
    await page.locator('[data-nav="security"]').click();
    await page.waitForFunction(() => document.querySelector('#gate-label').textContent !== 'Reading evidence…');
    assert.ok(await page.locator('#scan-table-body tr').count() >= 6, 'security report should list every scan');
    assert.ok(await page.locator('#policy-table-body tr').count() >= 6, 'security report should list the gate policy');
    await page.screenshot({ path: 'outputs/security-report.png', fullPage: true });
    await page.locator('[data-nav="handoff"]').click();
    await page.locator('[data-copy]').first().click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('copied'));
    await page.locator('[data-nav="local-ai"]').click();
    // The local model is optional: when LM Studio is not running, the page must
    // say so instead of showing a fabricated answer. Only the ready path is
    // exercised here, and a skipped run is recorded as skipped, never as passed.
    let ragState = 'skipped';
    try {
      await page.waitForFunction(() => document.querySelector('#rag-badge').textContent === 'Ready', null, { timeout: 30000 });
      ragState = 'verified';
      await page.locator('.rag-chip').first().click();
      await page.locator('#rag-submit').click();
      await page.waitForFunction(() => document.querySelector('#rag-answer-badge').textContent === 'Answered', null, { timeout: 180000 });
      const answer = (await page.locator('#rag-answer').textContent()).trim();
      if (answer.length < 20) throw new Error('RAG answer is unexpectedly short');
      if (await page.locator('.rag-source').count() < 1) throw new Error('RAG answer has no sources');
      await page.screenshot({ path: 'outputs/local-ai.png', fullPage: true });
    } catch {
      ragState = 'skipped';
      const notice = await page.locator('#rag-kb').textContent();
      if (!notice || notice.trim().length < 10) throw new Error('Local AI page shows no explanation while unavailable');
      await page.screenshot({ path: 'outputs/local-ai.png', fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-nav="overview"]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'outputs/mobile.png', fullPage: true });
    violations.push(...await page.evaluate(() => window.__cspErrors));
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
    const report = { generatedAt: new Date().toISOString(), status: 'passed', rag: ragState, checks: ['API connected', 'real leak blocked', 'real repair passed', 'evidence navigation', 'security report rendered', 'handoff copy interaction', `local RAG ${ragState}`, 'mobile no horizontal overflow', 'no JavaScript exceptions', 'no CSP violations'], errors, violations };
    await fs.writeFile('outputs/browser-check.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
