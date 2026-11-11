// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HarWaterfallBar } from '../HarWaterfallBar';
import type { WaterfallRow } from '@/utils/har';

afterEach(() => {
  cleanup();
});

const row: WaterfallRow = {
  hasTimeline: true,
  offsetRatio: 0,
  widthRatio: 1,
  totalMs: 100,
  segments: [
    { phase: 'wait', ms: 70, widthRatio: 0.7 },
    { phase: 'receive', ms: 30, widthRatio: 0.3 },
  ],
};

describe('HarWaterfallBar', () => {
  it('hasTimeline=true でセグメントを描画し aria-label に内訳を出す', () => {
    render(<HarWaterfallBar row={row} rowIndex={2} />);
    const bar = screen.getByLabelText(/wait 70ms/);
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('data-har-bar')).toBe('2');
    expect(bar.getAttribute('data-har-left')).toBe('0.0000%');
    expect(bar.getAttribute('data-har-width')).toBe('100.0000%');
    expect(bar.getAttribute('title')).toBe('wait 70ms, receive 30ms, 合計 100ms');
    expect(bar.getAttribute('role')).toBe('img');
    // セグメント要素が 2 つ、フェーズ色クラスと data-har-seg を持つ
    const segs = bar.querySelectorAll('.har-seg');
    expect(segs).toHaveLength(2);
    expect(segs[0].classList.contains('har-phase-wait')).toBe(true);
    expect(segs[0].getAttribute('data-har-seg')).toBe('2-0');
    expect(segs[1].classList.contains('har-phase-receive')).toBe(true);
    expect(segs[1].getAttribute('data-har-width')).toBe('30.0000%');
  });

  it('hasTimeline=false ではダッシュを表示しバーを描画しない', () => {
    const empty: WaterfallRow = {
      hasTimeline: false,
      offsetRatio: 0,
      widthRatio: 0,
      totalMs: 0,
      segments: [],
    };
    const { container } = render(<HarWaterfallBar row={empty} rowIndex={0} />);
    expect(container.querySelector('.har-bar')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

it('一覧のバーと各セグメントに小数第4位の割合を保持する', () => {
  const { container } = render(
    <HarWaterfallBar row={{ ...row, offsetRatio: 0.1234567, widthRatio: 0.8765432 }} rowIndex={2} />
  );
  const bar = container.querySelector('.har-bar')!;
  expect(bar.getAttribute('data-har-left')).toBe('12.3457%');
  expect(bar.getAttribute('data-har-width')).toBe('87.6543%');
  expect(bar.querySelector('.har-seg')?.getAttribute('data-har-width')).toBe('70.0000%');
});
