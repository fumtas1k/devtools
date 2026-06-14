/**
 * HAR の parse + sanitize をメインスレッドから切り離して実行する Web Worker。
 *
 * sanitizeHar は `structuredClone` + 全 response body の正規表現スキャンを行うため
 * 中規模 HAR でも数秒かかり、メインスレッドで実行すると UI が固まる（issue #677）。
 * worker に逃がすことで「ページが応答しません」を防ぎ、進捗を逐次通知する。
 *
 * 状態を持つ（parse 済み HAR を保持）ため、redact トグル変更時は再 parse せず
 * sanitize だけを再実行できる。
 */
import { parseHar, sanitizeHar, type Har } from '../utils/har';
import type { HarWorkerRequest, HarWorkerResponse } from './harSanitizer.types';

// worker グローバルスコープのうち本ファイルで使う API のみを型付けする。
// `/// <reference lib="webworker" />` で webworker lib を取り込むと、グローバル型が
// 変わり public/sw.js の `self.clients` 型推論にまで影響して astro check が hint を出す
// （CI の 0/0/0 ゲートが落ちる）。最小インターフェースのキャストで回避する。
interface HarWorkerScope {
  postMessage(message: HarWorkerResponse): void;
  onmessage: ((event: MessageEvent<HarWorkerRequest>) => void) | null;
}

const ctx = self as unknown as HarWorkerScope;

// parse 済みの元 HAR。sanitize は毎回ここから structuredClone して非破壊で処理する。
let parsed: Har | null = null;

function post(msg: HarWorkerResponse): void {
  ctx.postMessage(msg);
}

function runSanitize(requestId: number, enabled: HarWorkerRequest['enabled']): void {
  if (!parsed) return;
  const total = parsed.log.entries.length;
  const { har, counts } = sanitizeHar(parsed, enabled, (processed) => {
    post({ type: 'progress', requestId, processed, total });
  });
  post({ type: 'result', requestId, har, counts, entryCount: total });
}

ctx.onmessage = (e: MessageEvent<HarWorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    const result = parseHar(msg.text);
    if (!result.ok) {
      parsed = null;
      post({ type: 'error', requestId: msg.requestId, message: result.message });
      return;
    }
    parsed = result.har;
    runSanitize(msg.requestId, msg.enabled);
  } else if (msg.type === 'sanitize') {
    if (!parsed) {
      post({ type: 'error', requestId: msg.requestId, message: 'HAR が読み込まれていません' });
      return;
    }
    runSanitize(msg.requestId, msg.enabled);
  }
};
