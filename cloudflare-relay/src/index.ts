export interface Env {
	PEEK_SESSION: DurableObjectNamespace;
}

interface Session {
	id: string;
	token: string;
	expiresAt: number;
	initiatorJoinedAt: number | null;
	joinerJoinedAt: number | null;
	fileCount: number;
}

interface ViewEntry {
	id: string;
	blob: ArrayBuffer;
	filename: string;
	mimeType: string;
	expiresAt: number;
	onceOnly: boolean;
	viewed: boolean;
}

interface WebSocketAttachment {
	sessionId: string;
	role: "initiator" | "joiner";
}

export class PeekSession {
	constructor(
		private state: DurableObjectState,
		private env: Env
	) {}

	private async computeAcceptKey(key: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
		const hashBuffer = await crypto.subtle.digest('SHA-1', data);
		return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
	}

	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		const origin = request.headers.get("Origin");
		if (upgradeHeader !== "websocket") {
			const response = await this.handleHttp(request);
			addCorsHeaders(response.headers, origin);
			return response;
		}

		const responseHeaders = new Headers();
		responseHeaders.set("Connection", "Upgrade");
		responseHeaders.set("Upgrade", "websocket");
		responseHeaders.set("Sec-WebSocket-Accept", await this.computeAcceptKey(request.headers.get("Sec-WebSocket-Key") || ""));
		addCorsHeaders(responseHeaders, origin);

		const [client, server] = Object.values(new WebSocketPair());
		server.serializeAttachment({ sessionId: "", role: "initiator" });
		this.state.acceptWebSocket(server);

