const test = require('node:test');
const assert = require('node:assert/strict');

const security = require('../src/security');

test('localhost dev origins remain allowed', () => {
  assert.equal(security.isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(security.isAllowedOrigin('http://localhost:5174'), true);
});

test('unknown origins are rejected', () => {
  assert.equal(security.isAllowedOrigin('https://evil.example'), false);
});

test('parseTrustProxy handles booleans, hop counts, and subnet strings', () => {
  assert.equal(security.parseTrustProxy('true'), true);
  assert.equal(security.parseTrustProxy('false'), false);
  assert.equal(security.parseTrustProxy('2'), 2);
  assert.equal(security.parseTrustProxy('loopback'), 'loopback');
  assert.equal(security.parseTrustProxy(''), false);
});

test('normalizeIp unwraps ipv4-mapped addresses', () => {
  assert.equal(security.normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(security.normalizeIp(' 2001:db8::1 '), '2001:db8::1');
  assert.equal(security.normalizeIp(''), 'unknown');
});

test('createWindowCounter blocks when a key exceeds the limit', () => {
  const limiter = security.createWindowCounter({ windowMs: 1_000, max: 2 });
  assert.equal(limiter.consume('ip-1').allowed, true);
  assert.equal(limiter.consume('ip-1').allowed, true);
  assert.equal(limiter.consume('ip-1').allowed, false);
  limiter.reset('ip-1');
  assert.equal(limiter.consume('ip-1').allowed, true);
});
