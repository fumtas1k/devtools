import type { MatchResult } from '../utils/regex-visualizer/match';

export interface RegexMatchWorkerRequest {
  requestId: number;
  pattern: string;
  flags: string;
  text: string;
  maxLength?: number;
}

export type RegexMatchWorkerResponse =
  { type: 'result'; requestId: number; result: MatchResult } | { type: 'error'; requestId: number };
