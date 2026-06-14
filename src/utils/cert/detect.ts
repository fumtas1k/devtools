import type { DetectResult, DerCandidate } from './types';

/**
 * Base64 文字列を Uint8Array にデコードする（標準 Base64 のみ）
 */
function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s/g, '');
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * 入力（テキストまたはバイナリ）を受け取り、DER 証明書候補を返す。
 *
 * - PEM ブロック（CERTIFICATE / PKCS7）を抽出
 * - PKCS#12 関連ヘッダ（PKCS12 / PFX / ENCRYPTED PRIVATE KEY）を検出
 * - それ以外の Base64 テキストは DER として試みる
 * - バイナリ（Uint8Array）は先頭 0x30 を確認して DER 候補として返す
 */
export function detectInput(input: string | Uint8Array): DetectResult {
  // バイナリ入力の処理
  if (input instanceof Uint8Array) {
    if (input.length === 0) return { kind: 'empty', candidates: [] };
    if (input[0] === 0x30) {
      return {
        kind: 'der',
        candidates: [{ der: input, source: 'der' }],
      };
    }
    return { kind: 'unknown', candidates: [] };
  }

  // テキスト入力の処理
  if (input.trim() === '') return { kind: 'empty', candidates: [] };

  // PKCS#12 検出（PFX magic bytes または特定ヘッダ）
  const pkcs12Labels = ['PKCS12', 'PFX'];
  for (const label of pkcs12Labels) {
    if (input.includes(`-----BEGIN ${label}-----`)) {
      return { kind: 'pkcs12', candidates: [], unsupported: 'pkcs12' };
    }
  }
  // ENCRYPTED PRIVATE KEY のみ（証明書なし）の場合は PKCS#12 由来と見なす
  if (
    input.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----') &&
    !input.includes('-----BEGIN CERTIFICATE-----')
  ) {
    return { kind: 'pkcs12', candidates: [], unsupported: 'pkcs12' };
  }

  // PEM ブロック抽出
  // 本文クラスを base64 + 空白に限定（`-` を含まない）ことで、`-----END` 位置での
  // バックトラックを構造的に排除し catastrophic backtracking を防ぐ。
  const pemRegex = /-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]*)-----END \1-----/g;
  const candidates: DerCandidate[] = [];
  let hasPkcs7 = false;
  let match: RegExpExecArray | null;

  while ((match = pemRegex.exec(input)) !== null) {
    const label = match[1].trim();
    const b64Body = match[2];

    if (label === 'CERTIFICATE') {
      try {
        const der = base64ToBytes(b64Body);
        candidates.push({ der, source: 'pem' });
      } catch {
        // デコード失敗は無視（壊れた PEM は parse 側でエラーとして扱う）
        candidates.push({ der: new Uint8Array(0), source: 'pem' });
      }
    } else if (label === 'PKCS7' || label === 'CMS') {
      hasPkcs7 = true;
      try {
        const der = base64ToBytes(b64Body);
        candidates.push({ der, source: 'pkcs7' });
      } catch {
        candidates.push({ der: new Uint8Array(0), source: 'pkcs7' });
      }
    }
    // CERTIFICATE REQUEST, PRIVATE KEY 等はスキップ
  }

  if (candidates.length > 0) {
    const kind = hasPkcs7 && candidates.every((c) => c.source === 'pkcs7') ? 'pkcs7' : 'pem';
    return { kind, candidates };
  }

  // PEM ブロックなし → Base64 のみなら DER として試みる
  const stripped = input.trim().replace(/\s/g, '');
  // Base64 文字のみで構成されているか判定
  if (/^[A-Za-z0-9+/]+=*$/.test(stripped) && stripped.length > 0) {
    try {
      const der = base64ToBytes(stripped);
      if (der.length > 0 && der[0] === 0x30) {
        return { kind: 'der', candidates: [{ der, source: 'der' }] };
      }
    } catch {
      // デコード失敗
    }
  }

  return { kind: 'unknown', candidates: [] };
}
