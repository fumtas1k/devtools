import { describe, it, expect } from 'vitest';
import { computeWaterfall } from '../waterfall';
import type { HarEntry } from '../types';

function entry(over: Partial<HarEntry>): HarEntry {
  return {
    startedDateTime: '2026-06-15T00:00:00.000Z',
    time: 100,
    request: {
      method: 'GET',
      url: 'https://example.com/',
      headers: [],
      queryString: [],
      cookies: [],
    },
    response: { status: 200, headers: [], cookies: [], content: { size: 0 } },
    ...over,
  };
}

describe('computeWaterfall', () => {
  it('既知 timings をフェーズ別 widthRatio に分解する', () => {
    const model = computeWaterfall([
      entry({
        timings: { blocked: 10, dns: 20, connect: 30, ssl: 10, send: 5, wait: 30, receive: 5 },
      }),
    ]);
    expect(model.totalMs).toBe(100);
    const row = model.rows[0];
    expect(row.hasTimeline).toBe(true);
    expect(row.offsetRatio).toBe(0);
    expect(row.widthRatio).toBeCloseTo(1, 5);
    // connect は ssl を控除して 20ms、ssl は別セグメント 10ms
    const phases = row.segments.map((s) => [s.phase, s.ms]);
    expect(phases).toEqual([
      ['blocked', 10],
      ['dns', 20],
      ['connect', 20],
      ['ssl', 10],
      ['send', 5],
      ['wait', 30],
      ['receive', 5],
    ]);
    // バー内相対幅: connect 20/100=0.2
    const connect = row.segments.find((s) => s.phase === 'connect')!;
    expect(connect.widthRatio).toBeCloseTo(0.2, 5);
  });

  it('ssl を connect から控除し二重計上しない', () => {
    const model = computeWaterfall([entry({ timings: { connect: 100, ssl: 40, wait: 50 } })]);
    const segs = model.rows[0].segments;
    expect(segs.find((s) => s.phase === 'connect')!.ms).toBe(60);
    expect(segs.find((s) => s.phase === 'ssl')!.ms).toBe(40);
    // 合計は connect(60)+ssl(40)+wait(50)=150（元の connect 100 を二重に数えない）
    expect(model.rows[0].totalMs).toBe(150);
  });

  it('-1 / 未定義 / 0 のフェーズはセグメント化しない', () => {
    const model = computeWaterfall([entry({ timings: { blocked: -1, dns: 0, wait: 40 } })]);
    expect(model.rows[0].segments.map((s) => s.phase)).toEqual(['wait']);
  });

  it('全体タイムライン基準で後発エントリを相対配置する', () => {
    const model = computeWaterfall([
      entry({ startedDateTime: '2026-06-15T00:00:00.000Z', timings: { wait: 100 } }),
      entry({ startedDateTime: '2026-06-15T00:00:00.050Z', timings: { wait: 50 } }),
    ]);
    expect(model.totalMs).toBe(100);
    expect(model.rows[0].offsetRatio).toBeCloseTo(0, 5);
    expect(model.rows[0].widthRatio).toBeCloseTo(1, 5);
    expect(model.rows[1].offsetRatio).toBeCloseTo(0.5, 5);
    expect(model.rows[1].widthRatio).toBeCloseTo(0.5, 5);
  });

  it('startedDateTime / timings 欠落・null エントリを安全に degrade する', () => {
    const model = computeWaterfall([
      null,
      entry({ startedDateTime: undefined, timings: { wait: 10 } }),
      entry({ timings: undefined }),
      entry({ timings: { wait: 30 } }),
    ]);
    expect(model.rows).toHaveLength(4);
    expect(model.rows[0].hasTimeline).toBe(false);
    expect(model.rows[1].hasTimeline).toBe(false); // start 無し
    expect(model.rows[2].hasTimeline).toBe(false); // timings 無し
    expect(model.rows[3].hasTimeline).toBe(true);
  });

  it('有効なタイムラインが 1 つも無くても例外を投げない', () => {
    const model = computeWaterfall([
      null,
      entry({ startedDateTime: undefined, timings: undefined }),
    ]);
    expect(model.rows.every((r) => r.hasTimeline === false)).toBe(true);
  });
});
