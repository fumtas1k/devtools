import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_COUNT_RESULT } from '@/utils/char-count/empty';
import type { CountResult } from '@/utils/char-count/types';
import type { CharCountWorkerRequest, CharCountWorkerResponse } from '@/workers/charCount.types';

const WORKER_ERROR = '文字数の集計に失敗しました。入力を変更してもう一度お試しください。';

export function useCharCount() {
  const [text, updateText] = useState('');
  const [result, setResult] = useState<CountResult | null>(EMPTY_COUNT_RESULT);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const worker = useRef<Worker | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (worker.current) {
      worker.current.onmessage = null;
      worker.current.onerror = null;
      worker.current.onmessageerror = null;
      worker.current.terminate();
      worker.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      generation.current += 1;
      cancel();
    };
  }, [cancel]);

  const setText = useCallback(
    (value: string) => {
      const requestId = ++generation.current;
      cancel();
      updateText(value);
      setError(null);

      if (!value) {
        setResult(EMPTY_COUNT_RESULT);
        setPending(false);
        return;
      }

      setResult(null);
      setPending(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        let current: Worker | null = null;
        const fail = () => {
          if (generation.current !== requestId || worker.current !== current) return;
          cancel();
          setPending(false);
          setError(WORKER_ERROR);
        };

        try {
          current = new Worker(new URL('../workers/charCount.worker.ts', import.meta.url), {
            type: 'module',
          });
          worker.current = current;
          current.onmessage = ({ data }: MessageEvent<CharCountWorkerResponse>) => {
            if (
              generation.current !== requestId ||
              worker.current !== current ||
              data.requestId !== requestId
            )
              return;
            if (data.type === 'error') {
              fail();
              return;
            }
            cancel();
            setResult(data.result);
            setPending(false);
          };
          current.onerror = fail;
          current.onmessageerror = fail;
          const request: CharCountWorkerRequest = { type: 'count', requestId, text: value };
          current.postMessage(request);
        } catch {
          fail();
        }
      }, 100);
    },
    [cancel]
  );

  const reset = useCallback(() => setText(''), [setText]);

  return { text, setText, reset, result, isPending, error };
}
