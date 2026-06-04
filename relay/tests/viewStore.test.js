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

test('setViewStore swaps the active implementation', () => {
  const calls = [];
  const stubStore = {
    createView(...args) {
      calls.push(['createView', ...args]);
      return { id: 'stub-view', uploadToken: 'token', expiresAt: 1 };
    },
    deleteView(...args) {
      calls.push(['deleteView', ...args]);
      return true;
    },
    getView(...args) {
      calls.push(['getView', ...args]);
      return { id: args[0] };
    },
    validateUploadToken(...args) {
      calls.push(['validateUploadToken', ...args]);
      return true;
    },
  };

  const originalStore = viewStore.getViewStore();
  viewStore.setViewStore(stubStore);

  try {
    assert.equal(
      viewStore.createView({
        encryptedBlob: Buffer.from('ghi'),
        expiresIn: 10,
        filename: 'peek.txt',
        mimeType: 'text/plain',
        onceOnly: false,
      }).id,
      'stub-view'
    );
    assert.equal(viewStore.getView('view-1').id, 'view-1');
    assert.equal(viewStore.validateUploadToken('view-1', 'token'), true);
    assert.equal(viewStore.deleteView('view-1'), true);
    assert.deepEqual(calls, [
      [
        'createView',
        {
          encryptedBlob: Buffer.from('ghi'),
          expiresIn: 10,
          filename: 'peek.txt',
          mimeType: 'text/plain',
          onceOnly: false,
        },
      ],
      ['getView', 'view-1'],
      ['validateUploadToken', 'view-1', 'token'],
      ['deleteView', 'view-1'],
    ]);
  } finally {
    viewStore.setViewStore(originalStore);
  }
});
