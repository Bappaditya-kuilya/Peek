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
    <button
      type="button"
      className={`button-danger ${confirming ? 'confirm' : ''}`}
      onClick={handleClick}
    >
      {confirming ? 'Tap again to end session' : 'End session'}
    </button>
  );
}
