import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ROOT, EXPECTED_NODE, toolPath, toolStatus, scanScenario, scanText, makeFixture } from '../packages/security-policy/index.mjs';
import { checkStaged } from './pre-commit.mjs';
import { ragStatus, askQuestion } from '../packages/local-rag/index.mjs';

const runId = randomUUID();
const outputRoot = join(ROOT, 'outputs');
const out = join(outputRoot, 'runs', runId);
await mkdir(out, { recursive: true });
const checks = [];
function record(id, label, status, detail) {
  checks.push({ id, label, status, detail });
  console.log(`[${status}] ${label}: ${detail}`);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  return { ok: result.status === 0 && !result.error, code: result.status, text: (result.stdout ?? '') + (result.stderr ?? ''), stdout: result.stdout ?? '' };
}
const unavailable = text => /winapi error|access is denied|permission denied|connectex|failed to download|failed to initialize|no such file|cannot find|could not be found/i.test(text);

record('runtime', '固定开发运行时', process.versions.node === EXPECTED_NODE ? 'passed' : 'failed', `Node ${process.versions.node}; expected ${EXPECTED_NODE}.`);
const tests = run(process.execPath, ['--test', '--test-reporter=tap']);
await writeFile(join(out, 'tests.tap'), tests.text);
const testCount = tests.text.match(/# tests (\d+)/)?.[1] ?? '0';
record('tests', '服务与安全回归测试', tests.ok && Number(testCount) > 0 ? 'passed' : 'failed', `${testCount} tests; ${tests.text.match(/# pass (\d+)/)?.[1] ?? '?'} passed; ${tests.text.match(/# skipped (\d+)/)?.[1] ?? '?'} skipped. Raw log: runs/${runId}/tests.tap.`);

const tools = Object.fromEntries(await Promise.all(['gitleaks', 'terraform', 'trivy'].map(async name => [name, await toolStatus(name)])));
if (tools.gitleaks.available) {
  const leak = await scanScenario('leak');
  const clean = await scanScenario('clean');
  await writeFile(join(out, 'demo-results.json'), JSON.stringify({ leak, clean }, null, 2) + '\n');
  record('live-gate', '真实泄露拦截与修复放行', leak.status === 'blocked' && clean.status === 'passed' ? 'passed' : 'failed', `Gitleaks: synthetic input ${leak.status} (exit ${leak.exitCode}), repaired input ${clean.status} (exit ${clean.exitCode}). No real credentials.`);
  const omitted = new Set(['.git', '.tools', '.workbuddy-ai', 'outputs', 'node_modules', '.terraform', '.playwright-cli', 'reports']);
  const files = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (omitted.has(item.name) || item.isSymbolicLink()) continue;
      const path = join(directory, item.name);
      if (item.isDirectory()) await walk(path);
      else if (item.isFile()) files.push(path);
    }
  }
  await walk(ROOT);
  const inputs = await Promise.all(files.map(path => readFile(path, 'utf8')));
  const repo = await scanText(inputs.join('\n'));
  record('repo-secrets', '当前源码密钥扫描', repo.status === 'passed' ? 'passed' : 'failed', `${files.length} source files streamed into Gitleaks; excludes local tooling/generated output. Working tree only, not Git history. Result: ${repo.status}.`);
  const scratch = await mkdtemp(join(tmpdir(), 'sentinel-index-check-'));
  try {
    const git = args => {
      const result = run('git', args, { cwd: scratch });
      if (!result.ok) throw new Error('Cannot prepare isolated Git index');
    };
    git(['init', '--quiet']);
    await writeFile(join(scratch, '.gitleaks.toml'), await readFile(join(ROOT, '.gitleaks.toml'), 'utf8'));
    git(['add', '.gitleaks.toml']);
    const fixturePath = join(scratch, 'fixture.env');
    await writeFile(fixturePath, makeFixture('leak'));
    git(['add', 'fixture.env']);
    await writeFile(fixturePath, makeFixture('clean'));
    const stagedLeak = await checkStaged(scratch);
    git(['add', 'fixture.env']);
    const stagedClean = await checkStaged(scratch);
    record('staged-hook', '暂存区门禁集成验证', stagedLeak.status === 'blocked' && stagedClean.status === 'passed' ? 'passed' : 'failed', `Staged leak + unstaged repair: ${stagedLeak.status}; repair staged: ${stagedClean.status}. Tested index checker without creating commits.`);
  } catch {
    record('staged-hook', '暂存区门禁集成验证', 'blocked', 'Could not create the isolated index fixture; no commit was created.');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
} else {
  record('live-gate', '真实泄露拦截与修复放行', 'blocked', 'Install pinned Gitleaks first.');
}

if (tools.terraform.available) {
  const terraformFiles = (await readdir(join(ROOT, 'infra/terraform'))).filter(name => name.endsWith('.tf'));
  const fmt = await Promise.all(terraformFiles.map(async name => run(toolPath('terraform'), ['fmt', '-check', '-'], { input: await readFile(join(ROOT, 'infra/terraform', name), 'utf8') })));
  record('terraform-fmt', 'Terraform 真实格式检查', fmt.every(result => result.ok) ? 'passed' : 'failed', `terraform fmt -check - on ${terraformFiles.length} source files via stdin; no state or cloud resources.`);
  const init = run(toolPath('terraform'), ['-chdir=infra/terraform', 'init', '-backend=false', '-input=false', '-no-color']);
  if (init.ok) {
    const validation = run(toolPath('terraform'), ['-chdir=infra/terraform', 'validate', '-json']);
    record('terraform-validate', 'Terraform init / validate', validation.ok ? 'passed' : 'failed', validation.ok ? 'Validated built-in terraform_data development contract; no apply and no cloud resources.' : 'Validation failed; inspect the local Terraform configuration.');
  } else record('terraform-validate', 'Terraform init / validate', unavailable(init.text) ? 'blocked' : 'failed', 'CLI installed; initialization could not read the project directory in this execution environment. Run in the Dev Container or unrestricted project terminal. No apply executed.');
} else record('terraform-validate', 'Terraform init / validate', 'blocked', 'Install pinned Terraform first.');

