import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchResult } from '@/utils/regex-visualizer/match';
import type { RegexMatchWorkerRequest, RegexMatchWorkerResponse } from '@/workers/regexMatch.types';

const FAILURE = 'マッチを実行できませんでした。もう一度お試しください。';
const TIMEOUT =
  'マッチが制限時間を超えたため中断しました。入力を変更するか、もう一度お試しください。';
const CANCELLED = 'マッチを中断しました。';

type State = {
  key: string;
  status: 'pending' | 'done' | 'error';
  result?: MatchResult;
  error?: string;
};

export function useRegexMatch(
  pattern: string,
  flags: string,
  text: string,
  verdict: string | undefined,
  enabled: boolean,
  maxLength?: number
) {
  const key = JSON.stringify([pattern, flags, text, verdict, enabled, maxLength]);
  const [state, setState] = useState<State | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    const id = ++generation.current;
    if (!enabled) return;
    let current: Worker | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    const dispose = () => {
      active = false;
      if (debounce !== null) clearTimeout(debounce);
      if (deadline !== null) clearTimeout(deadline);
      if (current) {
        current.onmessage = null;
        current.onerror = null;
        current.onmessageerror = null;
        current.terminate();
        current = null;
      }
    };
    stop.current = dispose;
    const fail = (message: string) => {
      if (!active || generation.current !== id) return;
      dispose();
      setState({ key, status: 'error', error: message });
    };
    setState({ key, status: 'pending' });
    debounce = setTimeout(() => {
      debounce = null;
      deadline = setTimeout(() => fail(TIMEOUT), 1000);
      try {
        current = new Worker(new URL('../workers/regexMatch.worker.ts', import.meta.url), {
          type: 'module',
        });
        const worker = current;
        worker.onmessage = ({ data }: MessageEvent<RegexMatchWorkerResponse>) => {
          if (!active || generation.current !== id || current !== worker || data.requestId !== id)
            return;
          if (data.type !== 'result') {
            fail(FAILURE);
            return;
          }
          dispose();
          setState({ key, status: 'done', result: data.result });
        };
        worker.onerror = () => fail(FAILURE);
        worker.onmessageerror = () => fail(FAILURE);
        const request: RegexMatchWorkerRequest = { requestId: id, pattern, flags, text, maxLength };
        worker.postMessage(request);
      } catch {
        fail(FAILURE);
      }
    }, 300);
    return dispose;
  }, [key, pattern, flags, text, enabled, maxLength, attempt]);

  const cancel = useCallback(() => {
    ++generation.current;
    stop.current();
    setState({ key, status: 'error', error: CANCELLED });
  }, [key]);
  const retry = useCallback(() => {
    setState({ key, status: 'pending' });
    setAttempt((n) => n + 1);
  }, [key]);
  const current = enabled && state?.key === key ? state : null;
  return {
    result: current?.result ?? null,
    error: current?.error ?? null,
    isPending: enabled && (!current || current.status === 'pending'),
    cancel,
    retry,
  };
}
