import { describe, it, expect } from 'vitest';
import {
  pickName,
  isConsistentName,
  computeAge,
  pickBirthday,
  formatBirthday,
  pickAddress,
  pickMobile,
  isNonExistentMobile,
  pickEmail,
  generateRecord,
  generateRecords,
  makeUniqueEmail,
  makeUniqueByRegen,
  regenPhoneKeepingAreaCode,
} from '@/utils/dummy-personal-data/generate';
import { ADDRESSES } from '@/utils/dummy-personal-data/dictionaries';

// ── Task 3: 氏名・読みの整合 ──────────────────────────────────────────────────

describe('pickName', () => {
  it('漢字氏名と読みが辞書ペアと整合する', () => {
    for (let i = 0; i < 200; i++) {
      const r = pickName('男', '　');
      expect(isConsistentName(r.name, r.kana)).toBe(true);
    }
  });

  it('区切り文字を反映する（なし）', () => {
    const r = pickName('女', '');
    expect(r.name).not.toContain(' ');
    expect(r.name).not.toContain('　');
  });

  it('フリガナはカタカナで出力する（ひらがなを含まない）', () => {
    for (let i = 0; i < 100; i++) {
      const r = pickName('男', '　');
      // 区切り（全角スペース）以外はカタカナ・長音符のみ。ひらがなを含まない
      expect(r.kana).not.toMatch(/[ぁ-ゖ]/);
      expect(r.kana.replace(/[\s　]/g, '')).toMatch(/^[ァ-ヶー]+$/);
    }
  });

  it('陽性対照: 不整合な氏名↔読みは検出して false', () => {
    // 辞書に存在しない組合せ（佐藤 + 別人の読み・カタカナ）
    expect(isConsistentName('佐藤 大翔', 'サトウ　レン')).toBe(false);
  });
});

// ── Task 4: 生年月日↔年齢 ────────────────────────────────────────────────────

describe('生年月日↔年齢', () => {
  const today = new Date(2026, 5, 27); // 2026-06-27（月は 0 始まり）

  it('生成した生年月日から再計算した年齢が age と一致する', () => {
    for (let i = 0; i < 300; i++) {
      const { date, age } = pickBirthday(20, 80, today);
      expect(age).toBeGreaterThanOrEqual(20);
      expect(age).toBeLessThanOrEqual(80);
      expect(computeAge(date, today)).toBe(age);
    }
  });

  it('formatBirthday は YYYY年MM月DD日 書式（ゼロ埋め）', () => {
    expect(formatBirthday(new Date(2001, 0, 5))).toBe('2001年01月05日');
  });

  it('陽性対照: age を 1 ずらした不整合は computeAge で検出', () => {
    const { date, age } = pickBirthday(30, 30, today);
    expect(computeAge(date, today)).not.toBe(age + 1);
  });
});

// ── Task 5: 住所↔郵便番号↔固定電話 ──────────────────────────────────────────

describe('住所↔郵便番号↔固定電話', () => {
  it('郵便番号・都道府県・市区町村・市外局番が辞書の同一エントリ由来', () => {
    for (let i = 0; i < 200; i++) {
      const a = pickAddress();
      const entry = ADDRESSES.find(
        (e) => `${e.zip.slice(0, 3)}-${e.zip.slice(3)}` === a.postalCode
      );
      expect(entry).toBeDefined();
      expect(a.address.startsWith(entry!.pref + entry!.city)).toBe(true);
      expect(a.phone.startsWith(entry!.areaCode + '-')).toBe(true);
    }
  });

  it('固定電話は 0 始まり・全体 10 桁（ハイフン除く）', () => {
    const a = pickAddress();
    const digits = a.phone.replace(/-/g, '');
    expect(digits).toMatch(/^0\d{9}$/);
  });

  it('陽性対照: 別エントリの郵便番号を差し替えると不整合になる', () => {
    const a = pickAddress();
    const other = ADDRESSES.find((e) => `${e.zip.slice(0, 3)}-${e.zip.slice(3)}` !== a.postalCode)!;
    const fakeZip = `${other.zip.slice(0, 3)}-${other.zip.slice(3)}`;
    const entry = ADDRESSES.find((e) => `${e.zip.slice(0, 3)}-${e.zip.slice(3)}` === fakeZip)!;
    expect(a.address.startsWith(entry.pref + entry.city)).toBe(false);
  });
});

// ── Task 6: 携帯番号・メール ──────────────────────────────────────────────────

describe('携帯電話番号（実在回避）', () => {
  it('生成番号は 0900/0700 始まり・11 桁・第4桁が 0', () => {
    for (let i = 0; i < 300; i++) {
      const m = pickMobile();
      const digits = m.replace(/-/g, '');
      expect(digits).toMatch(/^0\d{10}$/);
      expect(digits.length).toBe(11);
      expect(['090', '070']).toContain(digits.slice(0, 3));
      expect(digits[3]).toBe('0'); // C=0（音声携帯の割当対象外）
      expect(isNonExistentMobile(digits)).toBe(true);
    }
  });

  it('陽性対照: 割当済み帯は isNonExistentMobile で reject', () => {
    expect(isNonExistentMobile('08001234567')).toBe(false); // 0800 フリーダイヤル
    expect(isNonExistentMobile('06001234567')).toBe(false); // 0600 FMC
    expect(isNonExistentMobile('09012345678')).toBe(false); // C≠0 の実在音声携帯帯
    expect(isNonExistentMobile('08012345678')).toBe(false); // 080 実在帯
    expect(isNonExistentMobile('0900123456')).toBe(false); // 10 桁（桁数不正）
  });
});

