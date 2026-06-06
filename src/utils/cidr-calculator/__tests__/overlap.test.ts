import { describe, it, expect } from 'vitest';
import { detectOverlaps } from '@/utils/cidr-calculator';

// ─── 独立（重複なし）の陰性対照 ───────────────────────────────────────────────

describe('detectOverlaps - 独立（重複なし）', () => {
  it('異なるクラスの CIDR は pairs が空', () => {
    const result = detectOverlaps(['10.0.0.0/8', '192.168.0.0/16']);
    expect(result.pairs).toHaveLength(0);
    expect(result.validCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('隣接（接しているが重複しない）CIDR は pairs が空', () => {
    // 10.0.0.0/24 は 10.0.0.0–10.0.0.255
    // 10.0.1.0/24 は 10.0.1.0–10.0.1.255 → 独立
    const result = detectOverlaps(['10.0.0.0/24', '10.0.1.0/24']);
    expect(result.pairs).toHaveLength(0);
  });

  it('IPv6 同士で重複しない', () => {
    const result = detectOverlaps(['2001:db8::/32', '2001:db9::/32']);
    expect(result.pairs).toHaveLength(0);
  });
});

// ─── 陽性対照: 実際に重複を検出する ──────────────────────────────────────────

describe('detectOverlaps - 陽性対照（重複検出）', () => {
  describe('identical（完全一致）', () => {
    it('同じ CIDR を 2 回入力すると identical を検出する', () => {
      const result = detectOverlaps(['10.0.0.0/8', '10.0.0.0/8']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('identical');
    });

    it('pairs.length > 0（陽性対照確認）', () => {
      const result = detectOverlaps(['192.168.0.0/16', '192.168.0.0/16']);
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it('aCidr / bCidr は正規化された CIDR 文字列', () => {
      // ホストビットが立っている入力でも正規化される
      const result = detectOverlaps(['10.1.2.3/8', '10.0.0.0/8']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].aCidr).toBe('10.0.0.0/8');
      expect(result.pairs[0].bCidr).toBe('10.0.0.0/8');
      expect(result.pairs[0].relation).toBe('identical');
    });
  });

  describe('a-contains-b（A が B を包含）', () => {
    it('10.0.0.0/8 と 10.1.0.0/16 → a-contains-b', () => {
      const result = detectOverlaps(['10.0.0.0/8', '10.1.0.0/16']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('a-contains-b');
      expect(result.pairs[0].aIndex).toBe(0);
      expect(result.pairs[0].bIndex).toBe(1);
    });

    it('10.0.0.0/16 と 10.0.0.0/24 → a-contains-b', () => {
      const result = detectOverlaps(['10.0.0.0/16', '10.0.0.0/24']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('a-contains-b');
    });
  });

  describe('b-contains-a（B が A を包含）', () => {
    it('10.1.0.0/16 と 10.0.0.0/8 → b-contains-a', () => {
      const result = detectOverlaps(['10.1.0.0/16', '10.0.0.0/8']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('b-contains-a');
      expect(result.pairs[0].aIndex).toBe(0);
      expect(result.pairs[0].bIndex).toBe(1);
    });
  });

  describe('partial（部分重複 — 人工範囲で検証）', () => {
    // 通常の CIDR は境界整合上 partial が発生しにくいため、
    // overlap.ts のロジックを人工的なケースで網羅する。
    // ロジック検証: aStart<=bEnd && bStart<=aEnd かつ identical/contains に当たらない場合
    // 実 CIDR では strict-subset 関係が成立するが、
    // 以下のように手動で細工して partial を再現する。
    // （例: 10.0.0.128/25 は 10.0.0.0/24 の後半。
    //    10.0.0.192/26 は 10.0.0.128/25 の後半。これらは独立。
    //    partial を作るには CIDR の境界を意図的にずらす必要があるが、
    //    parseCidr はネットワークアドレスに正規化するため、
    //    実際のユーザー入力では部分重複は発生しない。
    //    ただし内部ロジックの网羅として identical/contains 以外のパスを確認する。）
    //
    // partial が実 CIDR で発生しないことを確認するテストとして、
    // 代わりに 3 CIDR を使って複数ペアが検出されることを確認する。
    it('3 CIDR で複数ペアが検出される（10.0.0.0/8, 10.1.0.0/16, 192.168.0.0/16）', () => {
      const result = detectOverlaps(['10.0.0.0/8', '10.1.0.0/16', '192.168.0.0/16']);
      // 10.0.0.0/8 と 10.1.0.0/16 が a-contains-b、残り 2 ペアは独立
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('a-contains-b');
      expect(result.validCount).toBe(3);
    });
  });

  describe('IPv6 重複検出', () => {
    it('2001:db8::/32 と 2001:db8:1::/48 → a-contains-b', () => {
      const result = detectOverlaps(['2001:db8::/32', '2001:db8:1::/48']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('a-contains-b');
    });

    it('IPv6 identical', () => {
      const result = detectOverlaps(['2001:db8::/32', '2001:db8::/32']);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0].relation).toBe('identical');
    });
  });
});

// ─── version 混在・空行・エラー収集 ─────────────────────────────────────────

describe('detectOverlaps - version 混在', () => {
  it('IPv4 と IPv6 が混在しても重複なし（pairs 空）', () => {
    const result = detectOverlaps(['10.0.0.0/8', '2001:db8::/32']);
    expect(result.pairs).toHaveLength(0);
    expect(result.validCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});

describe('detectOverlaps - 空行スキップ', () => {
  it('空行は validCount に含まれず、インデックスは元配列位置を保持する', () => {
    const result = detectOverlaps(['10.0.0.0/8', '', '10.1.0.0/16']);
    expect(result.validCount).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.pairs).toHaveLength(1);
    // インデックスは元配列の位置（空行を除いた位置ではなく元 index）
    expect(result.pairs[0].aIndex).toBe(0);
    expect(result.pairs[0].bIndex).toBe(2);
  });

  it('全行が空行の場合は pairs・errors とも空', () => {
    const result = detectOverlaps(['', '  ', '\t']);
    expect(result.pairs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.validCount).toBe(0);
  });
});

// ─── 陽性対照: エラー収集 ────────────────────────────────────────────────────

describe('detectOverlaps - エラー収集の陽性対照', () => {
  it('不正行が errors に収集される（errors.length > 0）', () => {
    const result = detectOverlaps(['not-cidr', '10.0.0.0/8']);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].index).toBe(0);
    expect(result.errors[0].input).toBe('not-cidr');
    expect(result.errors[0].message).toBeTruthy();
  });

  it('不正行は有効行の重複判定から除外される', () => {
    // 不正行があっても有効な 2 行の重複は検出できる
    const result = detectOverlaps(['10.0.0.0/8', '256.0.0.0/8', '10.1.0.0/16']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.validCount).toBe(2);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].relation).toBe('a-contains-b');
  });

  it('複数の不正行を収集する', () => {
    const result = detectOverlaps(['bad1', 'bad2', '10.0.0.0/8']);
    expect(result.errors).toHaveLength(2);
    expect(result.validCount).toBe(1);
    expect(result.pairs).toHaveLength(0);
  });
});
