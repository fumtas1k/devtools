// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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

  it('loop ありの repetition は矢印 marker を参照する', () => {
    const inner = measureTerminal('a', undefined);
    const node = measureRepetition(inner, { skip: false, loop: true, label: '1回以上' }, undefined);
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('marker#rr-loop-arrow')).toBeTruthy();
    const loopPath = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('marker-end') === 'url(#rr-loop-arrow)'
    );
    expect(loopPath).toBeTruthy();
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
