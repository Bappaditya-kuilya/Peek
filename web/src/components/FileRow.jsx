import { FileIcon } from './FileIcon.jsx';
import { formatBytes } from '../utils/format.js';

function inferIconType(fileName = '', mimeType = '') {
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName)) {
    return 'image';
  }
  return 'doc';
}

export function FileRow({
  action,
  file,
  meta,
  onRemove,
  progress,
  removable = false,
  status = 'queued',
}) {
  const statusLabel =
    status === 'done' ? '✓' : status === 'failed' ? '×' : progress > 0 && progress < 100 ? `${progress}%` : '—';

  const statusClass =
    status === 'done' ? 'file-status success' : status === 'failed' ? 'file-status error' : 'file-status';

  return (
    <div className="file-row">
      <div className="file-row-left">
        <FileIcon type={inferIconType(file.name, file.type)} />
        <div className="file-row-main">
          <span className="file-name">{file.name}</span>
          <span className="file-size">{formatBytes(file.size)}</span>
          {meta ? <span className="file-size">{meta}</span> : null}
        </div>
      </div>

      <div className="file-row-right">
        {action}
        {removable ? (
          <button type="button" className="text-button" onClick={() => onRemove?.(file.id)}>
            ×
          </button>
        ) : (
          <span className={statusClass}>{statusLabel}</span>
        )}
      </div>

      {progress > 0 && progress < 100 ? (
        <div className="file-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="file-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}
