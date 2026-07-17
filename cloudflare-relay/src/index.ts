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

interface WebSocketAttachment {
	sessionId: string;
	role: "initiator" | "joiner";
}

export class PeekSession {
	constructor(
		private state: DurableObjectState,
		private env: Env
	) {}

	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		if (upgradeHeader !== "websocket") {
			return this.handleHttp(request);
		}

		const [client, server] = Object.values(new WebSocketPair());
		this.state.acceptWebSocket(server);

		// Attach metadata via Hibernation API (survives hibernation)
		server.serializeAttachment({ sessionId: "", role: "initiator" });

		server.addEventListener("message", (event: MessageEvent) => {
			this.handleMessage(server, event.data);
		});

		server.addEventListener("close", () => {
			this.handleClose(server);
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	private async handleHttp(request: Request): Promise<Response> {
		const url2 = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/session") {
			return this.createSession(request);
		}
		if (request.method === "DELETE" && url.pathname.startsWith("/session/")) {
			return this.killSession(request);
		}
		if (request.method === "GET" && url.pathname === "/health") {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response("Not found", { status: 404 });
	}

	// ---------- Session Management ----------

	private async createSession(request: Request): Promise<Response> {
		const body = await request.json().catch(() => ({}));
		const fileCount = Math.max(0, Math.min(500, Number(body?.fileCount || 0)));

		const sessionId = crypto.randomBytes(8).toString("hex");
		const token = crypto.randomBytes(32).toString("hex");
		const now = Date.now();
		const session = {
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
		await this.state.storage.delete(`ws:initiator:${sessionId}`);
		await this.state.storage.delete(`ws:joiner:${sessionId}`);
	}

	// ---------- WebSocket Signaling ----------

	handleMessage(ws: WebSocket, data: string | ArrayBuffer): void {
		if (typeof data === "string") {
			this.handleJsonMessage(ws, data);
		} else {
			this.handleBinaryMessage(ws, data);
		}
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

		// Handle reconnection: replace existing socket for this role
		const existingWs = await this.getRoleWebSocket(message.sessionId, role);
		if (existingWs && existingWs !== ws) {
			existingWs.close(4005, "Replaced by reconnect");
		}

		// Store WebSocket reference via Hibernation API attachment (survives hibernation)
		ws.serializeAttachment({ sessionId: message.sessionId, role });

		// Store reference in DO storage for peer lookup
		await this.setRoleWebSocket(message.sessionId, role, ws);

		// Mark role as joined in session
		// session already fetched above at line 185
		if (!session) return;

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

		this.sendJson(ws, { type: `${role}-ready`, expiresAt: session?.expiresAt });
		if (peerJoinedAt) {
			this.sendJson(ws, { type: "peer-connected", role: peerRole });
		}

		// Notify peer
		const peerWs = await this.getRoleWebSocket(message.sessionId, role === "initiator" ? "joiner" : "initiator");
		if (peerWs) {
			peerWs.send(JSON.stringify({ type: "peer-connected", role }));
		}
	}

	async relayToPeer(ws: WebSocket, message: any): Promise<void> {
		const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
		if (!attachment) return;

		const peerRole = attachment.role === "initiator" ? "joiner" : "initiator";
		const peerWs = await this.getRoleWebSocket(attachment.sessionId, peerRole);
		if (peerWs && peerWs.readyState === WebSocket.OPEN) {
			peerWs.send(JSON.stringify(message));
		}
	}

	handleClose(ws: WebSocket): void {
		const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
		if (!attachment) return;

		const peerRole = attachment.role === "initiator" ? "joiner" : "initiator";
		const peerWs = this.getRoleWebSocket(attachment.sessionId, peerRole);
		if (peerWs) {
			peerWs.then((pws) => {
				if (pws && pws.readyState === WebSocket.OPEN) {
					pws.send(JSON.stringify({ type: "peer-disconnected" }));
				}
			});
		}
	}

	// ---------- Binary Data Relay ----------

	async handleBinaryMessage(ws: WebSocket, data: ArrayBuffer): Promise<void> {
		const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
		if (!attachment) return;

		const peerRole = attachment.role === "initiator" ? "joiner" : "initiator";
		const peerWs = await this.getRoleWebSocket(attachment.sessionId, attachment.role === "initiator" ? "joiner" : "initiator");
		if (peerWs && peerWs.readyState === WebSocket.OPEN) {
			peerWs.send(data);
		}
	}

	// ---------- WebSocket Helpers ----------

	private sendJson(ws: WebSocket, payload: object): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}

	async getRoleWebSocket(sessionId: string, role: "initiator" | "joiner"): Promise<WebSocket | null> {
		const ws = await this.state.storage.get<WebSocket>(`ws:${role}:${sessionId}`);
		return ws || null;
	}

	async setRoleWebSocket(sessionId: string, role: "initiator" | "joiner", ws: WebSocket): Promise<void> {
		await this.state.storage.put(`ws:${role}:${sessionId}`, ws);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// HTTP endpoints - use a single "global" DO for session management
		if (request.method === "POST" && url.pathname === "/session") {
			const id = env.PEEK_SESSION.idFromName("global");
			const stub = env.PEEK_SESSION.get(id);
			return stub.fetch(request);
		}
		if (request.method === "DELETE" && url.pathname.startsWith("/session/")) {
			const id = env.PEEK_SESSION.idFromName("global");
			const stub = env.PEEK_SESSION.get(id);
			return stub.fetch(request);
		}
		if (url.pathname === "/health") {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		// WebSocket connections - route by session ID for isolation
		const sessionId = url.pathname.split("/")[2] || "global";
		const id = env.PEEK_SESSION.idFromName(sessionId);
		const stub = env.PEEK_SESSION.get(id);
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;