import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../packages/security-policy/index.mjs';

const result = spawnSync('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) {
  console.error('Initialize or clone this repository first, then run node scripts/install-hooks.mjs.');
  process.exit(1);
}
const target = resolve(ROOT, result.stdout.trim());
const content = '#!/bin/sh\n# Sentinel managed pre-commit hook\nexec node scripts/pre-commit.mjs\n';
if (existsSync(target) && readFileSync(target, 'utf8') !== content) {
  console.error('An existing pre-commit hook was found. It was not overwritten; integrate scripts/pre-commit.mjs manually.');
  process.exit(1);
}
mkdirSync(resolve(target, '..'), { recursive: true });
writeFileSync(target, content);
chmodSync(target, 0o755);
console.log('Installed fail-closed Gitleaks pre-commit hook. CI must recheck; local hooks can be bypassed.');
