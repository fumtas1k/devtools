/**
 * cert/engine.ts
 *
 * pkijs の Web Crypto エンジン初期化。
 *
 * pkijs v3 は Node.js 環境（vitest 等）では `getEngine()` 呼び出し前に
 * `setEngine()` の明示初期化が必須（未初期化だと "Please call 'setEngine'..." を throw）。
 * `setEngine` は v3.0.0 で `@deprecated` 指定されているが、代替の engine setter が
 * 提供されていないため、deprecation 診断（ts6385）を出さないよう型経由で呼び出す。
 */
import * as pkijs from 'pkijs';
import { CryptoEngine } from 'pkijs';

type SetEngine = (name: string, crypto: CryptoEngine) => void;

let initialized = false;

/**
 * pkijs に Web Crypto エンジンを登録する（ブラウザ / Node テスト環境の両対応）。
 * 複数回呼ばれても初回のみ初期化する。
 */
export function ensureCryptoEngine(): void {
  if (initialized) return;
  if (typeof globalThis.crypto === 'undefined') return;
  const setEngine = (pkijs as unknown as { setEngine: SetEngine }).setEngine;
  setEngine('cert-decoder', new CryptoEngine({ name: 'cert-decoder', crypto: globalThis.crypto }));
  initialized = true;
}
