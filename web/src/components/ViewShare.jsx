export function ViewShare({
  copyLabel = 'Copy link',
  expiresIn,
  file,
  generatedUrl,
  isBusy = false,
  onCopy,
  onExpiresChange,
  onFileChange,
  onGenerate,
  onToggleOnceOnly,
  onceOnly,
  statusMessage = '',
}) {
  return (
    <div className="panel stack-sm">
      <div className="section-heading-row">
        <div>
          <div className="panel-label">View-only share</div>
          <h2 className="section-title">Peek link</h2>
        </div>
        <div className="status-pill">PDF or image, up to 10MB</div>
      </div>

      <label className="view-field">
        <span className="panel-label">File</span>
        <input className="view-input" onChange={(event) => onFileChange(event.target.files?.[0] || null)} type="file" accept="application/pdf,image/*" />
      </label>

      <label className="view-field">
        <span className="panel-label">Expires in</span>
        <select className="view-input" onChange={(event) => onExpiresChange(Number(event.target.value))} value={expiresIn}>
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
      </label>

      <label className="view-toggle">
        <input checked={onceOnly} onChange={(event) => onToggleOnceOnly(event.target.checked)} type="checkbox" />
        <span>Delete after first successful view</span>
      </label>

      <button className="button-primary" disabled={!file || isBusy} onClick={onGenerate} type="button">
        {isBusy ? 'Preparing Peek…' : 'Create Peek link'}
      </button>

      {file ? <div className="status-copy">Selected: {file.name}</div> : null}
      {generatedUrl ? (
        <>
          <div className="view-link-output">{generatedUrl}</div>
          <button type="button" className="compact-button" onClick={onCopy}>
            {copyLabel}
          </button>
        </>
      ) : null}
      {statusMessage ? <div className="status-copy">{statusMessage}</div> : null}
    </div>
  );
}
