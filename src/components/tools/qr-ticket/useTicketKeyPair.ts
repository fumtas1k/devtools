import { useState } from 'react';
import {
  generateKeyPair,
  exportKeyPair,
  importPrivateKey,
  importPublicKey,
} from '@/utils/qr-ticket';

export interface TicketKeyPairState {
  cryptoKeyPair: CryptoKeyPair | null;
  privateKeyJwkStr: string;
  publicKeyJwkStr: string;
  keyGenerating: boolean;
  keyError: string;
  showImport: boolean;
  importStr: string;
}

export interface TicketKeyPairActions {
  generateKeys: () => Promise<void>;
  importKey: () => Promise<void>;
  toggleImport: () => void;
  setImportStr: (v: string) => void;
  /** 鍵生成時に検証タブの公開鍵欄へ伝播させるコールバックを渡すと呼ばれる */
  onPubKeyGenerated?: (pubKeyStr: string) => void;
}

export type UseTicketKeyPairReturn = TicketKeyPairState & {
  generateKeys: () => Promise<void>;
  importKey: () => Promise<void>;
  toggleImport: () => void;
  setImportStr: (v: string) => void;
};

/**
 * QRチケット鍵ペア管理フック。
 * 鍵の生成・インポートに関する状態とロジックを一元管理する。
 */
export function useTicketKeyPair(options?: {
  onPubKeyGenerated?: (pubKeyStr: string) => void;
}): UseTicketKeyPairReturn {
  const [cryptoKeyPair, setCryptoKeyPair] = useState<CryptoKeyPair | null>(null);
  const [privateKeyJwkStr, setPrivateKeyJwkStr] = useState('');
  const [publicKeyJwkStr, setPublicKeyJwkStr] = useState('');
  const [keyGenerating, setKeyGenerating] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importStr, setImportStr] = useState('');

  const generateKeys = async () => {
    setKeyGenerating(true);
    setKeyError('');
    try {
      const pair = await generateKeyPair();
      const exported = await exportKeyPair(pair);
      const privStr = JSON.stringify(exported.privateKey, null, 2);
      const pubStr = JSON.stringify(exported.publicKey, null, 2);
      setCryptoKeyPair(pair);
      setPrivateKeyJwkStr(privStr);
      setPublicKeyJwkStr(pubStr);
      options?.onPubKeyGenerated?.(pubStr);
    } catch {
      setKeyError('鍵の生成に失敗しました');
    } finally {
      setKeyGenerating(false);
    }
  };

  const importKey = async () => {
    setKeyError('');
    let jwk: JsonWebKey;
    try {
      jwk = JSON.parse(importStr) as JsonWebKey;
    } catch {
      setKeyError('JSON形式が不正です');
      return;
    }
    if (!('d' in jwk)) {
      setKeyError('これは公開鍵です。秘密鍵（"d" フィールドを含むJWK）を入力してください。');
      return;
    }
    try {
      const privKey = await importPrivateKey(jwk);
      // ECDSA JWK から公開鍵部分を抽出（d フィールドを除去）
      const { d: _d, key_ops: _ops, ...pubJwk } = jwk as Record<string, unknown>;
      const pubKeyJwk = { ...pubJwk, key_ops: ['verify'] } as JsonWebKey;
      const pubKey = await importPublicKey(pubKeyJwk);
      const privStr = JSON.stringify(jwk, null, 2);
      const pubStr = JSON.stringify(pubKeyJwk, null, 2);
      setCryptoKeyPair({ privateKey: privKey, publicKey: pubKey });
      setPrivateKeyJwkStr(privStr);
      setPublicKeyJwkStr(pubStr);
      options?.onPubKeyGenerated?.(pubStr);
      setShowImport(false);
      setImportStr('');
    } catch {
      setKeyError('秘密鍵のインポートに失敗しました。有効なECDSA P-256 JWKを入力してください。');
    }
  };

  const toggleImport = () => setShowImport((v) => !v);

  return {
    cryptoKeyPair,
    privateKeyJwkStr,
    publicKeyJwkStr,
    keyGenerating,
    keyError,
    showImport,
    importStr,
    generateKeys,
    importKey,
    toggleImport,
    setImportStr,
  };
}
