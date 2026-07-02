const test = require('node:test');
const assert = require('node:assert/strict');

const { createInMemorySessionStore } = require('../src/stores/inMemorySessionStore');
const { createRedisSessionStore } = require('../src/stores/redisSessionStore');
const { createInMemoryViewStore } = require('../src/stores/inMemoryViewStore');
const { createRedisViewStore } = require('../src/stores/redisViewStore');
const { createLiveSessionRegistry } = require('../src/liveSessionRegistry');
const { createRedisLiveSessionRegistry } = require('../src/stores/redisLiveSessionRegistry');

// ponytail: no ioredis-mock dependency. Inline mock implements just the Redis
// commands the adapters use. TTLs are ignored (expiry is also checked in
// application logic via expiresAt), which is enough for interface parity tests.
function createMockRedis() {
  const strings = new Map();
  const sets = new Map();
  const ok = () => 'OK';
  return {
    get: async (k) => (strings.has(k) ? strings.get(k) : null),
    set: async (k, v) => { strings.set(k, v); return ok(); },
    setex: async (k, ttl, v) => { strings.set(k, v); return ok(); },
    del: async (...keys) => {
      let n = 0;
      for (const k of keys) {
        if (strings.delete(k)) n++;
        else if (sets.delete(k)) n++;
      }
      return n;
    },
    exists: async (k) => (strings.has(k) || sets.has(k) ? 1 : 0),
    incr: async (k) => {
      const v = Number(strings.get(k) || '0') + 1;
      strings.set(k, String(v));
      return v;
    },
    sAdd: async (k, ...members) => {
      let s = sets.get(k);
      if (!s) { s = new Set(); sets.set(k, s); }
      let n = 0;
      for (const m of members) { if (!s.has(m)) { s.add(m); n++; } }
      return n;
    },
    sRem: async (k, ...members) => {
      const s = sets.get(k);
      if (!s) return 0;
      let n = 0;
      for (const m of members) { if (s.delete(m)) n++; }
      if (s.size === 0) sets.delete(k);
      return n;
    },
    smembers: async (k) => {
      const s = sets.get(k);
      return s ? Array.from(s) : [];
    },
    sCard: async (k) => {
      const s = sets.get(k);
      return s ? s.size : 0;
    },
    expire: async () => 1,
  };
}

// ---- Session store interface tests, run against both backends ----

function sessionStoreTests(label, makeStore) {
  test(`[${label}] session store: create + get roundtrip`, async () => {
    const s = makeStore();
    const created = await s.createSession(2);
    assert.match(created.id, /^[a-f0-9]{16}$/);
    assert.match(created.token, /^[a-f0-9]{64}$/);
    assert.equal(created.fileCount, 2);
    assert.equal(created.initiatorJoinedAt, null);
    assert.equal(created.joinerJoinedAt, null);

    const got = await s.getSession(created.id);
    assert.equal(got.token, created.token);
    assert.equal(got.fileCount, 2);
  });

  test(`[${label}] session store: getSession returns null for unknown id`, async () => {
    const s = makeStore();
    assert.equal(await s.getSession('deadbeefdeadbeef'), null);
  });

  test(`[${label}] session store: validateToken accepts correct, rejects wrong`, async () => {
    const s = makeStore();
    const created = await s.createSession(0);
    assert.equal(await s.validateToken(created.id, created.token), true);
    assert.equal(await s.validateToken(created.id, '0'.repeat(64)), false);
    assert.equal(await s.validateToken('unknown', created.token), false);
  });

  test(`[${label}] session store: updateSession merges patch`, async () => {
    const s = makeStore();
    const created = await s.createSession(1);
    const updated = await s.updateSession(created.id, { initiatorJoinedAt: 123 });
    assert.equal(updated.initiatorJoinedAt, 123);
    assert.equal(updated.fileCount, 1);
    assert.equal(await s.updateSession('unknown', { x: 1 }), null);
  });

  test(`[${label}] session store: markRoleJoined sets timestamps`, async () => {
    const s = makeStore();
    const created = await s.createSession(0);
    await s.markRoleJoined(created.id, 'initiator');
    const got = await s.getSession(created.id);
    assert.equal(Boolean(got.initiatorJoinedAt), true);
    assert.equal(got.joinerJoinedAt, null);
  });

  test(`[${label}] session store: canJoinRole mirrors in-memory logic`, async () => {
    const s = makeStore();
    const created = await s.createSession(0);
    assert.equal(s.canJoinRole(created, 'initiator'), true);
    assert.equal(s.canJoinRole(created, 'joiner'), true);
    assert.equal(s.canJoinRole(null, 'initiator'), false);
    assert.equal(s.canJoinRole(created, 'weird'), false);
  });

  test(`[${label}] session store: lookupSessionByCode returns null`, async () => {
    const s = makeStore();
    assert.equal(await s.lookupSessionByCode('123456'), null);
  });

  test(`[${label}] session store: killSession removes and returns boolean`, async () => {
    const s = makeStore();
    const created = await s.createSession(0);
    assert.equal(await s.killSession(created.id), true);
    assert.equal(await s.getSession(created.id), null);
    assert.equal(await s.killSession(created.id), false);
  });
}

sessionStoreTests('in-memory', () => createInMemorySessionStore());
sessionStoreTests('redis', () => createRedisSessionStore(createMockRedis()));

