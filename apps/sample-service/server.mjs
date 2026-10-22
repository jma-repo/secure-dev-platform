import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, EXPECTED_NODE, toolStatus, scanScenario } from '../../packages/security-policy/index.mjs';
import { ragStatus, askQuestion, buildIndex } from '../../packages/local-rag/index.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);
const defaultEvidence = {
  generatedAt: null,
  checks: [
    { id: 'local', label: '本地验证', status: 'not_run', detail: '运行 node scripts/verify.mjs 生成真实证据。' },
    { id: 'ci', label: 'GitHub Actions / CodeQL', status: 'not_run', detail: '配置已提供；未推送、未在 GitHub 运行。' },
    { id: 'review', label: '分支保护 / CODEOWNERS', status: 'not_run', detail: '需仓库管理员替换负责人并启用保护。' },
    { id: 'container', label: '容器构建与镜像扫描', status: 'not_run', detail: '需要可用的 Docker 引擎。' }
  ]
};

export async function loadEvidence() {
  try {
    const data = JSON.parse(await readFile(resolve(ROOT, 'outputs/evidence.json'), 'utf8'));
    if (!Array.isArray(data.checks)) throw new Error('Invalid evidence');
    return data;
  } catch { return defaultEvidence; }
}

export function createApp({ scan = scanScenario } = {}) {
  let busy = false;
  let ragBusy = false;
  function reply(res, code, value, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type });
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  }
  function sameOrigin(req, authority) {
    if (req.headers.origin && req.headers.origin !== 'http://' + authority) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    return true;
  }
  async function readJson(req, res, limit) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) { reply(res, 415, { error: 'application/json required' }); return null; }
    let body = '';
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > limit) { reply(res, 413, { error: 'Body too large' }); return null; }
      body += chunk.toString('utf8');
    }
    try { return JSON.parse(body); } catch { reply(res, 400, { error: 'Invalid JSON' }); return null; }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Mitigate DNS rebinding: only local hostnames may reach this unauthenticated demo.
      const authority = req.headers.host ?? '';
      let hostname;
      try { hostname = new URL('http://' + authority).hostname; } catch { return reply(res, 400, { error: 'Invalid host' }); }
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return reply(res, 403, { error: 'Local demo only' });
      const path = (req.url ?? '/').split('?')[0];
      if (req.method === 'GET' && path === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && path === '/healthz') return reply(res, 200, { status: 'ok', service: 'sentinel-poc' });
      if (req.method === 'GET' && path === '/api/evidence') return reply(res, 200, await loadEvidence());
      if (req.method === 'GET' && path === '/api/status') {
        const names = ['gitleaks', 'trivy', 'terraform'];
        const statuses = await Promise.all(names.map(toolStatus));
        return reply(res, 200, {
          name: 'Sentinel Secure Dev Platform', version: '0.1.0', nodeVersion: process.versions.node,
          expectedNode: EXPECTED_NODE,
          environment: { platform: process.platform, arch: process.arch, mode: 'Local-only PoC; not a production control plane' },
          tools: Object.fromEntries(names.map((name, index) => [name, statuses[index]])), evidence: await loadEvidence()
        });
      }
      if (path === '/api/demo/secret') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { error: 'POST required' }); }
        // Browser calls must be same-origin; CLI without Origin is allowed locally.
        if (req.headers.origin && req.headers.origin !== 'http://' + authority) return reply(res, 403, { error: 'Cross-origin requests are not allowed' });
        if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, { error: 'Cross-site requests are not allowed' });
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return reply(res, 415, { error: 'application/json required' });
        let body = '';
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 1024) return reply(res, 413, { error: 'Body too large' });
          body += chunk.toString('utf8');
        }
        let payload;
        try { payload = JSON.parse(body); } catch { return reply(res, 400, { error: 'Invalid JSON' }); }
        if (!payload || !['leak', 'clean'].includes(payload.scenario) || Object.keys(payload).some(key => key !== 'scenario')) return reply(res, 400, { error: 'Only scenario leak or clean is supported' });
        if (busy) return reply(res, 429, { error: 'A scan is already running' });
        busy = true;
        try {
          const result = await scan(payload.scenario);
          return reply(res, result.status === 'unavailable' ? 503 : result.status === 'error' ? 500 : 200, result);
        } finally { busy = false; }
      }
      if (req.method === 'GET' && path === '/api/rag/status') return reply(res, 200, await ragStatus());
      if (path === '/api/rag/ask') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { error: 'POST required' }); }
        if (!sameOrigin(req, authority)) return reply(res, 403, { error: 'Cross-origin requests are not allowed' });
        const payload = await readJson(req, res, 4096);
        if (!payload) return;
        if (typeof payload.question !== 'string' || !payload.question.trim()) return reply(res, 400, { error: 'question is required' });
        if (Object.keys(payload).some(key => key !== 'question')) return reply(res, 400, { error: 'Only question is supported' });
        if (payload.question.length > 400) return reply(res, 400, { error: 'Question is limited to 400 characters' });
        if (ragBusy) return reply(res, 429, { error: 'A question is already running' });
        ragBusy = true;
        try {
          return reply(res, 200, await askQuestion(payload.question));
        } catch (error) {
          return reply(res, error.statusCode ?? 503, { error: error.message || 'Local model unavailable' });
        } finally { ragBusy = false; }
      }
      if (path === '/api/rag/reindex') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { error: 'POST required' }); }
        if (!sameOrigin(req, authority)) return reply(res, 403, { error: 'Cross-origin requests are not allowed' });
        if (ragBusy) return reply(res, 429, { error: 'A question is already running' });
        ragBusy = true;
        try {
          const index = await buildIndex();
          return reply(res, 200, { rebuilt: true, chunks: index.chunks.length, embedModel: index.embedModel, builtAt: index.builtAt });
        } catch (error) {
          return reply(res, 503, { error: error.message || 'Reindex failed' });
        } finally { ragBusy = false; }
      }
      if (req.method === 'GET' && assets.has(path)) {
        const [filename, type] = assets.get(path);
        return reply(res, 200, await readFile(resolve(publicDir, filename)), type);
      }
      return reply(res, 404, { error: 'Not found' });
    } catch {
      if (!res.headersSent) reply(res, 500, { error: 'Request failed; no successful result recorded' });
      else res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createApp();
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.listen(port, host, () => console.log(`Sentinel PoC listening at http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
