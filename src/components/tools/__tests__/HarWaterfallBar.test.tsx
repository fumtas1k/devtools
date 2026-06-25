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
    // セグメント要素が 2 つ、フェーズ色クラスと data-har-seg を持つ
    const segs = bar.querySelectorAll('.har-seg');
    expect(segs).toHaveLength(2);
    expect(segs[0].classList.contains('har-phase-wait')).toBe(true);
    expect(segs[0].getAttribute('data-har-seg')).toBe('2-0');
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
