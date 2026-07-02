import { CodeDisplay } from '../../components/CodeDisplay.jsx';
import { ErrorBanner } from '../../components/ErrorBanner.jsx';
import { Watermark } from '../../components/Watermark.jsx';

export function ReceiverPendingView({ mode, statusMessage, statusDanger }) {
  if (mode === 'missing-key') {
    return (
      <div className="app-shell">
        <div className="app-frame">
          <div className="workspace">
            <div className="workspace-main">
              <div className="workspace-shell stack-lg">
                <Watermark eyebrow="Incomplete link" />
                <div className="stack-md">
                  <h1 className="section-title">This link is missing its key</h1>
                  <div className="hero-copy">
                    A Peek link only works in full. Scan the QR code on the sending device, or open the complete link it generated — the part after <CodeDisplay>#</CodeDisplay> carries the key needed to connect.
                  </div>
                </div>
              </div>
            </div>
            <aside className="workspace-side">
              <div className="panel stack-md">
                <div>
                  <div className="panel-label">Why</div>
                  <h2 className="section-title">The key never touches our servers</h2>
                </div>
                <div className="helper-copy">
                  Peek keeps the session token and encryption key in the link fragment, which browsers never send to the server. That means the full link must be opened as-is on the receiving device.
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="workspace">
          <div className="workspace-main">
            <div className="workspace-shell stack-lg">
              <Watermark eyebrow="Receiver session" />
              <h1 className="section-title">Connecting to device…</h1>
              <ErrorBanner tone={statusDanger ? 'danger' : 'warning'}>{statusMessage}</ErrorBanner>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}