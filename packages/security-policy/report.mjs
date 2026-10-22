import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './index.mjs';

// A gate is only useful if the threshold is stated and the consequence is
// stated. Each entry below maps to one or more rows in the evidence ledger.
export const GATE_POLICY = [
  {
    id: 'secrets',
    rule: 'Secret material anywhere in the repository',
    threshold: 'Any finding',
    blocking: true,
    why: 'There is no legitimate reason to commit a credential. Rotation is the only remedy, so the merge must stop.'
  },
  {
    id: 'tests',
    rule: 'Security regression tests',
    threshold: 'All must pass',
    blocking: true,
    why: 'The suite proves the gates still behave as described. A failing test means the description is no longer true.'
  },
  {
    id: 'config',
    rule: 'Misconfiguration we own (Dockerfile, Terraform)',
    threshold: 'HIGH or CRITICAL',
    blocking: true,
    why: 'We control these files, so a finding is always actionable.'
  },
  {
    id: 'runtime',
    rule: 'Container build and hardening',
    threshold: 'Must build and run hardened',
    blocking: true,
    why: 'A control that is only written down has never stopped an attacker.'
  },
  {
    id: 'image',
    rule: 'Third-party CVEs in the base image',
    threshold: 'CRITICAL with a published fix',
    blocking: true,
    why: 'An unfixed CVE cannot be acted on locally. Blocking on it only teaches the team to ignore red builds; it is still reported.'
  },
  {
    id: 'remote',
    rule: 'Remote enforcement (CI, branch protection)',
    threshold: 'Must be enabled by a repository admin',
    blocking: false,
    why: 'Local checks can be bypassed with --no-verify. Only server-side rules make them mandatory.'
  }
];

const SCANS = [
  {
    id: 'secrets',
    name: 'Secrets in the repository',
    tool: 'Gitleaks',
    policy: 'Any finding blocks',
    checks: ['repo-secrets', 'staged-hook']
  },
  {
    id: 'tests',
    name: 'Security regression tests',
    tool: 'node --test',
    policy: 'All must pass',
    checks: ['tests']
  },
  {
    id: 'config',
    name: 'Configuration we own',
    tool: 'Terraform, Trivy config',
    policy: 'HIGH or CRITICAL blocks',
    checks: ['terraform-fmt', 'terraform-validate', 'trivy-config']
  },
  {
    id: 'runtime',
    name: 'Container runtime',
    tool: 'Docker',
    policy: 'Must build and stay hardened',
    checks: ['compose', 'container']
  },
  {
    id: 'image',
    name: 'Base image vulnerabilities',
    tool: 'Trivy image',
    policy: 'Fixable CRITICAL blocks',
    checks: ['trivy-image']
  },
  {
    id: 'remote',
    name: 'Remote enforcement',
    tool: 'GitHub Actions, branch rules',
    policy: 'Repository admin action',
    checks: ['ci', 'review']
  }
];

const SEVERITY_ORDER = ['failed', 'blocked', 'not_run', 'passed'];

function worstStatus(statuses) {
  for (const level of SEVERITY_ORDER) if (statuses.includes(level)) return level;
  return 'not_run';
}

function firstNumber(text, pattern) {
  const match = typeof text === 'string' ? text.match(pattern) : null;
  return match ? Number(match[1]) : null;
}

function overallGate(scans) {
  if (scans.some((scan) => scan.status === 'failed')) {
    return { status: 'fail', label: 'Blocked', detail: 'At least one blocking check failed.' };
  }
  if (scans.some((scan) => scan.status === 'blocked' || scan.status === 'not_run')) {
    return { status: 'warn', label: 'Incomplete', detail: 'No failure, but some controls could not be verified on this machine.' };
  }
  return { status: 'pass', label: 'Passing', detail: 'Every blocking check ran and passed.' };
}

export async function buildSecurityReport() {
  let evidence = { checks: [], tools: {}, generatedAt: null, runId: null };
  try {
    const parsed = JSON.parse(await readFile(resolve(ROOT, 'outputs/evidence.json'), 'utf8'));
    if (Array.isArray(parsed.checks)) evidence = parsed;
  } catch {
    // No evidence yet: every scan reports not_run rather than assuming a pass.
  }

  const byId = new Map(evidence.checks.map((check) => [check.id, check]));
  const scans = SCANS.map((definition) => {
    const rows = definition.checks.map((id) => byId.get(id)).filter(Boolean);
    const status = worstStatus(rows.map((row) => row.status));
    return {
      id: definition.id,
      name: definition.name,
      tool: definition.tool,
      policy: definition.policy,
      status,
      verified: rows.filter((row) => row.status === 'passed').length,
      total: definition.checks.length,
      detail: rows.map((row) => row.detail).filter(Boolean).join(' ')
    };
  });

  const testRow = byId.get('tests');
  const secretRow = byId.get('repo-secrets');
  const verified = scans.reduce((sum, scan) => sum + scan.verified, 0);
  const total = scans.reduce((sum, scan) => sum + scan.total, 0);

  return {
    generatedAt: evidence.generatedAt ?? null,
    runId: evidence.runId ?? null,
    environment: 'local',
    gate: overallGate(scans),
    coverage: { verified, total },
    counts: {
      tests: firstNumber(testRow?.detail, /(\d+)\s+tests/i),
      filesScanned: firstNumber(secretRow?.detail, /(\d+)\s+source files/i),
      blocked: scans.filter((scan) => scan.status === 'blocked').length,
      notRun: scans.filter((scan) => scan.status === 'not_run').length
    },
    scans,
    policy: GATE_POLICY,
    note: 'Every number above comes from a local command that actually ran. Controls marked blocked or not run were never verified, and are not counted as passing.'
  };
}
