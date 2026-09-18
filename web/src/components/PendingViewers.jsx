export function PendingViewers({ viewers = [], onApprove }) {
  if (!viewers.length) {
    return null;
  }
  return (
    <div className="panel stack-sm">
      <div>
        <div className="panel-label">Viewers waiting</div>
        <h2 className="section-title">Approve to share the key</h2>
      </div>
      {viewers.map((viewer) => (
        <div className="file-row" key={viewer.receiverId}>
          <div className="file-row-left">
            <div className="file-row-main">
              <span className="file-name">{viewer.viewerName || viewer.receiverId}</span>
            </div>
          </div>
          <div className="file-row-right">
            <button type="button" className="compact-button" onClick={() => onApprove?.(viewer.receiverId)}>
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
