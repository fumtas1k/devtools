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

  it('陽性対照: 不整合な氏名↔読みは検出して false', () => {
    // 辞書に存在しない組合せ（佐藤 + 別人の読み）
    expect(isConsistentName('佐藤 大翔', 'さとう　れん')).toBe(false);
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
