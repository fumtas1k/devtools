import { DOMParser as WorkerDOMParser, XMLSerializer as WorkerXMLSerializer } from '@xmldom/xmldom';
import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { Application, SignedXml } from 'xmldsigjs';
import { exceedsUtf8ByteLimit } from './limits';
import {
  checkDocument,
  checkTarget,
  MAX_CERT_BYTES,
  MAX_SIGNATURE_XML_BYTES,
  signatureSnapshot,
  targetsFor,
  type SignatureResult,
} from './signature-profile';

// XML ライブラリの parser / serializer を worker 内だけに用意する。
Object.assign(globalThis, { DOMParser: WorkerDOMParser, XMLSerializer: WorkerXMLSerializer });
Application.setEngine('WebCrypto', globalThis.crypto);

async function importCertificate(pem: string): Promise<CryptoKey> {
  if (exceedsUtf8ByteLimit(pem, MAX_CERT_BYTES))
    throw new Error('証明書は 64 KiB 以下にしてください');
  const match =
    /^\s*-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+)\s*-----END CERTIFICATE-----\s*$/.exec(
      pem
    );
  if (!match)
    throw new Error('公開 X.509 証明書 PEM を 1 件入力してください（秘密鍵は入力できません）');
  try {
    const encoded = match[1].replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw new Error();
    const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const parsed = asn1js.fromBER(raw.buffer);
    if (parsed.offset !== raw.length) throw new Error();
    const certificate = new Certificate({ schema: parsed.result });
    const spki = certificate.subjectPublicKeyInfo.toSchema().toBER(false);
    const key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify']
    );
    const bits = (key.algorithm as RsaHashedKeyAlgorithm).modulusLength;
    if (bits < 2048 || bits > 8192) throw new Error('RSA 鍵長は 2048〜8192 bit のみ対応しています');
    return key;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('RSA 鍵長')) throw error;
    throw new Error('証明書が不正か RSA 公開鍵ではありません');
  }
}

export async function verifySignatures(
  xml: string,
  snapshot: string,
  pem: string
): Promise<SignatureResult[]> {
  if (exceedsUtf8ByteLimit(xml, MAX_SIGNATURE_XML_BYTES))
    throw new Error('署名検証は XML 2 MiB 以下に対応しています');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new Error('DTD / ENTITY は署名検証に対応していません');
  const parsed = new WorkerDOMParser({
    onError: () => {
      throw new Error('XML の構文エラーがあります');
    },
  }).parseFromString(xml, 'text/xml');
  const doc = parsed as unknown as Document;
  if (signatureSnapshot(doc) !== snapshot)
    throw new Error('XML parser の解析結果が一致しないため検証できません');
  const entries = targetsFor(doc);
  try {
    checkDocument(doc);
  } catch (error) {
    return entries.map(({ target }) => ({
      ...target,
      status: 'unsupported',
      reason: error instanceof Error ? error.message : '構造に対応していません',
    }));
  }
  let key: CryptoKey;
  try {
    key = await importCertificate(pem);
  } catch (error) {
    return entries.map(({ target }) => ({
      ...target,
      status: target.signed ? 'input-error' : 'unsigned',
      reason: target.signed
        ? error instanceof Error
          ? error.message
          : '証明書が不正です'
        : '直下に署名がありません',
    }));
  }
  const clone = doc.cloneNode(true) as Document;
  const clonedEntries = targetsFor(clone);
  const results: SignatureResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { element, target } = entries[i];
    try {
      const signature = checkTarget(element);
      if (!signature) {
        results.push({ ...target, status: 'unsigned', reason: '直下に署名がありません' });
        continue;
      }
      const clonedSignature = checkTarget(clonedEntries[i].element)!;
      for (const child of Array.from(clonedSignature.childNodes)) {
        if (
          child.nodeType === 1 &&
          (child as Element).namespaceURI === 'http://www.w3.org/2000/09/xmldsig#' &&
          (child as Element).localName === 'KeyInfo'
        )
          clonedSignature.removeChild(child);
      }
      const verifier = new SignedXml(doc);
      verifier.LoadXml(clonedSignature);
      const valid = await verifier.Verify({ key, content: doc.documentElement });
      results.push({
        ...target,
        status: valid ? 'match' : 'mismatch',
        reason: valid
          ? `指定証明書の公開鍵で ${target.label}［${target.id}］の署名が一致`
          : '署名または参照先の digest が一致しません',
      });
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : '';
      const digestMismatch = message.includes('Invalid digest for uri');
      results.push({
        ...target,
        status: digestMismatch ? 'mismatch' : 'unsupported',
        reason: digestMismatch
          ? '参照先の digest が一致しません'
          : error instanceof Error
            ? error.message
            : '署名の検証処理に対応していません',
      });
    }
  }
  return results;
}
