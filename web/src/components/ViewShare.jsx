export function ViewShare({
  copyLabel = 'Copy link',
  disabled = false,
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
        <div className="status-pill">Any file, up to 50MB</div>
      </div>

      <label className="view-field">
        <span className="panel-label">File</span>
        <input className="view-input" disabled={disabled} id="peek-file" name="peek_file" onChange={(event) => onFileChange(event.target.files?.[0] || null)} type="file" />
      </label>

      <label className="view-field">
        <span className="panel-label">Expires in</span>
        <select className="view-input" disabled={disabled} id="peek-expires-in" name="peek_expires_in" onChange={(event) => onExpiresChange(Number(event.target.value))} value={expiresIn}>
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
      </label>

      <label className="view-toggle">
        <input checked={onceOnly} disabled={disabled} id="peek-once-only" name="peek_once_only" onChange={(event) => onToggleOnceOnly(event.target.checked)} type="checkbox" />
        <span>Delete after first successful view</span>
      </label>

      <button className="button-primary" disabled={disabled || !file || isBusy} id="peek-generate" name="peek_generate" onClick={onGenerate} type="button">
        {isBusy ? 'Preparing Peek…' : 'Create Peek link'}
      </button>

      {disabled ? <div className="status-copy">Peek links are disabled on this relay.</div> : null}
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
