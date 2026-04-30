type QrContent =
  | { kind: 'url'; raw: string; url: URL; hostname: string }
  | { kind: 'text'; raw: string };

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
