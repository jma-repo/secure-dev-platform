import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4173';
const health = await fetch(base + '/healthz');
assert.equal(health.status, 200);
for (const [scenario, expected] of [['leak', 'blocked'], ['clean', 'passed']]) {
  const response = await fetch(base + '/api/demo/secret', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, expected);
  assert.ok(!JSON.stringify(result).includes('0123456789abcdef'));
  console.log(`${scenario}: ${result.status}; real ${result.engine}; exit=${result.exitCode}; ${result.elapsedMs}ms`);
}
console.log('Local live demonstration smoke check passed.');
