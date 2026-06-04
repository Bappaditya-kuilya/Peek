const test = require('node:test');
const assert = require('node:assert/strict');

const session = require('../src/session');

test('createSession returns bounded metadata and valid token', async () => {
  const created = await session.createSession(3);
  assert.match(created.id, /^[a-f0-9]{16}$/);
  assert.match(created.token, /^[a-f0-9]{64}$/);
  assert.equal(created.fileCount, 3);
  assert.equal(await session.validateToken(created.id, created.token), true);
  await session.killSession(created.id);
});

test('lookupSessionByCode ignores expired sessions and finds active ones', async () => {
  const created = await session.createSession(2);
  const lookedUp = await session.lookupSessionByCode(created.numericCode);
  assert.equal(lookedUp.sessionId, created.id);
  assert.equal(lookedUp.filesAvailable, 2);
  await session.killSession(created.id);
});

test('markRoleJoined and clearRoleSocket update session state', async () => {
  const created = await session.createSession(1);
  await session.markRoleJoined(created.id, 'initiator');
  const fakeSocket = { close() {} };
  session.setRoleSocket(created.id, 'initiator', fakeSocket);

  const stored = await session.getSession(created.id);
  assert.equal(Boolean(stored.initiatorJoinedAt), true);
  assert.equal(session.getRoleSocket(created.id, 'initiator'), fakeSocket);

  session.clearRoleSocket(created.id, 'initiator');
  assert.equal(session.getRoleSocket(created.id, 'initiator'), null);
  await session.killSession(created.id);
});

test('killSession closes both sockets and removes the session', async () => {
  const created = await session.createSession(0);
  const closed = [];
  const initiatorSocket = {
    close(code, reason) {
      closed.push({ code, reason, role: 'initiator' });
    },
  };
  const joinerSocket = {
    close(code, reason) {
      closed.push({ code, reason, role: 'joiner' });
    },
  };

  session.setRoleSocket(created.id, 'initiator', initiatorSocket);
  session.setRoleSocket(created.id, 'joiner', joinerSocket);

  assert.equal(await session.killSession(created.id, 'Ended for test', 4009), true);
  assert.equal(await session.getSession(created.id), null);
  assert.deepEqual(
    closed,
    [
      { code: 4009, reason: 'Ended for test', role: 'initiator' },
      { code: 4009, reason: 'Ended for test', role: 'joiner' },
    ]
  );
});

test('setSessionStore swaps the active implementation', async () => {
  const calls = [];
  const stubStore = {
    createSession(...args) {
      calls.push(['createSession', ...args]);
      return Promise.resolve({ id: 'stub-session' });
    },
    getSession(...args) {
      calls.push(['getSession', ...args]);
      return Promise.resolve({ id: args[0] });
    },
    killSession(...args) {
      calls.push(['killSession', ...args]);
      return Promise.resolve(true);
    },
    lookupSessionByCode(...args) {
      calls.push(['lookupSessionByCode', ...args]);
      return Promise.resolve({ sessionId: 'stub-session' });
    },
    markRoleJoined(...args) {
      calls.push(['markRoleJoined', ...args]);
      return Promise.resolve({ marked: true });
    },
    updateSession(...args) {
      calls.push(['updateSession', ...args]);
      return Promise.resolve({ updated: true });
    },
    validateToken(...args) {
      calls.push(['validateToken', ...args]);
      return Promise.resolve(true);
    },
  };
  const stubRegistry = {
    clearRoleSocket(...args) {
      calls.push(['registry.clearRoleSocket', ...args]);
      return 'registry-cleared';
    },
    closeSessionSockets(...args) {
      calls.push(['registry.closeSessionSockets', ...args]);
      return true;
    },
    getPeerSocket(...args) {
      calls.push(['registry.getPeerSocket', ...args]);
      return { peer: true };
    },
    getRoleSocket(...args) {
      calls.push(['registry.getRoleSocket', ...args]);
      return null;
    },
    setRoleSocket(...args) {
      calls.push(['registry.setRoleSocket', ...args]);
      return args[2];
    },
  };

  const originalStore = session.getSessionStore();
  const originalRegistry = session.getLiveSessionRegistry();
  session.setSessionStore(stubStore);
  session.setLiveSessionRegistry(stubRegistry);

  try {
    assert.equal((await session.createSession(4)).id, 'stub-session');
    assert.equal((await session.getSession('abc')).id, 'abc');
    assert.equal((await session.updateSession('abc', { ok: true })).updated, true);
    assert.equal(session.canJoinRole({ id: 'abc' }, 'initiator'), true);
    assert.equal((await session.markRoleJoined('abc', 'joiner')).marked, true);
    assert.equal(session.setRoleSocket('abc', 'joiner', { id: 1 }).id, 1);
    assert.equal(session.getRoleSocket('abc', 'joiner'), null);
    assert.equal(session.getPeerSocket('abc', 'joiner').peer, true);
    assert.equal(session.clearRoleSocket('abc', 'joiner'), 'registry-cleared');
    assert.equal(await session.validateToken('abc', 'token'), true);
    assert.equal((await session.lookupSessionByCode('123456')).sessionId, 'stub-session');
    assert.equal(await session.killSession('abc'), true);
    assert.deepEqual(calls, [
      ['createSession', 4],
      ['getSession', 'abc'],
      ['updateSession', 'abc', { ok: true }],
      ['registry.getRoleSocket', 'abc', 'initiator'],
      ['markRoleJoined', 'abc', 'joiner'],
      ['registry.setRoleSocket', 'abc', 'joiner', { id: 1 }],
      ['registry.getRoleSocket', 'abc', 'joiner'],
      ['registry.getPeerSocket', 'abc', 'joiner'],
      ['registry.clearRoleSocket', 'abc', 'joiner', undefined],
      ['validateToken', 'abc', 'token'],
      ['lookupSessionByCode', '123456'],
      ['registry.closeSessionSockets', 'abc', 'Session ended', 4000],
      ['killSession', 'abc', 'Session ended', 4000],
    ]);
  } finally {
    session.setSessionStore(originalStore);
    session.setLiveSessionRegistry(originalRegistry);
  }
});
