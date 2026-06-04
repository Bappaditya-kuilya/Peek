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
