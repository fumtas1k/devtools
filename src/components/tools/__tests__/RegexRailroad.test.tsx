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

  it('assertion は pill（rect）+ ラベルを描画する', () => {
    const node = measureAssertion('^', { start: 0, end: 1 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('rect')).toBeTruthy();
    expect(container.textContent).toContain('^');
  });
});
