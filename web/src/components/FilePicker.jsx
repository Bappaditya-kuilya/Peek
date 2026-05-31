import { FileRow } from './FileRow.jsx';
import { formatBytes } from '../utils/format.js';

export function FilePicker({
  files,
  onAddFiles,
  onBack,
  onGenerate,
  onRemoveFile,
}) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="screen stack-lg">
      <div className="screen-header">
        <div className="wordmark">passr</div>
        <button type="button" className="muted-link" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="section-heading-row">
        <div>
          <h1 className="section-title">Files to share</h1>
        </div>
        <button type="button" className="text-button" onClick={onAddFiles}>
          + Add more
        </button>
      </div>

      <div className="file-list">
        {files.map((file) => (
          <FileRow key={file.id} file={file} removable onRemove={onRemoveFile} />
        ))}
      </div>

      <div className="picker-meta">
        {files.length} files · {formatBytes(totalSize)} total
      </div>

      <button type="button" className="button-primary" disabled={files.length === 0} onClick={onGenerate}>
        Generate QR code
      </button>
    </div>
  );
}