describe('メールアドレス', () => {
  it('ローカル部はローマ字ベース・ドメインは example.* 予約ドメイン', () => {
    const e = pickEmail('sato', 'hiroto');
    expect(e).toMatch(/@example\.(com|jp|net|org)$/);
    expect(e.split('@')[0]).toContain('sato');
  });
});

// ── Task 7: generateRecord / generateRecords ──────────────────────────────────

describe('generateRecord / generateRecords', () => {
  const today = new Date(2026, 5, 27);

  it('全フィールドが埋まり整合する', () => {
    const r = generateRecord({ ageMin: 20, ageMax: 80, separator: '　' }, today);
    expect(isConsistentName(r.name, r.kana)).toBe(true);
    expect(r.gender).toMatch(/^(男|女|その他・不明)$/);
    expect(r.birthday).toMatch(/^\d{4}年\d{2}月\d{2}日$/);
    expect(r.age).toMatch(/^\d+$/);
    expect(r.postalCode).toMatch(/^\d{3}-\d{4}$/);
    expect(r.mobile.replace(/-/g, '')).toMatch(/^0\d{10}$/);
    expect(r.email).toContain('@example.');
  });

  it('指定件数を生成する', () => {
    expect(generateRecords(50, { ageMin: 20, ageMax: 80, separator: ' ' }, today)).toHaveLength(50);
  });
});

// ── Task 1: メール一意化ヘルパー ──────────────────────────────────────────────

describe('makeUniqueEmail（メール一意化）', () => {
  it('初出はそのまま、衝突時にローカル部へ連番付与', () => {
    const seen = new Set<string>();
    expect(makeUniqueEmail('sato.haruto@example.com', seen)).toBe('sato.haruto@example.com');
    expect(makeUniqueEmail('sato.haruto@example.com', seen)).toBe('sato.haruto1@example.com');
    expect(makeUniqueEmail('sato.haruto@example.com', seen)).toBe('sato.haruto2@example.com');
  });

  it('ドメインは保持しローカル部のみに連番を付ける', () => {
    const seen = new Set<string>();
    makeUniqueEmail('a@example.jp', seen);
    expect(makeUniqueEmail('a@example.jp', seen)).toBe('a1@example.jp');
  });
});

// ── Task 2: 再生成方式一意化ヘルパー ─────────────────────────────────────────

describe('regenPhoneKeepingAreaCode（固定電話の市外局番保持再生成）', () => {
  it('市外局番を保持し全体 10 桁・先頭 0 を維持', () => {
    for (let i = 0; i < 100; i++) {
      const out = regenPhoneKeepingAreaCode('03-1234-5678');
      expect(out.startsWith('03-')).toBe(true);
      const digits = out.replace(/-/g, '');
      expect(digits).toMatch(/^0\d{9}$/);
    }
    const out2 = regenPhoneKeepingAreaCode('0258-12-3456');
    expect(out2.startsWith('0258-')).toBe(true);
    expect(out2.replace(/-/g, '')).toMatch(/^0\d{9}$/);
  });
});

describe('makeUniqueByRegen（再生成方式の一意化）', () => {
  it('初出はそのまま、衝突時は generator で一意値を得る', () => {
    const seen = new Set<string>();
    let i = 0;
    const gen = () => `v${i++}`;
    expect(makeUniqueByRegen('orig', seen, gen, 1000)).toBe('orig');
    // 'orig' を再投入 → generator が呼ばれて 'v0'
    expect(makeUniqueByRegen('orig', seen, gen, 1000)).toBe('v0');
  });
});

// ── Task 3: generateRecords 一意化オプション ──────────────────────────────────

describe('generateRecords 一意化オプション', () => {
  const today = new Date(2026, 5, 27);
  const N = 3000;

  it('unique=true で email/phone/mobile が全件一意', () => {
    const recs = generateRecords(N, { ageMin: 20, ageMax: 80, separator: ' ', unique: true }, today);
    expect(new Set(recs.map((r) => r.email)).size).toBe(N);
    expect(new Set(recs.map((r) => r.phone)).size).toBe(N);
    expect(new Set(recs.map((r) => r.mobile)).size).toBe(N);
  });

  it('一意化後も固定電話が市外局番整合・10 桁、携帯が非実在帯を維持', () => {
    const recs = generateRecords(500, { ageMin: 20, ageMax: 80, separator: ' ', unique: true }, today);
    for (const r of recs) {
      expect(r.phone.replace(/-/g, '')).toMatch(/^0\d{9}$/);
      expect(isNonExistentMobile(r.mobile.replace(/-/g, ''))).toBe(true);
    }
  });

  it('陽性対照: unique=false では重複が発生する（テストの検出能力を担保）', () => {
    const recs = generateRecords(N, { ageMin: 20, ageMax: 80, separator: ' ', unique: false }, today);
    const emailUnique = new Set(recs.map((r) => r.email)).size === N;
    const nameUnique = new Set(recs.map((r) => r.name)).size === N;
    // 辞書規模 ≒1,200 に対し 3,000 件なので氏名は必ず重複する
    expect(nameUnique).toBe(false);
    // 一意化 OFF なら少なくとも氏名は重複（email も高確率で重複）
    expect(emailUnique && nameUnique).toBe(false);
  });
});
