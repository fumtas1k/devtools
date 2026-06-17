// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { SAMPLE_SECRET_BASE32, DEFAULTS, TotpHotpGeneratorTool } from '../TotpHotpGenerator';
import { base32Decode } from '@/utils/totp-hotp';

// TOTP の setInterval tick が async crypto (crypto.subtle) を叩いて RTL テストを汚すのを避けるため、
// totp / hotp のみダミー化する。generateRandomBase32Secret / base32Decode は同期 (getRandomValues /
// 純計算) で crypto.subtle 非依存なので実物を維持する。
vi.mock('@/utils/totp-hotp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/totp-hotp')>();
  return {
    ...actual,
    totp: vi.fn(async () => '000000'),
    hotp: vi.fn(async () => '000000'),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SAMPLE_SECRET_BASE32', () => {
  it('有効な Base32 文字列である（デコード時に throw しない）', () => {
    expect(() => base32Decode(SAMPLE_SECRET_BASE32)).not.toThrow();
  });

  // 陽性対照: RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) を満たすか検証。
  // ツール自身が「ランダム生成は 160 bit」と謳いつつ、サンプルだけ短い (90 bit 等) に
  // 戻る silent regression を本テストが捕捉して fail させる。
  it('RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) 以上を満たす', () => {
    expect(base32Decode(SAMPLE_SECRET_BASE32).length).toBeGreaterThanOrEqual(20);
  });
});

describe('DEFAULTS', () => {
  it('アルゴリズムデフォルトは SHA-1（最も広くサポートされる）', () => {
    expect(DEFAULTS.algorithm).toBe('SHA-1');
  });

  it('桁数デフォルトは 6（RFC 4226 標準）', () => {
    expect(DEFAULTS.digits).toBe(6);
  });

  it('周期デフォルトは 30秒（RFC 6238 推奨）', () => {
    expect(DEFAULTS.period).toBe(30);
  });

  it('DEFAULTS でサンプル secret を使って totp を生成できる', async () => {
    // このケースは実物の totp が必要 (モックは固定 '000000' を返すため)。
    // importActual で実装を直接取得して検証する。
    const actual = await vi.importActual<typeof import('@/utils/totp-hotp')>('@/utils/totp-hotp');
    const secretBytes = actual.base32Decode(SAMPLE_SECRET_BASE32);
    const code = await actual.totp(secretBytes, { ...DEFAULTS, timestamp: 1234567890 * 1000 });
    expect(code).toHaveLength(DEFAULTS.digits);
    expect(/^\d+$/.test(code)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #538: ランダム生成 連打時の re-announce（unmount→remount dance）を守る陽性対照
// ─────────────────────────────────────────────────────────────────────────────
describe('TotpHotpGenerator — ランダム生成 連打の re-announce (#538)', () => {
  // requestAnimationFrame を蓄積式 stub にして決定論的に flush する。
  // 実装の dance は setRegenFlash(false) → rAF(() => setRegenFlash(true)) の順で、
  // 「flash 中の再 click で span が一旦 unmount され、次フレームで remount される」ことが要件。
  function setupRaf() {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    return () => {
      const pending = callbacks.splice(0);
      act(() => {
        pending.forEach((cb) => cb(0));
      });
    };
  }

  const ANNOUNCE = 'シークレットを再生成しました';
  const REGEN_LABEL = 'ランダム生成（新しいシークレット）';

  it('flash 表示中に再 click すると announce span が unmount→remount される', () => {
    const flushRaf = setupRaf();
    render(<TotpHotpGeneratorTool />);

    const regen = screen.getByRole('button', { name: REGEN_LABEL });

    // 1 回目: rAF flush 前は span 未 mount、flush 後に mount される
    act(() => {
      fireEvent.click(regen);
    });
    expect(screen.queryByText(ANNOUNCE)).toBeNull();
    flushRaf();
    const firstSpan = screen.getByText(ANNOUNCE);
    expect(firstSpan).toBeTruthy();

    // 2 回目（flash 表示中 = 1200ms setTimeout 前）: setRegenFlash(false) で span が一旦消える。
    // ← これが退行検知の要。1 行 setRegenFlash(true) 実装では span が消えずこの assert が fail する。
    act(() => {
      fireEvent.click(regen);
    });
    expect(screen.queryByText(ANNOUNCE)).toBeNull();

    // 次フレームで再 mount。同一ノードではなく remount されている = SR が再 announce する。
    flushRaf();
    const secondSpan = screen.getByText(ANNOUNCE);
    expect(secondSpan).toBeTruthy();
    expect(secondSpan).not.toBe(firstSpan);
  });
});
