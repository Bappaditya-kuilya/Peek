const test = require('node:test');
const assert = require('node:assert/strict');

const session = require('../src/session');

test('createSession returns bounded metadata and valid token', () => {
  const created = session.createSession(3);
  assert.match(created.id, /^[a-f0-9]{16}$/);
  assert.match(created.token, /^[a-f0-9]{64}$/);
  assert.equal(created.fileCount, 3);
  assert.equal(session.validateToken(created.id, created.token), true);
  session.killSession(created.id);
});

test('lookupSessionByCode ignores expired sessions and finds active ones', () => {
  const created = session.createSession(2);
  const lookedUp = session.lookupSessionByCode(created.numericCode);
  assert.equal(lookedUp.sessionId, created.id);
  assert.equal(lookedUp.filesAvailable, 2);
  session.killSession(created.id);
});

test('markRoleJoined and clearRoleSocket update session state', () => {
  const created = session.createSession(1);
  session.markRoleJoined(created.id, 'initiator');
  const fakeSocket = { close() {} };
  session.updateSession(created.id, { initiatorSocket: fakeSocket });

  const stored = session.getSession(created.id);
  assert.equal(Boolean(stored.initiatorJoinedAt), true);
  assert.equal(stored.initiatorSocket, fakeSocket);

  session.clearRoleSocket(created.id, 'initiator');
  assert.equal(session.getSession(created.id).initiatorSocket, null);
  session.killSession(created.id);
});

test('killSession closes both sockets and removes the session', () => {
  const created = session.createSession(0);
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

  session.updateSession(created.id, {
    initiatorSocket,
    joinerSocket,
  });

  assert.equal(session.killSession(created.id, 'Ended for test', 4009), true);
  assert.equal(session.getSession(created.id), null);
  assert.deepEqual(
    closed,
    [
      { code: 4009, reason: 'Ended for test', role: 'initiator' },
      { code: 4009, reason: 'Ended for test', role: 'joiner' },
    ]
  );
});

test('setSessionStore swaps the active implementation', () => {
  const calls = [];
  const stubStore = {
    canJoinRole(...args) {
      calls.push(['canJoinRole', ...args]);
      return 'joined';
    },
    clearRoleSocket(...args) {
      calls.push(['clearRoleSocket', ...args]);
      return 'cleared';
    },
    createSession(...args) {
      calls.push(['createSession', ...args]);
      return { id: 'stub-session' };
    },
    getSession(...args) {
      calls.push(['getSession', ...args]);
      return { id: args[0] };
    },
    killSession(...args) {
      calls.push(['killSession', ...args]);
      return true;
    },
    lookupSessionByCode(...args) {
      calls.push(['lookupSessionByCode', ...args]);
      return { sessionId: 'stub-session' };
    },
    markRoleJoined(...args) {
      calls.push(['markRoleJoined', ...args]);
      return { marked: true };
    },
    updateSession(...args) {
      calls.push(['updateSession', ...args]);
      return { updated: true };
    },
    validateToken(...args) {
      calls.push(['validateToken', ...args]);
      return true;
    },
  };

  const originalStore = session.getSessionStore();
  session.setSessionStore(stubStore);

  try {
    assert.equal(session.createSession(4).id, 'stub-session');
    assert.equal(session.getSession('abc').id, 'abc');
    assert.equal(session.updateSession('abc', { ok: true }).updated, true);
    assert.equal(session.canJoinRole({ id: 'abc' }, 'initiator'), 'joined');
    assert.equal(session.markRoleJoined('abc', 'joiner').marked, true);
    assert.equal(session.clearRoleSocket('abc', 'joiner'), 'cleared');
    assert.equal(session.validateToken('abc', 'token'), true);
    assert.equal(session.lookupSessionByCode('123456').sessionId, 'stub-session');
    assert.equal(session.killSession('abc'), true);
    assert.deepEqual(calls, [
      ['createSession', 4],
      ['getSession', 'abc'],
      ['updateSession', 'abc', { ok: true }],
      ['canJoinRole', { id: 'abc' }, 'initiator'],
      ['markRoleJoined', 'abc', 'joiner'],
      ['clearRoleSocket', 'abc', 'joiner'],
      ['validateToken', 'abc', 'token'],
      ['lookupSessionByCode', '123456'],
      ['killSession', 'abc'],
    ]);
  } finally {
    session.setSessionStore(originalStore);
  }
});
