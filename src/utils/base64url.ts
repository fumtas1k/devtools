/**
 * base64url（RFC 4648 §5）エンコード／デコード
 *
 * `+`→`-`, `/`→`_`, パディング `=` 除去 の base64 変種を扱う。
 * 既存の `base64.ts`（Tool 公開 API、UTF-8 テキスト⇄文字列）とは別レイヤで、
 * バイト列 / ArrayBuffer ⇄ base64url 文字列の低レベル相互変換を提供する。
 *
 * ここに集約する以前は `jwt.ts` と `qr-ticket.ts` が同等の処理を独自実装していた。
 */

/** Uint8Array を base64url 文字列に変換する。 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * base64url 文字列を Uint8Array に変換する。
 *
 * 戻り値の型を `Uint8Array<ArrayBuffer>` に絞り込んでいるのは、`crypto.subtle.verify` 等
 * `BufferSource = ArrayBufferView<ArrayBuffer>` を要求する API に直接渡せるようにするため。
 */
export function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(pad);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** ArrayBuffer を base64url 文字列に変換する。 */
export function bufferToBase64Url(buf: ArrayBuffer): string {
  return bytesToBase64Url(new Uint8Array(buf));
}

/** base64url 文字列を ArrayBuffer に変換する。 */
export function base64UrlToBuffer(str: string): ArrayBuffer {
  return base64UrlToBytes(str).buffer;
}
