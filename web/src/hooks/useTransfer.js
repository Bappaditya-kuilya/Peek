import { useRef } from 'react';
import { encryptChunk, decryptChunk } from './useCrypto.js';

const CHUNK_SIZE = 48 * 1024;
const PACKET_MANIFEST = 1;
const PACKET_CHUNK = 2;
const PACKET_FILE_COMPLETE = 3;
const PACKET_DOWNLOAD_NOTICE = 4;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concatBuffers(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeManifestPacket(files) {
  const body = encoder.encode(
    JSON.stringify({
      files: files.map((file, index) => ({
        id: index,
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      })),
    })
  );

  return concatBuffers([Uint8Array.of(PACKET_MANIFEST), body]).buffer;
}

function encodeFileCompletePacket(fileId) {
  const packet = new Uint8Array(3);
  packet[0] = PACKET_FILE_COMPLETE;
  new DataView(packet.buffer).setUint16(1, fileId);
  return packet.buffer;
}

function encodeDownloadNoticePacket(fileId) {
  const packet = new Uint8Array(3);
  packet[0] = PACKET_DOWNLOAD_NOTICE;
  new DataView(packet.buffer).setUint16(1, fileId);
  return packet.buffer;
}

function encodeChunkPacket(fileId, chunkIndex, chunkBytes) {
  const header = new Uint8Array(7);
  const view = new DataView(header.buffer);
  header[0] = PACKET_CHUNK;
  view.setUint16(1, fileId);
  view.setUint32(3, chunkIndex);
  return concatBuffers([header, chunkBytes]).buffer;
}

function decodePacket(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = bytes[0];

  if (type === PACKET_MANIFEST) {
    return {
      type: 'manifest',
      payload: JSON.parse(decoder.decode(bytes.slice(1))),
    };
  }

  if (type === PACKET_FILE_COMPLETE) {
    return {
      type: 'file-complete',
      payload: { fileId: view.getUint16(1) },
    };
  }

  if (type === PACKET_DOWNLOAD_NOTICE) {
    return {
      type: 'download-notice',
      payload: { fileId: view.getUint16(1) },
    };
  }

  if (type === PACKET_CHUNK) {
    return {
      type: 'chunk',
      payload: {
        fileId: view.getUint16(1),
        chunkIndex: view.getUint32(3),
        chunkBytes: bytes.slice(7),
      },
    };
  }

  throw new Error('Unknown packet type');
}

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

  async function sendEncryptedPacket(transport, packetBuffer) {
    const encrypted = await encryptChunk(encryptionKey, packetBuffer);
    transport.sendBinary(encrypted);
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
    await sendManifest(files, transport);

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBuffer = await file.slice(start, end).arrayBuffer();
        const packet = encodeChunkPacket(fileIndex, chunkIndex, new Uint8Array(chunkBuffer));
        await sendEncryptedPacket(transport, packet);

        onSendProgress?.({
          fileId: fileIndex,
          fileName: file.name,
          progress: Math.round(((chunkIndex + 1) / totalChunks) * 100),
        });

        while (transport.getBufferedAmount() > 1024 * 1024) {
          // Backpressure keeps the browser responsive during larger sends.
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      await sendEncryptedPacket(transport, encodeFileCompletePacket(fileIndex));
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
        chunks: new Array(file.totalChunks).fill(null),
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
    sendDownloadNotice,
    sendFiles,
  };
}