		return new Response(null, { status: 101, headers: responseHeaders, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		if (typeof data === "string") {
			await this.handleJsonMessage(ws, data);
		} else {
			await this.handleBinaryMessage(ws, data);
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
		if (!attachment || !attachment.sessionId) return;

		const peerRole = attachment.role === "initiator" ? "joiner" : "initiator";
		const peerWs = await this.getRoleWebSocket(attachment.sessionId, peerRole);
		if (peerWs && peerWs.readyState === WebSocket.OPEN) {
			peerWs.send(JSON.stringify({ type: "peer-disconnected" }));
		}
	}

	private async handleHttp(request: Request): Promise<Response> {
		const url2 = new URL(request.url);
		const origin = request.headers.get("Origin");

		if (request.method === "POST" && url2.pathname === "/session") {
			const response = await this.createSession(request);
			addCorsHeaders(response.headers, origin);
			return response;
		}
		if (request.method === "DELETE" && url2.pathname.startsWith("/session/")) {
			const response = await this.killSession(request);
			addCorsHeaders(response.headers, origin);
			return response;
		}
		if (request.method === "POST" && url2.pathname === "/view") {
			const response = await this.createView(request);
			addCorsHeaders(response.headers, origin);
			return response;
		}
		if (request.method === "GET" && url2.pathname.startsWith("/view/")) {
			const response = await this.getView(request);
			addCorsHeaders(response.headers, origin);
			return response;
		}
		if (request.method === "GET" && url2.pathname === "/health") {
			const response = new Response(JSON.stringify({ ok: true }), {
				headers: { "Content-Type": "application/json" },
			});
			addCorsHeaders(response.headers, origin);
			return response;
		}

		const response = new Response("Not found", { status: 404 });
		addCorsHeaders(response.headers, origin);
		return response;
	}

	private async createSession(request: Request): Promise<Response> {
		try {
			const body = await request.json().catch(() => ({}));
			const fileCount = Math.max(0, Math.min(500, Number(body?.fileCount || 0)));

			const sessionIdBytes = new Uint8Array(8);
			globalThis.crypto.getRandomValues(sessionIdBytes);
			const sessionId = Array.from(sessionIdBytes, b => b.toString(16).padStart(2, '0')).join('');

			const tokenBytes = new Uint8Array(32);
			globalThis.crypto.getRandomValues(tokenBytes);
			const token = Array.from(tokenBytes, b => b.toString(16).padStart(2, '0')).join('');

			const session: Session = {
				id: sessionId,
				token,
				expiresAt: Date.now() + 60 * 60 * 1000,
				initiatorJoinedAt: null,
				joinerJoinedAt: null,
				fileCount,
			};

			await this.state.storage.put(`session:${sessionId}`, session);
			await this.state.storage.put(`session_token:${token}`, sessionId);

			return new Response(
				JSON.stringify({ sessionId, token, expiresAt: session.expiresAt }),
				{ headers: { "Content-Type": "application/json" } }
			);
		} catch (e) {
			return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
		}
	}

	private async killSession(request: Request): Promise<Response> {
		const sessionId = new URL(request.url).pathname.split("/")[2];
		const body = await request.json().catch(() => ({}));
		const token = body?.token || "";

		const session = await this.getSession(sessionId);
		if (!session || !(await this.validateToken(sessionId, token))) {
			return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
				status: 403,
				headers: { "Content-Type": "application/json" },
			});
		}

		await this.killSessionInternal(sessionId);
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	private async createView(request: Request): Promise<Response> {
		try {
			const expiresIn = Math.max(1, Math.min(120, Number(request.headers.get("X-Expires-In") || "15")));
			const filename = request.headers.get("X-Filename") || "peek-file";
			const mimeType = request.headers.get("X-Mime-Type") || "application/octet-stream";
			const onceOnly = request.headers.get("X-Once-Only") === "true";
			const blob = await request.arrayBuffer();

			if (!blob || blob.byteLength === 0) {
				return new Response(JSON.stringify({ error: "Empty body" }), { status: 400 });
			}

			const viewIdBytes = new Uint8Array(8);
			globalThis.crypto.getRandomValues(viewIdBytes);
			const viewId = Array.from(viewIdBytes, b => b.toString(16).padStart(2, '0')).join('');

			const entry: ViewEntry = {
				id: viewId,
				blob,
				filename,
				mimeType,
				expiresAt: Date.now() + expiresIn * 60 * 1000,
				onceOnly,
				viewed: false,
			};

			await this.state.storage.put(`view:${viewId}`, entry);

			return new Response(
				JSON.stringify({ id: viewId }),
				{ headers: { "Content-Type": "application/json" } }
			);
		} catch (e) {
			return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
		}
	}

	private async getView(request: Request): Promise<Response> {
		const viewId = new URL(request.url).pathname.split("/")[2];
		if (!viewId || !/^[a-f0-9]{16}$/i.test(viewId)) {
			return new Response("Invalid view ID", { status: 400 });
		}

		const entry = await this.state.storage.get<ViewEntry>(`view:${viewId}`);
		if (!entry) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 410 });
		}

		if (entry.expiresAt < Date.now()) {
			await this.state.storage.delete(`view:${viewId}`);
			return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
		}

		if (entry.onceOnly && entry.viewed) {
			await this.state.storage.delete(`view:${viewId}`);
			return new Response(JSON.stringify({ error: "Already viewed" }), { status: 410 });
		}

		if (entry.onceOnly) {
			await this.state.storage.put(`view:${viewId}`, { ...entry, viewed: true });
		}

		return new Response(entry.blob, {
			headers: {
				"Content-Type": "application/octet-stream",
				"X-Expires-At": String(entry.expiresAt),
				"X-Filename": entry.filename,
				"X-Mime-Type": entry.mimeType,
			},
		});
	}

	private async getSession(sessionId: string) {
		const session = await this.state.storage.get<Session>(`session:${sessionId}`);
		if (!session) return null;
		if (session.expiresAt < Date.now()) {
			await this.state.storage.delete(`session:${sessionId}`);
			return null;
		}
		return session;
	}

	private async validateToken(sessionId: string, token: string): Promise<boolean> {
		const session = await this.getSession(sessionId);
		return session?.token === token;
	}

	private async killSessionInternal(sessionId: string): Promise<void> {
		const session = await this.state.storage.get(`session:${sessionId}`);
		if (session) {
			await this.state.storage.delete(`session_token:${session.token}`);
		}
		await this.state.storage.delete(`session:${sessionId}`);
	}

	private getRoleWebSocket(sessionId: string, role: "initiator" | "joiner"): WebSocket | null {
		const websockets = this.state.getWebSockets();
		for (const ws of websockets) {
			const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
			if (attachment && attachment.sessionId === sessionId && attachment.role === role && ws.readyState === WebSocket.OPEN) {
				return ws;
			}
		}
		return null;
	}

	private getPeerWs(ws: WebSocket): WebSocket | null {
		const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
		if (!attachment || !attachment.sessionId) return null;
		const peerRole = attachment.role === "initiator" ? "joiner" : "initiator";
		return this.getRoleWebSocket(attachment.sessionId, peerRole);
	}

	async handleJsonMessage(ws: WebSocket, text: string): Promise<void> {
		let message: any;
		try {
			message = JSON.parse(text);
		} catch {
			ws.close(4002, "Bad message");
			return;
		}

		const { type } = message;

		switch (type) {
			case "initiator-join":
			case "joiner-join":
				await this.handleJoin(ws, message, message.type === "initiator-join" ? "initiator" : "joiner");
				break;
			case "webrtc-offer":
			case "webrtc-answer":
			case "webrtc-candidate":
			case "clipboard-push":
			case "view-share-push":
				await this.relayToPeer(ws, message);
				break;
			default:
				break;
		}
	}

	async handleJoin(ws: WebSocket, message: any, role: "initiator" | "joiner"): Promise<void> {
		const { sessionId, token } = message;

		if (!/^[a-f0-9]{16}$/i.test(String(sessionId || "")) ||
			typeof message.token !== "string" ||
			!/^[a-f0-9]{32,128}$/i.test(message.token)) {
			ws.close(4002, "Bad join payload");
			return;
		}

		const session = await this.getSession(message.sessionId);
		if (!session || !(await this.validateToken(message.sessionId, message.token))) {
			ws.close(4001, "Invalid token");
			return;
		}

		const existingWs = this.getRoleWebSocket(message.sessionId, role);
		if (existingWs && existingWs !== ws) {
			existingWs.close(4005, "Replaced by reconnect");
		}

		ws.serializeAttachment({ sessionId: message.sessionId, role });

		if (role === "initiator") {
			await this.state.storage.put(`session:${message.sessionId}`, {
				...session,
				initiatorJoinedAt: Date.now(),
			});
		} else {
			await this.state.storage.put(`session:${message.sessionId}`, {
				...session,
				joinerJoinedAt: Date.now(),
			});
		}

		const peerRole = role === "initiator" ? "joiner" : "initiator";
		const sessionInfo = await this.getSession(message.sessionId);
		const peerJoinedAt = sessionInfo
			? (role === "initiator" ? sessionInfo.joinerJoinedAt : sessionInfo.initiatorJoinedAt)
			: null;

		this.sendJson(ws, { type: `${role}-ready`, expiresAt: session.expiresAt });
		if (peerJoinedAt) {
			this.sendJson(ws, { type: "peer-connected", role: peerRole });
		}

		const peerWs = this.getRoleWebSocket(message.sessionId, peerRole);
		if (peerWs) {
			peerWs.send(JSON.stringify({ type: "peer-connected", role }));
		}
	}

	async relayToPeer(ws: WebSocket, message: any): Promise<void> {
		const peerWs = this.getPeerWs(ws);
		if (peerWs && peerWs.readyState === WebSocket.OPEN) {
			peerWs.send(JSON.stringify(message));
		}
	}

	async handleBinaryMessage(ws: WebSocket, data: ArrayBuffer): Promise<void> {
		const peerWs = this.getPeerWs(ws);
		if (peerWs && peerWs.readyState === WebSocket.OPEN) {
			peerWs.send(data);
		}
	}

	private sendJson(ws: WebSocket, payload: object): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}
}

function corsHeaders(origin: string | null) {
	const allowedOrigins = [
		"https://peekapp.vercel.app",
		"https://peek.dev",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	];
	const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Expires-In, X-Filename, X-Mime-Type, X-Once-Only",
		"Access-Control-Expose-Headers": "X-Expires-At, X-Filename, X-Mime-Type",
		"Access-Control-Max-Age": "86400",
	};
}

function addCorsHeaders(headers: Headers, origin: string | null): void {
	for (const [k, v] of Object.entries(corsHeaders(origin))) {
		headers.set(k, v);
	}
}

function handleOptions(request: Request): Response {
	const origin = request.headers.get("Origin");
	return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return handleOptions(request);
		}

		const id = env.PEEK_SESSION.idFromName("global");
		const stub = env.PEEK_SESSION.get(id);
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
