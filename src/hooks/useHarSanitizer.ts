import { useState, useRef, useEffect, useCallback } from 'react';
import type { Har, HarRedactCategory } from '@/utils/har';
import type { HarWorkerResponse } from '@/workers/harSanitizer.types';

export interface HarSanitizeResult {
  har: Har;
  counts: Record<HarRedactCategory, number>;
  entryCount: number;
  /** load ごとに増える連番。toggle（再 sanitize）では不変。新規ファイル判定・リスト remount key に使う。 */
  loadSeq: number;
}

export interface HarSanitizeProgress {
  processed: number;
  total: number;
}

export interface UseHarSanitizer {
  /** 直近の sanitize 結果。null は未読込 or エラー。 */
  result: HarSanitizeResult | null;
  /** worker 処理中（初回 load / トグル再計算のいずれも）。 */
  busy: boolean;
  /** 処理中の進捗。未開始 / 完了時は null。 */
  progress: HarSanitizeProgress | null;
  /** parse / worker エラーメッセージ。 */
  error: string | null;
  /** 新規 HAR テキストを worker に渡して parse + sanitize する。 */
  load: (text: string, enabled: Record<HarRedactCategory, boolean>) => void;
  /** parse 済み HAR を別の redact 設定で再 sanitize する（トグル変更時）。 */
  resanitize: (enabled: Record<HarRedactCategory, boolean>) => void;
  /** 状態をクリアし、進行中リクエストを無効化する。 */
  reset: () => void;
}

/**
 * HAR の parse + sanitize を Web Worker に委譲するフック。
 *
 * sanitize はメインスレッドで実行すると中規模 HAR で UI を固める（issue #677）ため、
 * worker で実行して進捗を逐次受け取る。worker は parse 済み HAR を保持するので、
 * redact トグル変更時は `resanitize` で sanitize のみ再実行する（再 parse しない）。
 *
 * `requestId` で最新リクエストのみ反映し、トグル連打時の古い結果を破棄する。
 */
export function useHarSanitizer(): UseHarSanitizer {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const loadSeqRef = useRef(0);
  // 最新リクエストが load か sanitize か。result 受信時に loadSeq を増やすか判定する。
  const latestKindRef = useRef<'load' | 'sanitize'>('load');

  const [result, setResult] = useState<HarSanitizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<HarSanitizeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/harSanitizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<HarWorkerResponse>) => {
      const msg = e.data;
      // 最新リクエスト以外（トグル連打で追い越された stale）は破棄する。
      if (msg.requestId !== requestIdRef.current) return;

      if (msg.type === 'progress') {
        setProgress({ processed: msg.processed, total: msg.total });
        return;
      }
      if (msg.type === 'result') {
        if (latestKindRef.current === 'load') loadSeqRef.current += 1;
        setResult({
          har: msg.har,
          counts: msg.counts,
          entryCount: msg.entryCount,
          loadSeq: loadSeqRef.current,
        });
        setBusy(false);
        setProgress(null);
        setError(null);
        return;
      }
      // error
      setError(msg.message);
      setResult(null);
      setBusy(false);
      setProgress(null);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const load = useCallback((text: string, enabled: Record<HarRedactCategory, boolean>) => {
    const worker = workerRef.current;
    if (!worker) return;
    const requestId = ++requestIdRef.current;
    latestKindRef.current = 'load';
    setBusy(true);
    setProgress(null);
    setError(null);
    worker.postMessage({ type: 'load', requestId, text, enabled });
  }, []);

  const resanitize = useCallback((enabled: Record<HarRedactCategory, boolean>) => {
    const worker = workerRef.current;
    if (!worker) return;
    const requestId = ++requestIdRef.current;
    latestKindRef.current = 'sanitize';
    setBusy(true);
    setProgress(null);
    worker.postMessage({ type: 'sanitize', requestId, enabled });
  }, []);

  const reset = useCallback(() => {
    // 進行中リクエストを無効化（worker からの結果を以後無視させる）。
    requestIdRef.current += 1;
    setResult(null);
    setBusy(false);
    setProgress(null);
    setError(null);
  }, []);

  return { result, busy, progress, error, load, resanitize, reset };
}
