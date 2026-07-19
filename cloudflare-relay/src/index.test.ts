import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

describe('PeekSession Durable Object', () => {
	// ponytail: --no-isolate shares DO storage across the file, so each test
	// gets a unique namespace name to avoid leaking sessions/hibernated sockets.
	let nameSeq = 0;
	const newId = () => peekSessionNamespace.idFromName(`t${nameSeq++}`);
	let peekSessionNamespace: typeof env.PEEK_SESSION;

	const connect = async (stub: any, join: object) => {
		const response = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
		const ws = response.webSocket;
		if (!ws) throw new Error('Expected WebSocket response');
		ws.accept();
		const inbox: any[] = [];
		ws.addEventListener('message', (event) => { inbox.push(event.data); });
		const ready = new Promise<string>((resolve) => {
			ws.addEventListener('message', (event) => {
				if (typeof event.data === 'string') resolve(event.data);
			}, { once: true });
		});
		ws.send(JSON.stringify(join));
		const readyMsg = JSON.parse(await ready);
		const nextMessage = (pred: (d: any) => boolean, timeoutMs = 5000) =>
			new Promise<any>((resolve, reject) => {
				const found = inbox.find(pred);
				if (found !== undefined) return resolve(found);
				const onMsg = (event: any) => {
					if (pred(event.data)) {
						ws.removeEventListener('message', onMsg);
						resolve(event.data);
					}
				};
				ws.addEventListener('message', onMsg);
				setTimeout(() => { ws.removeEventListener('message', onMsg); reject(new Error('nextMessage timeout')); }, timeoutMs);
			});
		return { ws, ready: readyMsg, nextMessage };
	};

	beforeEach(() => {
		peekSessionNamespace = env.PEEK_SESSION;
	});

	describe('Session creation and joining', () => {
		it('creates a session via POST /session', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 3 }),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.sessionId).toMatch(/^[a-f0-9]{16}$/);
			expect(data.token).toMatch(/^[a-f0-9]{64}$/);
			expect(data.expiresAt).toBeGreaterThan(Date.now());
			expect(data.fileCount).toBe(3);
		});

		it('rejects invalid fileCount in session creation', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1000 }),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.fileCount).toBe(500);
		});

		it('initiator joins session successfully', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const wsResponse = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
			expect(wsResponse.status).toBe(101);
			const ws = wsResponse.webSocket;
			if (!ws) throw new Error('Expected WebSocket response');
			ws.accept();

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));

			const response = await messagePromise;
			const msg = JSON.parse(response);
			expect(msg.type).toBe('initiator-ready');
			expect(msg.expiresAt).toBeDefined();
		});

		it('joiner joins session successfully', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const wsResponse = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
			expect(wsResponse.status).toBe(101);
			const ws = wsResponse.webSocket;
			if (!ws) throw new Error('Expected WebSocket response');
			ws.accept();

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));

			const response = await messagePromise;
			const msg = JSON.parse(response);
			expect(msg.type).toBe('receiver-ready');
			expect(msg.expiresAt).toBeDefined();
		});

		it('rejects invalid sessionId format', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const wsResponse = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
			const ws = wsResponse.webSocket;
			if (!ws) throw new Error('Expected WebSocket response');
			ws.accept();

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.send(JSON.stringify({ type: 'initiator-join', sessionId: 'invalid', token: 'a'.repeat(64) }));

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4002);
			expect(closeInfo.reason).toBe('Bad join payload');
		});
	});

	describe('Reconnection replaces existing role socket', () => {
		it('replaces initiator socket on reconnect', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: ws1 } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const { ws: ws2 } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws1.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4005);
			expect(closeInfo.reason).toBe('Replaced by reconnect');
		});

		it('replaces joiner socket on reconnect', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: ws1 } = await connect(stub, { type: 'joiner-join', sessionId, token });

			const { ws: ws2 } = await connect(stub, { type: 'joiner-join', sessionId, token });

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws1.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4005);
			expect(closeInfo.reason).toBe('Replaced by reconnect');
		});
	});

	describe('Binary chunk relay between peers', () => {
		it('relays binary data from initiator to joiner', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: initiatorWs } = await connect(stub, { type: 'initiator-join', sessionId, token });
			const { ws: joinerWs, nextMessage } = await connect(stub, { type: 'joiner-join', sessionId, token });

			const binaryData = new Uint8Array([1, 2, 3, 4, 5]).buffer;
			initiatorWs.send(binaryData);

			const received = await nextMessage((d) => d instanceof ArrayBuffer) as ArrayBuffer;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
		});

		it('relays binary data from joiner to initiator', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: initiatorWs, nextMessage } = await connect(stub, { type: 'initiator-join', sessionId, token });
			const { ws: joinerWs } = await connect(stub, { type: 'joiner-join', sessionId, token });

			const binaryData = new Uint8Array([9, 8, 7, 6, 5]).buffer;
			joinerWs.send(binaryData);

			const received = await nextMessage((d) => d instanceof ArrayBuffer) as ArrayBuffer;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
		});

		it('relays WebRTC signaling messages between peers', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: initiatorWs } = await connect(stub, { type: 'initiator-join', sessionId, token });
			const { ws: joinerWs, ready: joinerReady, nextMessage } = await connect(stub, { type: 'joiner-join', sessionId, token });

			const offer = { type: 'offer', sdp: 'fake-sdp' };
			initiatorWs.send(JSON.stringify({ type: 'webrtc-offer', offer, targetReceiverId: joinerReady.receiverId }));

			const received = await nextMessage((d) => typeof d === 'string' && JSON.parse(d).type === 'webrtc-offer') as string;
			const msg = JSON.parse(received);
			expect(msg.type).toBe('webrtc-offer');
			expect(msg.offer).toEqual(offer);
		});
	});

	describe('Rate limiting', () => {
		it('enforces session creation rate limit', async () => {
			const id = peekSessionNamespace.idFromName('rate-limit');
			const stub = peekSessionNamespace.get(id);

			for (let i = 0; i < 10; i++) {
				const response = await stub.fetch('https://example.com/session', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ fileCount: 1 }),
				});
				expect(response.status).toBe(200);
			}

			const response = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});

			expect(response.status).toBe(429);
		});

		it('enforces WebSocket message rate limit', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws } = await connect(stub, { type: 'initiator-join', sessionId, token });

			for (let i = 0; i < 100; i++) {
				ws.send(JSON.stringify({ type: 'clipboard-push', data: `msg-${i}` }));
			}

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4008);
			expect(closeInfo.reason).toContain('rate limit');
		});
	});

	describe('Session expiry and kill', () => {
		it('expires session after TTL', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token, expiresAt } = await createResponse.json();

			expect(expiresAt).toBeGreaterThan(Date.now());

			await connect(stub, { type: 'initiator-join', sessionId, token });

			const killResponse = await stub.fetch(`https://example.com/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});

			expect(killResponse.status).toBe(200);
			const killData = await killResponse.json();
			expect(killData.ok).toBe(true);
		});

		it('kills session with valid token', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const killResponse = await stub.fetch(`https://example.com/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});

			expect(killResponse.status).toBe(200);
			const data = await killResponse.json();
			expect(data.ok).toBe(true);
		});

		it('rejects kill with invalid token', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId } = await createResponse.json();

			const killResponse = await stub.fetch(`https://example.com/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: 'invalid' }),
			});

			expect(killResponse.status).toBe(403);
		});
	});

	describe('Per-session isolation', () => {
		it('two concurrent sessions never share state', async () => {
			const stub1 = peekSessionNamespace.get(peekSessionNamespace.idFromName('session-1'));
			const stub2 = peekSessionNamespace.get(peekSessionNamespace.idFromName('session-2'));

			const create1 = await stub1.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 2 }),
			});
			const { sessionId: sessionId1, token: token1 } = await create1.json();

			const create2 = await stub2.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 3 }),
			});
			const { sessionId: sessionId2, token: token2 } = await create2.json();

			expect(sessionId1).not.toBe(sessionId2);
			expect(token1).not.toBe(token2);

			const { ws: ws1, nextMessage } = await connect(stub1, { type: 'initiator-join', sessionId: sessionId1, token: token1 });
			const { ws: ws2 } = await connect(stub2, { type: 'initiator-join', sessionId: sessionId2, token: token2 });

			const binaryData = new Uint8Array([42, 42, 42]).buffer;
			ws2.send(binaryData);

			await expect(nextMessage((d) => d instanceof ArrayBuffer, 1000)).rejects.toThrow();
		});
	});

	describe('Peek links (/view endpoints)', () => {
		it('creates a view via POST /view', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('https://example.com/view', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Filename': 'test.txt',
					'X-Mime-Type': 'text/plain',
					'X-Expires-In': '15',
					'X-Once-Only': 'true',
				},
				body: new Uint8Array([72, 101, 108, 108, 111]).buffer,
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.id).toMatch(/^[a-f0-9]{16}$/);
		});

		it('retrieves a view via GET /view/:id', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/view', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Filename': 'test.txt',
					'X-Mime-Type': 'text/plain',
					'X-Expires-In': '15',
					'X-Once-Only': 'false',
				},
				body: new Uint8Array([72, 101, 108, 108, 111]).buffer,
			});
			const { id: viewId } = await createResponse.json();

			const getResponse = await stub.fetch(`https://example.com/view/${viewId}`, {
				method: 'GET',
			});

			expect(getResponse.status).toBe(200);
			expect(getResponse.headers.get('X-Filename')).toBe('test.txt');
			expect(getResponse.headers.get('X-Mime-Type')).toBe('text/plain');

			const blob = await getResponse.arrayBuffer();
			expect(new Uint8Array(blob)).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
		});

		it('returns 410 for expired view', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/view', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Filename': 'test.txt',
					'X-Mime-Type': 'text/plain',
					'X-Expires-In': '0',
					'X-Once-Only': 'false',
				},
				body: new Uint8Array([1, 2, 3]).buffer,
			});
			const { id: viewId } = await createResponse.json();

			await new Promise((resolve) => setTimeout(resolve, 100));

			const getResponse = await stub.fetch(`https://example.com/view/${viewId}`, {
				method: 'GET',
			});

			expect(getResponse.status).toBe(410);
		});

		it('returns 410 for once-only view after first access', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/view', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Filename': 'test.txt',
					'X-Mime-Type': 'text/plain',
					'X-Expires-In': '60',
					'X-Once-Only': 'true',
				},
				body: new Uint8Array([1, 2, 3]).buffer,
			});
			const { id: viewId } = await createResponse.json();

			const firstGet = await stub.fetch(`https://example.com/view/${viewId}`, { method: 'GET' });
			expect(firstGet.status).toBe(200);

			const secondGet = await stub.fetch(`https://example.com/view/${viewId}`, { method: 'GET' });
			expect(secondGet.status).toBe(410);
		});
	});
});
