import { Miniflare } from 'miniflare';

console.log('=== VITEST SETUP RUNNING ===');

// Polyfill WebSocketPair and WebSocket for Node.js test environment
class MockWebSocket {
	url: string;
	readyState: number = 0; // CONNECTING
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	binaryType: string = 'blob';
	extensions: string = '';
	protocol: string = '';
	bufferedAmount: number = 0;
	
	private _listeners: Map<string, Set<Function>> = new Map();
	private _partner: MockWebSocket | null = null;

	constructor(url: string) {
		this.url = url;
		console.log('MockWebSocket created:', url);
		// Simulate async connection
		setTimeout(() => {
			this.readyState = 1; // OPEN
			this.onopen?.({ type: 'open', target: this } as any);
			this._dispatchEvent('open', { type: 'open', target: this });
		}, 0);
	}

	set partner(ws: MockWebSocket) {
		this._partner = ws;
	}

	send(data: string | ArrayBuffer) {
		if (this.readyState !== 1) {
			throw new Error('WebSocket is not open');
		}
		// Forward to partner
		if (this._partner && this._partner.readyState === 1) {
			setTimeout(() => {
				const event = { 
					type: 'message', 
					data, 
					target: this._partner 
				} as any;
				this._partner.onmessage?.(event);
				this._partner._dispatchEvent('message', event);
			}, 0);
		}
	}

	close(code?: number, reason?: string) {
		this.readyState = 3; // CLOSED
		const event = { type: 'close', code, reason, target: this } as any;
		this.onclose?.(event);
		this._dispatchEvent('close', event);
	}

	addEventListener(type: string, listener: EventListener) {
		if (!this._listeners.has(type)) {
			this._listeners.set(type, new Set());
		}
		this._listeners.get(type)!.add(listener);
	}

	removeEventListener(type: string, listener: EventListener) {
		this._listeners.get(type)?.delete(listener);
	}

	_dispatchEvent(type: string, event: Event) {
		this._listeners.get(type)?.forEach(listener => listener(event));
	}
}

// Simple function that returns the WebSocketPair object
// Works with both `WebSocketPair()` and `new WebSocketPair()`
function WebSocketPair() {
	console.log('WebSocketPair function called');
	const client = new MockWebSocket('ws://test');
	const server = new MockWebSocket('ws://test');
	
	// Connect them bidirectionally
	client.partner = server;
	server.partner = client;
	
	// Return object with numeric properties 0 and 1
	const result = {
		0: client,
		1: server,
		length: 2,
	};
	
	console.log('WebSocketPair created:', Object.keys(result), result[0] ? 'client ok' : 'client undefined', result[1] ? 'server ok' : 'server undefined');
	
	return result;
}

// Assign to globalThis
globalThis.WebSocketPair = WebSocketPair as any;
globalThis.WebSocket = MockWebSocket as any;

console.log('=== VITEST SETUP COMPLETE ===');
console.log('globalThis.WebSocketPair:', typeof globalThis.WebSocketPair);
console.log('globalThis.WebSocket:', typeof globalThis.WebSocket);