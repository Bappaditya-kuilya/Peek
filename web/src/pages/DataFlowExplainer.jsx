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

                  <figure className="flow-diagram">
                    <img
                      src="/images/data-flow-diagram.png"
                      alt="Diagram: end-to-end encrypted file transfer. Preferred path (blue dashed) is direct WebRTC P2P, end-to-end encrypted with the relay not used. Fallback path (gray dashed) routes encrypted chunks through the Cloudflare Worker plus Durable Object relay when a direct connection fails. The relay never sees plaintext — only AES-GCM ciphertext, session IDs, and peer presence."
                      className="flow-diagram-img"
                      width="1400"
                      height="875"
                      loading="lazy"
                    />
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
                  <li>✓ Active MITM on signaling — could disrupt, not decrypt (availability risk only, not confidentiality)</li>
                  <li>✗ Compromised sender browser — keys + URL fragment leaked</li>
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