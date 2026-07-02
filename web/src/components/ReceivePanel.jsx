import { FileDropzone } from './FileDropzone.jsx';
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
    <div className="panel stack-md">
      <div className="section-heading-row">
        <div>
          <div className="panel-label">Transfer panel</div>
          <h2 className="section-title">{title}</h2>
        </div>
      </div>

      <div className="file-table">
        <div className="file-table-head">
          <div className="panel-label">Files</div>
          <div className="panel-label">Status</div>
        </div>
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
        <div className="panel-label">Send files back</div>
        <FileDropzone onClick={onSelectFiles}>
          <strong>Choose files to return</strong>
          Drop files here or click to browse
        </FileDropzone>
      </div>
    </div>
  );
}
