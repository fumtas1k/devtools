/**
 * cert/chain.ts
 *
 * `buildChain(certs)` — ParsedCert[] を issuer→subject 順に並べ替え、
 * 各リンクの署名検証結果と有効期限フラグを返す。
 *
 * 署名検証は pkijs `Certificate.verify(issuerCert)` (Web Crypto) を使用。
 * 親が集合内に見つからない場合は signatureValid = null。
 * verify が throw（未対応アルゴリズム等）した場合も signatureValid = null。
 */

import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { ensureCryptoEngine } from './engine';
import type { ParsedCert, ChainLink, ChainResult } from './types';

/**
 * ParsedCert.der から pkijs Certificate オブジェクトを再構築する。
 * chain.ts は parse.ts が保持する pkijs オブジェクトに依存せず、
 * DER から都度パースすることで疎結合を保つ。
 */
function derToCertificate(der: Uint8Array): Certificate {
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  const asn1 = asn1js.fromBER(buf);
  if (asn1.offset === -1) {
    throw new Error('DER の ASN.1 デコードに失敗しました');
  }
  return new Certificate({ schema: asn1.result });
}

/**
 * 改ざんされた DER から生成した pkijs Certificate の署名検証が
 * 正しく false を返すよう、DER から直接 Certificate を再構築する。
 * （ParsedCert.der が書き換えられた場合もこの関数で最新の DER を使う）
 */
async function verifySignature(
  subjectDer: Uint8Array,
  issuerDer: Uint8Array
): Promise<boolean | null> {
  try {
    const subject = derToCertificate(subjectDer);
    const issuer = derToCertificate(issuerDer);
    return await subject.verify(issuer);
  } catch {
    // 未対応アルゴリズム・パースエラー等
    return null;
  }
}

/**
 * 有効期限チェック。
 * now < notBefore または now > notAfter の場合に true を返す。
 */
function isExpired(cert: ParsedCert, now: Date): boolean {
  return now < cert.notBefore || now > cert.notAfter;
}

/** subject.full → そのDNを持つ全 index のリスト */
function buildSubjectMap(certs: ParsedCert[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < certs.length; i++) {
    const key = certs[i].subject.full;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }
  return map;
}

/**
 * cert の親（issuer に該当する集合内 index）を解決する。
 *
 * - 自己署名（subject==issuer）→ null
 * - DN 一致候補なし（自分自身を除く）→ null
 * - AKI あり: SKI 一致候補を優先。一致が無く、かつ SKI を持つ候補が存在 → null（不一致確定）。
 *            SKI を持つ候補が皆無 → DN 先頭候補にフォールバック（比較不能・後方互換）。
 * - AKI なし: DN 先頭候補を採用。
 */
function resolveParentIndex(
  cert: ParsedCert,
  idx: number,
  certs: ParsedCert[],
  subjectMap: Map<string, number[]>
): number | null {
  if (cert.subject.full === cert.issuer.full) return null;

  const candidates = (subjectMap.get(cert.issuer.full) ?? []).filter((c) => c !== idx);
  if (candidates.length === 0) return null;

  if (cert.authorityKeyId !== undefined) {
    const matched = candidates.find((c) => certs[c].subjectKeyId === cert.authorityKeyId);
    if (matched !== undefined) return matched;
    const anyHasSki = candidates.some((c) => certs[c].subjectKeyId !== undefined);
    if (anyHasSki) return null;
  }

  return candidates[0];
}

/**
 * issuer→subject 順に並べ替えたインデックス列を構築する。
 * 親関係は resolveParentIndex を単一の真実源とする（buildChain と整合）。
 */
function buildOrder(certs: ParsedCert[], subjectMap: Map<string, number[]>): number[] {
  const n = certs.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const parentOf = new Map<number, number | null>();
  for (let i = 0; i < n; i++) {
    parentOf.set(i, resolveParentIndex(certs[i], i, certs, subjectMap));
  }

  // root = 親が null（自己署名 or 親不明 or AKI/SKI 不一致）
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (parentOf.get(i) === null) roots.push(i);
  }
  if (roots.length === 0) roots.push(0);

  const order: number[] = [];
  const visited = new Set<number>();

  function traverse(idx: number): void {
    if (visited.has(idx)) return;
    visited.add(idx);
    order.push(idx);
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && parentOf.get(j) === idx) {
        traverse(j);
      }
    }
  }

  for (const root of roots) {
    traverse(root);
  }

  // 未訪問（環状等）を末尾に追加
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) order.push(i);
  }

  return order;
}

/**
 * ParsedCert[] を受け取り、チェーン並べ替えと署名検証を行う。
 *
 * @param certs - `parseCertificates` が返した ParsedCert[]
 * @returns ChainResult
 */
export async function buildChain(certs: ParsedCert[]): Promise<ChainResult> {
  ensureCryptoEngine();

  const now = new Date();
  const n = certs.length;

  if (n === 0) {
    return { order: [], links: [] };
  }

  const subjectMap = buildSubjectMap(certs);
  const order = buildOrder(certs, subjectMap);

  const links: ChainLink[] = await Promise.all(
    certs.map(async (cert, idx): Promise<ChainLink> => {
      const expired = isExpired(cert, now);
      const isSelfSigned = cert.subject.full === cert.issuer.full;

      // エラー付き証明書は検証不能
      if (cert.error) {
        return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
      }

      if (isSelfSigned) {
        // 自己署名: 親は自分自身（issuerIndex = null）、署名検証は自己で実施
        let signatureValid: boolean | null = null;
        try {
          signatureValid = await verifySignature(cert.der, cert.der);
        } catch {
          signatureValid = null;
        }
        return { subjectIndex: idx, issuerIndex: null, signatureValid, expired };
      }

      const issuerIdx = resolveParentIndex(cert, idx, certs, subjectMap);
      if (issuerIdx === null) {
        return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
      }

      // 署名検証（改ざん検出含む）
      const signatureValid = await verifySignature(cert.der, certs[issuerIdx].der);

      return { subjectIndex: idx, issuerIndex: issuerIdx, signatureValid, expired };
    })
  );

  return { order, links };
}
