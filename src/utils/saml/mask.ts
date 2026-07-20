import { scrubText, type ScrubCategory } from '@/utils/secret-scrubber';
import { NS_A } from './ns';

export interface SamlMaskResult {
  /** マスク済み XML（シリアライズ後の文字列。表示側で formatXml して整形表示する） */
  xml: string;
  /** 構造ベース（フェーズ1）でマスクした occurrence 数 */
  piiCount: number;
  /** secret-scrubber（フェーズ2）でマスクした occurrence 数 */
  secretCount: number;
}

/**
 * フェーズ2 で有効にする secret-scrubber カテゴリ。
 * HIGH_ENTROPY を除外して X509Certificate / SignatureValue / DigestValue の
 * base64（非 PII・公開情報）を over-mask しないようにする。
 */
const SCRUB_ENABLED: Record<ScrubCategory, boolean> = {
  API_KEY: true,
  PRIVATE_KEY: true,
  CREDENTIAL: true,
  JWT: true,
  EMAIL: true,
  IP: true,
  PHONE_JP: true,
  CREDIT_CARD: true,
  HIGH_ENTROPY: false,
};

/**
 * デコード済み SAML XML から PII / 機密文字列を除去した共有用 XML を生成する。
 *
 * フェーズ1（構造ベース）: saml:NameID / saml:AttributeValue のテキストを値ベース一貫
 * トークン [REDACTED:PII_n] に置換する（同一値 → 同一トークンで相関を保つ）。
 * フェーズ2（scrubber 併用）: 再シリアライズ後の文字列に scrubText を HIGH_ENTROPY 除外で
 * 適用し、URL 埋め込みメール等の構造で拾えない残余を救済する。
 *
 * 純関数。パース不能な入力は件数 0 で元の文字列を返す。
 */
export function maskSamlXml(xml: string): SamlMaskResult {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return { xml, piiCount: 0, secretCount: 0 };
    }

    // フェーズ1: 構造ベースマスク（値ベース一貫トークン化）
    const tokenMap = new Map<string, string>();
    let counter = 0;
    let piiCount = 0;
    const maskElement = (el: Element): void => {
      const value = el.textContent ?? '';
      if (!value.trim()) return;
      let token = tokenMap.get(value);
      if (!token) {
        counter += 1;
        token = `[REDACTED:PII_${counter}]`;
        tokenMap.set(value, token);
      }
      el.textContent = token;
      piiCount += 1;
    };
    const targets: Element[] = [
      ...Array.from(doc.getElementsByTagNameNS(NS_A, 'NameID')),
      ...Array.from(doc.getElementsByTagNameNS(NS_A, 'AttributeValue')),
    ];
    for (const el of targets) maskElement(el);

    const serialized = new XMLSerializer().serializeToString(doc);

    // フェーズ2: secret-scrubber 残余救済
    const scrubbed = scrubText(serialized, SCRUB_ENABLED);
    return { xml: scrubbed.output, piiCount, secretCount: scrubbed.findings.length };
  } catch {
    return { xml, piiCount: 0, secretCount: 0 };
  }
}