// ---- View store interface tests, run against both backends ----

function viewStoreTests(label, makeStore) {
  test(`[${label}] view store: createView returns id/token/expiresAt`, async () => {
    const s = makeStore();
    const blob = Buffer.from('hello world');
    const view = await s.createView({
      encryptedBlob: blob,
      filename: 'a.txt',
      mimeType: 'text/plain',
      expiresIn: 5,
      onceOnly: false,
    });
    assert.match(view.id, /^[a-f0-9]{24}$/);
    assert.match(view.uploadToken, /^[a-f0-9]{64}$/);
    assert.equal(typeof view.expiresAt, 'number');
  });

  test(`[${label}] view store: getView returns blob and metadata`, async () => {
    const s = makeStore();
    const blob = Buffer.from('secret bytes');
    const created = await s.createView({
      encryptedBlob: blob,
      filename: 'f.bin',
      mimeType: 'application/octet-stream',
      expiresIn: 5,
      onceOnly: true,
    });
    const got = await s.getView(created.id);
    assert.deepEqual(got.encryptedBlob, blob);
    assert.equal(got.filename, 'f.bin');
    assert.equal(got.onceOnly, true);
    assert.equal(got.viewCount, 0);
  });

  test(`[${label}] view store: getView returns null for unknown`, async () => {
    const s = makeStore();
    assert.equal(await s.getView('0'.repeat(24)), null);
  });

  test(`[${label}] view store: validateUploadToken`, async () => {
    const s = makeStore();
    const created = await s.createView({
      encryptedBlob: Buffer.from('x'),
      filename: 'y',
      mimeType: '',
      expiresIn: 5,
      onceOnly: false,
    });
    assert.equal(await s.validateUploadToken(created.id, created.uploadToken), true);
    assert.equal(await s.validateUploadToken(created.id, 'wrong'), false);
    assert.equal(await s.validateUploadToken('unknown', created.uploadToken), false);
  });

  test(`[${label}] view store: incrementViewCount then deleteView`, async () => {
    const s = makeStore();
    const created = await s.createView({
      encryptedBlob: Buffer.from('x'),
      filename: 'y',
      mimeType: '',
      expiresIn: 5,
      onceOnly: false,
    });
    assert.equal(await s.incrementViewCount(created.id), true);
    assert.equal(await s.incrementViewCount(created.id), true);
    const got = await s.getView(created.id);
    assert.equal(got.viewCount, 2);
    assert.equal(await s.deleteView(created.id), true);
    assert.equal(await s.getView(created.id), null);
    assert.equal(await s.deleteView(created.id), false);
  });
}

viewStoreTests('in-memory', () => createInMemoryViewStore());
viewStoreTests('redis', () => createRedisViewStore(createMockRedis()));

// ---- Live session registry interface tests, run against both backends ----

function registryTests(label, makeRegistry) {
  test(`[${label}] registry: set/get/clear role socket`, async () => {
    const r = makeRegistry();
    const sock = { close() {} };
    assert.equal(r.getRoleSocket('s1', 'initiator'), null);
    await r.setRoleSocket('s1', 'initiator', sock);
    assert.equal(r.getRoleSocket('s1', 'initiator'), sock);
    assert.equal(r.getPeerSocket('s1', 'initiator'), null);
    await r.clearRoleSocket('s1', 'initiator');
    assert.equal(r.getRoleSocket('s1', 'initiator'), null);
  });

  test(`[${label}] registry: both roles and peer lookup`, async () => {
    const r = makeRegistry();
    const a = { close() {} };
    const b = { close() {} };
    await r.setRoleSocket('s2', 'initiator', a);
    await r.setRoleSocket('s2', 'joiner', b);
    assert.equal(r.getPeerSocket('s2', 'initiator'), b);
    assert.equal(r.getPeerSocket('s2', 'joiner'), a);
  });

  test(`[${label}] registry: closeSessionSockets closes both`, async () => {
    const r = makeRegistry();
    const closed = [];
    const a = { close(code, reason) { closed.push(['a', code, reason]); } };
    const b = { close(code, reason) { closed.push(['b', code, reason]); } };
    await r.setRoleSocket('s3', 'initiator', a);
    await r.setRoleSocket('s3', 'joiner', b);
    const ok = await r.closeSessionSockets('s3', 'done', 4000);
    assert.equal(ok, true);
    assert.equal(closed.length, 2);
    assert.equal(r.getRoleSocket('s3', 'initiator'), null);
    assert.equal(r.getRoleSocket('s3', 'joiner'), null);
  });

  test(`[${label}] registry: clearRoleSocket with matching socket arg`, async () => {
    const r = makeRegistry();
    const a = { close() {} };
    const other = { close() {} };
    await r.setRoleSocket('s4', 'initiator', a);
    // passing a different socket should NOT clear
    await r.clearRoleSocket('s4', 'initiator', other);
    assert.equal(r.getRoleSocket('s4', 'initiator'), a);
    // passing the matching socket clears
    await r.clearRoleSocket('s4', 'initiator', a);
    assert.equal(r.getRoleSocket('s4', 'initiator'), null);
  });
}

registryTests('in-memory', () => createLiveSessionRegistry());
registryTests('redis', () => createRedisLiveSessionRegistry(createMockRedis()));