type PhaseStatus = 'running' | 'completed' | 'failed';

type Phase = {
  page: string | null;
  name: string;
  startMs: number;
  durationMs?: number;
  status: PhaseStatus;
};

/** 1 テストの逐次巡回を記録する。時計は Playwright の timeout 時計とは別。 */
export class HydrationRecorder {
  private readonly startedAt: number;
  private readonly phases: Phase[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now();
  }

  async run<T>(page: string | null, name: string, action: () => T | Promise<T>): Promise<T> {
    const start = this.now();
    const phase: Phase = { page, name, startMs: start - this.startedAt, status: 'running' };
    this.phases.push(phase);
    try {
      const result = await action();
      phase.status = 'completed';
      return result;
    } catch (error) {
      phase.status = 'failed';
      throw error;
    } finally {
      phase.durationMs = this.now() - start;
    }
  }

  snapshot() {
    const elapsedMs = this.now() - this.startedAt;
    return {
      elapsedMs,
      phases: this.phases.map((phase) => ({
        ...phase,
        durationMs: phase.durationMs ?? elapsedMs - phase.startMs,
      })),
    };
  }
}

/** 全 cleanup を試み、最初に throw された値をそのまま伝播する。 */
export async function withCleanup<T>(
  action: () => Promise<T>,
  cleanup: Array<() => void | Promise<void>>
): Promise<T> {
  let failed = false;
  let firstError: unknown;
  let result!: T;
  try {
    result = await action();
  } catch (error) {
    failed = true;
    firstError = error;
  }
  for (const close of cleanup) {
    try {
      await close();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }
  if (failed) throw firstError;
  return result;
}

type FailureInfo = Pick<TestInfo, 'status' | 'expectedStatus' | 'attach'>;

/** 診断の失敗でテスト結果を上書きしない。成功時は出力しない。 */
export async function reportHydrationFailure(
  recorder: HydrationRecorder,
  info: FailureInfo,
  log: (message: string) => void = (message) => console.error(message)
) {
  if (
    (info.status !== 'failed' && info.status !== 'timedOut' && info.status !== 'interrupted') ||
    info.status === info.expectedStatus
  )
    return;
  try {
    const snapshot = recorder.snapshot();
    const pages = new Map<string, string[]>();
    for (const phase of snapshot.phases) {
      const page = phase.page ?? '(context)';
      const entries = pages.get(page) ?? [];
      entries.push(
        `${phase.name}: ${phase.status} start=${phase.startMs.toFixed(1)}ms duration=${phase.durationMs.toFixed(1)}ms`
      );
      pages.set(page, entries);
    }
    const lines = [...pages].map(([page, phases]) => `${page} ${phases.join('; ')}`);
    try {
      log(`[hydration] elapsed=${snapshot.elapsedMs.toFixed(1)}ms\n${lines.join('\n')}`);
    } catch {
      // 診断出力の失敗は元の失敗を隠さない。
    }
    try {
      await info.attach('hydration-diagnostics', {
        body: Buffer.from(JSON.stringify(snapshot, null, 2)),
        contentType: 'application/json',
      });
    } catch {
      // attachment が保存できなくても元の失敗を維持する。
    }
  } catch {
    // snapshot や整形に失敗してもテスト結果を維持する。
  }
}
import type { TestInfo } from '@playwright/test';
