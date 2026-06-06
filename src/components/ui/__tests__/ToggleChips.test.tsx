// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToggleChips } from '@/components/ui/ToggleChips';

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe('ToggleChips', () => {
  describe('バッジ表示と aria-label の合成', () => {
    it('count > 0 のときバッジ（toggle-chip__count）が表示され、aria-label が「ラベル（検出 N 件）」に合成される', () => {
      const { container } = render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'メール', count: 3 }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      // バッジが描画されている
      expect(container.querySelector('.toggle-chip__count')).not.toBeNull();
      // aria-label が件数込みで合成される
      expect(screen.getByRole('button', { name: 'メール（検出 3 件）' })).toBeTruthy();
    });

    it('count = 0 のときバッジ非表示・aria-label は label のまま', () => {
      const { container } = render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'メール', count: 0 }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(container.querySelector('.toggle-chip__count')).toBeNull();
      expect(screen.getByRole('button', { name: 'メール' })).toBeTruthy();
    });

    it('count 未指定のときバッジ非表示・aria-label は label のまま', () => {
      const { container } = render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'キー名' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(container.querySelector('.toggle-chip__count')).toBeNull();
      expect(screen.getByRole('button', { name: 'キー名' })).toBeTruthy();
    });
  });

  describe('ariaLabel prop', () => {
    it('ariaLabel 未指定かつ label が文字列なら label を accessible name に使う', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'x', label: 'グローバル' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(screen.getByRole('button', { name: 'グローバル' })).toBeTruthy();
    });

    it('ariaLabel 明示時はそれを accessible name として優先する', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'x', label: 'g', ariaLabel: '全マッチ（グローバル）' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(screen.getByRole('button', { name: '全マッチ（グローバル）' })).toBeTruthy();
    });

    it('ariaLabel 明示時に count > 0 でも ariaLabel ベースで件数を合成する', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'x', label: 'g', ariaLabel: '全マッチ', count: 2 }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(screen.getByRole('button', { name: '全マッチ（検出 2 件）' })).toBeTruthy();
    });

    it('label が ReactNode（非文字列）かつ ariaLabel 未指定なら aria-label は undefined（ボタン要素は描画される）', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'x', label: <span>アイコン</span> }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      // ボタン自体は描画される（アクセシブル名が空でも要素は存在する）
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      // aria-label 属性は付与されない（label が ReactNode のため baseLabel が undefined）
      expect(buttons[0].getAttribute('aria-label')).toBeNull();
    });
  });

  describe('legendVisible', () => {
    it('legendVisible 既定 true で legend が caption text-muted クラスを持つ', () => {
      const { container } = render(
        <ToggleChips legend="マスク対象" options={[]} selected={() => false} onToggle={noop} />
      );
      const legend = container.querySelector('legend');
      expect(legend).not.toBeNull();
      expect(legend!.className).toContain('caption');
      expect(legend!.className).toContain('text-muted');
      expect(legend!.className).not.toContain('sr-only');
    });

    it('legendVisible=false で legend が sr-only クラスを持つ', () => {
      const { container } = render(
        <ToggleChips
          legend="マスク対象"
          legendVisible={false}
          options={[]}
          selected={() => false}
          onToggle={noop}
        />
      );
      const legend = container.querySelector('legend');
      expect(legend).not.toBeNull();
      expect(legend!.className).toContain('sr-only');
    });
  });

  describe('token 表示', () => {
    it('token 指定時に toggle-chip__token が描画される', () => {
      const { container } = render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'g', label: '全マッチ', token: 'g' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(container.querySelector('.toggle-chip__token')).not.toBeNull();
    });

    it('token 未指定のとき toggle-chip__token は描画されない', () => {
      const { container } = render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'メール' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      expect(container.querySelector('.toggle-chip__token')).toBeNull();
    });
  });

  describe('aria-pressed とクリック', () => {
    it('aria-pressed が selected(value) の true を反映する', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'メール' }]}
          selected={() => true}
          onToggle={noop}
        />
      );
      const btn = screen.getByRole('button', { name: 'メール' }) as HTMLButtonElement;
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });

    it('aria-pressed が selected(value) の false を反映する', () => {
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'a', label: 'メール' }]}
          selected={() => false}
          onToggle={noop}
        />
      );
      const btn = screen.getByRole('button', { name: 'メール' }) as HTMLButtonElement;
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });

    it('クリックで onToggle(value) が呼ばれる', () => {
      const handler = vi.fn();
      render(
        <ToggleChips
          legend="テスト"
          options={[{ value: 'EMAIL', label: 'メール' }]}
          selected={() => false}
          onToggle={handler}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'メール' }));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('EMAIL');
    });

    it('複数チップで各ボタンが対応する value を持つ', () => {
      const handler = vi.fn();
      render(
        <ToggleChips
          legend="テスト"
          options={[
            { value: 'EMAIL', label: 'メール' },
            { value: 'JWT', label: 'JWT' },
          ]}
          selected={(v) => v === 'EMAIL'}
          onToggle={handler}
        />
      );
      const emailBtn = screen.getByRole('button', { name: 'メール' }) as HTMLButtonElement;
      const jwtBtn = screen.getByRole('button', { name: 'JWT' }) as HTMLButtonElement;
      expect(emailBtn.getAttribute('aria-pressed')).toBe('true');
      expect(jwtBtn.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(jwtBtn);
      expect(handler).toHaveBeenCalledWith('JWT');
    });
  });
});
