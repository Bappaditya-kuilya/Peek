import { useEffect, useMemo, useState } from 'react';
import { createQrDataUrl } from '../utils/qr.js';
import { formatTimer, timerLabel } from '../utils/format.js';

export function QRDisplay({ expiresAt, joinUrl, numericCode }) {
  const [qrUrl, setQrUrl] = useState('');
  const [timeLabel, setTimeLabel] = useState(formatTimer(expiresAt));
  const [ariaLabel, setAriaLabel] = useState(timerLabel(expiresAt));

  useEffect(() => {
    createQrDataUrl(joinUrl).then(setQrUrl).catch(() => setQrUrl(''));
  }, [joinUrl]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeLabel(formatTimer(expiresAt));
      setAriaLabel(timerLabel(expiresAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const severityClass = useMemo(() => {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 60 * 1000) {
      return 'critical';
    }
    if (remainingMs <= 5 * 60 * 1000) {
      return 'warning';
    }
    return '';
  }, [expiresAt, timeLabel]);

  return (
    <div className="qr-block">
      <div className="qr-frame">
        {qrUrl ? (
          <img src={qrUrl} alt="QR code — scan to receive files on the other device" />
        ) : null}
      </div>
      <div className={`qr-timer ${severityClass}`} aria-label={ariaLabel}>
        {timeLabel}
      </div>
      <div className="qr-copy">
        or type <span className="code">{numericCode}</span> at passr.dev/r
      </div>
      <div className="warning-banner">Keep this screen on while transferring</div>
    </div>
  );
}
