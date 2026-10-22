import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const EXPECTED_NODE = '22.22.2';
export const TOOL_VERSIONS = JSON.parse(await readFile(new URL('../../scripts/tools.json', import.meta.url), 'utf8'));
const execute = promisify(execFile);

export function toolPath(name) {
  if (!Object.hasOwn(TOOL_VERSIONS, name)) throw new Error('Unknown tool');
  return join(ROOT, '.tools', name + (process.platform === 'win32' ? '.exe' : ''));
}

export async function toolStatus(name) {
  const version = TOOL_VERSIONS[name];
  try {
    await access(toolPath(name));
    const { stdout } = await execute(toolPath(name), [name === 'terraform' ? 'version' : '--version'], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
    const actual = stdout.match(/(?:^|[^\d])(\d+\.\d+\.\d+)\b/)?.[1];
    return { available: actual === version, version: actual ?? 'unknown', expectedVersion: version };
  } catch {
    return { available: false, version: null, expectedVersion: version };
  }
}

// Deliberately synthetic and assembled at runtime so the repository is clean.
// A custom Gitleaks rule catches this namespace. It does not prove every real
// credential type is detected; Gitleaks default rules remain enabled as well.
export function makeFixture(scenario) {
  if (scenario === 'leak') return 'API_TOKEN=' + ['SDEV', 'DEMO', '0123456789abcdef'.repeat(2)].join('_') + '\n';
  if (scenario === 'clean') return 'API_TOKEN=${INJECT_AT_RUNTIME}\n';
  throw new Error('Unsupported scenario');
}

export async function scanText(text, policy) {
  const config = policy ?? await readFile(new URL('../../.gitleaks.toml', import.meta.url), 'utf8');
  return new Promise(resolve => {
    const child = execFile(toolPath('gitleaks'), ['stdin', '--redact', '--no-banner', '--verbose', '--exit-code', '42'], {
      cwd: join(ROOT, '.tools'), timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
      env: { ...process.env, GITLEAKS_CONFIG: '', GITLEAKS_CONFIG_TOML: config }
    }, (error, stdout, stderr) => {
      // A distinct finding exit code prevents fatal scanner errors (normally 1)
      // from being mistaken for successful secret detection.
      const exitCode = error ? error.code : 0;
      const rules = [...stdout.matchAll(/^RuleID:\s+(\S+)/gm)].map(match => match[1]);
      const scanned = /scanned ~?\d+ bytes/.test(stderr);
      const valid = scanned && ((exitCode === 42 && rules.length > 0) || (exitCode === 0 && /no leaks found/.test(stderr) && rules.length === 0));
      resolve({ status: !valid ? 'error' : exitCode === 42 ? 'blocked' : 'passed', exitCode: typeof exitCode === 'number' ? exitCode : null, rules });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
}

export async function scanScenario(scenario) {
  const fixture = makeFixture(scenario);
  const started = performance.now();
  const engine = `Gitleaks ${TOOL_VERSIONS.gitleaks}`;
  if (!(await toolStatus('gitleaks')).available) {
    return { scenario, status: 'unavailable', exitCode: null, engine, elapsedMs: 0, findings: [], message: 'Pinned Gitleaks is not installed. Run python scripts/bootstrap-tools.py gitleaks.' };
  }
  try {
    // Stream an in-memory fixture into the real CLI: no credential file is stored.
    const result = await scanText(fixture);
    return {
      scenario, status: result.status, exitCode: result.exitCode, engine,
      elapsedMs: Math.round(performance.now() - started),
      findings: result.rules.map(ruleId => ({ ruleId, description: 'Synthetic demonstration credential', file: 'stdin (example.env)', line: 1 })),
      message: result.status === 'blocked' ? 'Synthetic demo credential blocked by the real scanner.' : result.status === 'passed' ? 'Repaired fixture passed the real scanner.' : 'Scanner failed; no successful result was recorded.'
    };
  } catch {
    return { scenario, status: 'error', exitCode: null, engine, elapsedMs: Math.round(performance.now() - started), findings: [], message: 'Scanner could not finish; no successful result was recorded.' };
  }
}
