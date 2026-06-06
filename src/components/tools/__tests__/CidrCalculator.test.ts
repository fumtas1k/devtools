import { describe, it, expect } from 'vitest';
import { buildRows } from '@/components/tools/CidrCalculator';
import { parseCidr } from '@/utils/cidr-calculator';

// ─── IPv4: 192.168.1.0/24 ───────────────────────────────────────────────────

describe('buildRows - IPv4 (192.168.1.0/24)', () => {
  const info = parseCidr('192.168.1.0/24');
  const rows = buildRows(info);

  it('各 row が label / value / copyLabel を持つ', () => {
    for (const row of rows) {
      expect(row).toHaveProperty('label');
      expect(row).toHaveProperty('value');
      expect(row).toHaveProperty('copyLabel');
    }
  });

  it('ブロードキャストアドレス行が含まれる', () => {
    expect(rows.some((r) => r.label === 'ブロードキャストアドレス')).toBe(true);
  });

  it('サブネットマスク行が含まれる', () => {
    expect(rows.some((r) => r.label === 'サブネットマスク')).toBe(true);
  });

  it('ワイルドカードマスク行が含まれる', () => {
    expect(rows.some((r) => r.label === 'ワイルドカードマスク')).toBe(true);
  });

  it('ネットワークアドレス行が含まれる', () => {
    expect(rows.some((r) => r.label === 'ネットワークアドレス')).toBe(true);
  });

  it('最初のホスト行が含まれる', () => {
    expect(rows.some((r) => r.label === '最初のホスト')).toBe(true);
  });

  it('最後のホスト行が含まれる', () => {
    expect(rows.some((r) => r.label === '最後のホスト')).toBe(true);
  });

  it('総アドレス数行が含まれる', () => {
    expect(rows.some((r) => r.label === '総アドレス数')).toBe(true);
  });

  it('利用可能ホスト数行が含まれる', () => {
    expect(rows.some((r) => r.label === '利用可能ホスト数')).toBe(true);
  });

  it('2 進表記行が含まれる', () => {
    expect(rows.some((r) => r.label === '2 進表記')).toBe(true);
  });
});

// ─── IPv6: 2001:db8::/32 ────────────────────────────────────────────────────

describe('buildRows - IPv6 (2001:db8::/32)', () => {
  const info = parseCidr('2001:db8::/32');
  const rows = buildRows(info);

  it('各 row が label / value / copyLabel を持つ', () => {
    for (const row of rows) {
      expect(row).toHaveProperty('label');
      expect(row).toHaveProperty('value');
      expect(row).toHaveProperty('copyLabel');
    }
  });

  it('ブロードキャストアドレス行が含まれない', () => {
    expect(rows.some((r) => r.label === 'ブロードキャストアドレス')).toBe(false);
  });

  it('サブネットマスク行が含まれない', () => {
    expect(rows.some((r) => r.label === 'サブネットマスク')).toBe(false);
  });

  it('ワイルドカードマスク行が含まれない', () => {
    expect(rows.some((r) => r.label === 'ワイルドカードマスク')).toBe(false);
  });

  it('ネットワークアドレス行が含まれる', () => {
    expect(rows.some((r) => r.label === 'ネットワークアドレス')).toBe(true);
  });

  it('最初のホスト行が含まれる', () => {
    expect(rows.some((r) => r.label === '最初のホスト')).toBe(true);
  });

  it('最後のホスト行が含まれる', () => {
    expect(rows.some((r) => r.label === '最後のホスト')).toBe(true);
  });

  it('総アドレス数行が含まれる', () => {
    expect(rows.some((r) => r.label === '総アドレス数')).toBe(true);
  });

  it('利用可能ホスト数行が含まれる', () => {
    expect(rows.some((r) => r.label === '利用可能ホスト数')).toBe(true);
  });

  it('2 進表記行が含まれる', () => {
    expect(rows.some((r) => r.label === '2 進表記')).toBe(true);
  });
});
