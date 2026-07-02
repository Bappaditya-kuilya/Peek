import { useRef } from 'react';
import { encryptChunk, decryptChunk } from '../shared/crypto.js';
import {
  CHUNK_SIZE,
  encodeManifestPacket,
  encodeFileCompletePacket,
  encodeDownloadNoticePacket,
  encodeChunkPacket,
  decodePacket,
} from '../shared/packetProtocol.js';

const MAX_CHUNKS_PER_FILE = 1000000;

function ensureArrayBuffer(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new Error('Unsupported binary payload');
}

export function useTransfer({
  encryptionKey,
  onActivity,
  onError,
  onManifest,
  onReceiveComplete,
  onReceiveProgress,
  onSendProgress,
}) {
  const incomingFilesRef = useRef(new Map());
  const outgoingFileMapRef = useRef(new Map());
  const failedChunksRef = useRef([]);
  const sendContextRef = useRef(null);

  async function sendEncryptedPacket(transport, packetBuffer, retries = 3) {
    const encrypted = await encryptChunk(encryptionKey, packetBuffer);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        transport.sendBinary(encrypted);
        return;
      } catch {
        if (attempt === retries - 1) throw new Error('send-failed');
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }

  async function sendManifest(files, transport) {
    const outgoingFileMap = outgoingFileMapRef.current;
    outgoingFileMap.clear();
    files.forEach((file, index) => {
      outgoingFileMap.set(index, file);
    });

    await sendEncryptedPacket(transport, encodeManifestPacket(files));
  }

  async function sendFiles(files, transport) {
    sendContextRef.current = { files, transport };
    failedChunksRef.current = [];
    await sendManifest(files, transport);

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBuffer = await file.slice(start, end).arrayBuffer();
        const packet = encodeChunkPacket(fileIndex, chunkIndex, new Uint8Array(chunkBuffer));
        try {
          await sendEncryptedPacket(transport, packet);
        } catch {
          failedChunksRef.current.push({ fileIndex, chunkIndex, file });
          onError?.(new Error('chunk-send-failed'));
          return;
        }

        onSendProgress?.({
          fileId: fileIndex,
          fileName: file.name,
          size: file.size,
          progress: Math.round(((chunkIndex + 1) / totalChunks) * 100),
        });

        await transport.waitForDrain();
      }

      await sendEncryptedPacket(transport, encodeFileCompletePacket(fileIndex));
    }
    sendContextRef.current = null;
  }

  async function retryFailedChunks() {
    const ctx = sendContextRef.current;
    if (!ctx || !failedChunksRef.current.length) return;
    const { files, transport } = ctx;
    const pending = [...failedChunksRef.current];
    failedChunksRef.current = [];

    for (const { fileIndex, chunkIndex, file } of pending) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunkBuffer = await file.slice(start, end).arrayBuffer();
      const packet = encodeChunkPacket(fileIndex, chunkIndex, new Uint8Array(chunkBuffer));
      try {
        await sendEncryptedPacket(transport, packet);
      } catch {
        failedChunksRef.current.push({ fileIndex, chunkIndex, file });
        onError?.(new Error('chunk-send-failed'));
        return;
      }
      onSendProgress?.({
        fileId: fileIndex,
        fileName: file.name,
        size: file.size,
        progress: Math.round(((chunkIndex + 1) / (Math.ceil(file.size / CHUNK_SIZE) || 1)) * 100),
      });
      await transport.waitForDrain();
    }
  }

  async function handleBinaryMessage(binaryData) {
    const incomingFiles = incomingFilesRef.current;
    const outgoingFileMap = outgoingFileMapRef.current;
    let decrypted;
    try {
      decrypted = await decryptChunk(encryptionKey, ensureArrayBuffer(binaryData));
    } catch {
      // SECURITY: a failed AES-GCM decrypt means a wrong key (a truncated or
      // tampered link) or a corrupted packet. Fail gracefully — never crash the
      // transfer loop. The auth tag did its job; we just drop the packet and
      // let the UI tell the user the link looks wrong.
      onError?.(new Error('decrypt-failed'));
      return;
    }

    let packet;
    try {
      packet = decodePacket(decrypted);
    } catch {
      onError?.(new Error('decode-failed'));
      return;
    }

    if (packet.type === 'manifest') {
      const files = packet.payload.files.map((file) => ({
        ...file,
        chunks: new Array(Math.min(file.totalChunks, MAX_CHUNKS_PER_FILE)).fill(null),
        bytesReceived: 0,
        complete: false,
      }));

      incomingFiles.clear();
      files.forEach((file) => incomingFiles.set(file.id, file));
      onManifest?.(files);
      return;
    }

    if (packet.type === 'chunk') {
      const file = incomingFiles.get(packet.payload.fileId);
      if (!file) {
        return;
      }

      file.chunks[packet.payload.chunkIndex] = packet.payload.chunkBytes;
      file.bytesReceived += packet.payload.chunkBytes.byteLength;

      onReceiveProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: Math.min(100, Math.round((file.bytesReceived / file.size) * 100) || 0),
      });
      return;
    }

    if (packet.type === 'file-complete') {
      const file = incomingFiles.get(packet.payload.fileId);
      if (!file) {
        return;
      }

      const blob = new Blob(file.chunks, { type: file.type || 'application/octet-stream' });
      const completeFile = {
        blob,
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      incomingFiles.set(file.id, { ...file, complete: true, blob });
      onReceiveComplete?.(completeFile);
      return;
    }

    if (packet.type === 'download-notice') {
      const file = incomingFiles.get(packet.payload.fileId) || {
        name: outgoingFileMap.get(packet.payload.fileId)?.name || 'file',
      };
      onActivity?.(file.name);
    }
  }

  async function sendDownloadNotice(fileId, transport) {
    await sendEncryptedPacket(transport, encodeDownloadNoticePacket(fileId));
  }

  return {
    handleBinaryMessage,
    hasFailedChunks: () => failedChunksRef.current.length > 0,
    retryFailedChunks,
    sendDownloadNotice,
    sendFiles,
  };
}
