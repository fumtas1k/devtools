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
import { Certificate, setEngine, CryptoEngine } from 'pkijs';
import type { ParsedCert, ChainLink, ChainResult } from './types';

// pkijs に Web Crypto エンジンを登録（ブラウザ / Node テスト環境の両対応）
function ensureCryptoEngine(): void {
  if (typeof globalThis.crypto !== 'undefined') {
    setEngine('WebCrypto', new CryptoEngine({ name: 'WebCrypto', crypto: globalThis.crypto }));
  }
}

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

/**
 * issuer→subject 順に並べ替えたインデックス列を構築する。
 *
 * アルゴリズム:
 * 1. 自己署名（subject.full === issuer.full）を root 候補とする
 * 2. root → child と辿って order を構築
 * 3. 環状参照や孤立 cert は末尾に追記
 */
function buildOrder(certs: ParsedCert[]): number[] {
  const n = certs.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  // subject.full → index の逆引きマップ
  const subjectMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    subjectMap.set(certs[i].subject.full, i);
  }

  // 各証明書の親インデックスを求める（DN 一致ベース）
  const parentOf = new Map<number, number | null>();
  for (let i = 0; i < n; i++) {
    const cert = certs[i];
    const isSelfSigned = cert.subject.full === cert.issuer.full;
    if (isSelfSigned) {
      parentOf.set(i, null);
    } else {
      const parentIdx = subjectMap.get(cert.issuer.full);
      parentOf.set(i, parentIdx !== undefined ? parentIdx : null);
    }
  }

  // 深さ優先で root から並べる
  // root = 親が null（かつ自己署名）または 集合内に親が存在しない
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = parentOf.get(i);
    if (p === null) {
      // 自己署名 or 明示的に null
      roots.push(i);
    } else if (p === undefined) {
      // 親が集合内に見つからない
      roots.push(i);
    }
  }

  // root が無ければ index 0 を仮 root にする
  if (roots.length === 0) roots.push(0);

  const order: number[] = [];
  const visited = new Set<number>();

  // root → 子 → 孫 の順で追加
  function traverse(idx: number): void {
    if (visited.has(idx)) return;
    visited.add(idx);
    order.push(idx);
    // children: この証明書を親とするもの
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

  // subject.full → index の逆引きマップ（親候補検索用）
  const subjectMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    subjectMap.set(certs[i].subject.full, i);
  }

  // 並び順を構築
  const order = buildOrder(certs);

  // 各証明書について ChainLink を構築（署名検証は非同期）
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

      // 親を subject DN で検索
      const issuerIdx = subjectMap.get(cert.issuer.full);

      if (issuerIdx === undefined) {
        // 親が集合内にない
        return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
      }

      // AKI/SKI による絞り込み（あれば精度向上）
      let resolvedIssuerIdx = issuerIdx;
      if (cert.authorityKeyId !== undefined && certs[issuerIdx].subjectKeyId !== undefined) {
        if (cert.authorityKeyId !== certs[issuerIdx].subjectKeyId) {
          // AKI/SKI が不一致の場合は親なし扱い
          return { subjectIndex: idx, issuerIndex: null, signatureValid: null, expired };
        }
      }

      // 署名検証（改ざん検出含む）
      // cert.der / certs[resolvedIssuerIdx].der を DER から直接 pkijs 再構築して検証
      const signatureValid = await verifySignature(cert.der, certs[resolvedIssuerIdx].der);

      return {
        subjectIndex: idx,
        issuerIndex: resolvedIssuerIdx,
        signatureValid,
        expired,
      };
    })
  );

  return { order, links };
}
