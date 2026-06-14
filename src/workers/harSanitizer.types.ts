/**
 * HAR サニタイズ Web Worker のメッセージ型。
 * メインスレッド（`useHarSanitizer`）と worker（`harSanitizer.worker.ts`）が共有する。
 *
 * `requestId` は load / sanitize ごとにインクリメントし、トグル連打時に古い結果を
 * メインスレッドで破棄するために使う（stale result の排除）。
 */
import type { Har, HarRedactCategory } from '@/utils/har';

export type HarWorkerRequest =
  | {
      type: 'load';
      requestId: number;
      text: string;
      enabled: Record<HarRedactCategory, boolean>;
    }
  | {
      type: 'sanitize';
      requestId: number;
      enabled: Record<HarRedactCategory, boolean>;
    }
  // 保持中の parse 済み HAR を解放する（reset 時のメモリ防御）。requestId は不要。
  | { type: 'reset' };

export type HarWorkerResponse =
  | { type: 'progress'; requestId: number; processed: number; total: number }
  | {
      type: 'result';
      requestId: number;
      har: Har;
      counts: Record<HarRedactCategory, number>;
      entryCount: number;
    }
  | { type: 'error'; requestId: number; message: string };
