import { FileRow } from './FileRow.jsx';
import { downloadAllAsZip } from '../utils/zip.js';

export function ReceivePanel({
  files,
  onDownload,
  onSelectFiles,
  sessionId,
  title,
}) {
  return (
    <div className="stack-md">
      <div className="section-heading-row">
        <h2 className="section-title" style={{ fontSize: '18px' }}>
          {title}
        </h2>
      </div>

      <div className="file-list">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            action={
              file.blob ? (
                <button type="button" className="compact-button" onClick={() => onDownload(file)}>
                  Download
                </button>
              ) : null
            }
            progress={file.progress || 0}
            status={file.status || 'queued'}
          />
        ))}
      </div>

      {files.some((file) => file.blob) ? (
        <button
          type="button"
          className="button-primary"
          onClick={() => downloadAllAsZip(files.filter((file) => file.blob), sessionId)}
        >
          Download all as ZIP
        </button>
      ) : null}

      <div className="stack-sm">
        <div className="section-meta">Send files back</div>
        <button type="button" className="receive-dropzone" onClick={onSelectFiles}>
          <span>
            <strong>Drop files here</strong>
            or click to select
          </span>
        </button>
      </div>
    </div>
  );
}
