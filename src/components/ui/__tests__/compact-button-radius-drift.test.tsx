// @vitest-environment jsdom
/**
 * cross-component メタテスト: CopyButton(default) と ActionButton(size="compact") の
 * border-radius ・パディング・行高さが共有定数 COMPACT_BUTTON_SHAPE_CLASSES 経由で
 * 一致していることを検証する drift 検知器。
 *
 * 問題の背景: PR #318 後も CopyButton は rounded(0.25rem)、ActionButton compact は
 * rounded-lg(0.5rem) で不一致が残っていた。class 名 assert ベースの unit test では
 * 片方だけ変わる silent drift を検出できないため、issue #320 で共有定数化 + 本テストを追加。
 *
 * 陽性対照: 下記「陽性対照 (positive control)」テストを参照。
 * CopyButton か ActionButton compact の角丸を rounded に戻すと必ず fail する設計にしている。
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { CopyButton } from '@/components/ui/CopyButton';
import { ActionButton } from '@/components/ui/ActionButton';
import { COMPACT_BUTTON_SHAPE_CLASSES } from '@/components/ui/_compactButton';

afterEach(() => {
  cleanup();
});

/**
 * COMPACT_BUTTON_SHAPE_CLASSES から各 utility を抽出するヘルパー。
 * 定数から直接 token を取り出すことで、実装との 1:1 対応を保証する。
 */
function extractCompactTokens(classStr: string): {
  borderRadius: string;
  px: string;
  py: string;
  leading: string;
  fontWeight: string;
} {
  const classes = classStr.split(' ');
  const borderRadius = classes.find((c) => c.startsWith('rounded')) ?? '';
  const px = classes.find((c) => c.startsWith('px-')) ?? '';
  const py = classes.find((c) => c.startsWith('py-')) ?? '';
  const leading = classes.find((c) => c.startsWith('leading-')) ?? '';
  const fontWeight = classes.find((c) => c.startsWith('font-')) ?? '';
  return { borderRadius, px, py, leading, fontWeight };
}

// ─── 陰性対照（正常系）: 共有定数の各 token が両コンポーネントに存在する ───────────────
// ⚠️ これ単独では「検知能力ゼロで green」との区別ができない。
// 陽性対照（下記）と合わせて初めて drift 検知器として機能する。

describe('compact ボタン border-radius drift 検知 (陰性対照)', () => {
  it('CopyButton(default) は COMPACT_BUTTON_SHAPE_CLASSES の全 token を含む', () => {
    render(<CopyButton text="test" label="コピー" />);
    const btn = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;
    const tokens = extractCompactTokens(COMPACT_BUTTON_SHAPE_CLASSES);

    expect(btn.className).toContain(tokens.borderRadius); // 'rounded-lg'
    expect(btn.className).toContain(tokens.px); // 'px-3'
    expect(btn.className).toContain(tokens.py); // 'py-2'
    expect(btn.className).toContain(tokens.leading); // 'leading-none'
    expect(btn.className).toContain(tokens.fontWeight); // 'font-bold'
  });

  it('ActionButton(size="compact") は COMPACT_BUTTON_SHAPE_CLASSES の全 token を含む', () => {
    render(
      <ActionButton onClick={() => {}} size="compact">
        ダウンロード
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: 'ダウンロード' }) as HTMLButtonElement;
    const tokens = extractCompactTokens(COMPACT_BUTTON_SHAPE_CLASSES);

    expect(btn.className).toContain(tokens.borderRadius); // 'rounded-lg'
    expect(btn.className).toContain(tokens.px);
    expect(btn.className).toContain(tokens.py);
    expect(btn.className).toContain(tokens.leading);
    expect(btn.className).toContain(tokens.fontWeight);
  });

  it('CopyButton(default) と ActionButton(compact) の compact 関連 token 集合が一致する', () => {
    render(<CopyButton text="test" label="コピー" />);
    const copyBtn = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;
    cleanup();

    render(
      <ActionButton onClick={() => {}} size="compact">
        ダウンロード
      </ActionButton>
    );
    const actionBtn = screen.getByRole('button', { name: 'ダウンロード' }) as HTMLButtonElement;

    const copyTokens = extractCompactTokens(copyBtn.className);
    const actionTokens = extractCompactTokens(actionBtn.className);

    // 両コンポーネントの compact token が完全一致することを確認する drift 検知
    expect(copyTokens).toEqual(actionTokens);
  });
});

// ─── 陽性対照 (positive control): 旧実装では必ず fail する検知能力の証明 ────────────────
// test-gates ルール準拠: 検知能力ゼロで green にならないことを保証する。
//
// 検証方法: 旧実装（CopyButton が rounded を使用）では copyTokens.borderRadius = 'rounded'、
// COMPACT_BUTTON_SHAPE_CLASSES には 'rounded-lg' が含まれるため
// expect(copyTokens.borderRadius).toBe(expectedRadius) が fail する。
// → 「CopyButton の rounded を rounded-lg に統一した」修正が機能していることを証明する。
//
// もし CopyButton の角丸を再び rounded に戻すと、このテストが fail して drift を検知できる。

describe('compact ボタン border-radius drift 検知 (陽性対照)', () => {
  it('[陽性対照] COMPACT_BUTTON_SHAPE_CLASSES が rounded-lg を指定していることを確認する', () => {
    // 定数自体が rounded-lg を含む前提。これが変わったら意図的な変更として検知する。
    const tokens = extractCompactTokens(COMPACT_BUTTON_SHAPE_CLASSES);
    expect(tokens.borderRadius).toBe('rounded-lg');
  });

  it('[陽性対照] CopyButton(default) の角丸が rounded-lg であることを確認する (旧実装 rounded では fail)', () => {
    // 旧実装: CopyButton に 'rounded' が直書きされていた。
    // → このテストは rounded-lg を assert するため、旧実装に当てると必ず fail する。
    // → 角丸が再び rounded に戻った場合も検知できる。
    render(<CopyButton text="test" label="コピー" />);
    const btn = screen.getByRole('button', { name: 'コピー' }) as HTMLButtonElement;

    // 'rounded-lg' が存在することを assert
    expect(btn.className).toContain('rounded-lg');

    // 旧実装の 'rounded'（= 0.25rem, rounded-lg 以外の rounded）が単体で含まれないことを確認
    // ('rounded-lg' は 'rounded' を部分一致で含むため、単体 token として存在しないことを検証)
    const classes = btn.className.split(' ');
    const hasPlainRounded = classes.includes('rounded');
    expect(hasPlainRounded).toBe(false); // 'rounded' のみ（rounded-lgではない）が含まれていたら fail
  });

  it('[陽性対照] ActionButton(compact) の角丸が rounded-lg であることを確認する', () => {
    render(
      <ActionButton onClick={() => {}} size="compact">
        ダウンロード
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: 'ダウンロード' }) as HTMLButtonElement;
    const classes = btn.className.split(' ');

    expect(classes).toContain('rounded-lg');
    expect(classes).not.toContain('rounded'); // plain 'rounded' (0.25rem) は含まない
  });
});
