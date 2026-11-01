// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { RegexRailroad } from '../RegexRailroad';
import {
  measureSequence,
  measureTerminal,
  measureGroup,
  measureChoice,
  measureAssertion,
  measureRepetition,
  measureBackreference,
  measureCharClass,
} from '@/utils/regex-visualizer/railroad-layout';

afterEach(() => cleanup());

function nestedLoops() {
  const loop = (inner: ReturnType<typeof measureTerminal>) =>
    measureRepetition(inner, { skip: false, loop: true, label: '+' }, undefined);
  return measureSequence(
    [
      measureGroup(loop(loop(measureTerminal('a', undefined))), '#1', undefined),
      measureChoice(
        [loop(measureTerminal('b', undefined)), measureTerminal('c', undefined)],
        undefined
      ),
    ],
    undefined
  );
}

function expectLocalMarkers(container: Element, expectedReferences: number) {
  const markers = Array.from(container.querySelectorAll('marker'));
  const ids = markers.map((marker) => marker.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id))).toBe(true);
  const paths = Array.from(container.querySelectorAll('[marker-end]'));
  expect(paths).toHaveLength(expectedReferences);
  for (const path of paths) {
    const reference = path.getAttribute('marker-end');
    expect(reference).toMatch(/^url\(#[A-Za-z][A-Za-z0-9_-]*\)$/);
    const id = reference!.slice(5, -1);
    const svg = path.closest('svg');
    expect(
      Array.from(svg!.querySelectorAll('marker')).filter((marker) => marker.id === id)
    ).toHaveLength(1);
  }
  return ids;
}

describe('RegexRailroad', () => {
  it('terminal を rect + text で描画する', () => {
    const node = measureTerminal('a', { start: 0, end: 1 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('a');
  });

  it('sequence は子ごとに rect を描画する', () => {
    const node = measureSequence(
      [measureTerminal('a', undefined), measureTerminal('b', undefined)],
      undefined
    );
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
  });

  it('group はタイトルを描画する', () => {
    const node = measureGroup(measureTerminal('a', undefined), '#1', undefined);
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.textContent).toContain('#1');
  });

  it('choice は各分岐の rect と分岐パスを描画する', () => {
    const node = measureChoice(
      [measureTerminal('a', undefined), measureTerminal('b', undefined)],
      undefined
    );
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // split/merge
  });

  it('assertion は rr-anchor（rect）+ ラベルを描画する', () => {
    const node = measureAssertion('$', { start: 0, end: 1 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('.rr-anchor')).toBeTruthy();
    expect(container.textContent).toContain('$');
  });

  // 補強（PR #492 レビュー指摘）: 幅違い分岐は狭い側に出口までの水平延長 <line> を描く
  it('幅の異なる分岐では狭い分岐に延長 line を描く', () => {
    const node = measureChoice(
      [measureTerminal('a', undefined), measureTerminal('bbbb', undefined)],
      undefined
    );
    const { container } = render(<RegexRailroad node={node} />);
    // choice 内の <line> は狭い分岐の延長のみ（split/merge は <path>）
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(1);
  });

  it('repetition は inner の rect と弧 path を描画する', () => {
    const inner = measureTerminal('a', { start: 0, end: 1 });
    const node = measureRepetition(
      inner,
      { skip: true, loop: true, label: '0回以上' },
      { start: 0, end: 2 }
    );
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('rect')).toBeTruthy();
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // skip + loop
    expect(container.textContent).toContain('0回以上');
  });

  it('backreference は rect + ラベルを描画する', () => {
    const node = measureBackreference('\\1', { start: 0, end: 2 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.textContent).toContain('\\1');
  });

  // hotspot ハイライト（陽性対照）: 重なる最深ノードに hot class が付く
  it('hotspot に重なる最深ノードに hot class が付く', () => {
    const inner = measureTerminal('a', { start: 1, end: 2 });
    const node = measureRepetition(
      inner,
      { skip: false, loop: true, label: '+' },
      { start: 0, end: 3 }
    );
    // hotspot {1,2} は inner(terminal) に重なる。inner が最深なので inner の rect が hot。
    const { container } = render(<RegexRailroad node={node} hotspot={[{ start: 1, end: 2 }]} />);
    expect(container.querySelector('.rr-box-hot')).toBeTruthy();
  });

  // hotspot ハイライト（陰性対照）: 重ならないノードには hot class が付かない
  it('hotspot と重ならないノードには hot class が付かない', () => {
    const inner = measureTerminal('a', { start: 1, end: 2 });
    const node = measureRepetition(
      inner,
      { skip: false, loop: true, label: '+' },
      { start: 0, end: 3 }
    );
    // hotspot {5,9} は全ノードと重ならない
    const { container } = render(<RegexRailroad node={node} hotspot={[{ start: 5, end: 9 }]} />);
    expect(container.querySelector('.rr-box-hot')).toBeNull();
  });

  // 回帰防止（PR #493 レビュー指摘）: tall inner（group/choice）でも量指定子ラベルが
  // svg 高さ（=node.height）内に収まる（terminal の connectY=height/2 前提に依存しない）。
  it('量指定子付きグループ（tall inner）でラベルがノード高内に収まる', () => {
    const inner = measureGroup(measureTerminal('abc', undefined), '#1', undefined);
    const node = measureRepetition(inner, { skip: false, loop: true, label: '1回以上' }, undefined);
    const { container } = render(<RegexRailroad node={node} />);
    const label = container.querySelector('.rr-quant');
    expect(label).toBeTruthy();
    expect(Number(label!.getAttribute('y'))).toBeLessThanOrEqual(node.height);
  });

  it('charclass は rr-charclass class で描画する', () => {
    const node = measureCharClass('\\s', { start: 0, end: 2 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('.rr-charclass')).toBeTruthy();
    expect(container.textContent).toContain('\\s');
  });

  it('複数の鉄道図でマーカーが一意かつ各 SVG 内にあり、再描画後も安定する', () => {
    const node = nestedLoops();
    const view = (showFirst: boolean) => (
      <>
        {showFirst && <RegexRailroad key="first" node={node} />}
        <RegexRailroad key="second" node={node} />
      </>
    );
    const { container, rerender, unmount } = render(view(true));
    const ids = expectLocalMarkers(container, 8);
    expect(ids).toHaveLength(4);
    rerender(view(true));
    expect(expectLocalMarkers(container, 8)).toEqual(ids);
    rerender(view(false));
    expect(expectLocalMarkers(container, 4)).toEqual(ids.slice(2));
    unmount();
    expect(container.querySelectorAll('marker')).toHaveLength(0);
  });

  it('句読点を含む異なる prefix で SSR と hydration の ID が一致し衝突しない', async () => {
    const node = nestedLoops();
    const prefixes = ['rail:a_', 'raila_'];
    const containers = prefixes.map((identifierPrefix) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(<RegexRailroad node={node} />, { identifierPrefix });
      return container;
    });
    const before = containers.map((container) => expectLocalMarkers(container, 4));
    expect(new Set(before.flat()).size).toBe(4);
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const roots: ReturnType<typeof hydrateRoot>[] = [];
    try {
      await act(async () => {
        containers.forEach((container, i) => {
          roots.push(
            hydrateRoot(container, <RegexRailroad node={node} />, {
              identifierPrefix: prefixes[i],
              onRecoverableError,
            })
          );
        });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      containers.forEach((container, i) =>
        expect(expectLocalMarkers(container, 4)).toEqual(before[i])
      );
    } finally {
      await act(async () => roots.forEach((root) => root.unmount()));
      containers.forEach((container) => container.remove());
      consoleError.mockRestore();
    }
  });

  it('凡例の4種を描画する', () => {
    const node = measureTerminal('a', undefined);
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('.rr-legend')).toBeTruthy();
    expect(container.textContent).toContain('文字（リテラル）');
    expect(container.textContent).toContain('文字クラス・メタ文字');
    expect(container.textContent).toContain('アンカー（位置）');
    expect(container.textContent).toContain('量指定子（くり返し・スキップ）');
  });
});
