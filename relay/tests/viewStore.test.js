const test = require('node:test');
const assert = require('node:assert/strict');

const viewStore = require('../src/viewStore');

test('createView returns ids and validates upload token', () => {
  const created = viewStore.createView({
    encryptedBlob: Buffer.from('abc'),
    expiresIn: 5,
    filename: 'demo.pdf',
    mimeType: 'application/pdf',
    onceOnly: false,
  });

  assert.match(created.id, /^[a-f0-9]{24}$/);
  assert.match(created.uploadToken, /^[a-f0-9]{64}$/);
  assert.equal(viewStore.validateUploadToken(created.id, created.uploadToken), true);
  assert.equal(viewStore.validateUploadToken(created.id, 'bad-token'), false);
  assert.equal(viewStore.deleteView(created.id), true);
});

test('getView returns null after deletion', () => {
  const created = viewStore.createView({
    encryptedBlob: Buffer.from('def'),
    expiresIn: 5,
    filename: 'image.png',
    mimeType: 'image/png',
    onceOnly: true,
  });

  assert.equal(Boolean(viewStore.getView(created.id)), true);
  assert.equal(viewStore.deleteView(created.id), true);
  assert.equal(viewStore.getView(created.id), null);
});
