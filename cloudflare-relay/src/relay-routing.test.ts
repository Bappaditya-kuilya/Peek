import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('S-relay cross-routing (worker fetch)', () => {
	it('HTTP create then WS join across worker routing succeeds', async () => {
		const createRes = await SELF.fetch('https://example.com/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fileCount: 1 }),
		});
		expect(createRes.status).toBe(200);
		const { sessionId, token } = (await createRes.json()) as { sessionId: string; token: string };
		expect(sessionId).toMatch(/^[a-f0-9]{16}$/);

		const wsRes = await SELF.fetch(`https://example.com/?sessionId=${sessionId}`, {
			headers: { Upgrade: 'websocket' },
		});
		expect(wsRes.status).toBe(101);
		const ws = wsRes.webSocket;
		if (!ws) throw new Error('Expected WebSocket response');
		ws.accept();

		const outcome = await new Promise<{ ok: boolean; code?: number; reason?: string }>((resolve) => {
			const timer = setTimeout(() => resolve({ ok: false }), 5000);
			ws.addEventListener(
				'message',
				(event) => {
					try {
						const msg = JSON.parse(event.data as string);
						if (msg.type === 'initiator-ready') {
							clearTimeout(timer);
							resolve({ ok: true });
						}
					} catch {
						/* ignore */
					}
				},
			);
			ws.addEventListener(
				'close',
				(event: any) => {
					clearTimeout(timer);
					resolve({ ok: false, code: event.code, reason: event.reason });
				},
				{ once: true },
			);
			ws.send(JSON.stringify({ type: 'initiator-join', sessionId, token }));
		});

		expect(outcome).toEqual({ ok: true });
	});
});
