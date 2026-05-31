import QRCode from 'qrcode';

export async function createQrDataUrl(value) {
  return QRCode.toDataURL(value, {
    margin: 1,
    width: 256,
  });
}
