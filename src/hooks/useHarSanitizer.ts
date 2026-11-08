import { useState, useRef, useEffect, useCallback } from 'react';
import type { Har, HarRedactCategory } from '@/utils/har';
import type { HarWorkerRequest, HarWorkerResponse } from '@/workers/harSanitizer.types';

export interface HarSanitizeResult {
  har: Har;
  counts: Record<HarRedactCategory, number>;
  entryCount: number;
  loadSeq: number;
}

type Phase = 'parse' | 'sanitize';

/** Worker の保持入力はキャンセル・再読込・障害時に terminate で破棄する。 */
export function useHarSanitizer() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const loadSeqRef = useRef(0);
  const latestKindRef = useRef<'load' | 'sanitize'>('load');
  const [result, setResult] = useState<HarSanitizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispose = useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate();
  }, []);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      dispose();
    },
    [dispose]
  );

  const fail = useCallback(
    (message: string) => {
      requestIdRef.current += 1;
      dispose();
      setError(message);
      setResult(null);
      setBusy(false);
      setProgress(null);
    },
    [dispose]
  );

  const createWorker = useCallback(() => {
    const worker = new Worker(new URL('../workers/harSanitizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<HarWorkerResponse>) => {
      const msg = e.data;
      if (workerRef.current !== worker || msg.requestId !== requestIdRef.current) return;
      if (msg.type === 'progress') {
        setProgress(msg.phase);
      } else if (msg.type === 'result') {
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
      } else {
        fail(msg.message);
      }
    };
    worker.onerror = () => {
      if (workerRef.current === worker) fail('サニタイズ処理中に予期しないエラーが発生しました');
    };
    worker.onmessageerror = () => {
      if (workerRef.current === worker) fail('サニタイズ結果を受信できませんでした');
    };
    return worker;
  }, [fail]);

  const send = useCallback(
    (request: HarWorkerRequest, worker: Worker) => {
      try {
        worker.postMessage(request);
      } catch {
        fail('サニタイズ処理を開始できませんでした');
      }
    },
    [fail]
  );

  const load = useCallback(
    (text: string, enabled: Record<HarRedactCategory, boolean>) => {
      const requestId = ++requestIdRef.current;
      dispose();
      latestKindRef.current = 'load';
      setResult(null);
      setBusy(true);
      setProgress(null);
      setError(null);
      try {
        send({ type: 'load', requestId, text, enabled }, createWorker());
      } catch {
        fail('サニタイズ処理を開始できませんでした');
      }
    },
    [createWorker, dispose, fail, send]
  );

  const resanitize = useCallback(
    (enabled: Record<HarRedactCategory, boolean>) => {
      const worker = workerRef.current;
      if (!worker) return;
      const requestId = ++requestIdRef.current;
      latestKindRef.current = 'sanitize';
      setBusy(true);
      setProgress(null);
      setError(null);
      send({ type: 'sanitize', requestId, enabled }, worker);
    },
    [send]
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    dispose();
    setResult(null);
    setBusy(false);
    setProgress(null);
    setError(null);
  }, [dispose]);

  return { result, busy, progress, error, load, resanitize, reset };
}
