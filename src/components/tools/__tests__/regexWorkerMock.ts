import { vi } from 'vitest';
import { runMatch } from '@/utils/regex-visualizer/match';
import type { RegexMatchWorkerRequest, RegexMatchWorkerResponse } from '@/workers/regexMatch.types';

export const requests: RegexMatchWorkerRequest[] = [];
export function mockRegexWorker() {
  requests.length = 0;
  vi.stubGlobal(
    'Worker',
    class {
      onmessage: ((event: MessageEvent<RegexMatchWorkerResponse>) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      terminate() {}
      postMessage(request: RegexMatchWorkerRequest) {
        requests.push(request);
        this.onmessage?.({
          data: {
            type: 'result',
            requestId: request.requestId,
            result: runMatch(request.pattern, request.flags, request.text, request.maxLength),
          },
        } as MessageEvent<RegexMatchWorkerResponse>);
      }
    }
  );
}
