import { FileRow } from './FileRow.jsx';
import { formatBytes } from '../utils/format.js';

export function FilePicker({
  files,
  isGenerating = false,
  onAddFiles,
  onBack,
  onGenerate,
  onRemoveFile,
  statusMessage = '',
}) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="workspace">
      <div className="workspace-main">
        <div className="workspace-shell stack-lg">
          <div className="workspace-header compact">
            <div className="brand-block">
              <div className="wordmark">Peek</div>
              <div className="eyebrow">Step 1 of 2</div>
            </div>
            <button type="button" className="link-chip" onClick={onBack}>
              Back
            </button>
          </div>

          <div className="stack-sm">
            <h1 className="section-title">Review what you want to share</h1>
            <p className="section-subtitle">
              Build the session before you generate the join code. This keeps the other device flow short and predictable.
            </p>
          </div>

          <div className="file-table">
            <div className="file-table-head">
              <div className="panel-label">Selected files</div>
              <div className="panel-label">Action</div>
            </div>
            <div>
              {files.map((file) => (
                <FileRow key={file.id} file={file} removable onRemove={onRemoveFile} />
              ))}
            </div>
          </div>

          <div className="picker-meta">
            <span>{files.length} files selected</span>
            <span>{formatBytes(totalSize)} total</span>
          </div>

          <div className="stack-sm">
            <button type="button" className="button-primary" disabled={files.length === 0 || isGenerating} onClick={onGenerate}>
              {isGenerating ? 'Preparing secure session…' : 'Create secure session'}
            </button>
            <button type="button" className="button-secondary" onClick={onAddFiles}>
              Add more files
            </button>
          </div>

          {statusMessage ? <div className="notice-banner danger">{statusMessage}</div> : null}
        </div>
      </div>

      <aside className="workspace-side">
        <div className="panel stack-md">
          <div className="panel-label">Before you continue</div>
          <div className="security-list">
            <div className="security-row">
              <strong>Files stay encrypted in transit</strong>
              <span className="helper-copy">Chunk encryption happens in the browser before relay fallback is used.</span>
            </div>
            <div className="security-row">
              <strong>Sessions are temporary</strong>
              <span className="helper-copy">Each session expires automatically and can also be ended manually at any time.</span>
            </div>
            <div className="security-row">
              <strong>Prepare once, scan once</strong>
              <span className="helper-copy">Adding everything now reduces interruptions while the receiving device is connected.</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
