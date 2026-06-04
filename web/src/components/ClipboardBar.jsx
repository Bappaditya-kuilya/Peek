export function ClipboardBar({
  copyLabel,
  draftText,
  maxChars,
  onChange,
  onCopy,
  receivedText,
}) {
  return (
    <div className="panel stack-sm">
      <div className="section-heading-row">
        <div>
          <div className="panel-label">Clipboard bridge</div>
          <h2 className="section-title">Instant clipboard</h2>
        </div>
        <div className="status-pill">{draftText.length}/{maxChars}</div>
      </div>

      <textarea
        className="clipboard-textarea"
        maxLength={maxChars}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type or paste here. It syncs to the connected device automatically."
        rows={4}
        value={draftText}
      />

      <div className="clipboard-received-row">
        <div className="clipboard-received-copy">
          <strong>Incoming text:</strong> {receivedText || 'Waiting for the other device…'}
        </div>
        <button type="button" className="compact-button" disabled={!receivedText} onClick={onCopy}>
          {copyLabel}
        </button>
      </div>
    </div>
  );
}
