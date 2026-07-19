import { Link } from 'react-router-dom';
import { Watermark } from '../components/Watermark.jsx';

export function PrivacyPolicy() {
  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="workspace">
          <div className="workspace-main">
            <div className="workspace-shell stack-lg">
              <Watermark eyebrow="Privacy policy" />
              <div className="panel stack-md">
                <h1 className="section-title">Privacy policy</h1>
                <div className="helper-copy">
                  <p>Last updated: July 2026</p>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">The short version</h2>
                  <p>
                    Peek is a browser-to-browser file transfer tool. Your files never touch our servers in plaintext.
                    The encryption key stays in your browser. We relay only encrypted bytes, and we don't log file
                    contents, names, or metadata beyond what's needed to route a session.
                  </p>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">What we see (and what we don't)</h2>
                  <ul className="stack-sm" style={{ marginLeft: '1.5rem', listStyle: 'disc' }}>
                    <li><strong>We see:</strong> Session IDs, WebSocket connection IPs (briefly, for routing), and
                      encrypted blob bytes passing through the relay.</li>
                    <li><strong>We don't see:</strong> Your encryption key, file names, file contents, file sizes,
                      or any decrypted data. The key never leaves your browser — it's carried in the URL fragment
                      (<code>#k=…</code>), which browsers never send to servers.</li>
                  </ul>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">How the encryption works</h2>
                  <ol className="stack-sm" style={{ marginLeft: '1.5rem' }}>
                    <li>When you start a session, your browser generates a random 256-bit key.</li>
                    <li>Files are encrypted locally with AES-256-GCM (chunked for streaming).</li>
                    <li>The relay only passes ciphertext — it cannot decrypt.</li>
                    <li>The recipient opens the full link, derives the key from the fragment, and decrypts in-browser.</li>
                  </ol>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">Retention & cleanup</h2>
                  <ul className="stack-sm" style={{ marginLeft: '1.5rem', listStyle: 'disc' }}>
                    <li>Active sessions expire after <strong>60 minutes</strong> automatically.</li>
                    <li>Encrypted Peek links (the <code>/view/…</code> pages) expire after <strong>1–120 minutes</strong>
                      (sender-chosen) and are <strong>once-only</strong> by default — the blob is deleted on first access.</li>
                    <li>No persistent database of file contents exists. The relay uses in-memory SQLite within a
                      Durable Object; data is deleted when the session ends or TTL expires.</li>
                  </ul>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">Third-party services</h2>
                  <ul className="stack-sm" style={{ marginLeft: '1.5rem', listStyle: 'disc' }}>
                    <li><strong>Cloudflare Workers / Durable Objects</strong> — hosts the relay. We do not send
                      data to Cloudflare's AI, analytics, or logging products.</li>
                    <li><strong>STUN/TURN</strong> — public STUN servers (Google) and optional TURN (openrelay.metered.ca
                      or self-hosted) for NAT traversal. These see your IP and ICE candidates only.</li>
                    <li><strong>Vercel</strong> — hosts the static frontend. No file data passes through Vercel.</li>
                    <li><strong>Sentry</strong> — optional error reporting (enabled only if <code>VITE_SENTRY_DSN</code>
                      is set). We capture connection-state events (ICE failures), not file data.</li>
                  </ul>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">Your rights</h2>
                  <p>Because we don't store personal data or file contents, there's nothing to delete, export, or
                    rectify. If you want to end a session early, click "End session" — it kills the relay state
                    immediately.</p>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">Changes to this policy</h2>
                  <p>We'll update the "Last updated" date above. Material changes will be noted in the app's
                    changelog.</p>
                </div>

                <div className="stack-md">
                  <h2 className="panel-label">Contact</h2>
                  <p>Questions? Open an issue on <a href="https://github.com/bappadityakuilya/Peek-clone" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
                </div>
              </div>

              <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e0e0e2' }}>
                <Link to="/" className="button-secondary">← Back to Peek</Link>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}