import { useEffect, useState } from 'react';

export function KillSwitch({ onConfirm }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setConfirming(false);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [confirming]);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onConfirm?.();
  }

  return (
    <div className="panel stack-sm">
      <div>
        <div className="panel-label">Danger zone</div>
        <div className="helper-copy">End the session immediately and disconnect both devices.</div>
      </div>
      <button
        type="button"
        className={`button-danger ${confirming ? 'confirm' : ''}`}
        onClick={handleClick}
      >
        {confirming ? 'Confirm end session' : 'End session'}
      </button>
    </div>
  );
}
