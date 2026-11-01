import { count } from '../utils/char-count';
import type { CharCountWorkerRequest, CharCountWorkerResponse } from './charCount.types';

// webworker lib 全体を取り込まず、必要な API だけを型付けする（ADR 117）。
interface CharCountWorkerScope {
  postMessage(message: CharCountWorkerResponse): void;
  onmessage: ((event: MessageEvent<CharCountWorkerRequest>) => void) | null;
}

const ctx = self as unknown as CharCountWorkerScope;

ctx.onmessage = ({ data }) => {
  try {
    ctx.postMessage({ type: 'result', requestId: data.requestId, result: count(data.text) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      type: 'error',
      requestId: data.requestId,
      message: `集計に失敗しました: ${message}`,
    });
  }
};
