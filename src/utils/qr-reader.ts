import jsQR from 'jsqr';

type QrContent =
  | { kind: 'url'; raw: string; url: URL; hostname: string }
  | { kind: 'text'; raw: string };

export type DecodeQrResult =
  | { ok: true; data: string }
  | { ok: false; reason: 'load-error' | 'not-found' };

export const DEFAULT_QR_MAX_DIM = 1600;

/**
 * ファイルからQRコードをデコードする。
 * 長辺が maxDim を超える場合はアスペクト比を維持してダウンスケールする。
 */
export async function decodeQrFromFile(
  file: File,
  opts: { maxDim: number }
): Promise<DecodeQrResult> {
  return new Promise<DecodeQrResult>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, opts.maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ok: false, reason: 'load-error' });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const found = jsQR(imageData.data, imageData.width, imageData.height);
      if (!found) {
        resolve({ ok: false, reason: 'not-found' });
        return;
      }
      resolve({ ok: true, data: found.data });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ ok: false, reason: 'load-error' });
    };

    img.src = objectUrl;
  });
}

export function detectQrContent(raw: string): QrContent {
  if (raw.length > 0) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { kind: 'url', raw, url, hostname: url.hostname };
      }
    } catch {
      // URL でなければ text として扱う
    }
  }
  return { kind: 'text', raw };
}
