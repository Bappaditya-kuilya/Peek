import { Watermark } from '../components/Watermark.jsx';

export function SenderEndedView({ summary, onReset }) {
  return (
    <div className="screen stack-lg">
      <div className="screen-header">
        <Watermark />
      </div>
      <div className="stack-md">
        <h1 className="section-title">Session ended</h1>
        <div className="file-list">
          {summary.map((file) => (
            <div className="file-row" key={`${file.name}-${file.status}`}>
              <div className="file-row-left">
                <span className="file-name">{file.name}</span>
              </div>
              <div className={`file-status ${file.status === 'done' ? 'success' : ''}`}>{file.status === 'done' ? '✓' : '—'}</div>
            </div>
          ))}
        </div>
        <div className="hero-copy">This Peek session is closed. Start a new one whenever you need.</div>
      </div>
      <button type="button" className="button-primary" onClick={onReset}>
        Start another Peek session
      </button>
    </div>
  );
}