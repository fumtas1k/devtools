// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { HarEntryList } from '@/components/tools/HarEntryList';
import { computeWaterfall } from '@/utils/har';
import type { HarEntry } from '@/utils/har';

beforeEach(() => {
  document.adoptedStyleSheets = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.adoptedStyleSheets = [];
});

// 正常 1 件 + 壊れた entry 3 種（{}, null, response 欠落）を混在させる。
// 型は実データ（手編集 HAR）を模すため unknown 経由でキャストする。
const entries = [
  {
    time: 12,
    request: {
      method: 'GET',
      url: 'https://example.com/api/ok',
      headers: [],
      queryString: [],
      cookies: [],
    },
    response: { status: 200, headers: [], cookies: [], content: { size: 2 } },
  },
  {}, // request/response 欠落
  null, // entry 自体が null
  {
    request: {
      method: 'POST',
      url: 'https://example.com/api/noresp',
      headers: [],
      queryString: [],
      cookies: [],
    },
  }, // response 欠落
] as unknown as HarEntry[];

describe('HarEntryList 壊れた entry のガード', () => {
  it('壊れた entry を含んでも throw せず描画できる', () => {
    const waterfall = computeWaterfall(entries);
    expect(() =>
      render(
        <HarEntryList
          entries={entries}
          waterfall={waterfall}
          selectedIndex={null}
          onSelect={() => {}}
        />
      )
    ).not.toThrow();
  });

  it('正常 entry の method と URL を描画する', () => {
    const waterfall = computeWaterfall(entries);
    render(
      <HarEntryList
        entries={entries}
        waterfall={waterfall}
        selectedIndex={null}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('GET')).toBeTruthy();
    // shortUrl は host + pathname
    expect(screen.getByRole('button', { name: 'example.com/api/ok' })).toBeTruthy();
  });

  it('壊れた entry 行はプレースホルダ文言の button を描画する', () => {
    const waterfall = computeWaterfall(entries);
    render(
      <HarEntryList
        entries={entries}
        waterfall={waterfall}
        selectedIndex={null}
        onSelect={() => {}}
      />
    );
    // 「（壊れたエントリ）」プレースホルダが request 欠落行に出る（{} と null の 2 行）
    expect(screen.getAllByText('（壊れたエントリ）').length).toBeGreaterThanOrEqual(2);
    // url を持つ行（ok / noresp）と壊れ行（{} / null）すべてが button（計 4 つ）
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '壊れたエントリ（2 行目）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '壊れたエントリ（3 行目）' })).toBeTruthy();
  });

  it('壊れた entry 行クリックでその index の onSelect が呼ばれる（再選択可能）', () => {
    const onSelect = vi.fn();
    const waterfall = computeWaterfall(entries);
    render(
      <HarEntryList
        entries={entries}
        waterfall={waterfall}
        selectedIndex={null}
        onSelect={onSelect}
      />
    );
    // 壊れ行は {} (index 1) と null (index 2)。先頭の壊れ行をクリック。
    screen.getByRole('button', { name: '壊れたエントリ（2 行目）' }).click();
    expect(onSelect).toHaveBeenCalledWith(1);
    screen.getByRole('button', { name: '壊れたエントリ（3 行目）' }).click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

it('typed percentage が left と width に対応する場合は一覧のシートを生成しない', () => {
  const supports = vi.fn().mockReturnValue(true);
  vi.stubGlobal('CSS', { supports });
  const original = globalThis.CSSStyleSheet;
  const constructor = vi.fn(function () {
    return new original();
  });
  vi.stubGlobal('CSSStyleSheet', constructor);
  const replace = vi.spyOn(original.prototype, 'replaceSync');
  const waterfall = computeWaterfall(entries);
  waterfall.rows[0] = {
    hasTimeline: true,
    offsetRatio: 0.125,
    widthRatio: 0.5,
    totalMs: 12,
    segments: [{ phase: 'wait', ms: 12, widthRatio: 1 }],
  };
  render(
    <HarEntryList
      entries={entries}
      waterfall={waterfall}
      selectedIndex={null}
      onSelect={() => {}}
    />
  );
  expect(supports).toHaveBeenCalledWith('left', 'attr(data-har-left type(<percentage>), 0%)');
  expect(supports).toHaveBeenCalledWith('width', 'attr(data-har-width type(<percentage>), 0%)');
  expect(document.adoptedStyleSheets).toHaveLength(0);
  expect(constructor).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

describe('一覧ジオメトリのフォールバック', () => {
  function model() {
    const waterfall = computeWaterfall(entries);
    waterfall.rows[0] = {
      hasTimeline: true,
      offsetRatio: 0.125,
      widthRatio: 0.5,
      totalMs: 12,
      segments: [{ phase: 'wait', ms: 12, widthRatio: 1 }],
    };
    return waterfall;
  }
  const view = (waterfall = model(), selectedIndex: number | null = null) => (
    <HarEntryList
      entries={entries}
      waterfall={waterfall}
      selectedIndex={selectedIndex}
      onSelect={() => {}}
    />
  );
  const css = (sheet: CSSStyleSheet) =>
    Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');

  it.each([
    undefined,
    {},
    { supports: () => false },
    { supports: (property: string) => property === 'width' },
    { supports: (property: string) => property === 'left' },
  ])('検出不可または片方のみ対応なら scoped な従来ルールを使う', (cssApi) => {
    vi.stubGlobal('CSS', cssApi);
    const { container, unmount } = render(view());
    const sheet = document.adoptedStyleSheets[0]!;
    const scope = Array.from(container.firstElementChild!.classList).find((s) =>
      s.startsWith('dyn-')
    );
    expect(css(sheet)).toContain(`.${scope} [data-har-bar="0"]`);
    expect(css(sheet)).toContain('--bar-left: 12.5000%');
    expect(css(sheet)).toContain('--bar-width: 50.0000%');
    expect(css(sheet)).toContain('--seg-width: 100.0000%');
    unmount();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it.each([NaN, Infinity, Number.MAX_VALUE])(
    '非有限の割合または乗算 overflow (%s) は従来生成へ戻す',
    (value) => {
      vi.stubGlobal('CSS', { supports: () => true });
      const waterfall = model();
      waterfall.rows[0]!.segments[0]!.widthRatio = value;
      render(view(waterfall));
      expect(document.adoptedStyleSheets).toHaveLength(1);
      expect(css(document.adoptedStyleSheets[0]!)).toContain(
        `--seg-width: ${(value * 100).toFixed(4)}%`
      );
    }
  );

  it.each(['offsetRatio', 'widthRatio'] as const)(
    '行の %s が乗算後に非有限なら従来生成にする',
    (property) => {
      vi.stubGlobal('CSS', { supports: () => true });
      const waterfall = model();
      waterfall.rows[0]![property] = Number.MAX_VALUE;
      render(view(waterfall));
      const name = property === 'offsetRatio' ? '--bar-left' : '--bar-width';
      expect(css(document.adoptedStyleSheets[0]!)).toContain(`${name}: Infinity%`);
    }
  );

  it('対応環境でも有限→非有限→有限の遷移で生成・クリアする', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    const { rerender } = render(view());
    expect(document.adoptedStyleSheets).toHaveLength(0);
    const bad = model();
    bad.rows[0]!.widthRatio = NaN;
    rerender(view(bad));
    const sheet = document.adoptedStyleSheets[0]!;
    expect(css(sheet)).toContain('--bar-width: NaN%');
    rerender(view());
    expect(css(sheet)).toBe('');
  });

  it('再描画でシートを再利用し、native に戻ると規則を消し unmount で除去する', () => {
    const supports = vi.fn().mockReturnValue(false);
    vi.stubGlobal('CSS', { supports });
    const replace = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync');
    const { rerender, unmount } = render(view());
    const sheet = document.adoptedStyleSheets[0]!;
    rerender(view(model(), 1));
    expect(replace).toHaveBeenCalledTimes(1);
    const changed = model();
    changed.rows[0]!.offsetRatio = 0.25;
    rerender(view(changed));
    expect(document.adoptedStyleSheets[0]).toBe(sheet);
    expect(css(sheet)).toContain('--bar-left: 25.0000%');
    supports.mockReturnValue(true);
    rerender(view(changed));
    expect(css(sheet)).toBe('');
    unmount();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('複数インスタンスは独立した scope と cleanup を持つ', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const first = render(view());
    const second = render(view());
    expect(document.adoptedStyleSheets).toHaveLength(2);
    expect(css(document.adoptedStyleSheets[0]!)).not.toBe(css(document.adoptedStyleSheets[1]!));
    first.unmount();
    expect(document.adoptedStyleSheets).toHaveLength(1);
    second.unmount();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('SSR と client で属性を含む markup が一致し hydration できる', async () => {
    vi.stubGlobal('CSS', undefined);
    const html = renderToString(view());
    vi.stubGlobal('CSS', { supports: () => true });
    const { container } = render(view());
    expect(container.innerHTML.replace(/dyn-[^" ]+/, 'dyn-id')).toBe(
      html.replace(/dyn-[^" ]+/, 'dyn-id')
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, view(), { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });
});
