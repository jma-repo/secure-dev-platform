import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const INDEX_DIR = join(ROOT, '.rag');
export const INDEX_FILE = join(INDEX_DIR, 'index.json');
export const DEFAULT_BASE = 'http://127.0.0.1:1234/v1';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const DOC_DIRS = ['docs/knowledge'];
const EXTRA_DOCS = ['README.md'];
const CHUNK_CHARS = 760;

export function localBase() {
  return (process.env.LM_STUDIO_BASE ?? DEFAULT_BASE).replace(/\/+$/, '');
}

// Hard guard: the RAG path must never be pointed at a remote inference host,
// otherwise "data does not leave the machine" would be a claim without a control.
export function assertLoopback(base = localBase()) {
  let url;
  try { url = new URL(base); } catch { throw new Error('LM Studio base URL is invalid'); }
  if (!LOOPBACK.has(url.hostname)) throw new Error(`Refusing non-local inference host: ${url.hostname}. Only loopback is allowed.`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported protocol');
  return url;
}

async function call(path, body, timeoutMs) {
  const url = new URL(assertLoopback().origin + '/v1' + path);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}`);
  return response.json();
}

export async function listModels() {
  const data = await call('/models', null, 5000);
  return (data.data ?? []).map(item => item.id).filter(id => typeof id === 'string');
}

// Interactive use needs an answer in seconds, not minutes. A 27B model on CPU
// runs at about 4 tokens per second, which is unusable in front of a customer,
// so the small model is preferred and the large one stays loaded for quality
// comparison. Override with LOCAL_CHAT_MODEL=<model id> when quality matters
// more than latency.
const CHAT_PREFERENCE = ['qwen2.5-3b-instruct', 'qwen/qwen3.8-27b'];

export function pickModels(ids) {
  const embed = ids.find(id => /embed/i.test(id));
  const override = process.env.LOCAL_CHAT_MODEL;
  const chat = (override && ids.includes(override) ? override : null)
    ?? CHAT_PREFERENCE.find(preferred => ids.includes(preferred))
    ?? ids.find(id => !/embed/i.test(id));
  return { chat: chat ?? null, embed: embed ?? null };
}

export function chunkMarkdown(text, source) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let heading = 'Document start';
  let buffer = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body.length > 40) chunks.push({ source, heading, text: body });
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^#{1,4}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    if (line.length > CHUNK_CHARS) {
      // A single oversized paragraph must not produce an unbounded chunk.
      for (let start = 0; start < line.length; start += CHUNK_CHARS) {
        buffer.push(line.slice(start, start + CHUNK_CHARS));
        flush();
      }
      continue;
    }
    if (buffer.length && buffer.join('\n').length + line.length + 1 > CHUNK_CHARS) flush();
    buffer.push(line);
  }
  flush();
  return chunks;
}

async function corpusFiles() {
  const files = [];
  for (const directory of DOC_DIRS) {
    const absolute = join(ROOT, directory);
    let entries = [];
    try { entries = await readdir(absolute, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(join(absolute, entry.name));
    }
  }
  for (const file of EXTRA_DOCS) files.push(join(ROOT, file));
  return files;
}

async function embedTexts(texts, model) {
  const vectors = [];
  for (let index = 0; index < texts.length; index += 16) {
    const batch = texts.slice(index, index + 16);
    const data = await call('/embeddings', { model, input: batch }, 60000);
    const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new Error('Embedding count mismatch');
    for (const row of rows) {
      const vector = row.embedding;
      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
      vectors.push(vector.map(value => value / norm));
    }
  }
  return vectors;
}

export async function buildIndex() {
  const ids = await listModels();
  const models = pickModels(ids);
  if (!models.embed) throw new Error('No local embedding model is loaded');
  const files = await corpusFiles();
  const chunks = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const chunk of chunkMarkdown(text, relative(ROOT, file).split(sep).join('/'))) chunks.push(chunk);
  }
  if (!chunks.length) throw new Error('No knowledge documents found');
  // Nomic embeddings expect task prefixes for asymmetric search.
  const vectors = await embedTexts(chunks.map(chunk => 'search_document: ' + chunk.heading + '\n' + chunk.text), models.embed);
  const payload = {
    builtAt: new Date().toISOString(),
    embedModel: models.embed,
    chatModel: models.chat,
    dimensions: vectors[0].length,
    chunks: chunks.map((chunk, index) => ({ ...chunk, vector: vectors[index].map(value => Number(value.toFixed(6))) }))
  };
  await mkdir(INDEX_DIR, { recursive: true });
  await writeFile(INDEX_FILE, JSON.stringify(payload));
  cached = payload;
  return payload;
}

let cached = null;

export async function loadIndex({ rebuild = false } = {}) {
  if (!rebuild && cached) return cached;
  try {
    const data = JSON.parse(await readFile(INDEX_FILE, 'utf8'));
    if (!Array.isArray(data.chunks) || !data.chunks.length) throw new Error('empty');
    cached = data;
    return data;
  } catch {
    cached = await buildIndex();
    return cached;
  }
}

export async function ragStatus() {
  const status = { localOnly: true, endpoint: null, embedModel: null, chatModel: null, documents: 0, chunks: 0, builtAt: null, ready: false, reason: null };
  try {
    const base = assertLoopback();
    status.endpoint = base.origin;
    const ids = await listModels();
    const models = pickModels(ids);
    Object.assign(status, { embedModel: models.embed, chatModel: models.chat });
    if (!models.embed) { status.reason = 'No local embedding model loaded in LM Studio'; return status; }
    const index = await loadIndex();
    Object.assign(status, { documents: new Set(index.chunks.map(chunk => chunk.source)).size, chunks: index.chunks.length, builtAt: index.builtAt, ready: true });
  } catch (error) {
    status.reason = error.name === 'TimeoutError' ? 'Local model server did not respond in time' : error.message;
  }
  return status;
}

export function cosine(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}

// The bundled embedding model is English-first, so a Chinese question that also
// names the brand ("Canlus 怎么收费") drifts toward whichever chunk repeats the
// brand. Keyword scoring with IDF fixes that without a second model.
export function tokenize(text) {
  const value = String(text ?? '').toLowerCase();
  const tokens = value.match(/[a-z0-9][a-z0-9._+-]*/g) ?? [];
  for (const run of value.match(/[\u3400-\u9fff]+/g) ?? []) {
    for (let index = 0; index < run.length; index += 1) {
      tokens.push(run[index]);
      if (index + 1 < run.length) tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
}

export function bm25Rank(query, documents, { k1 = 1.2, b = 0.75 } = {}) {
  const queryTokens = [...new Set(tokenize(query))];
  const tokenized = documents.map(document => tokenize(document.text));
  const averageLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / (tokenized.length || 1);
  const documentFrequency = new Map();
  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const total = tokenized.length || 1;
  return tokenized.map(tokens => {
    const frequency = new Map();
    for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
    let score = 0;
    for (const token of queryTokens) {
      const count = frequency.get(token) ?? 0;
      if (!count) continue;
      const idf = Math.log(1 + (total - documentFrequency.get(token) + 0.5) / (documentFrequency.get(token) + 0.5));
      score += idf * (count * (k1 + 1)) / (count + k1 * (1 - b + (b * tokens.length) / (averageLength || 1)));
    }
    return score;
  });
}

export async function askQuestion(question) {
  const started = performance.now();
  const text = String(question ?? '').trim();
  if (!text) throw Object.assign(new Error('Question is required'), { statusCode: 400 });
  if (text.length > 400) throw Object.assign(new Error('Question is limited to 400 characters'), { statusCode: 400 });
  const index = await loadIndex();
  const ids = await listModels();
  const models = pickModels(ids);
  if (!models.chat || !models.embed) throw Object.assign(new Error('Local chat or embedding model is not loaded'), { statusCode: 503 });
  const [queryVector] = await embedTexts(['search_query: ' + text], models.embed);
  const keyword = bm25Rank(text, index.chunks.map(chunk => ({ text: chunk.heading + '\n' + chunk.text })));
  const keywordCeiling = Math.max(...keyword, 0);
  const ranked = index.chunks
    .map((chunk, position) => {
      const semantic = cosine(queryVector, chunk.vector);
      const lexical = keywordCeiling > 0 ? keyword[position] / keywordCeiling : 0;
      return { chunk, semantic, lexical, score: 0.55 * semantic + 0.45 * lexical };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const context = ranked.map((item, position) => `[${position + 1}] Source: ${item.chunk.source} · ${item.chunk.heading}\n${item.chunk.text}`).join('\n\n');
  // This model reasons before it answers, and the server ignores both
  // chat_template_kwargs.enable_thinking and the /no_think soft switch. The
  // chat endpoint keeps the reasoning in a separate field, so the budget has to
  // cover reasoning plus the answer. The raw completion endpoint has no such
  // separation and leaks the reasoning into the visible text, which is why it is
  // not used here.
  //
  // On CPU this model produces roughly 4 tokens per second, so a question costs
  // about a minute. That latency is the real price of keeping the data on the
  // machine, and it is measured and reported rather than hidden.
  const request = {
    model: models.chat,
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: 'system', content: 'You are the SENTINEL internal knowledge assistant. Answer in English, using only the supplied material. Never add rules, commands or numbers that are not in the material. If the material does not answer the question, say "The material does not cover this" and name what is missing. Mark each key claim with its source number, for example [1]. Stay within four sentences and do not restate the question.' },
      { role: 'user', content: `[Material]\n${context}\n\n[Question]\n${text}` }
    ]
  };
  let completion;
  try {
    completion = await call('/chat/completions', { ...request, chat_template_kwargs: { enable_thinking: false } }, 240000);
  } catch (error) {
    if (!/HTTP 4\d\d/.test(String(error.message))) throw error;
    completion = await call('/chat/completions', request, 240000);
  }
  const answer = (completion.choices?.[0]?.message?.content ?? '').replace(/<\/?think>/gi, '').trim();
  if (!answer) {
    throw Object.assign(new Error('The local model spent its whole token budget on reasoning and returned no answer. Raise max_tokens, or load a smaller model for interactive use.'), { statusCode: 502 });
  }
  return {
    answer,
    sources: ranked.map(item => ({
      file: item.chunk.source,
      heading: item.chunk.heading,
      score: Number(item.score.toFixed(3)),
      semantic: Number(item.semantic.toFixed(3)),
      lexical: Number(item.lexical.toFixed(3))
    })),
    model: models.chat,
    embeddingModel: models.embed,
    retrieval: 'hybrid',
    localOnly: true,
    elapsedMs: Math.round(performance.now() - started)
  };
}
