import * as asn1js from 'asn1js';
import { exceedsUtf8ByteLimit } from './limits';

/** 単一の RSA PKCS#8 のみを受け入れる。秘密鍵の利用は復号 Worker に限る。 */
export function parsePrivateKeyPem(pem: string): Uint8Array<ArrayBuffer> {
  if (exceedsUtf8ByteLimit(pem, 64 * 1024)) throw new Error('秘密鍵は 64 KiB 以下にしてください');
  const match =
    /^[\t\r\n ]*-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END PRIVATE KEY-----[\t\r\n ]*$/.exec(
      pem
    );
  if (!match) throw new Error('非暗号化 PKCS#8 PRIVATE KEY を 1 件入力してください');
  const encoded = match[1].replace(/[\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error('秘密鍵の base64 が不正です');
  const decoded = atob(encoded);
  if (btoa(decoded) !== encoded) throw new Error('秘密鍵の base64 が不正です');
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  try {
    const parsed = asn1js.fromBER(bytes.buffer);
    if (parsed.offset !== bytes.length || !(parsed.result instanceof asn1js.Sequence))
      throw new Error();
    const values = parsed.result.valueBlock.value;
    if (
      (values.length !== 3 && values.length !== 4) ||
      !(values[0] instanceof asn1js.Integer) ||
      values[0].valueBlock.valueDec !== 0 ||
      !(values[1] instanceof asn1js.Sequence) ||
      !(values[2] instanceof asn1js.OctetString)
    )
      throw new Error();
    if (
      values.length === 4 &&
      (!(values[3] instanceof asn1js.Constructed) ||
        values[3].idBlock.tagClass !== 3 ||
        values[3].idBlock.tagNumber !== 0 ||
        values[3].valueBlock.value.length !== 0)
    )
      throw new Error();
    const algorithm = values[1].valueBlock.value;
    if (
      algorithm.length !== 2 ||
      !(algorithm[0] instanceof asn1js.ObjectIdentifier) ||
      algorithm[0].valueBlock.toString() !== '1.2.840.113549.1.1.1' ||
      !(algorithm[1] instanceof asn1js.Null)
    )
      throw new Error();
    return bytes;
  } catch {
    bytes.fill(0);
    throw new Error('非暗号化 RSA PKCS#8 鍵の形式を確認してください');
  }
}
