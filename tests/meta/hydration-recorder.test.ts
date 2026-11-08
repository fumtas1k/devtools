import { describe, expect, it, vi } from 'vitest';
import {
  HydrationRecorder,
  reportHydrationFailure,
  withCleanup,
} from '../diagnostics/hydration-recorder';

describe('hydration 巡回の診断', () => {
  it('未確定や想定された結果は出力せず、失敗・timeout・中断を出力する', async () => {
    const recorder = new HydrationRecorder(() => 0);
    const log = vi.fn();
    const attach = vi.fn(async () => {});
    for (const status of [undefined, 'passed', 'skipped'] as const) {
      await reportHydrationFailure(recorder, { status, expectedStatus: 'passed', attach }, log);
    }
    await reportHydrationFailure(
      recorder,
      { status: 'failed', expectedStatus: 'failed', attach },
      log
    );
    expect(log).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    for (const status of ['failed', 'timedOut', 'interrupted'] as const) {
      await reportHydrationFailure(recorder, { status, expectedStatus: 'passed', attach }, log);
    }
    expect(log).toHaveBeenCalledTimes(3);
    expect(attach).toHaveBeenCalledTimes(3);
  });

  it('正常な複数ページの全段階を記録し、成功時は出力しない（陰性対照）', async () => {
    let now = 100;
    const recorder = new HydrationRecorder(() => now);
    await recorder.run(null, 'context', () => {
      now += 2;
    });
    for (const path of ['/one', '/two']) {
      await recorder.run(path, 'goto', () => {
        now += 3;
      });
      await recorder.run(path, 'assert', () => {
        now += 1;
      });
    }
    const log = vi.fn();
    const attach = vi.fn();
    await reportHydrationFailure(
      recorder,
      { status: 'passed', expectedStatus: 'passed', attach },
      log
    );
    expect(recorder.snapshot()).toEqual({
      elapsedMs: 10,
      phases: [
        { page: null, name: 'context', startMs: 0, durationMs: 2, status: 'completed' },
        { page: '/one', name: 'goto', startMs: 2, durationMs: 3, status: 'completed' },
        { page: '/one', name: 'assert', startMs: 5, durationMs: 1, status: 'completed' },
        { page: '/two', name: 'goto', startMs: 6, durationMs: 3, status: 'completed' },
        { page: '/two', name: 'assert', startMs: 9, durationMs: 1, status: 'completed' },
      ],
    });
    expect(log).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  it('途中で throw した段階と完了済み段階を summary と JSON に出す（陽性対照）', async () => {
    let now = 0;
    const recorder = new HydrationRecorder(() => now);
    const original = { failure: true };
    await recorder.run('/one', 'goto', () => {
      now += 2;
    });
    await recorder.run('/one', 'assert', () => {
      now += 1;
    });
    await expect(
      recorder.run('/two', 'goto', () => {
        now += 4;
        throw original;
      })
    ).rejects.toBe(original);
    const log = vi.fn();
    const attach = vi.fn(async () => {});
    await reportHydrationFailure(
      recorder,
      { status: 'failed', expectedStatus: 'passed', attach },
      log
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '/one goto: completed start=0.0ms duration=2.0ms; assert: completed start=2.0ms duration=1.0ms'
      )
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('/two goto: failed start=3.0ms duration=4.0ms')
    );
    const [name, options] = attach.mock.calls[0] as unknown as [
      string,
      { body: Buffer; contentType: string },
    ];
    expect(name).toBe('hydration-diagnostics');
    expect(options.contentType).toBe('application/json');
    expect(JSON.parse(options.body.toString())).toEqual({
      elapsedMs: 7,
      phases: [
        { page: '/one', name: 'goto', startMs: 0, durationMs: 2, status: 'completed' },
        { page: '/one', name: 'assert', startMs: 2, durationMs: 1, status: 'completed' },
        { page: '/two', name: 'goto', startMs: 3, durationMs: 4, status: 'failed' },
      ],
    });
  });

  it('未解決の段階を running と経過時間で snapshot に含める', async () => {
    let now = 5;
    const recorder = new HydrationRecorder(() => now);
    let finish!: () => void;
    const pending = recorder.run(
      '/one',
      'hydration',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    now = 12;
    expect(recorder.snapshot()).toEqual({
      elapsedMs: 7,
      phases: [{ page: '/one', name: 'hydration', startMs: 0, durationMs: 7, status: 'running' }],
    });
    finish();
    await pending;
  });

  it('primary error を維持し全 cleanup を実行し、成功と失敗を記録する', async () => {
    let now = 0;
    const recorder = new HydrationRecorder(() => now);
    const primary = new Error('primary');
    const cleanupError = new Error('cleanup');
    const result = withCleanup(
      () =>
        recorder.run('/one', 'goto', () => {
          now++;
          throw primary;
        }),
      [
        () =>
          recorder.run('/one', 'guard.dispose', () => {
            now++;
            throw cleanupError;
          }),
        () =>
          recorder.run('/one', 'page.close', () => {
            now++;
          }),
      ]
    );
    await expect(result).rejects.toBe(primary);
    expect(recorder.snapshot().phases.map(({ name, status }) => [name, status])).toEqual([
      ['goto', 'failed'],
      ['guard.dispose', 'failed'],
      ['page.close', 'completed'],
    ]);
    const log = vi.fn(() => {
      throw new Error('log');
    });
    const attach = vi.fn(async () => {
      throw new Error('attach');
    });
    await expect(
      reportHydrationFailure(recorder, { status: 'failed', expectedStatus: 'passed', attach }, log)
    ).resolves.toBeUndefined();
    expect(attach).toHaveBeenCalledOnce();
    await expect(result).rejects.toBe(primary);
  });

  it('primary が成功した場合は最初の cleanup の thrown 値を伝播する', async () => {
    const later = vi.fn();
    await expect(
      withCleanup(
        async () => 1,
        [
          () => {
            throw undefined;
          },
          later,
        ]
      )
    ).rejects.toBeUndefined();
    expect(later).toHaveBeenCalledOnce();
  });
});
