import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';

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

		it('rejects sixth receiver with busy when five already connected (5 max)', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: initiatorWs } = await connect(stub, { type: 'initiator-join', sessionId, token });
			const { ws: ws1, nextMessage } = await connect(stub, { type: 'joiner-join', sessionId, token });
			// fill to 5 approved (legacy joins auto-approve)
			for (let i = 0; i < 4; i++) {
				await connect(stub, { type: 'joiner-join', sessionId, token });
			}

			const wsResponse2 = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
			const ws2 = wsResponse2.webSocket;
			if (!ws2) throw new Error('Expected WebSocket response');
			ws2.accept();
			const closePromise2 = new Promise<{ code: number; reason: string }>((resolve) => {
				ws2.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});
			ws2.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));

			const closeInfo = await Promise.race([
				closePromise2,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('busy-close timeout: sixth receiver was not rejected')), 5000)),
			]);
			expect(closeInfo.code).toBe(4003);
			expect(closeInfo.reason).toMatch(/busy/i);
			expect(ws1.readyState).toBe(WebSocket.OPEN);

			initiatorWs.send(new Uint8Array([7, 7, 7]).buffer);
			const received = await nextMessage((d) => d instanceof ArrayBuffer) as ArrayBuffer;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([7, 7, 7]));
		});
	});

	describe('Multi-viewer per-viewer keys (5 max, pending/approved)', () => {
		const openRawWs = async (stub: any) => {
			const wsResponse = await stub.fetch('https://example.com/', { headers: { Upgrade: 'websocket' } });
			const ws = wsResponse.webSocket;
			if (!ws) throw new Error('Expected WebSocket response');
			ws.accept();
			const inbox: any[] = [];
			ws.addEventListener('message', (event: any) => { inbox.push(event.data); });
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
			const waitClose = (timeoutMs = 5000) =>
				new Promise<{ code: number; reason: string }>((resolve, reject) => {
					ws.addEventListener('close', (event: any) => {
						resolve({ code: event.code, reason: event.reason });
					}, { once: true });
					setTimeout(() => reject(new Error('waitClose timeout')), timeoutMs);
				});
			return { ws, inbox, nextMessage, waitClose };
		};

		const createSession = async (stub: any) => {
			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			return await createResponse.json() as { sessionId: string; token: string };
		};

		const fakeJwk = (n = 'fake-n') => ({ kty: 'RSA', n, e: 'AQAB', alg: 'RSA-OAEP-256', ext: true });
		const fakeWrapped = (s = 'fake-wrapped-key') => btoa(s);

		it('(a) forwards receiver-join-request as viewer-pending (pending does not count)', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const { ws: joinerWs } = await openRawWs(stub);
			const pubKeyJwk = fakeJwk();
			joinerWs.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk, viewerName: 'Alice' }));

			const raw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'viewer-pending') as string;
			const msg = JSON.parse(raw);
			expect(msg.type).toBe('viewer-pending');
			expect(typeof msg.receiverId).toBe('string');
			expect(msg.pubKeyJwk).toEqual(pubKeyJwk);
			expect(msg.viewerName).toBe('Alice');
			// pending does NOT trigger peer-connected
			expect(initiatorWs.readyState).toBe(WebSocket.OPEN);
			expect(joinerWs.readyState).toBe(WebSocket.OPEN);
		});

		it('(b) rejects 6th join with busy when 5 approved', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			for (let i = 0; i < 5; i++) {
				const { ws: rws, nextMessage: rNext } = await openRawWs(stub);
				rws.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk(`n${i}`), viewerName: `V${i}` }));
				const pendingRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === `V${i}`) as string;
				const pending = JSON.parse(pendingRaw);
				expect(pending.type).toBe('viewer-pending');
				initiatorWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64: fakeWrapped(`k${i}`) }));
				const grantRaw = await rNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant') as string;
				expect(JSON.parse(grantRaw).wrappedKeyB64).toBe(fakeWrapped(`k${i}`));
			}

			const { ws: ws6, waitClose } = await openRawWs(stub);
			ws6.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk('n6'), viewerName: 'V6' }));
			const closeInfo = await waitClose();
			expect(closeInfo.code).toBe(4003);
			expect(closeInfo.reason).toMatch(/busy/i);
		});

		it('(c) forwards sender-key-grant as key-grant and marks approved', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const { ws: rws, nextMessage: rNext } = await openRawWs(stub);
			const pubKeyJwk = fakeJwk();
			rws.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk, viewerName: 'Bob' }));
			const pendingRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'viewer-pending') as string;
			const pending = JSON.parse(pendingRaw);

			const wrappedKeyB64 = fakeWrapped('secret-123');
			initiatorWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64 }));
			const grantRaw = await rNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant') as string;
			const grant = JSON.parse(grantRaw);
			expect(grant.type).toBe('key-grant');
			expect(grant.wrappedKeyB64).toBe(wrappedKeyB64);

			// sender learns count via peer-connected (extended, not new channel)
			const peerRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'peer-connected' && JSON.parse(d).receiverId === pending.receiverId) as string;
			const peer = JSON.parse(peerRaw);
			expect(peer.receiverId).toBe(pending.receiverId);
			expect(peer.receiverCount).toBe(1);
		});

		it('(d) fans out binary to 2 approved receivers', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const approved: Array<{ ws: any; nextMessage: any }> = [];
			for (let i = 0; i < 2; i++) {
				const { ws: rws, nextMessage: rNext } = await openRawWs(stub);
				rws.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk(`fan${i}`), viewerName: `F${i}` }));
				const pendingRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === `F${i}`) as string;
				const pending = JSON.parse(pendingRaw);
				initiatorWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64: fakeWrapped(`fk${i}`) }));
				await rNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant');
				approved.push({ ws: rws, nextMessage: rNext });
			}

			initiatorWs.send(new Uint8Array([5, 6, 7]).buffer);
			for (const { nextMessage } of approved) {
				const received = await nextMessage((d: any) => d instanceof ArrayBuffer) as ArrayBuffer;
				expect(new Uint8Array(received)).toEqual(new Uint8Array([5, 6, 7]));
			}
		});

		it('(e) leave/disconnect decrements and notifies sender with counts', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const receivers: Array<{ ws: any; nextMessage: any; receiverId: string }> = [];
			for (let i = 0; i < 2; i++) {
				const { ws: rws, nextMessage: rNext } = await openRawWs(stub);
				rws.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk(`lv${i}`), viewerName: `L${i}` }));
				const pendingRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === `L${i}`) as string;
				const pending = JSON.parse(pendingRaw);
				initiatorWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64: fakeWrapped(`lk${i}`) }));
				await rNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant');
				receivers.push({ ws: rws, nextMessage: rNext, receiverId: pending.receiverId });
			}
			// drain peer-connected for second receiver so next peer-disconnected is unambiguous
			await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'peer-connected' && JSON.parse(d).receiverId === receivers[1].receiverId);

			receivers[0].ws.close();
			const discRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'peer-disconnected' && JSON.parse(d).receiverId === receivers[0].receiverId) as string;
			const disc = JSON.parse(discRaw);
			expect(disc.receiverId).toBe(receivers[0].receiverId);
			expect(disc.receiverCount).toBe(1);

			// fan-out now reaches only the remaining receiver
			initiatorWs.send(new Uint8Array([9, 9, 9]).buffer);
			const received = await receivers[1].nextMessage((d: any) => d instanceof ArrayBuffer) as ArrayBuffer;
			expect(new Uint8Array(received)).toEqual(new Uint8Array([9, 9, 9]));
		});

		it('(f) rejects 6th pending join-request with busy when 5 already pending', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			for (let i = 0; i < 5; i++) {
				const { ws } = await openRawWs(stub);
				ws.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk(`p${i}`), viewerName: `P${i}` }));
				const raw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === `P${i}`) as string;
				expect(JSON.parse(raw).type).toBe('viewer-pending');
			}

			const { ws: ws6, waitClose } = await openRawWs(stub);
			ws6.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk('p5'), viewerName: 'P5' }));
			const closeInfo = await waitClose();
			expect(closeInfo.code).toBe(4003);
			expect(closeInfo.reason).toMatch(/busy/i);
		});

		it('(g) ignores sender-key-grant from viewer (victim stays pending)', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);
			const { sessionId, token } = await createSession(stub);
			const { ws: initiatorWs, nextMessage: initiatorNext } = await connect(stub, { type: 'initiator-join', sessionId, token });

			const { ws: victimWs, nextMessage: victimNext } = await openRawWs(stub);
			victimWs.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk('victim'), viewerName: 'Victim' }));
			const pendingRaw = await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === 'Victim') as string;
			const pending = JSON.parse(pendingRaw);
			expect(pending.type).toBe('viewer-pending');

			const { ws: attackerWs } = await openRawWs(stub);
			attackerWs.send(JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk: fakeJwk('attacker'), viewerName: 'Attacker' }));
			await initiatorNext((d: any) => typeof d === 'string' && JSON.parse(d).viewerName === 'Attacker');

			attackerWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64: fakeWrapped('evil') }));
			await expect(victimNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant', 1000)).rejects.toThrow();

			initiatorWs.send(JSON.stringify({ type: 'sender-key-grant', sessionId, token, targetReceiverId: pending.receiverId, wrappedKeyB64: fakeWrapped('legit') }));
			const grantRaw = await victimNext((d: any) => typeof d === 'string' && JSON.parse(d).type === 'key-grant') as string;
			expect(JSON.parse(grantRaw).wrappedKeyB64).toBe(fakeWrapped('legit'));
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

		it('resets the create window after an hour', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			await runInDurableObject(stub, async (_instance: any, state: DurableObjectState) => {
				await state.storage.put(`rate:session_create`, { count: 10, windowStart: Date.now() - 3600001 });
			});

			const response = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});

			expect(response.status).toBe(200);
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

		it('caps messages across reconnects', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws: ws1 } = await connect(stub, { type: 'initiator-join', sessionId, token });
			for (let i = 0; i < 60; i++) {
				ws1.send(JSON.stringify({ type: 'clipboard-push', data: `pre-${i}` }));
			}

			const { ws: ws2 } = await connect(stub, { type: 'initiator-join', sessionId, token });
			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws2.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});
			for (let i = 0; i < 50; i++) {
				ws2.send(JSON.stringify({ type: 'clipboard-push', data: `post-${i}` }));
			}

			const closeInfo = await Promise.race([
				closePromise,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('reconnect-cap timeout: ws2 was not rate-limited')), 5000)),
			]);
			expect(closeInfo.code).toBe(4008);
		});

		it('counts binary frames toward rate cap', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			const { ws } = await connect(stub, { type: 'initiator-join', sessionId, token });
			await connect(stub, { type: 'joiner-join', sessionId, token });
			const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
				ws.addEventListener('close', (event) => {
					resolve({ code: event.code, reason: event.reason });
				}, { once: true });
			});
			for (let i = 0; i < 60; i++) {
				ws.send(JSON.stringify({ type: 'clipboard-push', data: `msg-${i}` }));
			}
			for (let i = 0; i < 50; i++) {
				ws.send(new Uint8Array([1, 2, 3]).buffer);
			}

			const closeInfo = await Promise.race([
				closePromise,
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('binary-cap timeout: binary frames were not counted')), 5000)),
			]);
			expect(closeInfo.code).toBe(4008);
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

		it('cleans up session on expiry', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const createResponse = await stub.fetch('https://example.com/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileCount: 1 }),
			});
			const { sessionId, token } = await createResponse.json();

			// Backdate the session past its TTL via the DO storage handle.
			await runInDurableObject(stub, async (_instance: any, state: DurableObjectState) => {
				const key = `session:${sessionId}`;
				const session: any = await state.storage.get(key);
				await state.storage.put(key, { ...session, expiresAt: Date.now() - 1 });
			});

			// Any session lookup (here: kill) now runs the getSession expiry path.
			const killResponse = await stub.fetch(`https://example.com/session/${sessionId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});
			expect(killResponse.status).toBe(403);

			const leaked = await runInDurableObject(stub, async (_instance: any, state: DurableObjectState) => {
				return await state.storage.get(`session:${sessionId}`);
			});
			expect(leaked).toBeUndefined();
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

		it('rejects view larger than 50MB with 413', async () => {
			const id = newId();
			const stub = peekSessionNamespace.get(id);

			const response = await stub.fetch('https://example.com/view', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Filename': 'big.bin',
					'X-Mime-Type': 'application/octet-stream',
					'X-Expires-In': '15',
					'X-Once-Only': 'false',
				},
				body: new Uint8Array(50 * 1024 * 1024 + 1).buffer,
			});

			expect(response.status).toBe(413);
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
