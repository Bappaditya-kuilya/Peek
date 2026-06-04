export function ClipboardBar({
  copyLabel,
  draftText,
  maxChars,
  onChange,
  onCopy,
  receivedText,
}) {
  return (
    <div className="section-panel clipboard-bar">
      <div className="section-heading-row">
        <h2 className="section-title" style={{ fontSize: '18px' }}>
          Instant clipboard
        </h2>
        <div className="section-meta">{draftText.length}/{maxChars}</div>
      </div>

      <div className="stack-sm">
        <textarea
          className="clipboard-textarea"
          maxLength={maxChars}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type or paste — sends automatically..."
          rows={4}
          value={draftText}
        />

        <div className="clipboard-received-row">
          <div className="clipboard-received-copy">
            <strong>Received:</strong> {receivedText || 'Waiting for the other device…'}
          </div>
          <button type="button" className="compact-button" disabled={!receivedText} onClick={onCopy}>
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
