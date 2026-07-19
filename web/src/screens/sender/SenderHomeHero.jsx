import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Watermark } from '../../components/Watermark.jsx';

export function SenderHomeHero({ onStart, onDrop }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      onDrop?.(files);
    }
  }

  return (
    <div
      className={`workspace${isDragging ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="workspace-main">
        <div className="hero-card stack-lg">
          <div className="workspace-header">
            <Watermark eyebrow="Cross-Network File Transfer" />
          </div>

          <div className="stack-md">
            <h1 className="workspace-title">Transfer files across networks — no shared WiFi, no server sees your data.</h1>
            <p className="hero-subtitle">
              WebRTC connects devices directly across different networks. When direct connection fails, encrypted relay carries only ciphertext — encryption keys never leave the browser.
            </p>
          </div>

          <div className="hero-feature-list">
            <div className="hero-feature">
              <strong>No install</strong>
              <span>The receiving side opens as a normal browser page.</span>
            </div>
            <div className="hero-feature">
              <strong>No account</strong>
              <span>One session, one QR, and automatic expiry after 60 minutes.</span>
            </div>
            <div className="hero-feature">
              <strong>Encrypted fallback</strong>
              <span>Relay fallback carries ciphertext only when direct local transfer fails.</span>
            </div>
            <div className="hero-feature">
              <strong>Two-way session</strong>
              <span>The other device can send files back without starting a new room.</span>
            </div>
          </div>

          <div className="stack-sm">
            <button type="button" className="button-primary" onClick={onStart}>Start sharing files</button>
            <div className="helper-copy">Choose files first, then create the short-lived session.</div>
          </div>

          <div className="screen-divider" />

          <div className="stack-sm">
            <Link to="/how-it-works" className="link-chip">How your data moves →</Link>
            <Link to="/privacy" className="link-chip">Privacy policy →</Link>
          </div>
        </div>
      </div>

      <aside className="workspace-side">
        <div className="panel stack-md">
          <div>
            <div className="panel-label">How it works</div>
            <h2 className="section-title">Three short steps</h2>
          </div>
          <div className="steps-list">
            <div className="step-row">
              <strong>1. Select the files</strong>
              <span className="helper-copy">Prepare the transfer before the second device joins.</span>
            </div>
            <div className="step-row">
              <strong>2. Open the session</strong>
              <span className="helper-copy">Peek generates a QR link and fallback code for the other device.</span>
            </div>
            <div className="step-row">
              <strong>3. Transfer and close</strong>
              <span className="helper-copy">Send, receive, and end the session when you are finished.</span>
            </div>
          </div>
        </div>

        <div className="panel stack-md">
          <div>
            <div className="panel-label">Security posture</div>
            <h2 className="section-title">Designed for risky environments</h2>
          </div>
          <div className="security-list">
            <div className="security-row">
              <strong>Client-side encryption</strong>
              <span className="helper-copy">Transfer packets are encrypted in the browser before fallback relay transport is used.</span>
            </div>
            <div className="security-row">
              <strong>Short-lived sessions</strong>
              <span className="helper-copy">Sessions expire automatically and can also be killed manually from either side.</span>
            </div>
            <div className="security-row">
              <strong>Minimal ceremony</strong>
              <span className="helper-copy">No account, no install, and no permanent workspace left behind on public hardware.</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}