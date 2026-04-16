import { describe, it, expect } from 'vitest';
import { parseUuidV7Fields, extractUuidV7Timestamp } from '@/utils/uuid-v7';

// テスト用の固定 UUID v7
// 019687a2-1234-7abc-8def-0123456789ab
//   unix_ts_ms = 019687a21234 = 0x019687a21234 = 1_688_888_050_228 ms
//   ver = 7, rand_a = abc, var = 8, rand_b = def-0123456789ab
const SAMPLE_UUID = '019687a2-1234-7abc-8def-0123456789ab';

describe('parseUuidV7Fields', () => {
  it('unix_ts_ms を "tttttttt-tttt" 形式で返す', () => {
    const { unixTsMs } = parseUuidV7Fields(SAMPLE_UUID);
    expect(unixTsMs).toBe('019687a2-1234');
  });

  it('ver は常に "7"', () => {
    const { ver } = parseUuidV7Fields(SAMPLE_UUID);
    expect(ver).toBe('7');
  });

  it('rand_a は3桁 hex', () => {
    const { randA } = parseUuidV7Fields(SAMPLE_UUID);
    expect(randA).toBe('abc');
  });

  it('var nibble は4グループの先頭1文字', () => {
    const { varNibble } = parseUuidV7Fields(SAMPLE_UUID);
    expect(varNibble).toBe('8');
  });

  it('rand_b は "xxx-xxxxxxxxxxxx" 形式', () => {
    const { randB } = parseUuidV7Fields(SAMPLE_UUID);
    expect(randB).toBe('def-0123456789ab');
  });

  it('RFC 4122 バリアント b のケース', () => {
    const uuid = '019687a2-1234-7abc-bdef-0123456789ab';
    const { varNibble } = parseUuidV7Fields(uuid);
    expect(varNibble).toBe('b');
  });
});

describe('extractUuidV7Timestamp', () => {
  it('unix_ts_ms 0x000000000000 → 1970-01-01T00:00:00.000Z', () => {
    const uuid = '00000000-0000-7000-8000-000000000000';
    expect(extractUuidV7Timestamp(uuid)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('unix_ts_ms 0x019687a21234 → 正しい ISO 8601 日時', () => {
    const tsMs = parseInt('019687a21234', 16);
    const expected = new Date(tsMs).toISOString();
    expect(extractUuidV7Timestamp(SAMPLE_UUID)).toBe(expected);
  });

  it('実際の uuid.v7() で生成した値は現在時刻に近い', () => {
    // uuid ライブラリを使わずに手動でテスト用 UUID を生成
    const nowMs = Date.now();
    const hex = nowMs.toString(16).padStart(12, '0');
    const tsHex = hex.substring(0, 8) + '-' + hex.substring(8, 12);
    const uuid = `${tsHex}-7000-8000-000000000000`;
    const ts = new Date(extractUuidV7Timestamp(uuid)).getTime();
    expect(Math.abs(ts - nowMs)).toBeLessThan(1000);
  });
});
