export const TRANSPORT_WAITING = 'waiting';
export const TRANSPORT_DIRECT = 'direct';
export const TRANSPORT_RELAY = 'relay';
export const TRANSPORT_RECONNECTING = 'reconnecting';

export const SESSION_ENDED_CLOSE_CODES = new Set([4000, 4001]);
export const SESSION_REPLACED_CLOSE_CODE = 4005;

export function createTransport(dataChannelRef, fallbackSocketRef) {
  return {
    getBufferedAmount() {
      if (dataChannelRef.current?.readyState === 'open') {
        return dataChannelRef.current.bufferedAmount;
      }
      if (fallbackSocketRef.current?.readyState === WebSocket.OPEN) {
        return fallbackSocketRef.current.bufferedAmount || 0;
      }
      return 0;
    },
    sendBinary(buffer) {
      if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(buffer);
        return;
      }
      if (fallbackSocketRef.current?.readyState === WebSocket.OPEN) {
        fallbackSocketRef.current.send(buffer);
      }
    },
    waitForDrain() {
      const highWater = 16 * 1024 * 1024;
      const dc = dataChannelRef.current;
      if (dc?.readyState === 'open') {
        if (dc.bufferedAmount <= highWater) return Promise.resolve();
        dc.bufferedAmountLowThreshold = highWater;
        return new Promise((resolve) => {
          const handler = () => {
            dc.removeEventListener('bufferedamountlow', handler);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', handler);
        });
      }
      const ws = fallbackSocketRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        if ((ws.bufferedAmount || 0) <= highWater) return Promise.resolve();
        return new Promise((resolve) => setTimeout(resolve, 25));
      }
      return Promise.resolve();
    },
  };
}

export function getTransportLabel(mode, peerConnected) {
  if (mode === TRANSPORT_DIRECT) return 'Direct';
  if (mode === TRANSPORT_RELAY) return 'Encrypted relay';
  if (mode === TRANSPORT_RECONNECTING) return 'Reconnecting';
  return peerConnected ? 'Peer detected' : 'Waiting for peer';
}