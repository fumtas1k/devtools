import { base64UrlToBytes } from '@/utils/jwt';
import { pemBlockToBytes } from '@/utils/base64';

type AlgParams =
  | { name: 'HMAC'; hash: string }
  | { name: 'RSASSA-PKCS1-v1_5'; hash: string }
  | { name: 'ECDSA'; hash: string; namedCurve: string };

/** アルゴリズム → WebCrypto パラメーターのマッピング（テスト用にエクスポート） */
export const ALG_MAP: Record<string, AlgParams> = {
  HS256: { name: 'HMAC', hash: 'SHA-256' },
  HS384: { name: 'HMAC', hash: 'SHA-384' },
  HS512: { name: 'HMAC', hash: 'SHA-512' },
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  RS384: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
  RS512: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
  ES256: { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
  ES384: { name: 'ECDSA', hash: 'SHA-384', namedCurve: 'P-384' },
  ES512: { name: 'ECDSA', hash: 'SHA-512', namedCurve: 'P-521' },
};

export type SigStatus = 'unchecked' | 'verifying' | 'valid' | 'invalid' | 'unsupported' | 'error';

export async function verifySignature(
  rawHeader: string,
  rawPayload: string,
  signature: string,
  header: Record<string, unknown>,
  secretOrKey: string
): Promise<SigStatus> {
  const alg = typeof header.alg === 'string' ? header.alg : '';
  const algParams = ALG_MAP[alg];
  if (!algParams) return 'unsupported';

  const signingInput = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const sigBytes = base64UrlToBytes(signature);

  try {
    if (algParams.name === 'HMAC') {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secretOrKey),
        { name: 'HMAC', hash: algParams.hash },
        false,
        ['verify']
      );
      return (await crypto.subtle.verify('HMAC', key, sigBytes, signingInput))
        ? 'valid'
        : 'invalid';
    }

    // RS* / ES* は公開鍵 PEM を使用
    const keyBytes = pemBlockToBytes(secretOrKey, 'PUBLIC KEY');
    if (algParams.name === 'RSASSA-PKCS1-v1_5') {
      const key = await crypto.subtle.importKey(
        'spki',
        keyBytes.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: algParams.hash },
        false,
        ['verify']
      );
      return (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, signingInput))
        ? 'valid'
        : 'invalid';
    }

    // ECDSA
    if (algParams.name === 'ECDSA') {
      const key = await crypto.subtle.importKey(
        'spki',
        keyBytes.buffer,
        { name: 'ECDSA', namedCurve: algParams.namedCurve },
        false,
        ['verify']
      );
      return (await crypto.subtle.verify(
        { name: 'ECDSA', hash: algParams.hash },
        key,
        sigBytes,
        signingInput
      ))
        ? 'valid'
        : 'invalid';
    }
    return 'error';
  } catch {
    return 'error';
  }
}
