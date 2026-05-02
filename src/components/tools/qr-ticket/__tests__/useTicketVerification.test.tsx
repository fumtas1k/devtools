// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTicketVerification } from '../useTicketVerification';
import type { VerificationResult } from '@/utils/qr-ticket';

// ────────────────────────────────────────────
// 依存モジュールのモック
// ────────────────────────────────────────────

const mockPubKey = { type: 'public' } as CryptoKey;

const validResult: VerificationResult = {
  valid: true,
  ticket: { e: 'event-test', t: 'T-00001', timestamp: 9999999999 },
  expired: false,
};

const invalidResult: VerificationResult = {
  valid: false,
  ticket: null,
  expired: false,
  error: '署名が無効です',
};

vi.mock('@/utils/qr-ticket', () => ({
  importPublicKey: vi.fn(async () => mockPubKey),
  verifyTicket: vi.fn(async () => validResult),
}));

vi.mock('@/utils/file-validation', () => ({
  validateFile: vi.fn(() => ({ ok: true, message: '' })),
}));

vi.mock('@/utils/qr-reader', () => ({
  decodeQrFromFile: vi.fn(async () => ({ ok: true, data: 'qr-data' })),
  DEFAULT_QR_MAX_DIM: 1024,
}));

// useQrCamera のモック: camera オブジェクトをシンプルに返す
const mockStartCamera = vi.fn(async () => {});
const mockStopCamera = vi.fn();
const mockSetCameraError = vi.fn();

vi.mock('@/hooks/useQrCamera', () => ({
  useQrCamera: vi.fn(({ onQrDetected }: { onQrDetected: (data: string) => void }) => ({
    cameraActive: false,
    cameraError: '',
    setCameraError: mockSetCameraError,
    videoRef: { current: null },
    canvasRef: { current: null },
    startCamera: mockStartCamera,
    stopCamera: mockStopCamera,
    onQrDetected,
  })),
}));

const validPubKeyStr = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTicketVerification — 初期状態', () => {
  it('初期値が正しくセットされている', () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    expect(result.current.verificationResult).toBeNull();
    expect(result.current.verifying).toBe(false);
    expect(result.current.scanMode).toBe('camera');
  });
});

describe('useTicketVerification — verify', () => {
  it('正常な公開鍵と有効なQRデータで verificationResult が valid になる', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    await act(async () => {
      await result.current.verify('qr-data');
    });

    expect(result.current.verificationResult).toEqual(validResult);
    expect(result.current.verifying).toBe(false);
  });

  it('公開鍵の JSON が不正なとき verificationResult.valid が false になる', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: 'not-json' }));

    await act(async () => {
      await result.current.verify('qr-data');
    });

    expect(result.current.verificationResult?.valid).toBe(false);
    expect(result.current.verificationResult?.error).toContain('公開鍵の形式が不正');
  });

  it('改竄を検出したとき verificationResult.valid が false になる', async () => {
    const { verifyTicket } = await import('@/utils/qr-ticket');
    vi.mocked(verifyTicket).mockResolvedValueOnce(invalidResult);

    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    await act(async () => {
      await result.current.verify('tampered-data');
    });

    expect(result.current.verificationResult?.valid).toBe(false);
    expect(result.current.verificationResult?.error).toContain('署名が無効');
  });

  it('signal が abort 済みの場合は状態更新されない', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    const controller = new AbortController();
    controller.abort();

    await act(async () => {
      await result.current.verify('qr-data', controller.signal);
    });

    // signal が aborted なので verify は先頭で return し状態更新されない
    expect(result.current.verificationResult).toBeNull();
  });
});

describe('useTicketVerification — handleImageUpload', () => {
  const createFileEvent = (file: File): React.ChangeEvent<HTMLInputElement> => {
    return {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
  };

  it('有効な画像でQRを検出すると verificationResult がセットされる', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    const file = new File(['dummy'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.handleImageUpload(createFileEvent(file));
    });

    expect(result.current.verificationResult).toEqual(validResult);
  });

  it('ファイルバリデーション失敗時は setCameraError が呼ばれる', async () => {
    const { validateFile } = await import('@/utils/file-validation');
    vi.mocked(validateFile).mockReturnValueOnce({
      ok: false,
      code: 'WRONG_TYPE',
      message: 'ファイルが不正です',
    });

    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    const file = new File(['dummy'], 'bad.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.handleImageUpload(createFileEvent(file));
    });

    expect(mockSetCameraError).toHaveBeenCalledWith('ファイルが不正です');
    expect(result.current.verificationResult).toBeNull();
  });

  it('QRコードが見つからない場合は verificationResult.valid が false になる', async () => {
    const { decodeQrFromFile } = await import('@/utils/qr-reader');
    vi.mocked(decodeQrFromFile).mockResolvedValueOnce({ ok: false, reason: 'not-found' });

    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    const file = new File(['dummy'], 'no-qr.png', { type: 'image/png' });

    await act(async () => {
      await result.current.handleImageUpload(createFileEvent(file));
    });

    expect(result.current.verificationResult?.valid).toBe(false);
    expect(result.current.verificationResult?.error).toContain('QRコードが見つかりませんでした');
  });

  it('画像読み込みエラーの場合は setCameraError が呼ばれる', async () => {
    const { decodeQrFromFile } = await import('@/utils/qr-reader');
    vi.mocked(decodeQrFromFile).mockResolvedValueOnce({ ok: false, reason: 'load-error' });

    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    const file = new File(['dummy'], 'bad-image.png', { type: 'image/png' });

    await act(async () => {
      await result.current.handleImageUpload(createFileEvent(file));
    });

    expect(mockSetCameraError).toHaveBeenCalledWith('画像を読み込めませんでした');
  });
});

describe('useTicketVerification — handleRescan', () => {
  it('handleRescan で verificationResult がリセットされる', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    // まず verify を呼んで結果をセット
    await act(async () => {
      await result.current.verify('qr-data');
    });
    expect(result.current.verificationResult).not.toBeNull();

    // rescan でリセット
    act(() => result.current.handleRescan());

    expect(result.current.verificationResult).toBeNull();
    expect(mockSetCameraError).toHaveBeenCalledWith('');
  });

  it('camera モードのとき handleRescan で startCamera が呼ばれる', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    // scanMode はデフォルトで 'camera'
    act(() => result.current.handleRescan());

    expect(mockStartCamera).toHaveBeenCalledTimes(1);
  });

  it('upload モードのとき handleRescan で startCamera は呼ばれない', async () => {
    const { result } = renderHook(() => useTicketVerification({ pubKeyStr: validPubKeyStr }));

    act(() => result.current.setScanMode('upload'));
    act(() => result.current.handleRescan());

    expect(mockStartCamera).not.toHaveBeenCalled();
  });
});
