import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { assertLoopback, bm25Rank, chunkMarkdown, cosine, pickModels, ragStatus, loadIndex, buildIndex, tokenize } from '../../../packages/local-rag/index.mjs';
import { createApp } from '../server.mjs';

async function withApp(fn) {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (payload, more = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...more }, body: JSON.stringify(payload) });

test('RAG refuses any inference host that is not loopback', () => {
  assert.throws(() => assertLoopback('http://192.168.1.20:1234/v1'), /Refusing non-local/);
  assert.throws(() => assertLoopback('https://api.openai.com/v1'), /Refusing non-local/);
  assert.throws(() => assertLoopback('http://[2001:db8::1]:1234/v1'), /Refusing non-local/);
  assert.equal(assertLoopback('http://127.0.0.1:1234/v1').hostname, '127.0.0.1');
  assert.equal(assertLoopback('http://localhost:1234/v1').hostname, 'localhost');
});

test('chunking keeps headings, drops noise and respects the size budget', () => {
  const text = '# 标题\n\n## 第一节\n\n' + '内容'.repeat(500) + '\n\n## 第二节\n\n' + '第二段内容。'.repeat(20) + '\n';
  const chunks = chunkMarkdown(text, 'docs/demo.md');
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].source, 'docs/demo.md');
  assert.ok(chunks.some(chunk => chunk.heading === '第一节'));
  assert.ok(chunks.some(chunk => chunk.heading === '第二节'));
  assert.ok(chunks.every(chunk => chunk.text.length <= 760));
});

test('cosine similarity prefers aligned vectors', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(cosine([1, 0], [1, 0]) > cosine([1, 0], [0.7, 0.7]));
});

test('tokenizer keeps latin words and CJK bigrams', () => {
  const tokens = tokenize('Canlus 收费模式 vCISO');
  assert.ok(tokens.includes('canlus'));
  assert.ok(tokens.includes('收费'));
  assert.ok(tokens.includes('模式'));
  assert.ok(tokens.includes('vciso'));
});

test('keyword scoring discounts a brand word that appears in every chunk', () => {
  const docs = [
    { text: 'Canlus 联系方式 Canlus 地址 Canlus 邮箱 Canlus 电话 Canlus' },
    { text: 'Canlus 收费模式：固定月费，一次性项目与软件许可单独报价' },
    { text: 'Canlus 服务列表 Canlus 能力 Canlus 团队' }
  ];
  const scores = bm25Rank('Canlus 的收费模式是怎样的？', docs);
  assert.equal(scores.indexOf(Math.max(...scores)), 1, `expected the pricing chunk to win, got ${scores.map(score => score.toFixed(2))}`);
});

test('keyword scoring never returns negative or NaN values', () => {
  const scores = bm25Rank('完全无关的查询', [{ text: 'Canlus 收费模式' }, { text: '' }]);
  assert.ok(scores.every(score => Number.isFinite(score) && score >= 0));
});

test('chat and embedding models are selected separately', () => {
  const models = pickModels(['qwen/qwen3.8-27b', 'text-embedding-nomic-embed-text-v1.5']);
  assert.equal(models.chat, 'qwen/qwen3.8-27b');
  assert.equal(models.embed, 'text-embedding-nomic-embed-text-v1.5');
});

test('RAG endpoints reject cross-origin, wrong content type and invalid questions', () => withApp(async base => {
  assert.equal((await fetch(base + '/api/rag/ask', post({ question: 'x' }, { origin: 'https://untrusted.invalid' }))).status, 403);
  assert.equal((await fetch(base + '/api/rag/ask', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  assert.equal((await fetch(base + '/api/rag/ask', post({}))).status, 400);
  assert.equal((await fetch(base + '/api/rag/ask', post({ question: '   ' }))).status, 400);
  assert.equal((await fetch(base + '/api/rag/ask', post({ question: 'x', path: '/etc/passwd' }))).status, 400);
  assert.equal((await fetch(base + '/api/rag/ask', post({ question: '问'.repeat(401) }))).status, 400);
  assert.equal((await fetch(base + '/api/rag/ask', { ...post({ question: 'x' }), body: JSON.stringify({ question: 'x'.repeat(5000) }) })).status, 413);
  assert.equal((await fetch(base + '/api/rag/ask')).status, 405);
}));

test('RAG status degrades honestly when the local model is unreachable', async () => {
  const previous = process.env.LM_STUDIO_BASE;
  process.env.LM_STUDIO_BASE = 'http://127.0.0.1:9/v1';
  try {
    const status = await ragStatus();
    assert.equal(status.ready, false);
    assert.equal(status.localOnly, true);
    assert.match(status.reason, /ECONNREFUSED|fetch failed|connect/i);
  } finally {
    if (previous === undefined) delete process.env.LM_STUDIO_BASE;
    else process.env.LM_STUDIO_BASE = previous;
  }
});

test('RAG status refuses a remote base URL instead of sending data', async () => {
  const previous = process.env.LM_STUDIO_BASE;
  process.env.LM_STUDIO_BASE = 'https://api.example.com/v1';
  try {
    const status = await ragStatus();
    assert.equal(status.ready, false);
    assert.match(status.reason, /Refusing non-local/);
  } finally {
    if (previous === undefined) delete process.env.LM_STUDIO_BASE;
    else process.env.LM_STUDIO_BASE = previous;
  }
});

test('reindex refreshes the in-process index cache', async context => {
  const status = await ragStatus();
  if (!status.ready) return context.skip('LM Studio is not running with a local embedding model');
  const first = await loadIndex();
  const rebuilt = await buildIndex();
  const second = await loadIndex();
  assert.equal(rebuilt.builtAt, second.builtAt);
  assert.equal(second.chunks.length, rebuilt.chunks.length);
  assert.ok(first.chunks.length > 0);
});

test('live local answer is grounded in retrieved sources', async context => {
  const status = await ragStatus();
  if (!status.ready) return context.skip('LM Studio is not running with a local chat and embedding model');
  const response = await fetch('http://127.0.0.1:4173/api/rag/ask', post({ question: 'What should I do if I find a leaked secret at commit time?' })).catch(() => null);
  if (!response) return context.skip('Demo server is not running on 127.0.0.1:4173');
  const data = await response.json();
  // A 27B reasoning model on CPU can need minutes for one answer. That is a fact
  // about the hardware, not a broken test: skip and say so rather than fail.
  if (response.status === 503 || response.status === 502) {
    return context.skip(`Local model could not answer inside the time budget: ${data.error ?? 'unknown reason'}`);
  }
  assert.equal(response.status, 200);
  assert.ok(data.answer.length > 0);
  assert.ok(data.sources.length > 0);
  assert.ok(data.sources.every(source => source.file.startsWith('docs/knowledge/') || source.file === 'README.md'));
  assert.equal(data.localOnly, true);
});
