import { Link } from 'react-router-dom';
import { Watermark } from '../components/Watermark.jsx';

export function DataFlowExplainer() {
  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="screen">
          <div className="workspace">
            <main className="workspace-main">
              <div className="workspace-shell stack-lg">
                <header className="workspace-header">
                  <div className="brand-block">
                    <Watermark eyebrow="How your data moves" />
                    <h1 className="workspace-title">Data flow</h1>
                  </div>
                </header>

                <p className="hero-copy">
                  Peek transfers files directly between browsers using WebRTC. When a direct connection
                  isn&apos;t possible, an encrypted relay steps in — but it never sees your files.
                </p>

                <section className="section-panel stack-lg" aria-labelledby="diagram-title">
                  <h2 id="diagram-title" className="section-title">
                    Encrypt in browser &rarr; Relay blind &rarr; Decrypt in browser
                  </h2>

                  <figure className="flow-diagram" role="img" aria-labelledby="diagram-title">
                    <svg viewBox="0 0 720 280" className="flow-svg" aria-hidden="true">
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill="var(--ink)" />
                        </marker>
                        <linearGradient id="grad-browser" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="var(--canvas)" />
                          <stop offset="100%" stopColor="var(--soft-cloud)" />
                        </linearGradient>
                        <linearGradient id="grad-relay" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#f0f0f5" />
                          <stop offset="100%" stopColor="#e8e8ee" />
                        </linearGradient>
                        <filter id="shadow-soft" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.06)" />
                        </filter>
                        <filter id="glow-blind" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="8" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Browser A - Sender */}
                      <g className="browser-node" transform="translate(40, 40)" filter="url(#shadow-soft)">
                        <rect x="0" y="0" width="200" height="200" rx="16" fill="url(#grad-browser)" stroke="var(--hairline)" stroke-width="1" />
                        <rect x="0" y="0" width="200" height="40" rx="16" fill="var(--soft-cloud)" stroke="var(--hairline)" stroke-width="1" />
                        <circle cx="12" cy="20" r="6" fill="#ff5f57" />
                        <circle cx="30" cy="20" r="6" fill="#ffbd2e" />
                        <circle cx="48" cy="20" r="6" fill="#28ca42" />
                        <rect x="12" y="56" width="176" height="128" rx="8" fill="var(--ink)" opacity="0.04" />
                        <rect x="24" y="72" width="60" height="60" rx="8" fill="var(--ink)" opacity="0.12" />
                        <rect x="104" y="72" width="88" height="20" rx="4" fill="var(--ink)" opacity="0.1" />
                        <rect x="104" y="104" width="88" height="14" rx="3" fill="var(--ink)" opacity="0.06" />
                        <rect x="104" y="132" width="60" height="14" rx="3" fill="var(--ink)" opacity="0.06" />
                        <text x="100" y="190" text-anchor="middle" font-family="var(--font-sans)" font-size="12" fill="var(--mute)" font-weight="500">Sender browser</text>
                        <text x="100" y="206" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--stone)">Encrypts files locally</text>

                        {/* Encryption badge */}
                        <g transform="translate(150, 10)" className="badge">
                          <rect x="0" y="0" width="56" height="24" rx="12" fill="var(--success)" opacity="0.15" stroke="var(--success)" stroke-width="1" />
                          <text x="28" y="16" text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--success)" font-weight="600">AES-GCM</text>
                        </g>
                      </g>

                      {/* Arrow: Browser A -> Relay */}
                      <path
                        d="M 240 140 Q 290 140, 340 140"
                        stroke="var(--ink)"
                        stroke-width="2"
                        fill="none"
                        marker-end="url(#arrowhead)"
                        stroke-dasharray="6 4"
                        opacity="0.4"
                      />
                      <text x="290" y="130" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--mute)" opacity="0.7">WebSocket (signaling)</text>

                      {/* Relay Server (Cloudflare Worker + Durable Object) */}
                      <g className="relay-node" transform="translate(280, 70)" filter="url(#shadow-soft)">
                        <rect x="0" y="0" width="160" height="140" rx="16" fill="url(#grad-relay)" stroke="var(--hairline)" stroke-width="1" />
                        <rect x="0" y="0" width="160" height="36" rx="16" fill="#e8e8ed" stroke="var(--hairline)" stroke-width="1" />
                        <rect x="12" y="10" width="12" height="12" rx="2" fill="#ffbd2e" />
                        <text x="80" y="95" text-anchor="middle" font-family="var(--font-display)" font-size="32" fill="var(--ink)" font-weight="400">☁</text>
                        <text x="80" y="128" text-anchor="middle" font-family="var(--font-sans)" font-size="12" fill="var(--mute)" font-weight="500">Relay (Worker + DO)</text>
                        <text x="80" y="148" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--stone)">WebSocket + SQLite</text>

                        {/* Blind relay badge */}
                        <g className="badge" transform="translate(40, -12)">
                          <rect x="0" y="0" width="80" height="20" rx="10" fill="var(--warning)" opacity="0.15" stroke="var(--warning)" stroke-width="1" />
                          <text x="40" y="13.5" text-anchor="middle" font-family="var(--font-sans)" font-size="9" fill="var(--warning)" font-weight="600">SEES CIPHERTEXT ONLY</text>
                        </g>

                        {/* What relay sees */}
                        <rect x="16" y="158" width="128" height="60" rx="8" fill="var(--ink)" opacity="0.03" stroke="var(--hairline)" stroke-width="0.5" />
                        <text x="80" y="175" text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--mute)" font-weight="500">Relay sees:</text>
                        <text x="80" y="192" text-anchor="middle" font-family="var(--font-mono)" font-size="9" fill="var(--stone)">
                          {`{type:"encrypted-chunk", data:"0x7f..."}`}
                        </text>
                        <text x="80" y="208" text-anchor="middle" font-family="var(--font-sans)" font-size="9" fill="var(--stone)">
                          Session ID, peer presence, TTL
                        </text>
                      </g>

                      {/* Arrow: Relay -> Browser B */}
                      <path
                        d="M 440 140 Q 490 140, 540 140"
                        stroke="var(--ink)"
                        stroke-width="2"
                        fill="none"
                        marker-end="url(#arrowhead)"
                        stroke-dasharray="6 4"
                        opacity="0.4"
                      />
                      <text x="490" y="130" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--mute)" opacity="0.7">WebSocket (relay)</text>

                      {/* Browser B - Receiver */}
                      <g className="browser-node" transform="translate(520, 40)" filter="url(#shadow-soft)">
                        <rect x="0" y="0" width="200" height="200" rx="16" fill="url(#grad-browser)" stroke="var(--hairline)" stroke-width="1" />
                        <rect x="0" y="0" width="200" height="40" rx="16" fill="var(--soft-cloud)" stroke="var(--hairline)" stroke-width="1" />
                        <circle cx="12" cy="20" r="6" fill="#ff5f57" />
                        <circle cx="30" cy="20" r="6" fill="#ffbd2e" />
                        <circle cx="48" cy="20" r="6" fill="#28ca42" />
                        <rect x="12" y="56" width="176" height="128" rx="8" fill="var(--ink)" opacity="0.04" />
                        <rect x="24" y="72" width="60" height="60" rx="8" fill="var(--success-bright)" opacity="0.15" />
                        <rect x="104" y="72" width="88" height="20" rx="4" fill="var(--success-bright)" opacity="0.2" />
                        <rect x="104" y="104" width="88" height="14" rx="3" fill="var(--success-bright)" opacity="0.12" />
                        <rect x="104" y="132" width="60" height="14" rx="3" fill="var(--success-bright)" opacity="0.12" />
                        <text x="100" y="190" text-anchor="middle" font-family="var(--font-sans)" font-size="12" fill="var(--mute)" font-weight="500">Receiver browser</text>
                        <text x="100" y="206" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--stone)">Decrypts locally</text>

                        {/* Decryption badge */}
                        <g transform="translate(150, 10)" className="badge">
                          <rect x="0" y="0" width="56" height="24" rx="12" fill="var(--success)" opacity="0.15" stroke="var(--success)" stroke-width="1" />
                          <text x="28" y="16" text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--success)" font-weight="600">AES-GCM</text>
                        </g>
                      </g>

                      {/* Direct WebRTC path (dashed, overlay) */}
                      <g className="direct-path" opacity="0.5">
                        <path
                          d="M 240 180 Q 360 60, 480 180"
                          stroke="var(--info)"
                          stroke-width="2"
                          fill="none"
                          marker-end="url(#arrowhead)"
                          stroke-dasharray="8 4"
                        />
                        <text x="360" y="50" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--info)" font-weight="500">Preferred: Direct WebRTC (P2P)</text>
                        <text x="360" y="66" text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--mute)">Encrypted data channel, no relay hop</text>
                      </g>

                      {/* TURN fallback note */}
                      <g className="turn-note" transform="translate(360, 230)">
                        <rect x="-120" y="0" width="240" height="36" rx="8" fill="var(--warning)" opacity="0.1" stroke="var(--warning)" stroke-width="1" />
                        <text x="0" y="14" text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--warning)" font-weight="500">⚠ TURN fallback when direct P2P fails</text>
                        <text x="0" y="28" text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--stone)">Relay sees ciphertext only · TURN server sees encrypted WebRTC packets</text>
                      </g>
                    </svg>

                    <figcaption className="diagram-caption">
                      Diagram: End-to-end encrypted file transfer. <strong>Preferred path</strong> (blue dashed) is direct WebRTC P2P.
                      <strong>Fallback path</strong> (gray dashed) routes encrypted chunks through Cloudflare Worker + Durable Object relay.
                      The relay never sees plaintext — only AES-GCM ciphertext, session IDs, and peer presence.
                    </figcaption>
                  </figure>
                </section>

                <section className="section-panel stack-lg" aria-labelledby="steps-title">
                  <h2 id="steps-title" className="section-title">Three phases</h2>

                  <div className="steps-detailed grid-two">
                    <article className="step-card panel stack-md">
                      <div className="step-number">1</div>
                      <h3 className="section-title" style={{fontSize: '18px'}}>Encrypt locally</h3>
                      <p className="panel-copy">
                        Before any bytes leave your browser, each file is split into chunks and encrypted with
                        <strong>AES-GCM</strong> using a session key derived from the session secret. The key never leaves
                        the browser — it&apos;s derived from the session URL fragment (the part after <code>#</code>).
                      </p>
                      <ul className="detail-list">
                        <li>Chunk size: 64 KiB</li>
                        <li>AEAD: AES-256-GCM (Web Crypto API)</li>
                        <li>Key derived via HKDF-SHA-256 from session secret</li>
                      </ul>
                    </article>

                    <article className="step-card panel stack-md">
                      <div className="step-number">2</div>
                      <h3 className="section-title" style={{fontSize: '18px'}}>Relay sees ciphertext only</h3>
                      <p className="panel-copy">
                        If direct WebRTC fails (NAT, firewall, no TURN), encrypted chunks route through a
                        <strong>Cloudflare Worker + Durable Object</strong>. The relay forwards opaque blobs
                        <code>{`{type: 'encrypted-chunk', data: '...'}`}</code> and handles WebSocket signaling,
                        session state, and peer presence — never the decryption key.
                      </p>
                      <ul className="detail-list">
                        <li>Durable Object stores session state in SQLite (TTL: 60 min)</li>
                        <li>WebSocket hibernation keeps costs near-zero when idle</li>
                        <li>Relay sees: session ID, peer count, chunk metadata — not file contents</li>
                      </ul>
                    </article>

                    <article className="step-card panel stack-md">
                      <div className="step-number">3</div>
                      <h3 className="section-title" style={{fontSize: '18px'}}>Decrypt in receiver browser</h3>
                      <p className="panel-copy">
                        The receiving browser reconstructs the file chunk-by-chunk, decrypting each piece with
                        the same session-derived key. Files are assembled in memory and offered for download
                        via <code>URL.createObjectURL</code> — nothing touches disk until the user saves.
                      </p>
                      <ul className="detail-list">
                        <li>Streaming decryption — no full-file buffer in memory</li>
                        <li>Progress shown per-file during receive</li>
                        <li>Session auto-expires after 60 min or manual kill</li>
                      </ul>
                    </article>

                    <article className="step-card panel stack-md">
                      <div className="step-number">⚠</div>
                      <h3 className="section-title" style={{fontSize: '18px', color: 'var(--warning)'}}>Current limitations</h3>
                      <p className="panel-copy" style={{color: 'var(--charcoal)'}}>
                        We&apos;re honest about what Peek <strong>doesn&apos;t</strong> do yet:
                      </p>
                      <ul className="detail-list" style={{color: 'var(--charcoal)'}}>
                        <li><strong>TURN fallback:</strong> Not yet deployed. Direct WebRTC fails on symmetric NAT / strict firewalls — falls back to relay only.</li>
                        <li><strong>Relay routing:</strong> Cloudflare Worker routes regionally; not yet geo-pinned. Metadata (IP region) visible to Cloudflare.</li>
                        <li><strong>No forward secrecy:</strong> Session key derives from static secret. Compromise of one session key exposes that session only.</li>
                        <li><strong>No audit log:</strong> No tamper-evident log of relay operations yet.</li>
                      </ul>
                    </article>
                  </div>
                </section>

                <section className="section-panel stack-md" aria-labelledby="crypto-title">
                  <h2 id="crypto-title" className="section-title">Cryptography summary</h2>
                  <div className="crypto-grid grid-two">
                    <div className="panel stack-sm">
                      <h3 className="panel-label">Key derivation</h3>
                      <pre className="code-block"><code>{`sessionKey = HKDF-SHA256(
  IKM: sessionSecret (from URL #fragment),
  salt: "peek-session-v1",
  info: "file-transfer",
  length: 32 bytes // AES-256 key
)`}</code></pre>
                    </div>
                    <div className="panel stack-sm">
                      <h3 className="panel-label">Chunk encryption</h3>
                      <pre className="code-block"><code>{`const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  sessionKey,
  chunkData
);
// Send: { type: 'encrypted-chunk', iv, data: ciphertext }`}</code></pre>
                    </div>
                  </div>
                </section>

                <div className="app-footer">
                  <Link to="/" className="link-chip">← Back to Peek</Link>
                  <span>Peek — browser file transfer, no installs</span>
                  <Link to="/privacy" className="link-chip" style={{ marginLeft: 'auto' }}>Privacy policy</Link>
                </div>
              </div>
            </main>

            <aside className="workspace-side">
              <div className="panel stack-md">
                <h3 className="section-title" style={{fontSize: '18px'}}>Quick reference</h3>
                <dl className="quick-ref">
                  <dt>Transport</dt>
                  <dd>WebRTC DataChannel (preferred) → WebSocket relay (fallback)</dd>
                  <dt>Encryption</dt>
                  <dd>AES-256-GCM, per-chunk, Web Crypto API</dd>
                  <dt>Key source</dt>
                  <dd>URL fragment (never sent to server)</dd>
                  <dt>Relay</dt>
                  <dd>Cloudflare Worker + Durable Object (SQLite, TTL 60 min)</dd>
                  <dt>Relay sees</dt>
                  <dd>Session ID, peer presence, ciphertext blobs, metadata</dd>
                  <dt>Relay <strong>never</strong> sees</dt>
                  <dd>Decryption key, file contents, filenames, file sizes</dd>
                  <dt>Session expiry</dt>
                  <dd>60 min auto-expire + manual kill from either side</dd>
                  <dt>TURN</dt>
                  <dd>Not yet deployed (direct P2P only)</dd>
                </dl>
              </div>

              <div className="panel stack-md">
                <h3 className="section-title" style={{fontSize: '18px'}}>Threat model</h3>
                <ul className="threat-list">
                  <li>✓ Passive network observer — sees only ciphertext</li>
                  <li>✓ Relay operator (Cloudflare) — sees ciphertext + metadata</li>
                  <li>✓ Malicious receiver — only gets files you choose to send</li>
                  <li>✗ Compromised sender browser — keys + URL fragment leaked</li>
                  <li>✗ Active MITM on signaling — could disrupt, not decrypt</li>
                  <li>✗ Compromised relay + compromised receiver — full access</li>
                </ul>
              </div>

              <div className="panel stack-md">
                <Link to="/" className="button-primary" style={{width: '100%'}}>Start a transfer</Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}