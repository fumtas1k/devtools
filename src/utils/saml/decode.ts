import { decompressSync } from 'fflate';
import type { DecodedInput } from './types';

const utf8 = new TextDecoder('utf-8', { fatal: true });

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * クエリ文字列（`key=value&key=value...` 形式）から SAMLResponse / SAMLRequest の値を抽出する。
 * searchParams.get() は "+" を空白に変換してしまい base64 を破壊するため、
 * 生のクエリ文字列から自前でパラメータを取り出す（値は percent エンコードのまま保持）。
 * SAMLResponse を優先し、無ければ最初の SAMLRequest を採用する。
 */
function extractSamlParam(rawQuery: string): string | undefined {
  let param: string | undefined;
  for (const pair of rawQuery.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    if (key === 'SAMLResponse' || (key === 'SAMLRequest' && param === undefined)) {
      param = pair.slice(eq + 1);
      if (key === 'SAMLResponse') break;
    }
  }
  return param;
}

/**
 * SAML メッセージ入力の自動判定デコード。
 * URL 全体 / URL エンコード base64 / base64（POST）/ base64+deflate（Redirect）/ 生 XML に対応。
 */
export function decodeSamlInput(raw: string): DecodedInput {
  const steps: string[] = [];
  let text = raw.trim();
  if (!text) throw new Error('入力が空です');

  // 1. URL 全体 → SAMLResponse / SAMLRequest パラメータ抽出
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new Error('URL として解釈できません');
    }
    const param = extractSamlParam(url.search.slice(1));
    if (!param) throw new Error('URL に SAMLResponse / SAMLRequest パラメータが見つかりません');
    steps.push('URL からパラメータ抽出');
    text = param;
  } else if (/^SAML(Response|Request)=/.test(text)) {
    // 1.1 クエリ文字列断片の救済（URL 全体ではなく `SAMLResponse=...&RelayState=...` のような
    // クエリ部分だけを貼り付けた場合）。実装を単純に保つため「SAMLResponse=」「SAMLRequest=」
    // で始まる場合のみを対象とし、それ以外の並び順（例: RelayState= が先頭）は対象外とする。
    const param = extractSamlParam(text);
    if (!param)
      throw new Error('クエリ文字列に SAMLResponse / SAMLRequest パラメータが見つかりません');
    steps.push('クエリ文字列からパラメータ抽出');
    text = param;
  }

  // 2. 生 XML
  if (text.startsWith('<')) {
    return { xml: text, steps: [...steps, '生 XML と判定'], binding: 'xml' };
  }

  // 3. URL エンコード解除（%xx を含む場合のみ。復号失敗はそのまま続行）
  if (/%[0-9a-fA-F]{2}/.test(text)) {
    try {
      text = decodeURIComponent(text);
      steps.push('URL デコード');
    } catch {
      /* 不正な %-シーケンスの場合はそのまま続行 */
    }
  }

  // 3.1 URL エンコードされた生 XML の救済（URL デコード後に改めて判定）
  if (text.startsWith('<')) {
    return { xml: text, steps: [...steps, '生 XML と判定'], binding: 'xml' };
  }

  // 4. base64
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(text.replace(/\s+/g, ''));
  } catch {
    throw new Error(
      'base64 として解釈できません（SAMLResponse / SAMLRequest の値か確認してください）'
    );
  }
  steps.push('base64 デコード');

  // 5. そのまま XML → HTTP-POST binding
  try {
    const asText = utf8.decode(bytes);
    if (asText.trimStart().startsWith('<')) {
      return { xml: asText, steps, binding: 'post' };
    }
  } catch {
    /* UTF-8 でない → deflate 圧縮の可能性 */
  }

  // 6. deflate 展開 → HTTP-Redirect binding（decompressSync は raw deflate / zlib / gzip を自動判定）
  let inflated: string;
  try {
    inflated = utf8.decode(decompressSync(bytes));
  } catch {
    throw new Error('デコード結果が XML ではありません（deflate 展開にも失敗しました）');
  }
  if (!inflated.trimStart().startsWith('<')) {
    throw new Error('デコード結果が XML ではありません（SAML メッセージか確認してください）');
  }
  return { xml: inflated, steps: [...steps, 'deflate 展開'], binding: 'redirect' };
}
