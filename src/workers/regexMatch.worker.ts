import { runMatch } from '../utils/regex-visualizer/match';
import type { RegexMatchWorkerRequest, RegexMatchWorkerResponse } from './regexMatch.types';

interface RegexMatchWorkerScope {
  postMessage(message: RegexMatchWorkerResponse): void;
  onmessage: ((event: MessageEvent<RegexMatchWorkerRequest>) => void) | null;
}

const ctx = self as unknown as RegexMatchWorkerScope;
ctx.onmessage = ({ data }) => {
  try {
    const result = runMatch(data.pattern, data.flags, data.text, data.maxLength);
    ctx.postMessage({ type: 'result', requestId: data.requestId, result });
  } catch {
    ctx.postMessage({ type: 'error', requestId: data.requestId });
  }
};
