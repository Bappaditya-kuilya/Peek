import { encoder, decoder } from './crypto.js';

export const CHUNK_SIZE = 48 * 1024;

const PACKET_MANIFEST = 1;
const PACKET_CHUNK = 2;
const PACKET_FILE_COMPLETE = 3;
const PACKET_DOWNLOAD_NOTICE = 4;

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

export function encodeManifestPacket(files) {
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

export function encodeFileCompletePacket(fileId) {
  const packet = new Uint8Array(3);
  packet[0] = PACKET_FILE_COMPLETE;
  new DataView(packet.buffer).setUint16(1, fileId);
  return packet.buffer;
}

export function encodeDownloadNoticePacket(fileId) {
  const packet = new Uint8Array(3);
  packet[0] = PACKET_DOWNLOAD_NOTICE;
  new DataView(packet.buffer).setUint16(1, fileId);
  return packet.buffer;
}

export function encodeChunkPacket(fileId, chunkIndex, chunkBytes) {
  const header = new Uint8Array(7);
  const view = new DataView(header.buffer);
  header[0] = PACKET_CHUNK;
  view.setUint16(1, fileId);
  view.setUint32(3, chunkIndex);
  return concatBuffers([header, chunkBytes]).buffer;
}

export function decodePacket(buffer) {
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