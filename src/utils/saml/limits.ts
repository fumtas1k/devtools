/** SAML XML と deflate 展開後データのアプリケーション上限。 */
export const MAX_SAML_XML_BYTES = 32 * 1024 * 1024;
/** 全文字を percent エンコードした base64 と URL・クエリ・空白の余裕。 */
export const MAX_SAML_INPUT_LENGTH = 3 * 4 * Math.ceil(MAX_SAML_XML_BYTES / 3) + 64 * 1024;

/** TextEncoder と同じ UTF-8 のバイト数を追加割当なしで上限まで数える。 */
export function exceedsUtf8ByteLimit(text: string, limit = MAX_SAML_XML_BYTES): boolean {
  if (text.length > limit) return true;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}

export function assertSamlInputSize(input: string): void {
  if (input.length > MAX_SAML_INPUT_LENGTH) {
    throw new Error(
      '入力サイズが上限（134,283,268 UTF-16 コード単位）を超えました。不要な URL パラメータや空白を削除するか、SAMLResponse / SAMLRequest の値を貼り付けてください'
    );
  }
}

export function assertSamlXmlSize(xml: string): void {
  if (exceedsUtf8ByteLimit(xml)) {
    throw new Error('XML のサイズが上限（UTF-8 で 32 MiB）を超えました');
  }
}
