import { NS_A, NS_XENC } from './ns';

/** 復号成功後、原文とは独立した XML として表示可能か検査する。 */
export function validateDecryptedAssertion(bytes: Uint8Array): string {
  if (bytes.length > 1024 * 1024) throw new Error('復号結果は 1 MiB 以下にしてください');
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('復号結果は UTF-8 ではありません');
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD / ENTITY は対応していません');
  const declaration = /^\s*<\?xml\s+([^?]*)\?>/i.exec(xml);
  const encoding = declaration && /\bencoding\s*=\s*(['"])(.*?)\1/i.exec(declaration[1]);
  if (encoding && encoding[2].toUpperCase() !== 'UTF-8')
    throw new Error('UTF-8 以外の XML 宣言は対応していません');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.doctype || doc.getElementsByTagName('parsererror').length)
    throw new Error('復号結果の XML が不正です');
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== NS_A || root.localName !== 'Assertion')
    throw new Error('復号結果が SAML Assertion ではありません');
  if (
    doc.getElementsByTagNameNS(NS_A, 'EncryptedAssertion').length ||
    doc.getElementsByTagNameNS(NS_XENC, 'EncryptedData').length ||
    doc.getElementsByTagNameNS(NS_XENC, 'EncryptedKey').length
  )
    throw new Error('再帰的な暗号化には対応していません');
  return xml;
}
