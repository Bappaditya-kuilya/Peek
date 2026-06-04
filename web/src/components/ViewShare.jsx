export function ViewShare({
  expiresIn,
  file,
  generatedUrl,
  isBusy = false,
  onExpiresChange,
  onFileChange,
  onGenerate,
  onToggleOnceOnly,
  onceOnly,
  statusMessage = '',
}) {
  return (
    <div className="section-panel view-share-panel">
      <div className="section-heading-row">
        <h2 className="section-title" style={{ fontSize: '18px' }}>
          Peek link
        </h2>
        <div className="section-meta">PDF or image, up to 10MB</div>
      </div>

      <div className="stack-sm">
        <label className="view-field">
          <span className="section-meta">File</span>
          <input className="view-input" onChange={(event) => onFileChange(event.target.files?.[0] || null)} type="file" accept="application/pdf,image/*" />
        </label>

        <label className="view-field">
          <span className="section-meta">Expires in</span>
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
        {generatedUrl ? <div className="view-link-output">{generatedUrl}</div> : null}
        {statusMessage ? <div className="status-copy">{statusMessage}</div> : null}
      </div>
    </div>
  );
}
