import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, toolStatus, scanText } from '../packages/security-policy/index.mjs';

export async function checkStaged(cwd = ROOT) {
  if (!(await toolStatus('gitleaks')).available) return { status: 'error', message: 'Install pinned Gitleaks: python scripts/bootstrap-tools.py gitleaks' };
  const git = args => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    if (result.status !== 0 || result.error) throw new Error('Cannot inspect staged files. Commit blocked.');
    return result.stdout;
  };
  try {
    const files = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT']).split('\0').filter(Boolean);
    if (!files.length) return { status: 'passed', message: 'No added or modified staged files.' };
    // Policy must belong to the same proposed commit, not an unstaged edit.
    const policy = git(['show', ':.gitleaks.toml']);
    if (!policy.trim()) throw new Error('Staged Gitleaks policy is missing. Commit blocked.');
    const blobs = [];
    let bytes = 0;
    for (const name of files) {
      // Read the index, NOT working-tree files; unstaged repairs cannot bypass the gate.
      const content = git(['show', `:${name}`]);
      bytes += Buffer.byteLength(content);
      if (bytes > 16 * 1024 * 1024) throw new Error('Staged content exceeds the 16 MiB PoC limit. Commit blocked.');
      blobs.push(content);
    }
    const scan = await scanText(blobs.join('\n'), policy);
    return { status: scan.status, message: scan.status === 'passed' ? `Gitleaks cleared ${files.length} staged files.` : scan.status === 'blocked' ? 'Commit blocked: Gitleaks detected a credential pattern. No secret is printed.' : 'Commit blocked: scanner execution failed.' };
  } catch (error) { return { status: 'error', message: error.message }; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkStaged();
  console.log(result.message);
  process.exitCode = result.status === 'passed' ? 0 : result.status === 'blocked' ? 1 : 2;
}
