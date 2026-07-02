export function IncomingPeekPanel({ url }) {
  if (!url) return null;
  return (
    <div className="panel stack-sm">
      <div>
        <div className="panel-label">Incoming view-only share</div>
        <h2 className="section-title">Peek ready</h2>
      </div>
      <div className="helper-copy">The other device shared a temporary view-only Peek.</div>
      <button type="button" className="button-primary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
        Open Peek in new tab
      </button>
    </div>
  );
}