import assert from 'node:assert/strict';
import { assertLoopback } from '../packages/local-rag/index.mjs';

const base = process.env.DEMO_URL ?? 'http://127.0.0.1:4173';
const timeout = ms => AbortSignal.timeout(ms);

async function json(path, options) {
  const response = await fetch(base + path, { ...options, signal: timeout(180000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${data.error ?? 'unknown error'}`);
  return data;
}

console.log(`1. Checking local model at ${base} ...`);
const status = await json('/api/rag/status');
console.log(`   ready=${status.ready} docs=${status.documents} chunks=${status.chunks}`);
console.log(`   chat=${status.chatModel} embed=${status.embedModel}`);
console.log(`   endpoint=${status.endpoint} localOnly=${status.localOnly}`);
assert.equal(status.ready, true, `RAG not ready: ${status.reason}. Start LM Studio server on port 1234 and load both models.`);

console.log('2. Asking an answerable question ...');
const first = await json('/api/rag/ask', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'What should I do if I find a leaked secret at commit time?' })
});
assert.ok(first.answer.length > 20, 'Answer is unexpectedly short');
assert.ok(first.sources.length > 0, 'Answer has no sources');
assert.equal(first.localOnly, true);
console.log(`   answer: ${first.answer.replace(/\s+/g, ' ').slice(0, 160)}...`);
console.log(`   sources: ${first.sources.map(source => `${source.file}#${source.heading} (${source.score})`).join(' | ')}`);
console.log(`   model=${first.model} elapsed=${first.elapsedMs}ms`);

console.log('3. Asking something the knowledge base does not cover ...');
const second = await json('/api/rag/ask', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'How many days of annual leave do I get?' })
});
console.log(`   answer: ${second.answer.replace(/\s+/g, ' ').slice(0, 160)}`);
if (!/does not cover|not covered|no information|not in the material|does not mention|not specified/i.test(second.answer)) {
  console.log('   WARNING: the model did not explicitly say the documents lack this information. Review the answer manually.');
}

console.log('4. Verifying the loopback-only guard ...');
assert.throws(() => assertLoopback('https://api.openai.com/v1'), /Refusing non-local/);
assert.throws(() => assertLoopback('http://192.168.1.10:1234/v1'), /Refusing non-local/);
console.log('   remote inference hosts are rejected before any request is made');
console.log('');
console.log('Local RAG smoke check passed. Data path: browser -> 127.0.0.1:4173 -> 127.0.0.1:1234.');
