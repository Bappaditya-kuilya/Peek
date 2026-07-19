import { useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from './ErrorBanner.jsx';
import { createQrDataUrl } from '../utils/qr.js';
import { formatTimer, timerLabel } from '../shared/format.js';
import { shareUrl } from '../utils/share.js';

export function QRDisplay({ expiresAt, joinUrl }) {
  const [qrUrl, setQrUrl] = useState('');
  const [timeLabel, setTimeLabel] = useState(formatTimer(expiresAt));
  const [ariaLabel, setAriaLabel] = useState(timerLabel(expiresAt));
  const [shareState, setShareState] = useState('idle');

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

  const handleShare = async () => {
    setShareState('sharing');
    const result = await shareUrl({
      title: 'Peek — Receive files',
      text: 'Scan the QR code or open this link to receive files on this device.',
      url: joinUrl,
    });
    if (result.success) {
      setShareState(result.method === 'native' ? 'shared' : 'copied');
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(joinUrl);
        setShareState('copied');
      } catch {
        setShareState('failed');
      }
    }
    window.setTimeout(() => setShareState('idle'), 2000);
  };

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
        Scan with the other device's camera to open Peek and receive files.
      </div>
      <button
        type="button"
        className="compact-button qr-share-button"
        onClick={handleShare}
        disabled={shareState === 'sharing'}
        aria-label={shareState === 'shared' ? 'Shared via system share' : shareState === 'copied' ? 'Copied link to clipboard' : shareState === 'failed' ? 'Share failed' : 'Share link via system share or copy to clipboard'}
      >
        {shareState === 'sharing' ? 'Sharing…' : shareState === 'shared' ? 'Shared' : shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Failed' : 'Share'}
      </button>
      <ErrorBanner tone="warning">Keep this screen open until the transfer completes.</ErrorBanner>
    </div>
  );
}
