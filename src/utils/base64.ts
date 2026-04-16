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
