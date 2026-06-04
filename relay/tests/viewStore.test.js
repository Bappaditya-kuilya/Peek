const test = require('node:test');
const assert = require('node:assert/strict');

const viewStore = require('../src/viewStore');

test('createView returns ids and validates upload token', async () => {
  const created = await viewStore.createView({
    encryptedBlob: Buffer.from('abc'),
    expiresIn: 5,
    filename: 'demo.pdf',
    mimeType: 'application/pdf',
    onceOnly: false,
  });

  assert.match(created.id, /^[a-f0-9]{24}$/);
  assert.match(created.uploadToken, /^[a-f0-9]{64}$/);
  assert.equal(await viewStore.validateUploadToken(created.id, created.uploadToken), true);
  assert.equal(await viewStore.validateUploadToken(created.id, 'bad-token'), false);
  assert.equal(await viewStore.deleteView(created.id), true);
});

test('getView returns null after deletion', async () => {
  const created = await viewStore.createView({
    encryptedBlob: Buffer.from('def'),
    expiresIn: 5,
    filename: 'image.png',
    mimeType: 'image/png',
    onceOnly: true,
  });

  assert.equal(Boolean(await viewStore.getView(created.id)), true);
  assert.equal(await viewStore.deleteView(created.id), true);
  assert.equal(await viewStore.getView(created.id), null);
});

test('setViewStore swaps the active implementation', async () => {
  const calls = [];
  const stubStore = {
    createView(...args) {
      calls.push(['createView', ...args]);
      return Promise.resolve({ id: 'stub-view', uploadToken: 'token', expiresAt: 1 });
    },
    deleteView(...args) {
      calls.push(['deleteView', ...args]);
      return Promise.resolve(true);
    },
    getView(...args) {
      calls.push(['getView', ...args]);
      return Promise.resolve({ id: args[0] });
    },
    incrementViewCount(...args) {
      calls.push(['incrementViewCount', ...args]);
      return Promise.resolve(true);
    },
    validateUploadToken(...args) {
      calls.push(['validateUploadToken', ...args]);
      return Promise.resolve(true);
    },
  };

  const originalStore = viewStore.getViewStore();
  viewStore.setViewStore(stubStore);

  try {
    assert.equal(
      (
        await viewStore.createView({
        encryptedBlob: Buffer.from('ghi'),
        expiresIn: 10,
        filename: 'peek.txt',
        mimeType: 'text/plain',
        onceOnly: false,
      })
      ).id,
      'stub-view'
    );
    assert.equal((await viewStore.getView('view-1')).id, 'view-1');
    assert.equal(await viewStore.incrementViewCount('view-1'), true);
    assert.equal(await viewStore.validateUploadToken('view-1', 'token'), true);
    assert.equal(await viewStore.deleteView('view-1'), true);
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
      ['incrementViewCount', 'view-1'],
      ['validateUploadToken', 'view-1', 'token'],
      ['deleteView', 'view-1'],
    ]);
  } finally {
    viewStore.setViewStore(originalStore);
  }
});
