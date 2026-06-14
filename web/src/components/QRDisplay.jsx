import { useEffect, useMemo, useState } from 'react';
import { createQrDataUrl } from '../utils/qr.js';
import { formatTimer, timerLabel } from '../utils/format.js';
import { getReceiverBaseUrl } from '../utils/relayConfig.js';

function getCodeLookupHost() {
  try {
    return new URL(getReceiverBaseUrl()).host;
  } catch {
    return window.location.host;
  }
}

export function QRDisplay({ expiresAt, joinUrl, numericCode }) {
  const lookupHost = getCodeLookupHost();
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
    <div className="panel qr-block">
      <div className="section-heading-row">
        <div>
          <div className="panel-label">Join session</div>
          <h2 className="section-title">Scan to open Peek on the other device</h2>
        </div>
      </div>
      <div className="qr-frame">
        {qrUrl ? <img src={qrUrl} alt="QR code — scan to receive files on the other device" /> : null}
      </div>
      <div className={`qr-timer ${severityClass}`} aria-label={ariaLabel}>
        {timeLabel}
      </div>
      <div className="qr-copy">
        No camera? Type <span className="code">{numericCode}</span> at {lookupHost}/r
      </div>
      <div className="notice-banner warning">Keep this screen open until the transfer completes.</div>
    </div>
  );
}
