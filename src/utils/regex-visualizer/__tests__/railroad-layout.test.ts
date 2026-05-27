import { describe, it, expect } from 'vitest';
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  measureChoice,
  measureAssertion,
  CHAR_W,
  BOX_H,
  H_GAP,
  V_GAP,
  CHOICE_LEAD,
} from '../railroad-layout';

describe('railroad-layout measure', () => {
  it('terminal は文字数で幅が決まり connectY は中央', () => {
    const t = measureTerminal('ab', undefined);
    expect(t.kind).toBe('terminal');
    expect(t.height).toBe(BOX_H);
    expect(t.connectY).toBe(BOX_H / 2);
    expect(t.width).toBeGreaterThanOrEqual(2 * CHAR_W);
    expect(t.label).toBe('ab');
  });

  it('sequence は子幅の合計 + gap、rail は子 connectY の最大', () => {
    const a = measureTerminal('a', undefined);
    const b = measureTerminal('b', undefined);
    const seq = measureSequence([a, b], undefined);
    expect(seq.kind).toBe('sequence');
    expect(seq.width).toBe(a.width + b.width + H_GAP);
    expect(seq.connectY).toBe(BOX_H / 2);
    expect(seq.children).toHaveLength(2);
  });

  it('空の sequence はフォールバック扱い（空ラベル枠）', () => {
    const seq = measureSequence([], undefined);
    expect(seq.kind).toBe('fallback');
  });

  it('group は inner を内包し幅/高さが pad 分増える', () => {
    const inner = measureTerminal('a', undefined);
    const g = measureGroup(inner, '#1', undefined);
    expect(g.kind).toBe('group');
    expect(g.title).toBe('#1');
    expect(g.width).toBeGreaterThan(inner.width);
    expect(g.height).toBeGreaterThan(inner.height);
    expect(g.children[0]).toBe(inner);
  });

  it('fallback は破線枠用の kind を持つ', () => {
    const f = measureFallback('(?=x)', undefined);
    expect(f.kind).toBe('fallback');
    expect(f.label).toBe('(?=x)');
  });
});

describe('measureChoice', () => {
  it('分岐の最大幅 + lead*2 を幅とし、高さは分岐高さ合計 + V_GAP', () => {
    const a = measureTerminal('a', undefined);
    const bb = measureTerminal('bbbb', undefined);
    const c = measureChoice([a, bb], undefined);
    expect(c.kind).toBe('choice');
    expect(c.width).toBe(bb.width + CHOICE_LEAD * 2);
    expect(c.height).toBe(a.height + bb.height + V_GAP);
    expect(c.connectY).toBe(a.connectY); // 先頭分岐を本線に乗せる
    expect(c.children).toHaveLength(2);
  });

  it('分岐が 1 つなら分岐表現せずその子をそのまま返す', () => {
    const a = measureTerminal('a', undefined);
    expect(measureChoice([a], undefined)).toBe(a);
  });

  it('分岐が空なら fallback', () => {
    expect(measureChoice([], undefined).kind).toBe('fallback');
  });
});

describe('measureAssertion', () => {
  it('ラベル付きの assertion ノードを返す', () => {
    const node = measureAssertion('^', { start: 0, end: 1 });
    expect(node.kind).toBe('assertion');
    expect(node.label).toBe('^');
    expect(node.connectY).toBe(node.height / 2);
  });
});
