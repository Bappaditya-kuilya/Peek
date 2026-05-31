import JSZip from 'jszip';
import { safeBaseName } from './sanitize.js';

export async function downloadAllAsZip(files, sessionId) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(safeBaseName(file.name), file.blob);
  }

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `passr-${sessionId.slice(0, 6)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
