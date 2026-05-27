import { describe, it, expect } from 'vitest';
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  CHAR_W,
  BOX_H,
  H_GAP,
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
