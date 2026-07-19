import { useState } from 'react';
import { getPairedDevices, renamePairedDevice, forgetPairedDevice, updateLastUsed } from '../utils/pairedDevices.js';
import { formatDistanceToNow } from 'date-fns';

function formatLastUsed(timestamp) {
  if (!timestamp) return 'Never used';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;

  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)}d ago`;
  return date.toLocaleDateString();
}

export function KnownDevices({ onWakeDevice, isConnected, disabled = false }) {
  const [devices, setDevices] = useState(() => getPairedDevices());
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  function handleWake(deviceId) {
    if (disabled || !onWakeDevice) return;
    onWakeDevice(deviceId);
    updateLastUsed(deviceId);
    setDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, lastUsed: Date.now() } : d));
  }

  function handleRename(deviceId) {
    const device = devices.find(d => d.deviceId === deviceId);
    if (device) {
      setEditingId(deviceId);
      setEditName(device.name);
    }
  }

  function handleSaveRename(deviceId) {
    if (editName.trim()) {
      renamePairedDevice(deviceId, editName.trim());
      setDevices(getPairedDevices());
    }
    setEditingId(null);
    setEditName('');
  }

  function handleForget(deviceId) {
    forgetPairedDevice(deviceId);
    setDevices(getPairedDevices());
  }

  function handleKeyDown(event, deviceId) {
    if (event.key === 'Enter') handleSaveRename(deviceId);
    if (event.key === 'Escape') { setEditingId(null); setEditName(''); }
  }

  if (!devices.length) {
    return (
      <div className="panel">
        <div className="panel-label">Known devices</div>
        <p className="helper-copy" style={{ marginTop: '8px' }}>No paired devices yet. Complete a transfer and choose "Remember this device" to add one.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-label">Known devices</div>
      <ul className="device-list">
        {devices.map(device => (
          <li key={device.deviceId} className="device-row">
            <div className="device-info" onClick={() => !disabled && handleWake(deviceId)}>
              {editingId === device.deviceId ? (
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, device.deviceId)}
                  onBlur={() => handleSaveRename(device.deviceId)}
                  autoFocus
                  className="device-name-input"
                />
              ) : (
                <>
                  <span className="device-name">{device.name}</span>
                  <span className="device-meta">{formatLastUsed(device.lastUsed)}</span>
                </>
              )}
            </div>
            <div className="device-actions">
              {!disabled && !editingId && (
                <button type="button" className="icon-button" onClick={() => handleWake(device.deviceId)} title="Wake and connect" disabled={!isConnected}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              )}
              <button type="button" className="icon-button" onClick={() => handleRename(device.deviceId)} title="Rename">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" className="icon-button danger" onClick={() => handleForget(device.deviceId)} title="Forget device">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}