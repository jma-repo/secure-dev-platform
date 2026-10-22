import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStaged } from '../../../scripts/pre-commit.mjs';
import { createApp } from '../server.mjs';
import { makeFixture, scanScenario, toolStatus } from '../../../packages/security-policy/index.mjs';

async function withApp(fn, options) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (scenario, more = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...more }, body: JSON.stringify({ scenario }) });

test('health returns structured status', () => withApp(async base => {
  const response = await fetch(base + '/healthz');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
}));

test('security headers restrict scripts, frames and browser permissions', () => withApp(async base => {
  const response = await fetch(base);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /SENTINEL/i);
}));

test('source, dotfiles and traversal paths are never served', () => withApp(async base => {
  for (const path of ['/.env', '/server.mjs', '/package.json', '/%2e%2e%2fpackage.json', '/.git/config']) assert.equal((await fetch(base + path)).status, 404);
}));

test('cross-origin scanner requests are denied', () => withApp(async base => {
  assert.equal((await fetch(base + '/api/demo/secret', post('leak', { origin: 'https://untrusted.invalid' }))).status, 403);
  assert.equal((await fetch(base + '/api/demo/secret', post('leak', { 'sec-fetch-site': 'cross-site' }))).status, 403);
}));

test('foreign Host is denied to reduce DNS rebinding exposure', () => withApp(async base => {
  const status = await new Promise((resolve, reject) => {
    http.get(base + '/healthz', { headers: { host: 'untrusted.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
}));

test('scanner endpoint only accepts constrained JSON POST', () => withApp(async base => {
  assert.equal((await fetch(base + '/api/demo/secret')).status, 405);
  assert.equal((await fetch(base + '/api/demo/secret', { method: 'POST', body: 'hello' })).status, 415);
  assert.equal((await fetch(base + '/api/demo/secret', post('; arbitrary shell command'))).status, 400);
  assert.equal((await fetch(base + '/api/demo/secret', { ...post('clean'), body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/demo/secret', { ...post('clean'), body: JSON.stringify({ scenario: 'clean', path: '/' }) })).status, 400);
}));

test('request body limits are enforced', () => withApp(async base => {
  assert.equal((await fetch(base + '/api/demo/secret', { ...post('clean'), body: JSON.stringify({ scenario: 'x'.repeat(2000) }) })).status, 413);
}));

test('missing scanners cannot be reported as successful', () => withApp(async base => {
  const response = await fetch(base + '/api/demo/secret', post('clean'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, 'unavailable');
}, { scan: async () => ({ status: 'unavailable' }) }));

test('failed scanners cannot be reported as successful', () => withApp(async base => {
  assert.equal((await fetch(base + '/api/demo/secret', post('clean'))).status, 500);
}, { scan: async () => ({ status: 'error' }) }));

test('concurrent scans are rejected, then slot is released', async () => {
  let release;
  let notify;
  const entered = new Promise(resolve => { notify = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  await withApp(async base => {
    const first = fetch(base + '/api/demo/secret', post('clean'));
    await entered;
    assert.equal((await fetch(base + '/api/demo/secret', post('leak'))).status, 429);
    release();
    assert.equal((await first).status, 200);
  }, { scan: async () => { notify(); await wait; return { status: 'passed' }; } });
});

test('fixture contract is synthetic and rejects arbitrary input', () => {
  assert.match(makeFixture('leak'), /^API_TOKEN=/);
  assert.match(makeFixture('clean'), /INJECT_AT_RUNTIME/);
  assert.throws(() => makeFixture('../secrets'));
});

test('real pinned Gitleaks blocks the synthetic fixture and accepts the repair', async context => {
  if (!(await toolStatus('gitleaks')).available) return context.skip('Run bootstrap-tools.py gitleaks for the integration check');
  const bad = await scanScenario('leak');
  const good = await scanScenario('clean');
  assert.equal(bad.status, 'blocked');
  assert.equal(bad.exitCode, 42);
  assert.equal(bad.findings[0].ruleId, 'sentinel-demo-token');
  assert.equal(good.status, 'passed');
  assert.equal(good.exitCode, 0);
  assert.equal(good.findings.length, 0);
  assert.ok(!JSON.stringify(bad).includes('0123456789abcdef'));
});

test('pre-commit uses staged files and staged policy, not unstaged repairs or relaxed rules', async context => {
  if (!(await toolStatus('gitleaks')).available) return context.skip('Install pinned Gitleaks for integration checks');
  const directory = await mkdtemp(join(tmpdir(), 'sentinel-hook-test-'));
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git(['init', '--quiet']);
    const policy = await readFile(new URL('../../../.gitleaks.toml', import.meta.url), 'utf8');
    await writeFile(join(directory, '.gitleaks.toml'), policy);
    await writeFile(join(directory, 'fixture.env'), makeFixture('leak'));
    git(['add', '.gitleaks.toml', 'fixture.env']);
    await writeFile(join(directory, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
    await writeFile(join(directory, 'fixture.env'), makeFixture('clean'));
    assert.equal((await checkStaged(directory)).status, 'blocked');
    git(['add', 'fixture.env']);
    assert.equal((await checkStaged(directory)).status, 'passed');
    git(['update-index', '--force-remove', '.gitleaks.toml']);
    assert.equal((await checkStaged(directory)).status, 'error');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('type-changed staged entries are included in the gate', async () => {
  // Static contract protects inclusion of Git T entries without requiring
  // symlink creation privileges on Windows. Runtime hook paths tested above.
  const source = await readFile(new URL('../../../scripts/pre-commit.mjs', import.meta.url), 'utf8');
  assert.match(source, /--diff-filter=ACMRT/);
});
