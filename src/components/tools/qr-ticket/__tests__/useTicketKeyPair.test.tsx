// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTicketKeyPair } from '../useTicketKeyPair';

// ────────────────────────────────────────────
// Web Crypto API のモック
// ────────────────────────────────────────────

const mockPrivateKey = { type: 'private' } as CryptoKey;
const mockPublicKey = { type: 'public' } as CryptoKey;

const mockCryptoKeyPair: CryptoKeyPair = {
  privateKey: mockPrivateKey,
  publicKey: mockPublicKey,
};

const mockPrivateJwk: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  d: 'private-d',
  x: 'pub-x',
  y: 'pub-y',
  key_ops: ['sign'],
};

const mockPublicJwk: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'pub-x',
  y: 'pub-y',
  key_ops: ['verify'],
};

vi.mock('@/utils/qr-ticket', () => ({
  generateKeyPair: vi.fn(async () => mockCryptoKeyPair),
  exportKeyPair: vi.fn(async () => ({
    privateKey: mockPrivateJwk,
    publicKey: mockPublicJwk,
  })),
  importPrivateKey: vi.fn(async () => mockPrivateKey),
  importPublicKey: vi.fn(async () => mockPublicKey),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTicketKeyPair — 初期状態', () => {
  it('初期値がすべて空・false であること', () => {
    const { result } = renderHook(() => useTicketKeyPair());
    expect(result.current.cryptoKeyPair).toBeNull();
    expect(result.current.privateKeyJwkStr).toBe('');
    expect(result.current.publicKeyJwkStr).toBe('');
    expect(result.current.keyGenerating).toBe(false);
    expect(result.current.keyError).toBe('');
    expect(result.current.showImport).toBe(false);
    expect(result.current.importStr).toBe('');
  });
});

describe('useTicketKeyPair — generateKeys', () => {
  it('鍵生成後に cryptoKeyPair・privateKeyJwkStr・publicKeyJwkStr がセットされる', async () => {
    const { result } = renderHook(() => useTicketKeyPair());

    await act(async () => {
      await result.current.generateKeys();
    });

    expect(result.current.cryptoKeyPair).toBe(mockCryptoKeyPair);
    expect(result.current.privateKeyJwkStr).toContain('"kty": "EC"');
    expect(result.current.publicKeyJwkStr).toContain('"kty": "EC"');
    expect(result.current.keyError).toBe('');
  });

  it('onPubKeyGenerated コールバックが生成した公開鍵文字列で呼ばれる', async () => {
    const onPubKeyGenerated = vi.fn();
    const { result } = renderHook(() => useTicketKeyPair({ onPubKeyGenerated }));

    await act(async () => {
      await result.current.generateKeys();
    });

    expect(onPubKeyGenerated).toHaveBeenCalledTimes(1);
    expect(onPubKeyGenerated.mock.calls[0][0]).toContain('"kty": "EC"');
  });

  it('generateKeyPair がエラーを投げると keyError がセットされる', async () => {
    const { generateKeyPair } = await import('@/utils/qr-ticket');
    vi.mocked(generateKeyPair).mockRejectedValueOnce(new Error('crypto error'));

    const { result } = renderHook(() => useTicketKeyPair());

    await act(async () => {
      await result.current.generateKeys();
    });

    expect(result.current.keyError).toBe('鍵の生成に失敗しました');
    expect(result.current.cryptoKeyPair).toBeNull();
  });
});

describe('useTicketKeyPair — importKey', () => {
  it('正常な秘密鍵 JWK をインポートすると cryptoKeyPair がセットされ showImport が閉じる', async () => {
    const { result } = renderHook(() => useTicketKeyPair());

    act(() => {
      result.current.setImportStr(JSON.stringify(mockPrivateJwk));
    });

    await act(async () => {
      await result.current.importKey();
    });

    expect(result.current.cryptoKeyPair).not.toBeNull();
    expect(result.current.privateKeyJwkStr).toContain('"kty": "EC"');
    expect(result.current.publicKeyJwkStr).toContain('"kty": "EC"');
    expect(result.current.showImport).toBe(false);
    expect(result.current.importStr).toBe('');
    expect(result.current.keyError).toBe('');
  });

  it('JSON形式が不正なときに keyError がセットされる', async () => {
    const { result } = renderHook(() => useTicketKeyPair());

    act(() => {
      result.current.setImportStr('not-json');
    });

    await act(async () => {
      await result.current.importKey();
    });

    expect(result.current.keyError).toBe('JSON形式が不正です');
  });

  it('公開鍵 JWK（d フィールドなし）を秘密鍵欄に入力するとエラーになる', async () => {
    const { result } = renderHook(() => useTicketKeyPair());

    act(() => {
      result.current.setImportStr(JSON.stringify(mockPublicJwk));
    });

    await act(async () => {
      await result.current.importKey();
    });

    expect(result.current.keyError).toContain('公開鍵です');
  });

  it('importPrivateKey がエラーを投げると keyError がセットされる', async () => {
    const { importPrivateKey } = await import('@/utils/qr-ticket');
    vi.mocked(importPrivateKey).mockRejectedValueOnce(new Error('import error'));

    const { result } = renderHook(() => useTicketKeyPair());

    act(() => {
      result.current.setImportStr(JSON.stringify(mockPrivateJwk));
    });

    await act(async () => {
      await result.current.importKey();
    });

    expect(result.current.keyError).toContain('インポートに失敗しました');
  });
});

describe('useTicketKeyPair — toggleImport', () => {
  it('toggleImport で showImport が反転する', () => {
    const { result } = renderHook(() => useTicketKeyPair());

    expect(result.current.showImport).toBe(false);
    act(() => result.current.toggleImport());
    expect(result.current.showImport).toBe(true);
    act(() => result.current.toggleImport());
    expect(result.current.showImport).toBe(false);
  });
});
