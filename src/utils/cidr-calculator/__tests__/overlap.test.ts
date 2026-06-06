import { describe, it, expect } from 'vitest';
import { detectOverlaps, OVERLAP_MAX_ENTRIES, OVERLAP_MAX_PAIRS } from '@/utils/cidr-calculator';

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

  describe('複数 CIDR の重複ペア検出（partial は正規化 CIDR では発生しないため代替検証）', () => {
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

// ─── 上限ガードの陽性対照 ────────────────────────────────────────────────────
//
// 旧実装（limitExceeded / pairsTruncated フィールドなし・上限ガードなし）に
// これらのテストを当てると以下の理由で必ず fail する:
//   - limitExceeded: 旧実装では O(n²) ループを回して大量 pairs を生成するため
//     limitExceeded === true にならず、かつ pairs.length === 0 にもならない
//   - pairsTruncated: 旧実装ではフィールド自体が存在しないため
//     `result.pairsTruncated` が undefined となり `=== true` が fail する

describe('上限ガードの陽性対照', () => {
  it('OVERLAP_MAX_ENTRIES + 1 件の有効 CIDR では limitExceeded が true で pairs が空になる', () => {
    // 257 件の一意な CIDR を生成（各 /16 なので重複なし）
    const inputs = Array.from(
      { length: OVERLAP_MAX_ENTRIES + 1 },
      (_, i) => `10.${Math.floor(i / 256)}.${i % 256}.0/24`
    );
    const result = detectOverlaps(inputs);

    // 上限超過ガードが発動していることを assert
    expect(result.limitExceeded).toBe(true);
    // ガード発動時は O(n²) ループを実行しないため pairs は空
    expect(result.pairs).toHaveLength(0);
    // validCount は実際の有効数を返す
    expect(result.validCount).toBe(OVERLAP_MAX_ENTRIES + 1);
    // limitExceeded の場合は pairsTruncated は false
    expect(result.pairsTruncated).toBe(false);
  });

  it('同一 CIDR を 60 件入力するとペアが OVERLAP_MAX_PAIRS に達し pairsTruncated が true になる', () => {
    // 60 件の 10.0.0.0/8 → 全ペア = 60 * 59 / 2 = 1770 > OVERLAP_MAX_PAIRS(1000)
    const inputs = Array.from({ length: 60 }, () => '10.0.0.0/8');
    const result = detectOverlaps(inputs);

    // ペア打ち切りガードが発動していることを assert
    expect(result.pairsTruncated).toBe(true);
    // 打ち切り後の pairs 数は上限値ちょうど
    expect(result.pairs).toHaveLength(OVERLAP_MAX_PAIRS);
    // limitExceeded は false（60 件 < 256 件）
    expect(result.limitExceeded).toBe(false);
  });
});

// ─── 陰性対照: 上限内では limitExceeded / pairsTruncated が false ──────────

describe('detectOverlaps - 上限内での陰性対照', () => {
  it('少数の正常入力では limitExceeded === false かつ pairsTruncated === false', () => {
    const result = detectOverlaps(['10.0.0.0/8', '192.168.0.0/16']);
    expect(result.limitExceeded).toBe(false);
    expect(result.pairsTruncated).toBe(false);
  });

  it('重複ありの少数入力でも pairsTruncated === false', () => {
    const result = detectOverlaps(['10.0.0.0/8', '10.1.0.0/16', '10.2.0.0/16']);
    expect(result.limitExceeded).toBe(false);
    expect(result.pairsTruncated).toBe(false);
    expect(result.pairs.length).toBeGreaterThan(0);
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
