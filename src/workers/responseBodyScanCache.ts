import type { ResponseBodyScanCache } from '../utils/har/sanitize';
import type { Har } from '../utils/har/types';

// 未検出情報も含む本文は機密相当。文字列の UTF-16 推計と entry ごとの固定予算を合算する。
export const BODY_SCAN_CACHE_MAX_BYTES = 16 * 1024 * 1024;
export const BODY_SCAN_CACHE_TTL_MS = 30_000;
export const BODY_SCAN_CACHE_MAX_ENTRIES = 4096;
const ENTRY_BYTES = 64;

/** 原文だけでも予算を超える場合は保存を試みない（走査対象外も数える保守的な判定）。 */
export function mayCacheResponseBodies(input: Har): boolean {
  let bytes = 0;
  let count = 0;
  for (const entry of input.log.entries) {
    if (!entry || typeof entry !== 'object') continue;
    const text = entry.response?.content?.text;
    if (typeof text !== 'string') continue;
    count++;
    bytes += text.length * 2 + ENTRY_BYTES;
    if (count > BODY_SCAN_CACHE_MAX_ENTRIES || bytes > BODY_SCAN_CACHE_MAX_BYTES) return false;
  }
  return true;
}

/** 現在の HAR のみ。利用時に期限を更新せず、上限超過では世代全体を無効化する。 */
export class WorkerResponseBodyScanCache implements ResponseBodyScanCache {
  private entries = new Map<number, { text: string; count: number }>();
  private bytes = 0;
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private overflow = false;
  private input: WeakRef<object> | undefined;

  constructor(
    private readonly maxBytes = BODY_SCAN_CACHE_MAX_BYTES,
    private readonly ttlMs = BODY_SCAN_CACHE_TTL_MS
  ) {}

  clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.entries.clear();
    this.bytes = 0;
    this.expiresAt = 0;
    this.overflow = false;
    this.input = undefined;
  }

  bind(input: object): void {
    if (this.input?.deref() !== input) {
      this.clear();
      this.input = new WeakRef(input);
    }
  }

  private expireIfNeeded(): void {
    if (this.expiresAt && performance.now() >= this.expiresAt) {
      // 同じ入力の次の走査で新しい世代を作れるよう identity を維持する。
      const input = this.input;
      this.clear();
      this.input = input;
    }
  }

  get(index: number): { text: string; count: number } | undefined {
    this.expireIfNeeded();
    return this.entries.get(index);
  }

  set(index: number, text: string, count: number): void {
    this.expireIfNeeded();
    if (this.overflow || this.entries.has(index)) return;
    const bytes = text.length * 2 + ENTRY_BYTES;
    if (this.entries.size >= BODY_SCAN_CACHE_MAX_ENTRIES || this.bytes + bytes > this.maxBytes) {
      const input = this.input;
      this.clear();
      this.input = input;
      this.overflow = true;
      return;
    }
    if (!this.expiresAt) {
      this.expiresAt = performance.now() + this.ttlMs;
      this.timer = setTimeout(() => this.clear(), this.ttlMs);
    }
    this.entries.set(index, { text, count });
    this.bytes += bytes;
  }
}
