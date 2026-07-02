export function ProgressBar({ value, error, onRetry }) {
  if (error) {
    return (
      <div className="file-progress error">
        <div className="file-progress-bar" style={{ width: '100%' }} />
        {onRetry ? (
          <button type="button" className="compact-button retry-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!(value > 0 && value < 100)) {
    return null;
  }

  return (
    <div className="file-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="file-progress-bar" style={{ width: `${value}%` }} />
    </div>
  );
}
