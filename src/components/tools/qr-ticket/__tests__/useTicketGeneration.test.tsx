// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTicketGeneration } from '../useTicketGeneration';
import type { GeneratedQr } from '../types';

// ────────────────────────────────────────────
// 依存モジュールのモック
// ────────────────────────────────────────────

const mockSignedTicket = {
  e: 'event-test',
  t: 'T-00001',
  timestamp: 9999999999,
  s: 'dummysig',
};

vi.mock('@/utils/qr-ticket', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/qr-ticket')>();
  return {
    ...original,
    signTicket: vi.fn(async () => mockSignedTicket),
    generateQrSvg: vi.fn(() => '<svg>dummy</svg>'),
    ticketToQrString: vi.fn(() => 'event-test|T-00001|9999999999|||dummysig'),
  };
});

vi.mock('@/utils/download', () => ({
  downloadSvg: vi.fn(),
}));

vi.mock('@/utils/zip', () => ({
  downloadZip: vi.fn(async () => undefined),
}));

const mockCryptoKeyPair: CryptoKeyPair = {
  privateKey: { type: 'private' } as CryptoKey,
  publicKey: { type: 'public' } as CryptoKey,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTicketGeneration — 初期状態', () => {
  it('初期チケットが1行セットされている', () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    expect(result.current.tickets).toHaveLength(1);
    expect(result.current.tickets[0].id).toBe('T-00001');
    expect(result.current.generating).toBe(false);
    expect(result.current.generateError).toBe('');
    expect(result.current.generatedQrs).toHaveLength(0);
    expect(result.current.zipping).toBe(false);
    expect(result.current.zipError).toBe('');
  });
});

describe('useTicketGeneration — チケット編集', () => {
  it('addTicket でチケットが追加される', () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => result.current.addTicket());

    expect(result.current.tickets).toHaveLength(2);
    expect(result.current.tickets[1].id).toBe('T-00002');
  });

  it('removeTicket でチケットが削除される', () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => result.current.addTicket());
    act(() => result.current.removeTicket(0));

    expect(result.current.tickets).toHaveLength(1);
    expect(result.current.tickets[0].id).toBe('T-00002');
  });

  it('updateTicket でフィールドが更新される', () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => result.current.updateTicket(0, 'name', '山田 太郎'));

    expect(result.current.tickets[0].name).toBe('山田 太郎');
  });

  it('MAX_TICKETS（20件）を超えると addTicket しても増えない', () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    // 毎回 act を分けることで tickets.length の stale closure 問題を回避
    for (let i = 0; i < 25; i++) {
      act(() => result.current.addTicket());
    }

    expect(result.current.tickets).toHaveLength(20);
  });
});

describe('useTicketGeneration — generate', () => {
  it('鍵ペアなしで generate するとエラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: null }));

    act(() => result.current.setEventId('event-test'));
    act(() => result.current.setExpiry('2099-12-31T23:59'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('鍵ペアを生成またはインポートしてください');
    expect(result.current.generatedQrs).toHaveLength(0);
  });

  it('イベントIDが空で generate するとエラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => result.current.setExpiry('2099-12-31T23:59'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('イベントIDを入力してください');
  });

  it('有効期限が未設定で generate するとエラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => result.current.setEventId('event-test'));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('有効期限を設定してください');
  });

  it('正常な入力で generate すると generatedQrs が返される', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toBe('');
    expect(result.current.generatedQrs).toHaveLength(1);
    expect(result.current.generatedQrs[0].svg).toBe('<svg>dummy</svg>');
  });

  it('eventId に | が含まれる場合は専用エラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event|test');
      result.current.setExpiry('2099-12-31T23:59');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('イベントIDに | を含めることはできません');
    expect(result.current.generateError).toContain('別の記号に置き換えてください');
    expect(result.current.generatedQrs).toHaveLength(0);
  });

  it('チケットIDに | が含まれる場合は専用エラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
      result.current.updateTicket(0, 'id', 'T-00001|x');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('チケットIDに | を含めることはできません');
    expect(result.current.generatedQrs).toHaveLength(0);
  });

  it('参加者名に | が含まれる場合は専用エラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
      result.current.updateTicket(0, 'name', '山田|太郎');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('参加者名に | を含めることはできません');
    expect(result.current.generatedQrs).toHaveLength(0);
  });

  it('料金区分に | が含まれる場合は専用エラーメッセージがセットされる', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
      result.current.updateTicket(0, 'category', '一般|学生');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('料金区分に | を含めることはできません');
    expect(result.current.generatedQrs).toHaveLength(0);
  });

  it('| を含まない正常な入力では | 専用エラーは発生しない', async () => {
    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
      result.current.updateTicket(0, 'name', '山田 太郎');
      result.current.updateTicket(0, 'category', '一般');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toBe('');
    expect(result.current.generatedQrs).toHaveLength(1);
  });

  it('generateQrSvg が null を返すとエラーメッセージがセットされる', async () => {
    const { generateQrSvg } = await import('@/utils/qr-ticket');
    vi.mocked(generateQrSvg).mockReturnValueOnce(null);

    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.generateError).toContain('QRコード生成に失敗しました');
    expect(result.current.generatedQrs).toHaveLength(0);
  });
});

describe('useTicketGeneration — downloadSvgQr', () => {
  it('downloadSvgQr が downloadSvg を呼び出す', async () => {
    const { downloadSvg } = await import('@/utils/download');

    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    const mockQr: GeneratedQr = {
      _key: 1,
      ticket: mockSignedTicket,
      svg: '<svg>dummy</svg>',
      qrString: 'qrdata',
    };

    act(() => result.current.downloadSvgQr(mockQr));

    expect(downloadSvg).toHaveBeenCalledTimes(1);
  });
});

describe('useTicketGeneration — downloadZipQrs', () => {
  it('generatedQrs がない状態では downloadZip が呼ばれない', async () => {
    const { downloadZip } = await import('@/utils/zip');

    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    await act(async () => {
      await result.current.downloadZipQrs();
    });

    expect(downloadZip).not.toHaveBeenCalled();
  });

  it('generate 後に downloadZipQrs を呼ぶと downloadZip が呼ばれる', async () => {
    const { downloadZip } = await import('@/utils/zip');

    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
    });

    await act(async () => {
      await result.current.generate();
    });

    await act(async () => {
      await result.current.downloadZipQrs();
    });

    expect(downloadZip).toHaveBeenCalledTimes(1);
  });

  it('downloadZip がエラーを投げると zipError がセットされる', async () => {
    const { downloadZip } = await import('@/utils/zip');
    vi.mocked(downloadZip).mockRejectedValueOnce(new Error('zip error'));

    const { result } = renderHook(() => useTicketGeneration({ cryptoKeyPair: mockCryptoKeyPair }));

    act(() => {
      result.current.setEventId('event-test');
      result.current.setExpiry('2099-12-31T23:59');
    });

    await act(async () => {
      await result.current.generate();
    });

    await act(async () => {
      await result.current.downloadZipQrs();
    });

    expect(result.current.zipError).toBe('ZIPの作成に失敗しました');
  });
});
