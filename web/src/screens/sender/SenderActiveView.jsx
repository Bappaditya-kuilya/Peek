import { ActivityFeed } from '../../components/ActivityFeed.jsx';
import { ClipboardBar } from '../../components/ClipboardBar.jsx';
import { ErrorBanner } from '../../components/ErrorBanner.jsx';
import { FileRow } from '../../components/FileRow.jsx';
import { IncomingPeekPanel } from '../../components/IncomingPeekPanel.jsx';
import { KillSwitch } from '../../components/KillSwitch.jsx';
import { QRDisplay } from '../../components/QRDisplay.jsx';
import { ReceivePanel } from '../../components/ReceivePanel.jsx';
import { ViewShare } from '../../components/ViewShare.jsx';
import { Watermark } from '../../components/Watermark.jsx';
import { formatTimer } from '../../shared/format.js';
import { getTransportLabel } from '../../shared/transport.js';

export function SenderActiveView({
  activity,
  clipboard,
  connectionTrouble,
  onDownload,
  onKill,
  onRetry,
  onSendBack,
  peerConnected,
  peekLink,
  receivedFiles,
  selectedFiles,
  sendBackInputRef,
  session,
  sharedFiles,
  statusMessage,
  transportMode,
}) {
  return (
    <div className="workspace">
      <div className="workspace-main">
        <div className="workspace-shell stack-lg">
          <div className="workspace-header compact">
            <Watermark eyebrow="Live session" />
            <div className={`status-pill ${peerConnected ? 'live' : 'waiting'}`}>
              {getTransportLabel(transportMode, peerConnected)}
            </div>
          </div>

          <div className="metric-strip">
            <div className="metric-cell">
              <span className="metric-value">{sharedFiles.length}</span>
              <span className="metric-label">Files staged</span>
            </div>
            <div className="metric-cell">
              <span className="metric-value">{receivedFiles.filter((file) => file.status === 'done').length}</span>
              <span className="metric-label">Files received</span>
            </div>
            <div className="metric-cell">
              <span className="metric-value">{formatTimer(session.expiresAt)}</span>
              <span className="metric-label">Time left</span>
            </div>
          </div>

          <ErrorBanner>{statusMessage}</ErrorBanner>
          {!peerConnected ? <ErrorBanner tone="warning">Waiting for the other device to join and keep the session alive.</ErrorBanner> : null}
          {connectionTrouble && (
            <div className="panel stack-sm" style={{ marginTop: '12px' }}>
              <ErrorBanner tone="warning">Connection trouble — retries exhausted.</ErrorBanner>
              <button type="button" className="button-primary" onClick={onRetry}>
                Retry connection
              </button>
            </div>
          )}

          <div className="panel">
            <div className="section-heading-row">
              <div>
                <div className="panel-label">Your transfer set</div>
                <h2 className="section-title">Files staged for this session</h2>
              </div>
            </div>
            <div className="file-list">
              {sharedFiles.map((file) => {
                const selectedEntry = selectedFiles.find((entry) => entry.id === file.id);
                return (
                  <FileRow
                    key={file.id}
                    action={
                      selectedEntry?.file ? (
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => peekLink.handleSessionPeek(selectedEntry)}
                        >
                          Peek
                        </button>
                      ) : null
                    }
                    file={file}
                    progress={file.progress}
                    status={file.status}
                  />
                );
              })}
            </div>
          </div>

          <ReceivePanel
            files={receivedFiles}
            onDownload={onDownload}
            onDrop={onSendBack}
            onSelectFiles={() => sendBackInputRef.current?.click()}
            sessionId={session.sessionId}
            title="Files received"
          />

          <ClipboardBar
            copyLabel={clipboard.copyState === 'copied' ? 'Copied' : clipboard.copyState === 'failed' ? 'Retry copy' : 'Copy'}
            draftText={clipboard.draftText}
            maxChars={clipboard.maxChars}
            onChange={clipboard.setDraftText}
            onCopy={clipboard.copyReceivedText}
            sendLabel={peerConnected ? 'Sync available' : 'Will sync after connection'}
            receivedText={clipboard.receivedText}
          />
        </div>
      </div>

      <aside className="workspace-side">
        <QRDisplay expiresAt={session.expiresAt} joinUrl={session.joinUrl} />
        <ViewShare
          expiresIn={peekLink.peekExpiresIn}
          file={peekLink.peekFile}
          generatedUrl={peekLink.peekUrl}
          isBusy={peekLink.peekBusy}
          copyLabel={peekLink.peekCopyState === 'copied' ? 'Copied' : peekLink.peekCopyState === 'failed' ? 'Retry copy' : 'Copy link'}
          onCopy={peekLink.handleCopyPeekLink}
          onExpiresChange={peekLink.setPeekExpiresIn}
          onFileChange={peekLink.setPeekFile}
          onGenerate={peekLink.handleCreatePeekLink}
          onToggleOnceOnly={peekLink.setPeekOnceOnly}
          onceOnly={peekLink.peekOnceOnly}
          statusMessage={peekLink.peekStatus}
        />
        <IncomingPeekPanel url={peekLink.incomingPeekUrl} />
        <ActivityFeed items={activity} />
        <KillSwitch onConfirm={onKill} />
      </aside>

      <input ref={sendBackInputRef} className="hidden-input" type="file" multiple onChange={onSendBack} />
    </div>
  );
}