// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { CopyButton } from '@/components/ui/CopyButton';

// クリップボードユーティリティをモック
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

import { copyToClipboard } from '@/utils/clipboard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CopyButton', () => {
  // ─── string パス（既存後方互換） ─────────────────────────────────────
  describe('text に string を渡す場合（既存パス）', () => {
    it('label をボタンの可視テキストとして描画する', () => {
      render(<CopyButton text="コピー内容" label="コピー" />);
      expect(screen.getByRole('button', { name: 'コピー' })).toBeTruthy();
    });

    it('クリックすると copyToClipboard が string の値で呼ばれる', async () => {
      render(<CopyButton text="テストテキスト" label="コピー" />);
      fireEvent.click(screen.getByRole('button', { name: 'コピー' }));
      await new Promise((r) => setTimeout(r, 0));
      expect(copyToClipboard).toHaveBeenCalledWith('テストテキスト');
    });
  });

  // ─── 陰性対照: 通常フローでコールバックが正しく機能する ─────────────
  describe('text に関数（遅延生成）を渡す場合 — 陰性対照', () => {
    it('クリック時にコールバックを評価し copyToClipboard にその返値を渡す', async () => {
      const textFn = vi.fn().mockReturnValue('遅延生成テキスト');
      render(<CopyButton text={textFn} label="コピー" />);

      fireEvent.click(screen.getByRole('button', { name: 'コピー' }));
      await new Promise((r) => setTimeout(r, 0));

      expect(textFn).toHaveBeenCalledTimes(1);
      expect(copyToClipboard).toHaveBeenCalledWith('遅延生成テキスト');
    });
  });

  // ─── 陽性対照: 遅延評価ゲートの検知能力を証明 ───────────────────────
  // このテスト群は「旧実装（text を string のまま copyToClipboard に渡す）」に
  // 当てると fail する設計になっており、lazy evaluation gate が実際に機能して
  // いることを証明する。
  describe('text に関数（遅延生成）を渡す場合 — 陽性対照', () => {
    it('陽性対照: レンダリング時点ではコールバックは評価されない（eager 評価になっていたら fail）', () => {
      const textFn = vi.fn().mockReturnValue('遅延生成テキスト');
      render(<CopyButton text={textFn} label="コピー" />);

      // コンポーネント描画後、クリック前の時点でコールバックが呼ばれていないことを検証。
      // もし handleClick の外で `text()` が評価されていれば（eager 評価）、ここで fail する。
      expect(textFn).not.toHaveBeenCalled();
    });

    it('陽性対照: copyToClipboard に関数オブジェクトではなくその戻り値（string）が渡される', async () => {
      const textFn = vi.fn().mockReturnValue('コールバック戻り値');
      render(<CopyButton text={textFn} label="コピー" />);

      fireEvent.click(screen.getByRole('button', { name: 'コピー' }));
      await new Promise((r) => setTimeout(r, 0));

      // copyToClipboard に渡った引数が関数オブジェクトではなく string であることを検証。
      // `typeof text === 'function'` 分岐がなく直接 `copyToClipboard(text)` していれば
      // ここで `expect.any(String)` が fail する。
      expect(copyToClipboard).toHaveBeenCalledWith(expect.any(String));
      const calledWith = vi.mocked(copyToClipboard).mock.calls[0][0];
      expect(typeof calledWith).toBe('string');
      expect(calledWith).toBe('コールバック戻り値');
      // 関数オブジェクトが渡されていないことを明示
      expect(typeof calledWith).not.toBe('function');
    });
  });

  // ─── disabled（issue #780: 再計算中に古い値をコピーさせない） ───────────
  describe('disabled', () => {
    it('陽性対照: disabled のときボタンが disabled 属性を持ち、クリックしても copyToClipboard が呼ばれない', async () => {
      const textFn = vi.fn().mockReturnValue('変更前の結果');
      render(<CopyButton text={textFn} label="コピー" disabled />);
      const button = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      await new Promise((r) => setTimeout(r, 0));

      expect(copyToClipboard).not.toHaveBeenCalled();
      expect(textFn).not.toHaveBeenCalled();
    });

    it('陽性対照: compact 表示でも disabled 属性が付き、クリックしてもコピーされない', async () => {
      render(<CopyButton text="変更前の結果" ariaLabel="出力をコピー" compact disabled />);
      const button = screen.getByRole('button', { name: '出力をコピー' }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      await new Promise((r) => setTimeout(r, 0));

      expect(copyToClipboard).not.toHaveBeenCalled();
    });

    it('陽性対照: disabled に切り替わった後は、同じボタンをクリックしてもコピーされない', async () => {
      const { rerender } = render(<CopyButton text="値" label="コピー" />);
      rerender(<CopyButton text="値" label="コピー" disabled />);
      const button = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      await new Promise((r) => setTimeout(r, 0));

      expect(copyToClipboard).not.toHaveBeenCalled();
    });

    it('陰性対照: disabled を渡さなければ disabled 属性は付かず、従来どおりコピーされる', async () => {
      render(<CopyButton text="通常のテキスト" label="コピー" />);
      const button = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;

      expect(button.disabled).toBe(false);
      fireEvent.click(button);
      await new Promise((r) => setTimeout(r, 0));

      expect(copyToClipboard).toHaveBeenCalledWith('通常のテキスト');
    });
  });
});
