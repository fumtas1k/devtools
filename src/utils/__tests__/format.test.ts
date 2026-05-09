import { describe, it, expect } from 'vitest';
import { formatBytes } from '@/utils/format';

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

describe('formatBytes — B 範囲', () => {
  it('0 バイトは "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('1023 バイト（KB 直前）は "1023 B"', () => {
    expect(formatBytes(1023)).toBe('1023 B');
  });
});

describe('formatBytes — KB 範囲', () => {
  it('1024 バイト（ちょうど 1KB）は "1.0 KB"', () => {
    expect(formatBytes(KB)).toBe('1.0 KB');
  });

  it('MB 直前（1024**2 - 1）は KB 表記', () => {
    expect(formatBytes(MB - 1)).toMatch(/KB$/);
  });

  it('1.5 KB は "1.5 KB"', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('formatBytes — MB 範囲', () => {
  it('1024**2 バイト（ちょうど 1MB）は "1.0 MB"', () => {
    expect(formatBytes(MB)).toBe('1.0 MB');
  });

  it('GB 直前（1024**3 - 1）は MB 表記', () => {
    expect(formatBytes(GB - 1)).toMatch(/MB$/);
  });

  it('2MB は "2.0 MB"', () => {
    expect(formatBytes(2 * MB)).toBe('2.0 MB');
  });
});

describe('formatBytes — GB 範囲', () => {
  it('1024**3 バイト（ちょうど 1GB）は "1.0 GB"', () => {
    expect(formatBytes(GB)).toBe('1.0 GB');
  });

  it('大値（5 * 1024**3）は GB 表記', () => {
    expect(formatBytes(5 * GB)).toBe('5.0 GB');
  });

  it('小数 1 桁で丸められる', () => {
    expect(formatBytes(1.5 * GB)).toBe('1.5 GB');
  });
});
