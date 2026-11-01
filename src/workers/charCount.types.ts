import type { CountResult } from '../utils/char-count/types';

export type CharCountWorkerRequest = { type: 'count'; requestId: number; text: string };

export type CharCountWorkerResponse =
  | { type: 'result'; requestId: number; result: CountResult }
  | { type: 'error'; requestId: number; message: string };
