/**
 * PEM ブロックからバイト列を取り出す。
 *
 * `-----BEGIN <label>-----` / `-----END <label>-----` に挟まれた Base64 文字列を
 * デコードして Uint8Array を返す。標準 Base64（`+/=`）を使用する PEM 形式に対応。
 *
 * @param pem - PEM 形式の文字列（例: RSA 公開鍵・ECDSA 公開鍵）
 * @param label - PEM ヘッダーのラベル（例: `'PUBLIC KEY'`, `'PRIVATE KEY'`）
 * @throws PEM ヘッダー/フッターが見つからない場合、または Base64 として不正な場合
 */
export function pemBlockToBytes(pem: string, label: string): Uint8Array<ArrayBuffer> {
  const header = `-----BEGIN ${label}-----`;
  const footer = `-----END ${label}-----`;
  const start = pem.indexOf(header);
  const end = pem.indexOf(footer);
  if (start === -1 || end === -1 || start + header.length > end) {
    throw new Error(`PEM ブロック（${label}）が見つかりません`);
  }
  const b64 = pem.slice(start + header.length, end).replace(/\s/g, '');
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new Error('PEM の Base64 が不正です');
  }
  const out = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * 文字列を Base64 エンコードする（ブラウザ組み込み API のみ使用）
 *
 * @param text - UTF-8 文字列
 * @param urlSafe - true のとき URL-safe Base64（+→- /→_ パディング除去）を返す
 */
export function encodeBase64(text: string, urlSafe: boolean): string {
  // UTF-8 → バイト列 → バイナリ文字列 → btoa
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  if (!urlSafe) return b64;
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64 文字列をデコードする（ブラウザ組み込み API のみ使用）
 *
 * @param text - Base64 または URL-safe Base64 文字列
 * @param urlSafe - true のとき URL-safe 入力として正規化してからデコード
 * @throws デコード失敗時は日本語メッセージをもつ Error
 */
export function decodeBase64(text: string, urlSafe: boolean): string {
  // URL-safe → 標準 Base64 に正規化
  let normalized = text;
  if (urlSafe) {
    normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    // パディング補完
    const pad = normalized.length % 4;
    if (pad === 2) normalized += '==';
    else if (pad === 3) normalized += '=';
  }

  // atob でバイナリ文字列に変換
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error('有効なBase64文字列ではありません');
  }

  // バイナリ文字列 → Uint8Array → UTF-8 文字列
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('テキストとして表示できないデータです');
  }
}
