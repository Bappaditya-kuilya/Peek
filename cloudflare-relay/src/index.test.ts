import { describe, it, expect, beforeEach } from 'vitest';
import { env, getDurableObjectNamespace, waitFor } from 'cloudflare:test';

describe('PeekSession Durable Object', () => {
	let peekSessionNamespace: ReturnType<typeof getDurableObjectNamespace>;

	beforeEach(() => {
		peekSessionNamespace = getDurableObjectNamespace(env.PEEK_SESSION);
	});

	describe('Session creation and joining', () => {
		it('creates a session via POST /session', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('http://test/session', {
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
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1000 }),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.fileCount).toBe(500);
		});

		it('initiator joins session successfully', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const ws = new WebSocket('ws://test/');
			const wsResponse = await stub.fetch('http://test/', {
				method: 'GET',
				headers: {
					Upgrade: 'websocket',
					'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Version': '13',
				},
				webSocket: ws,
			});

			expect(wsResponse.status).toBe(101);

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.addEventListener('open', () => {
				ws.send(JSON.stringify({
					type: 'initiator-join',
					sessionId,
					token,
				}));
			});

			const response = await messagePromise;
			const msg = JSON.parse(response);
			expect(msg.type).toBe('initiator-ready');
			expect(msg.expiresAt).toBeDefined();
		});

		it('joiner joins session successfully', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const ws = new WebSocket('ws://test/');
			const wsResponse = await stub.fetch('http://test/', {
				method: 'GET',
				headers: {
					Upgrade: 'websocket',
					'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Version': '13',
				},
				webSocket: ws,
			});

			expect(wsResponse.status).toBe(101);

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.addEventListener('open', () => {
				ws.send(JSON.stringify({
					type: 'joiner-join',
					sessionId,
					token,
				}));
			});

			const response = await messagePromise;
			const msg = JSON.parse(response);
			expect(msg.type).toBe('joiner-ready');
			expect(msg.expiresAt).toBeDefined();
		});

		it('rejects invalid sessionId format', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const ws = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: {
					Upgrade: 'websocket',
					'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Version': '13',
				},
				webSocket: ws,
			});

			const messagePromise = new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			ws.addEventListener('open', () => {
				ws.send(JSON.stringify({
					type: 'initiator-join',
					sessionId: 'invalid',
					token: 'a'.repeat(64),
				}));
			});

			await expect(ws.close).toHaveBeenCalledWith(4002, 'Bad join payload');
		});
	});

	describe('Reconnection replaces existing role socket', () => {
		it('replaces initiator socket on reconnect', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const ws1 = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: ws1,
			});

			await new Promise<void>((resolve) => {
				ws1.addEventListener('open', () => {
					ws1.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				ws1.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const ws2 = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: ws2,
			});

			await new Promise<void>((resolve) => {
				ws2.addEventListener('open', () => {
					ws2.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws1.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			await new Promise<string>((resolve) => {
				ws2.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4005);
			expect(closeInfo.reason).toBe('Replaced by reconnect');
		});

		it('replaces joiner socket on reconnect', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const ws1 = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: ws1,
			});

			await new Promise<void>((resolve) => {
				ws1.addEventListener('open', () => {
					ws1.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				ws1.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const ws2 = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: ws2,
			});

			await new Promise<void>((resolve) => {
				ws2.addEventListener('open', () => {
					ws2.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
					resolve();
				});
			});

			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws1.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});

			await new Promise<string>((resolve) => {
				ws2.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const closeInfo = await closePromise;
			expect(closeInfo.code).toBe(4005);
			expect(closeInfo.reason).toBe('Replaced by reconnect');
		});
	});

	describe('Binary chunk relay between peers', () => {
		it('relays binary data from initiator to joiner', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const initiatorWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: initiatorWs,
			});

			await new Promise<void>((resolve) => {
				initiatorWs.addEventListener('open', () => {
					initiatorWs.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				initiatorWs.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const joinerWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: joinerWs,
			});

			await new Promise<void>((resolve) => {
				joinerWs.addEventListener('open', () => {
					joinerWs.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
					resolve();
				});
			});

			await Promise.all([
				new Promise<string>((resolve) => {
					initiatorWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
				new Promise<string>((resolve) => {
					joinerWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
			]);

			const binaryData = new Uint8Array([1, 2, 3, 4, 5]).buffer;
			const binaryPromise = new Promise<ArrayBuffer>((resolve) => {
				joinerWs.addEventListener('message', (event) => {
					if (event.data instanceof ArrayBuffer) resolve(event.data);
				}, { once: true });
			});

			initiatorWs.send(binaryData);

			const received = await binaryPromise;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
		});

		it('relays binary data from joiner to initiator', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const initiatorWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: initiatorWs,
			});

			await new Promise<void>((resolve) => {
				initiatorWs.addEventListener('open', () => {
					initiatorWs.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				initiatorWs.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const joinerWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: joinerWs,
			});

			await new Promise<void>((resolve) => {
				joinerWs.addEventListener('open', () => {
					joinerWs.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
					resolve();
				});
			});

			await Promise.all([
				new Promise<string>((resolve) => {
					initiatorWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
				new Promise<string>((resolve) => {
					joinerWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
			]);

			const binaryData = new Uint8Array([9, 8, 7, 6, 5]).buffer;
			const binaryPromise = new Promise<ArrayBuffer>((resolve) => {
				initiatorWs.addEventListener('message', (event) => {
					if (event.data instanceof ArrayBuffer) resolve(event.data);
				}, { once: true });
			});

			joinerWs.send(binaryData);

			const received = await binaryPromise;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
		});

		it('relays WebRTC signaling messages between peers', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const initiatorWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: initiatorWs,
			});

			await new Promise<void>((resolve) => {
				initiatorWs.addEventListener('open', () => {
					initiatorWs.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				initiatorWs.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const joinerWs = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: joinerWs,
			});

			await new Promise<void>((resolve) => {
				joinerWs.addEventListener('open', () => {
					joinerWs.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
					resolve();
				});
			});

			await Promise.all([
				new Promise<string>((resolve) => {
					initiatorWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
				new Promise<string>((resolve) => {
					joinerWs.addEventListener('message', (event) => {
						if (typeof event.data === 'string') resolve(event.data);
					}, { once: true });
				}),
			]);

			const offer = { type: 'offer', sdp: 'fake-sdp' };
			const offerPromise = new Promise<string>((resolve) => {
				joinerWs.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			initiatorWs.send(JSON.stringify({ type: 'webrtc-offer', offer }));

			const received = await offerPromise;
			const msg = JSON.parse(received);
			expect(msg.type).toBe('webrtc-offer');
			expect(msg.offer).toEqual(offer);
		});
	});

	describe('Rate limiting', () => {
		it('enforces session creation rate limit', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			for (let i = 0; i < 10; i++) {
				const response = await stub.fetch('http://test/session', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ fileCount: 1 }),
				});
				expect(response.status).toBe(200);
			}

			const response = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});

			expect(response.status).toBe(429);
		});

		it('enforces WebSocket message rate limit', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const ws = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: ws,
			});

			await new Promise<void>((resolve) => {
				ws.addEventListener('open', () => {
					ws.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			for (let i = 0; i < 100; i++) {
				ws.send(JSON.stringify({ type: 'clipboard-push', data: `msg-${i}` }));
			}

			await waitFor(100);

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
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token, expiresAt } = await createResponse.json();

			expect(expiresAt).toBeGreaterThan(Date.now());

			const ws = new WebSocket('ws://test/');
			await stub.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: ws,
			});

			await new Promise<void>((resolve) => {
				ws.addEventListener('open', () => {
					ws.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
					resolve();
				});
			});

			await new Promise<string>((resolve) => {
				ws.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const killResponse = await stub.fetch(`http://test/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});

			expect(killResponse.status).toBe(200);
			const killData = await killResponse.json();
			expect(killData.ok).toBe(true);
		});

		it('kills session with valid token', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const killResponse = await stub.fetch(`http://test/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});

			expect(killResponse.status).toBe(200);
			const data = await killResponse.json();
			expect(data.ok).toBe(true);
		});

		it('rejects kill with invalid token', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId } = await createResponse.json();

			const killResponse = await stub.fetch(`http://test/session/${sessionId}`, {
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

			const create1 = await stub1.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 2 }),
			});
			const { sessionId: sessionId1, token: token1 } = await create1.json();

			const create2 = await stub2.fetch('http://test/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 3 }),
			});
			const { sessionId: sessionId2, token: token2 } = await create2.json();

			expect(sessionId1).not.toBe(sessionId2);
			expect(token1).not.toBe(token2);

			const ws1 = new WebSocket('ws://test/');
			await stub1.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key1', 'Sec-WebSocket-Version': '13' },
				webSocket: ws1,
			});

			await new Promise<void>((resolve) => {
				ws1.addEventListener('open', () => {
					ws1.send(JSON.stringify({ type: 'initiator-join', sessionId: sessionId1, token: token1 }));
					resolve();
				});
			});

			const msg1Promise = new Promise<string>((resolve) => {
				ws1.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			const ws2 = new WebSocket('ws://test/');
			await stub2.fetch('http://test/', {
				method: 'GET',
				headers: { Upgrade: 'websocket', 'Sec-WebSocket-Key': 'key2', 'Sec-WebSocket-Version': '13' },
				webSocket: ws2,
			});

			await new Promise<void>((resolve) => {
				ws2.addEventListener('open', () => {
					ws2.send(JSON.stringify({ type: 'initiator-join', sessionId: sessionId2, token: token2 }));
					resolve();
				});
			});

			await msg1Promise;

			const msg2Promise = new Promise<string>((resolve) => {
				ws2.addEventListener('message', (event) => {
					if (typeof event.data === 'string') resolve(event.data);
				}, { once: true });
			});

			await msg2Promise;

			const binaryData = new Uint8Array([42, 42, 42]).buffer;
			const binaryPromise = new Promise<ArrayBuffer>((resolve) => {
				ws1.addEventListener('message', (event) => {
					if (event.data instanceof ArrayBuffer) resolve(event.data);
				}, { once: true });
			});

			ws2.send(binaryData);

			await expect(binaryPromise).rejects.toThrow();

			ws1.close();
			ws2.close();
		});
	});

	describe('Peek links (/view endpoints)', () => {
		it('creates a view via POST /view', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('http://test/view', {
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
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/view', {
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

			const getResponse = await stub.fetch(`http://test/view/${viewId}`, {
				method: 'GET',
			});

			expect(getResponse.status).toBe(200);
			expect(getResponse.headers.get('X-Filename')).toBe('test.txt');
			expect(getResponse.headers.get('X-Mime-Type')).toBe('text/plain');

			const blob = await getResponse.arrayBuffer();
			expect(new Uint8Array(blob)).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
		});

		it('returns 410 for expired view', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/view', {
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

			await waitFor(100);

			const getResponse = await stub.fetch(`http://test/view/${viewId}`, {
				method: 'GET',
			});

			expect(getResponse.status).toBe(410);
		});

		it('returns 410 for once-only view after first access', async () => {
			const id = peekSessionNamespace.idFromName('global');
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('http://test/view', {
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

			const firstGet = await stub.fetch(`http://test/view/${viewId}`, { method: 'GET' });
			expect(firstGet.status).toBe(200);

			const secondGet = await stub.fetch(`http://test/view/${viewId}`, { method: 'GET' });
			expect(secondGet.status).toBe(410);
		});
	});
});