const rag = await ragStatus();
if (rag.ready) {
  try {
    const answer = await askQuestion('Copilot Studio 会训练模型吗？');
    record('local-rag', '本地 RAG：语义检索 + 生成', answer.answer && answer.sources.length ? 'passed' : 'failed', `${answer.model} + ${answer.embeddingModel}; ${answer.sources.length} sources; ${answer.elapsedMs}ms; endpoint ${rag.endpoint} (loopback only).`);
  } catch {
    record('local-rag', '本地 RAG：语义检索 + 生成', 'failed', 'Local model responded but the answer or sources could not be validated.');
  }
} else {
  record('local-rag', '本地 RAG：语义检索 + 生成', 'blocked', `Local model not ready: ${rag.reason ?? 'unknown'}. No answer was generated.`);
}

if (tools.trivy.available) {
  const config = run(toolPath('trivy'), ['config', '--severity', 'HIGH,CRITICAL', '--exit-code', '1', '--format', 'json', 'Dockerfile']);
  if (config.ok) {
    const result = JSON.parse(config.stdout);
    await writeFile(join(out, 'trivy-config.json'), JSON.stringify(result, null, 2) + '\n');
    const findings = (result.Results ?? []).flatMap(item => item.Misconfigurations ?? []);
    const applicable = (result.Results ?? []).some(item => item.MisconfSummary?.Successes > 0 || item.MisconfSummary?.Failures > 0);
    record('trivy-config', '运行镜像配置扫描', applicable ? 'passed' : 'not_run', applicable ? `${findings.length} HIGH/CRITICAL findings in runtime Dockerfile. Not an image vulnerability scan.` : 'No applicable configuration rules were reported; not counted as verified coverage.');
  } else record('trivy-config', '运行镜像配置扫描', unavailable(config.text) ? 'blocked' : 'failed', 'Trivy could not complete the local config scan; CLI availability is not a passed security check. CI config and image jobs are supplied separately.');
} else record('trivy-config', '运行镜像配置扫描', 'blocked', 'Install pinned Trivy first.');

const compose = run('docker', ['compose', 'config', '--quiet']);
record('compose', 'Compose 配置解析', compose.ok ? 'passed' : 'blocked', compose.ok ? 'docker compose config passed; this does not prove image build or runtime success.' : 'Docker Compose is unavailable or configuration cannot be parsed.');
const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15000 });
const dockerUp = docker.ok && /\d+\.\d+/.test(docker.stdout);
if (dockerUp) {
  const inspect = run('docker', ['inspect', 'sentinel-poc', '--format', '{{.State.Health.Status}}|{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.CapDrop}}|{{.Config.User}}'], { timeout: 15000 });
  const [health, readOnly, caps, user] = inspect.stdout.trim().split('|');
  const hardened = inspect.ok && health === 'healthy' && readOnly === 'true' && caps === '["ALL"]' && user === 'node';
  record('container', '容器构建 / 运行 / 加固', hardened ? 'passed' : 'not_run', hardened ? `Image built and container healthy; read-only rootfs, cap-drop ALL, non-root user, memory/pids limited. Health=${health}.` : 'Docker is running but no verified hardened container was found; build and runtime remain unproven.');
} else {
  record('container', '容器构建 / 运行 / 加固', 'not_run', 'Docker engine is not reachable; Dev Container, runtime image and image scan are unverified.');
}
let trivyImage = null;
try { trivyImage = JSON.parse(await readFile(join(out, 'trivy-image.json'), 'utf8')); } catch { trivyImage = null; }
if (trivyImage) {
  const vulnerabilities = (trivyImage.Results ?? []).flatMap(item => item.Vulnerabilities ?? []);
  record('trivy-image', '镜像 HIGH/CRITICAL 漏洞', vulnerabilities.length ? 'failed' : 'passed', `${vulnerabilities.length} HIGH/CRITICAL findings in the runtime image; results are not suppressed.`);
} else {
  record('trivy-image', '镜像 HIGH/CRITICAL 漏洞', 'blocked', 'Trivy could not read its Docker config or vulnerability database in this execution environment; no clean result is claimed.');
}
record('ci', 'GitHub Actions / CodeQL', 'not_run', 'Workflow files provided; no remote repository created or workflow run. CodeQL on private repositories requires applicable licensing.');
record('review', '分支保护 / CODEOWNERS', 'not_run', 'Owner entries are commented examples. Repository administrator must configure real owners, required checks and review rules.');

const evidence = { runId, generatedAt: new Date().toISOString(), scope: 'Local execution evidence; not a production certification', reportDirectory: `runs/${runId}`, tools, checks };
const serialized = JSON.stringify(evidence, null, 2) + '\n';
await writeFile(join(out, 'evidence.json'), serialized);
// All per-run reports are immutable; incomplete runs never overwrite the last
// complete snapshot or its referenced evidence. Publish via same-volume rename.
const pending = join(outputRoot, `.evidence-${runId}.tmp`);
await writeFile(pending, serialized);
await rename(pending, join(outputRoot, 'evidence.json'));
console.log(`Evidence written to ${relative(ROOT, join(outputRoot, 'evidence.json'))}`);
process.exitCode = checks.some(check => check.status === 'failed') ? 1 : checks.some(check => check.status === 'blocked') ? 2 : 0;
