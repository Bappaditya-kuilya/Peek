import { FileIcon } from './FileIcon.jsx';
import { ProgressBar } from './ProgressBar.jsx';
import { formatBytes } from '../shared/format.js';

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
  thumbnailUrl,
}) {
  const statusLabel =
    status === 'done' ? '✓' : status === 'failed' ? '×' : progress > 0 && progress < 100 ? `${progress}%` : '—';

  const statusClass =
    status === 'done' ? 'file-status success' : status === 'failed' ? 'file-status error' : 'file-status';

  const showThumbnail = thumbnailUrl && file.type?.startsWith('image/');

  return (
    <div className="file-row">
      <div className="file-row-left">
        {showThumbnail ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="file-thumbnail"
            style={{
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: 8,
              flexShrink: 0,
            }}
          />
        ) : (
          <FileIcon type={inferIconType(file.name, file.type)} />
        )}
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

      <ProgressBar value={progress} />
    </div>
  );
}
