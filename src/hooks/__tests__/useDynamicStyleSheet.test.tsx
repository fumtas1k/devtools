// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useDynamicStyleSheet } from '../useDynamicStyleSheet';

// jsdom 26 は CSSStyleSheet.replaceSync / document.adoptedStyleSheets 未実装のため polyfill
beforeAll(() => {
  if (!CSSStyleSheet.prototype.replaceSync) {
    CSSStyleSheet.prototype.replaceSync = function (cssText: string) {
      while (this.cssRules.length > 0) {
        this.deleteRule(0);
      }
      const rules = cssText
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      rules.forEach((rule, i) => {
        try {
          this.insertRule(rule, i);
        } catch {
          // jsdom の insertRule が拒否する正規 CSS rule もあるため polyfill では握りつぶす。
          // 拒否されたら下位 cssRules が短くなるだけで、各 test の cssText assertion で
          // 「想定 rule が見当たらない」として顕在化する (silent pass にはならない)。
        }
      });
    };
  }

  if (!('adoptedStyleSheets' in document)) {
    const sheets: CSSStyleSheet[] = [];
    Object.defineProperty(document, 'adoptedStyleSheets', {
      get() {
        return sheets;
      },
      set(v: CSSStyleSheet[]) {
        sheets.length = 0;
        sheets.push(...v);
      },
    });
  }
});

describe('useDynamicStyleSheet', () => {
  beforeEach(() => {
    document.adoptedStyleSheets = [];
  });
  afterEach(() => {
    cleanup();
    document.adoptedStyleSheets = [];
  });

  it('useId ベースで stable な class 名を返し dyn- prefix を持つ', () => {
    const { result } = renderHook(() => useDynamicStyleSheet(() => ''));
    expect(result.current).toMatch(/^dyn-/);
    expect(result.current).not.toContain(':');
  });

  it('rules を渡すと document.adoptedStyleSheets に attach される', () => {
    const { result } = renderHook(() => useDynamicStyleSheet((cn) => `.${cn} { color: red; }`));
    expect(document.adoptedStyleSheets.length).toBe(1);
    const sheet = document.adoptedStyleSheets[0];
    expect(sheet.cssRules[0].cssText).toContain(`.${result.current}`);
    expect(sheet.cssRules[0].cssText).toContain('color: red');
  });

  it('空文字列を返すと sheet を生成しない', () => {
    renderHook(() => useDynamicStyleSheet(() => ''));
    expect(document.adoptedStyleSheets.length).toBe(0);
  });

  it('unmount 時に sheet を detach する', () => {
    const { unmount } = renderHook(() => useDynamicStyleSheet((cn) => `.${cn} { color: red; }`));
    expect(document.adoptedStyleSheets.length).toBe(1);
    unmount();
    expect(document.adoptedStyleSheets.length).toBe(0);
  });

  it('rules が変わると同一 sheet を in-place 更新する (sheet を作り直さない)', () => {
    const { rerender } = renderHook(
      ({ color }: { color: string }) => useDynamicStyleSheet((cn) => `.${cn} { color: ${color}; }`),
      { initialProps: { color: 'red' } }
    );
    expect(document.adoptedStyleSheets[0].cssRules[0].cssText).toContain('red');
    // rules 変更前後で同一インスタンスを保持しているか確認
    const sheetBefore = document.adoptedStyleSheets[0];
    rerender({ color: 'blue' });
    expect(document.adoptedStyleSheets.length).toBe(1);
    expect(document.adoptedStyleSheets[0].cssRules[0].cssText).toContain('blue');
    // sheet インスタンスが同一であること (add/filter が発生していない)
    expect(document.adoptedStyleSheets[0]).toBe(sheetBefore);
  });

  it('rules を複数回変更しても adoptedStyleSheets に 1 sheet しか追加されない (in-place 更新)', () => {
    const { rerender } = renderHook(
      ({ rules }: { rules: string }) => useDynamicStyleSheet(() => rules),
      { initialProps: { rules: '.x { color: red }' } }
    );
    const initialCount = document.adoptedStyleSheets.length;
    rerender({ rules: '.x { color: blue }' });
    rerender({ rules: '.x { color: green }' });
    // 旧実装 (毎回 sheet 生成) ではこの assertion が fail する
    expect(document.adoptedStyleSheets.length).toBe(initialCount);
  });

  it('初回 empty → non-empty に変化したら lazy create で sheet を attach する', () => {
    // mount 直後 empty では sheet を attach しない
    const { rerender } = renderHook(
      ({ rules }: { rules: string }) => useDynamicStyleSheet(() => rules),
      { initialProps: { rules: '' } }
    );
    expect(document.adoptedStyleSheets.length).toBe(0);
    // 後で non-empty になったら sheet を生成 + attach + cssRules に反映される
    rerender({ rules: '.x { color: red; }' });
    expect(document.adoptedStyleSheets.length).toBe(1);
    expect(document.adoptedStyleSheets[0].cssRules[0].cssText).toContain('red');
  });

  it('non-empty → empty に変化したら sheet は attach 維持で cssRules のみ空になる', () => {
    const { rerender } = renderHook(
      ({ rules }: { rules: string }) => useDynamicStyleSheet(() => rules),
      { initialProps: { rules: '.x { color: red; }' } }
    );
    expect(document.adoptedStyleSheets.length).toBe(1);
    expect(document.adoptedStyleSheets[0].cssRules.length).toBe(1);
    // empty に切り替わったら sheet は残るが cssRules は 0 件
    rerender({ rules: '' });
    expect(document.adoptedStyleSheets.length).toBe(1);
    expect(document.adoptedStyleSheets[0].cssRules.length).toBe(0);
  });
});
