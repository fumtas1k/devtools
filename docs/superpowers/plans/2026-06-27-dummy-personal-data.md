# 日本語ダミー個人データ生成 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日本語の架空個人データ（氏名＋整合フリガナ・性別・生年月日・年齢・郵便番号・住所・固定/携帯電話・メール）を指定件数生成し、CSV/JSON でダウンロードできるツール `dummy-personal-data` を追加する。

**Architecture:** ロジック（純関数）を `src/utils/dummy-personal-data/` に分離し、UI は `src/components/tools/DummyPersonalData.tsx`。生成は自前辞書＋`Math.random()`。CSV は既存 `papaparse` を再利用し UTF-8 BOM 付きで出力。整合性ロジック（氏名↔読み・生年月日↔年齢・住所↔郵便番号↔市外局番・実在しない携帯番号）には陽性対照ユニットテストを付ける。

**Tech Stack:** Astro + React (TSX) + TypeScript / Vitest / Playwright / papaparse（既存）。新規依存なし。

**設計参照:** `docs/superpowers/specs/2026-06-27-dummy-personal-data-design.md`

---

## ファイル構成

| ファイル                                                    | 責務                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/utils/dummy-personal-data/types.ts`                    | `PersonRecord` 型・項目キー/ラベル定義・辞書エントリ型                            |
| `src/utils/dummy-personal-data/dictionaries.ts`             | 姓/名（漢字・読み・ローマ字）、住所（郵便番号・都道府県・市区町村・市外局番）辞書 |
| `src/utils/dummy-personal-data/generate.ts`                 | 乱数ヘルパー・各フィールド生成・整合性ロジック・1 レコード生成・検証関数          |
| `src/utils/dummy-personal-data/serialize.ts`                | CSV(BOM)/JSON シリアライズ                                                        |
| `src/utils/dummy-personal-data/__tests__/generate.test.ts`  | 生成・整合性・携帯番号の検証（陽性対照含む）                                      |
| `src/utils/dummy-personal-data/__tests__/serialize.test.ts` | シリアライズ検証                                                                  |
| `src/components/tools/DummyPersonalData.tsx`                | React 本体                                                                        |
| `src/pages/tools/dummy-personal-data.astro`                 | ページ                                                                            |
| `src/data/tools.ts`                                         | ツールエントリ登録（modify）                                                      |
| `tests/e2e/visual-regression-pages.ts`                      | VRT 対象登録（modify）                                                            |
| `tests/e2e/dummy-personal-data.spec.ts`                     | E2E                                                                               |

> テストは vitest の `include: ['src/**/__tests__/**/*.test.{ts,tsx}']` に従い `src/utils/dummy-personal-data/__tests__/` に置く（colocation）。

---

## Task 1: 型定義

**Files:**

- Create: `src/utils/dummy-personal-data/types.ts`

- [ ] **Step 1: 型ファイルを作成**

```ts
/** 出力フィールドのキー */
export type FieldKey =
  | 'name'
  | 'kana'
  | 'gender'
  | 'birthday'
  | 'age'
  | 'postalCode'
  | 'address'
  | 'phone'
  | 'mobile'
  | 'email';

/** 1 人分の生成レコード（全フィールドを文字列で保持） */
export type PersonRecord = Record<FieldKey, string>;

/** UI のチェック・CSV ヘッダで使う日本語ラベル（表示順を兼ねる） */
export const FIELD_DEFS: { key: FieldKey; label: string }[] = [
  { key: 'name', label: '氏名' },
  { key: 'kana', label: 'フリガナ' },
  { key: 'gender', label: '性別' },
  { key: 'birthday', label: '生年月日' },
  { key: 'age', label: '年齢' },
  { key: 'postalCode', label: '郵便番号' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'mobile', label: '携帯電話番号' },
  { key: 'email', label: 'メールアドレス' },
];

/** 氏名は常に出力する（OFF 不可） */
export const REQUIRED_FIELDS: FieldKey[] = ['name'];

/** 性別の値 */
export type Gender = '男' | '女' | 'その他・不明';

/** 氏名辞書エントリ */
export interface NameEntry {
  kanji: string;
  yomi: string; // ひらがな
  romaji: string; // ヘボン式・小文字
}

/** 名（given name）は性別タグを持つ */
export interface GivenNameEntry extends NameEntry {
  gender: '男' | '女';
}

/** 住所辞書エントリ（郵便番号・都道府県・市区町村・固定電話の市外局番が整合） */
export interface AddressEntry {
  zip: string; // 7 桁ハイフンなし
  pref: string;
  city: string;
  areaCode: string; // 先頭 0 を含む（例 "03", "045", "0258"）
}
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter src/utils/dummy-personal-data/types.ts`
Expected: エラーなし（型のみのため 0 errors）。

- [ ] **Step 3: Commit**

```bash
git add src/utils/dummy-personal-data/types.ts
git commit -m "feat: ダミー個人データ生成の型定義を追加"
```

---

## Task 2: 辞書データ

**Files:**

- Create: `src/utils/dummy-personal-data/dictionaries.ts`

- [ ] **Step 1: 辞書ファイルを作成**

姓・名・住所の辞書。**各配列は下記を最小とし、これ以上の件数を入れること**（姓 ≥ 30 / 名（男）≥ 20 / 名（女）≥ 20 / 住所 ≥ 20、住所は都道府県が偏らないよう分散）。`romaji` はヘボン式・小文字・記号なし。住所の `zip` は実在に依存しないダミーで、`pref`/`city`/`areaCode` と矛盾しない範囲で設定する（郵便番号自体の実在性は問わない）。

```ts
import type { NameEntry, GivenNameEntry, AddressEntry } from './types';

/** 姓（漢字・読み・ローマ字）。最小 30 件、これ以上入れる */
export const SURNAMES: NameEntry[] = [
  { kanji: '佐藤', yomi: 'さとう', romaji: 'sato' },
  { kanji: '鈴木', yomi: 'すずき', romaji: 'suzuki' },
  { kanji: '高橋', yomi: 'たかはし', romaji: 'takahashi' },
  { kanji: '田中', yomi: 'たなか', romaji: 'tanaka' },
  { kanji: '伊藤', yomi: 'いとう', romaji: 'ito' },
  { kanji: '渡辺', yomi: 'わたなべ', romaji: 'watanabe' },
  { kanji: '山本', yomi: 'やまもと', romaji: 'yamamoto' },
  { kanji: '中村', yomi: 'なかむら', romaji: 'nakamura' },
  { kanji: '小林', yomi: 'こばやし', romaji: 'kobayashi' },
  { kanji: '加藤', yomi: 'かとう', romaji: 'kato' },
  { kanji: '吉田', yomi: 'よしだ', romaji: 'yoshida' },
  { kanji: '山田', yomi: 'やまだ', romaji: 'yamada' },
  { kanji: '佐々木', yomi: 'ささき', romaji: 'sasaki' },
  { kanji: '山口', yomi: 'やまぐち', romaji: 'yamaguchi' },
  { kanji: '松本', yomi: 'まつもと', romaji: 'matsumoto' },
  { kanji: '井上', yomi: 'いのうえ', romaji: 'inoue' },
  { kanji: '木村', yomi: 'きむら', romaji: 'kimura' },
  { kanji: '林', yomi: 'はやし', romaji: 'hayashi' },
  { kanji: '清水', yomi: 'しみず', romaji: 'shimizu' },
  { kanji: '山崎', yomi: 'やまざき', romaji: 'yamazaki' },
  { kanji: '中島', yomi: 'なかじま', romaji: 'nakajima' },
  { kanji: '池田', yomi: 'いけだ', romaji: 'ikeda' },
  { kanji: '阿部', yomi: 'あべ', romaji: 'abe' },
  { kanji: '橋本', yomi: 'はしもと', romaji: 'hashimoto' },
  { kanji: '山下', yomi: 'やました', romaji: 'yamashita' },
  { kanji: '森', yomi: 'もり', romaji: 'mori' },
  { kanji: '石川', yomi: 'いしかわ', romaji: 'ishikawa' },
  { kanji: '前田', yomi: 'まえだ', romaji: 'maeda' },
  { kanji: '藤田', yomi: 'ふじた', romaji: 'fujita' },
  { kanji: '小川', yomi: 'おがわ', romaji: 'ogawa' },
];

/** 名（性別タグ付き）。男女各 20 件以上入れる */
export const GIVEN_NAMES: GivenNameEntry[] = [
  { kanji: '大翔', yomi: 'ひろと', romaji: 'hiroto', gender: '男' },
  { kanji: '蓮', yomi: 'れん', romaji: 'ren', gender: '男' },
  { kanji: '陽翔', yomi: 'はると', romaji: 'haruto', gender: '男' },
  { kanji: '湊', yomi: 'みなと', romaji: 'minato', gender: '男' },
  { kanji: '悠真', yomi: 'ゆうま', romaji: 'yuma', gender: '男' },
  { kanji: '健太', yomi: 'けんた', romaji: 'kenta', gender: '男' },
  { kanji: '翔太', yomi: 'しょうた', romaji: 'shota', gender: '男' },
  { kanji: '拓海', yomi: 'たくみ', romaji: 'takumi', gender: '男' },
  { kanji: '大樹', yomi: 'だいき', romaji: 'daiki', gender: '男' },
  { kanji: '直樹', yomi: 'なおき', romaji: 'naoki', gender: '男' },
  { kanji: '誠', yomi: 'まこと', romaji: 'makoto', gender: '男' },
  { kanji: '亮', yomi: 'りょう', romaji: 'ryo', gender: '男' },
  { kanji: '優太', yomi: 'ゆうた', romaji: 'yuta', gender: '男' },
  { kanji: '隼人', yomi: 'はやと', romaji: 'hayato', gender: '男' },
  { kanji: '颯太', yomi: 'そうた', romaji: 'sota', gender: '男' },
  { kanji: '陸', yomi: 'りく', romaji: 'riku', gender: '男' },
  { kanji: '智也', yomi: 'ともや', romaji: 'tomoya', gender: '男' },
  { kanji: '達也', yomi: 'たつや', romaji: 'tatsuya', gender: '男' },
  { kanji: '雄大', yomi: 'ゆうだい', romaji: 'yudai', gender: '男' },
  { kanji: '和也', yomi: 'かずや', romaji: 'kazuya', gender: '男' },
  { kanji: '陽菜', yomi: 'ひな', romaji: 'hina', gender: '女' },
  { kanji: '結衣', yomi: 'ゆい', romaji: 'yui', gender: '女' },
  { kanji: '葵', yomi: 'あおい', romaji: 'aoi', gender: '女' },
  { kanji: '凜', yomi: 'りん', romaji: 'rin', gender: '女' },
  { kanji: '美咲', yomi: 'みさき', romaji: 'misaki', gender: '女' },
  { kanji: '愛', yomi: 'あい', romaji: 'ai', gender: '女' },
  { kanji: '彩花', yomi: 'あやか', romaji: 'ayaka', gender: '女' },
  { kanji: 'さくら', yomi: 'さくら', romaji: 'sakura', gender: '女' },
  { kanji: '七海', yomi: 'ななみ', romaji: 'nanami', gender: '女' },
  { kanji: '愛美', yomi: 'まなみ', romaji: 'manami', gender: '女' },
  { kanji: '優奈', yomi: 'ゆうな', romaji: 'yuna', gender: '女' },
  { kanji: '菜々子', yomi: 'ななこ', romaji: 'nanako', gender: '女' },
  { kanji: '麻衣', yomi: 'まい', romaji: 'mai', gender: '女' },
  { kanji: '美穂', yomi: 'みほ', romaji: 'miho', gender: '女' },
  { kanji: '里奈', yomi: 'りな', romaji: 'rina', gender: '女' },
  { kanji: '真由', yomi: 'まゆ', romaji: 'mayu', gender: '女' },
  { kanji: '千尋', yomi: 'ちひろ', romaji: 'chihiro', gender: '女' },
  { kanji: '春香', yomi: 'はるか', romaji: 'haruka', gender: '女' },
  { kanji: '由美', yomi: 'ゆみ', romaji: 'yumi', gender: '女' },
  { kanji: '香織', yomi: 'かおり', romaji: 'kaori', gender: '女' },
];

/** 住所辞書（zip・pref・city・areaCode が相互整合）。最小 20 件、都道府県を分散 */
export const ADDRESSES: AddressEntry[] = [
  { zip: '1000001', pref: '東京都', city: '千代田区千代田', areaCode: '03' },
  { zip: '1500043', pref: '東京都', city: '渋谷区道玄坂', areaCode: '03' },
  { zip: '1600022', pref: '東京都', city: '新宿区新宿', areaCode: '03' },
  { zip: '2200012', pref: '神奈川県', city: '横浜市西区みなとみらい', areaCode: '045' },
  { zip: '2310023', pref: '神奈川県', city: '横浜市中区山下町', areaCode: '045' },
  { zip: '5300001', pref: '大阪府', city: '大阪市北区梅田', areaCode: '06' },
  { zip: '5420076', pref: '大阪府', city: '大阪市中央区難波', areaCode: '06' },
  { zip: '4600008', pref: '愛知県', city: '名古屋市中区栄', areaCode: '052' },
  { zip: '0600042', pref: '北海道', city: '札幌市中央区大通西', areaCode: '011' },
  { zip: '9800021', pref: '宮城県', city: '仙台市青葉区中央', areaCode: '022' },
  { zip: '7300013', pref: '広島県', city: '広島市中区八丁堀', areaCode: '082' },
  { zip: '8100001', pref: '福岡県', city: '福岡市中央区天神', areaCode: '092' },
  { zip: '6008216', pref: '京都府', city: '京都市下京区東塩小路町', areaCode: '075' },
  { zip: '9200805', pref: '石川県', city: '金沢市彦三町', areaCode: '076' },
  { zip: '3300854', pref: '埼玉県', city: 'さいたま市大宮区桜木町', areaCode: '048' },
  { zip: '2600013', pref: '千葉県', city: '千葉市中央区中央', areaCode: '043' },
  { zip: '9500088', pref: '新潟県', city: '新潟市中央区万代', areaCode: '025' },
  { zip: '7000901', pref: '岡山県', city: '岡山市北区本町', areaCode: '086' },
  { zip: '8600811', pref: '熊本県', city: '熊本市中央区本荘', areaCode: '096' },
  { zip: '3800815', pref: '長野県', city: '長野市鶴賀', areaCode: '026' },
];
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter src/utils/dummy-personal-data/dictionaries.ts`
Expected: エラーなし。

- [ ] **Step 3: Commit**

```bash
git add src/utils/dummy-personal-data/dictionaries.ts
git commit -m "feat: ダミー個人データ生成の辞書データを追加"
```

---

## Task 3: 乱数ヘルパー・氏名/性別生成（TDD）

**Files:**

- Create: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { pickName, isConsistentName } from '@/utils/dummy-personal-data/generate';
import { SURNAMES, GIVEN_NAMES } from '@/utils/dummy-personal-data/dictionaries';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate`
Expected: FAIL（`pickName` / `isConsistentName` が未定義）。

- [ ] **Step 3: 最小実装**

```ts
import { SURNAMES, GIVEN_NAMES, ADDRESSES } from './dictionaries';
import type { Gender, PersonRecord, FieldKey } from './types';

/** 配列から 1 要素をランダム選択 */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** min〜max（両端含む）の整数乱数 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 任意桁のランダム数字文字列 */
export function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(randomInt(0, 9));
  return s;
}

export interface PickedName {
  name: string; // 漢字（区切り適用済み）
  kana: string; // 読み（同じ区切り適用済み）
  surnameRomaji: string;
  givenRomaji: string;
}

/** 性別に応じた氏名を生成。separator は姓名の区切り（'' / ' ' / '　'） */
export function pickName(gender: Gender, separator: string): PickedName {
  const sei = pickRandom(SURNAMES);
  // その他・不明は男女どちらの名でも可
  const pool =
    gender === 'その他・不明' ? GIVEN_NAMES : GIVEN_NAMES.filter((g) => g.gender === gender);
  const mei = pickRandom(pool);
  return {
    name: `${sei.kanji}${separator}${mei.kanji}`,
    kana: `${sei.yomi}${separator}${mei.yomi}`,
    surnameRomaji: sei.romaji,
    givenRomaji: mei.romaji,
  };
}

/**
 * 氏名（漢字）と読みが辞書のペアと整合するか検証する（テスト用ガード）。
 * 区切り文字（半角/全角スペース）を除去してから、姓・名それぞれが
 * 同一辞書エントリのペアであることを確認する。
 */
export function isConsistentName(name: string, kana: string): boolean {
  const stripSep = (s: string) => s.replace(/[\s　]/g, '');
  const n = stripSep(name);
  const k = stripSep(kana);
  for (const sei of SURNAMES) {
    if (!n.startsWith(sei.kanji) || !k.startsWith(sei.yomi)) continue;
    const restN = n.slice(sei.kanji.length);
    const restK = k.slice(sei.yomi.length);
    if (GIVEN_NAMES.some((mei) => mei.kanji === restN && mei.yomi === restK)) return true;
  }
  return false;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- generate`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 氏名・読みの整合生成と検証を実装"
```

---

## Task 4: 生年月日↔年齢の整合（TDD）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`（追記）

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { computeAge, pickBirthday, formatBirthday } from '@/utils/dummy-personal-data/generate';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate`
Expected: FAIL（未定義関数）。

- [ ] **Step 3: 実装を追記**

```ts
/** birth 時点から today 時点の満年齢を計算 */
export function computeAge(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * [ageMin, ageMax] の年齢を持つ生年月日を生成する。
 * 「today - age 年」を基準日とし、そこから 0〜364 日さかのぼることで、
 * 次の誕生日に到達しない範囲（＝満年齢が age のまま）の日付を作る。
 */
export function pickBirthday(
  ageMin: number,
  ageMax: number,
  today: Date
): { date: Date; age: number } {
  const age = randomInt(ageMin, ageMax);
  const base = new Date(today.getFullYear() - age, today.getMonth(), today.getDate());
  const daysBack = randomInt(0, 364);
  const date = new Date(base.getTime() - daysBack * 86400000);
  return { date, age: computeAge(date, today) };
}

/** YYYY年MM月DD日 書式（月日ゼロ埋め） */
export function formatBirthday(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}年${mm}月${dd}日`;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- generate`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 生年月日と年齢の整合生成を実装"
```

---

## Task 5: 住所↔郵便番号↔固定電話の整合（TDD）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`（追記）

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { pickAddress } from '@/utils/dummy-personal-data/generate';
import { ADDRESSES } from '@/utils/dummy-personal-data/dictionaries';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate`
Expected: FAIL（`pickAddress` 未定義）。

- [ ] **Step 3: 実装を追記**

```ts
export interface PickedAddress {
  postalCode: string; // NNN-NNNN
  address: string;
  phone: string; // 固定電話
}

/** 住所・郵便番号・固定電話を整合させて生成 */
export function pickAddress(): PickedAddress {
  const e = pickRandom(ADDRESSES);
  const postalCode = `${e.zip.slice(0, 3)}-${e.zip.slice(3)}`;
  const address = `${e.pref}${e.city}${randomInt(1, 5)}丁目${randomInt(1, 20)}-${randomInt(1, 30)}`;
  // 固定電話: 全体 10 桁（先頭 0 含む）。末尾 4 桁を加入者番号、市外局番との
  // 残り桁を市内局番として 3 分割（areaCode-middle-last）。
  const subscriberLen = 10 - e.areaCode.length; // 例 03→8, 045→7, 0258→6
  const lastLen = 4;
  const middleLen = subscriberLen - lastLen;
  const middle = randomDigits(middleLen);
  const last = randomDigits(lastLen);
  const phone = `${e.areaCode}-${middle}-${last}`;
  return { postalCode, address, phone };
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- generate`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 住所・郵便番号・固定電話の整合生成を実装"
```

---

## Task 6: 実在しない携帯番号・メール（TDD）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`（追記）

> 根拠（spec 参照）: 総務省「電気通信番号の種別」では音声携帯は `0X0CDEFGHJK` で「C は 0 を除く」。よって第 4 桁 C=0（`0900` / `0700`）は音声携帯の割当対象外＝実在しない確度が高い。`0800`（フリーダイヤル）・`0600`（FMC電話番号 `0600DEFGHJK`）は割当済みのため除外する。

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { pickMobile, isNonExistentMobile, pickEmail } from '@/utils/dummy-personal-data/generate';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate`
Expected: FAIL（未定義関数）。

- [ ] **Step 3: 実装を追記**

```ts
/** 実在しない確度の高い携帯番号を生成（090-0XXX-XXXX / 070-0XXX-XXXX） */
export function pickMobile(): string {
  const prefix = pickRandom(['090', '070']);
  const rest = '0' + randomDigits(7); // 第4桁を 0 固定（音声携帯の割当対象外）
  return `${prefix}-${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/**
 * 携帯番号が「実在しない確度の高い帯」かを検証する（テスト用ガード）。
 * 条件: 11 桁・先頭 090 または 070・第 4 桁が 0。
 * 0800（フリーダイヤル）/ 0600（FMC）/ C≠0 の実在音声携帯帯は false。
 */
export function isNonExistentMobile(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const prefix = digits.slice(0, 3);
  if (prefix !== '090' && prefix !== '070') return false;
  return digits[3] === '0';
}

const EMAIL_DOMAINS = ['example.com', 'example.jp', 'example.net', 'example.org'];

/** ローマ字姓名からメールアドレスを生成（example.* 予約ドメイン） */
export function pickEmail(surnameRomaji: string, givenRomaji: string): string {
  const seps = ['.', '_', ''];
  const local = `${surnameRomaji}${pickRandom(seps)}${givenRomaji}${pickRandom(['', String(randomInt(1, 99))])}`;
  return `${local}@${pickRandom(EMAIL_DOMAINS)}`;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- generate`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 実在しない携帯番号とメールアドレスの生成を実装"
```

---

## Task 7: レコード生成（全フィールド結合, TDD）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`（追記）

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { generateRecord, generateRecords } from '@/utils/dummy-personal-data/generate';
import { isConsistentName as _consistent } from '@/utils/dummy-personal-data/generate';

describe('generateRecord / generateRecords', () => {
  const today = new Date(2026, 5, 27);

  it('全フィールドが埋まり整合する', () => {
    const r = generateRecord({ ageMin: 20, ageMax: 80, separator: '　' }, today);
    expect(_consistent(r.name, r.kana)).toBe(true);
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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装を追記**

```ts
export interface GenerateOptions {
  ageMin: number;
  ageMax: number;
  separator: string; // 氏名区切り
}

/** 性別を確率的に決定（男/女 ≒ 各 49%、その他・不明 ≒ 2%） */
function pickGender(): Gender {
  const r = Math.random();
  if (r < 0.49) return '男';
  if (r < 0.98) return '女';
  return 'その他・不明';
}

/** 1 レコード生成 */
export function generateRecord(opts: GenerateOptions, today: Date = new Date()): PersonRecord {
  const gender = pickGender();
  const nm = pickName(gender, opts.separator);
  const bd = pickBirthday(opts.ageMin, opts.ageMax, today);
  const addr = pickAddress();
  return {
    name: nm.name,
    kana: nm.kana,
    gender,
    birthday: formatBirthday(bd.date),
    age: String(bd.age),
    postalCode: addr.postalCode,
    address: addr.address,
    phone: addr.phone,
    mobile: pickMobile(),
    email: pickEmail(nm.surnameRomaji, nm.givenRomaji),
  };
}

/** count 件を生成 */
export function generateRecords(
  count: number,
  opts: GenerateOptions,
  today: Date = new Date()
): PersonRecord[] {
  const out: PersonRecord[] = [];
  for (let i = 0; i < count; i++) out.push(generateRecord(opts, today));
  return out;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- generate`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 全フィールドのレコード生成を実装"
```

---

## Task 8: シリアライズ（CSV BOM / JSON, TDD）

**Files:**

- Create: `src/utils/dummy-personal-data/serialize.ts`
- Test: `src/utils/dummy-personal-data/__tests__/serialize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { toCsv, toJson } from '@/utils/dummy-personal-data/serialize';
import type { PersonRecord, FieldKey } from '@/utils/dummy-personal-data/types';

const rec: PersonRecord = {
  name: '佐藤 大翔',
  kana: 'さとう はると',
  gender: '男',
  birthday: '2000年01月02日',
  age: '26',
  postalCode: '100-0001',
  address: '東京都千代田区千代田1丁目2-3',
  phone: '03-1234-5678',
  mobile: '090-0123-4567',
  email: 'sato.haruto@example.com',
};

describe('toCsv', () => {
  it('BOM 付き・選択フィールドのみをヘッダ＋行で出力', () => {
    const fields: FieldKey[] = ['name', 'age'];
    const csv = toCsv([rec], fields);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const body = csv.slice(1);
    expect(body.split(/\r?\n/)[0]).toBe('氏名,年齢');
    expect(body).toContain('佐藤 大翔');
    expect(body).not.toContain('さとう'); // kana は非選択
  });
});

describe('toJson', () => {
  it('選択フィールドのみのオブジェクト配列を JSON 文字列化', () => {
    const json = toJson([rec], ['name', 'email']);
    const parsed = JSON.parse(json);
    expect(parsed[0]).toEqual({ 氏名: '佐藤 大翔', メールアドレス: 'sato.haruto@example.com' });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- serialize`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装**

```ts
import Papa from 'papaparse';
import { escapeCsvFormula } from '@/utils/json-csv';
import { FIELD_DEFS } from './types';
import type { PersonRecord, FieldKey } from './types';

/** key → 日本語ラベル */
function labelOf(key: FieldKey): string {
  return FIELD_DEFS.find((f) => f.key === key)!.label;
}

/** 選択フィールドのみを {ラベル: 値} へ射影 */
function project(records: PersonRecord[], fields: FieldKey[]): Record<string, string>[] {
  return records.map((r) => {
    const o: Record<string, string> = {};
    for (const k of fields) o[labelOf(k)] = r[k];
    return o;
  });
}

/** CSV 文字列（UTF-8 BOM 付き、CSV 数式インジェクション対策込み） */
export function toCsv(records: PersonRecord[], fields: FieldKey[]): string {
  const rows = project(records, fields).map((row) => {
    const o: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(row)) o[k] = escapeCsvFormula(v);
    return o;
  });
  const csv = Papa.unparse(rows, { columns: fields.map(labelOf) });
  return '﻿' + csv;
}

/** JSON 文字列（整形） */
export function toJson(records: PersonRecord[], fields: FieldKey[]): string {
  return JSON.stringify(project(records, fields), null, 2);
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `npm run test -- serialize`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/dummy-personal-data/serialize.ts src/utils/dummy-personal-data/__tests__/serialize.test.ts
git commit -m "feat: ダミー個人データの CSV/JSON シリアライズを実装"
```

---

## Task 9: React コンポーネント

**Files:**

- Create: `src/components/tools/DummyPersonalData.tsx`

> 共通 UI（`InputField` 風の数値入力は `DummyText` の `<input type="number">` パターンを踏襲）・`ToggleGroup`・`ToggleChips`・`DownloadButton`・`NotificationBanner` を使用。色は semantic class / token utility 経由のみ（primitive scale 直書き禁止、`@layer components` 手書き class への variant prefix 禁止）。

- [ ] **Step 1: コンポーネントを作成**

```tsx
import { useState, useCallback } from 'react';
import { useClampedInput } from '@/hooks/useClampedInput';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { downloadText } from '@/utils/download';
import { generateRecords } from '@/utils/dummy-personal-data/generate';
import { toCsv, toJson } from '@/utils/dummy-personal-data/serialize';
import { FIELD_DEFS, REQUIRED_FIELDS } from '@/utils/dummy-personal-data/types';
import type { FieldKey, PersonRecord } from '@/utils/dummy-personal-data/types';

const PREVIEW_LIMIT = 20;
const MAX_COUNT = 3000;

type SepValue = 'half' | 'full' | 'none';
const SEP_MAP: Record<SepValue, string> = { half: ' ', full: '　', none: '' };

type Format = 'csv' | 'json';

export function DummyPersonalDataTool() {
  const {
    value: count,
    inputStr: countInput,
    handleChange: onCount,
    handleBlur: onCountBlur,
  } = useClampedInput(100, 1, MAX_COUNT);
  const {
    value: ageMin,
    inputStr: ageMinInput,
    handleChange: onAgeMin,
    handleBlur: onAgeMinBlur,
  } = useClampedInput(20, 0, 120);
  const {
    value: ageMax,
    inputStr: ageMaxInput,
    handleChange: onAgeMax,
    handleBlur: onAgeMaxBlur,
  } = useClampedInput(80, 0, 120);
  const [sep, setSep] = useState<SepValue>('half');
  const [format, setFormat] = useState<Format>('csv');
  const [selected, setSelected] = useState<Set<FieldKey>>(
    () => new Set(FIELD_DEFS.map((f) => f.key))
  );
  const [records, setRecords] = useState<PersonRecord[]>([]);

  const fields = FIELD_DEFS.filter((f) => selected.has(f.key)).map((f) => f.key);

  const toggleField = useCallback((key: FieldKey) => {
    if (REQUIRED_FIELDS.includes(key)) return; // 氏名は常時 ON
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const generate = useCallback(() => {
    const lo = Math.min(ageMin, ageMax);
    const hi = Math.max(ageMin, ageMax);
    setRecords(generateRecords(count, { ageMin: lo, ageMax: hi, separator: SEP_MAP[sep] }));
  }, [count, ageMin, ageMax, sep]);

  const download = useCallback(() => {
    if (records.length === 0) return;
    if (format === 'csv') {
      downloadText(toCsv(records, fields), 'dummy-personal-data.csv', 'text/csv');
    } else {
      downloadText(toJson(records, fields), 'dummy-personal-data.json', 'application/json');
    }
  }, [records, fields, format]);

  const preview = records.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-6">
      <NotificationBanner variant="warning" title="架空のテストデータです">
        生成される氏名・住所・電話番号・メールアドレスはすべて開発／検証用の架空データであり、実在の個人・連絡先ではありません。電話番号・携帯番号は形式的に生成したもので、実在を保証しません。
      </NotificationBanner>

      {/* 出力件数・年齢範囲 */}
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div>
          <label htmlFor="dpd-count" className="body-emphasis text-default block mb-1">
            出力する人数
          </label>
          <input
            id="dpd-count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={countInput}
            onChange={(e) => onCount(e.target.value)}
            onBlur={onCountBlur}
            className="rounded-lg px-3 py-2 caption w-32 border border-input bg-default text-default"
          />
          <p className="caption text-muted mt-1">1〜{MAX_COUNT}人</p>
        </div>
        <div>
          <p className="body-emphasis text-default mb-1">年齢範囲</p>
          <div className="flex items-center gap-2">
            <input
              id="dpd-age-min"
              aria-label="年齢下限"
              type="number"
              min={0}
              max={120}
              value={ageMinInput}
              onChange={(e) => onAgeMin(e.target.value)}
              onBlur={onAgeMinBlur}
              className="rounded-lg px-3 py-2 caption w-20 border border-input bg-default text-default"
            />
            <span className="caption text-muted">歳 〜</span>
            <input
              id="dpd-age-max"
              aria-label="年齢上限"
              type="number"
              min={0}
              max={120}
              value={ageMaxInput}
              onChange={(e) => onAgeMax(e.target.value)}
              onBlur={onAgeMaxBlur}
              className="rounded-lg px-3 py-2 caption w-20 border border-input bg-default text-default"
            />
            <span className="caption text-muted">歳</span>
          </div>
        </div>
      </div>

      {/* 氏名区切り */}
      <div>
        <p className="body-emphasis text-default mb-1">氏名の区切り</p>
        <ToggleGroup<SepValue>
          options={[
            { value: 'half', label: '半角スペース' },
            { value: 'full', label: '全角スペース' },
            { value: 'none', label: 'なし' },
          ]}
          value={sep}
          onChange={setSep}
          ariaLabel="氏名の区切り"
        />
      </div>

      {/* 出力項目 */}
      <div>
        <ToggleChips<FieldKey>
          legend="出力する項目"
          options={FIELD_DEFS.map((f) => ({
            value: f.key,
            label: f.label,
            title: REQUIRED_FIELDS.includes(f.key) ? '氏名は常に出力されます' : undefined,
          }))}
          selected={(v) => selected.has(v)}
          onToggle={toggleField}
        />
      </div>

      {/* 出力形式・操作 */}
      <div className="flex flex-wrap items-center gap-4">
        <ToggleGroup<Format>
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'json', label: 'JSON' },
          ]}
          value={format}
          onChange={setFormat}
          ariaLabel="出力形式"
        />
        <ActionButton variant="primary" onClick={generate}>
          生成
        </ActionButton>
        <DownloadButton
          onClick={download}
          label="ダウンロード"
          variant="secondary"
          disabled={records.length === 0}
        />
      </div>

      {/* プレビュー */}
      {records.length > 0 && (
        <div className="rounded-lg border border-default overflow-hidden">
          <span role="status" aria-live="polite" className="sr-only">
            {`${records.length}件のダミー個人データを生成しました`}
          </span>
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-subtle border-b border-default">
            <span className="body-emphasis text-default">
              {records.length} 件（先頭 {Math.min(PREVIEW_LIMIT, records.length)} 件を表示）
            </span>
          </div>
          <div className="overflow-x-auto bg-default">
            <table className="w-full caption text-default border-collapse">
              <thead>
                <tr className="bg-subtle">
                  {fields.map((k) => (
                    <th
                      key={k}
                      scope="col"
                      className="text-left px-3 py-2 border-b border-default whitespace-nowrap"
                    >
                      {FIELD_DEFS.find((f) => f.key === k)!.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    {fields.map((k) => (
                      <td key={k} className="px-3 py-2 border-b border-default whitespace-nowrap">
                        {r[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter src/components/tools/DummyPersonalData.tsx`
Expected: エラーなし。`ToggleGroup` / `DownloadButton` / `NotificationBanner` の props が一致すること（不一致なら各コンポーネントの実シグネチャに合わせて修正）。

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS（`<button>` に `type` 必須ルールを満たすこと）。

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/DummyPersonalData.tsx
git commit -m "feat: ダミー個人データ生成の UI コンポーネントを追加"
```

---

## Task 10: ページ・ツール登録・VRT 登録

**Files:**

- Create: `src/pages/tools/dummy-personal-data.astro`
- Modify: `src/data/tools.ts`
- Modify: `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: ツールエントリを `src/data/tools.ts` の `toolEntries` 配列末尾に追加**

```ts
  {
    slug: 'dummy-personal-data',
    name: '日本語ダミー個人データ生成',
    description:
      '日本人の氏名（漢字＋フリガナ整合）・住所・電話番号・生年月日などの架空個人データを一括生成し CSV/JSON で出力します',
    category: 'generate',
    yomi: 'にほんごだみーこじんでーたせいせい',
  },
```

- [ ] **Step 2: ページを作成**

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { DummyPersonalDataTool } from '@/components/tools/DummyPersonalData';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'dummy-personal-data')!;
---

<ToolLayout tool={tool}>
  <DummyPersonalDataTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      日本人の氏名（漢字とフリガナを整合させて生成）・性別・生年月日・年齢・郵便番号・住所・電話番号・携帯番号・メールアドレスの架空データを、指定した件数だけ生成します。生成・ダウンロードはすべてブラウザ内で完結します。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">整合性</h3>
    <p class="tool-info-body">
      氏名の漢字と読み、生年月日と年齢、住所・郵便番号・固定電話の市外局番は、それぞれ矛盾しないよう整合させて生成します。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">携帯電話番号の扱い</h3>
    <p class="tool-info-body">
      携帯番号は、実在の番号に当たらない確度を高めるため <code>090-0XXX-XXXX</code> /
      <code>070-0XXX-XXXX</code>（第 4 桁が
      0）の形式で生成します。総務省の電気通信番号の種別では音声携帯番号の第 4 桁に 0
      が割り当てられないためです。
    </p>

    <h3 class="mb-2 mt-4 tool-info-heading">制限</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>生成されるデータはすべて架空であり、実在の個人・連絡先ではありません</li>
      <li>出力は CSV（UTF-8 BOM 付き）と JSON です。Excel 形式には非対応です</li>
      <li>クレジットカード番号・マイナンバー・血液型・会社名は対象外です</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: VRT 対象に追加** — `tests/e2e/visual-regression-pages.ts` の `PAGES` 配列末尾（`'/tools/contrast-matrix',` の次）に追加

```ts
  '/tools/dummy-personal-data',
```

- [ ] **Step 4: 型チェック・meta テスト**

Run: `npx astro check && npm run test -- vrt-pages-coverage`
Expected: 型エラーなし。`tests/meta/vrt-pages-coverage.test.ts` が PASS（slug と PAGES が整合）。

- [ ] **Step 5: Commit**

```bash
git add src/pages/tools/dummy-personal-data.astro src/data/tools.ts tests/e2e/visual-regression-pages.ts
git commit -m "feat: ダミー個人データ生成ツールのページを追加しVRT登録"
```

---

## Task 11: E2E テスト

**Files:**

- Create: `tests/e2e/dummy-personal-data.spec.ts`

> 既存 spec（例 `tests/e2e/dummy-text.spec.ts` があれば）を参照し、`getByRole` / `getByLabel` ベースで書く。属性セレクタ禁止。

- [ ] **Step 1: E2E を作成**

```ts
import { test, expect } from '@playwright/test';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
  });

  test('生成するとプレビュー表が表示される', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('status')).toContainText('生成しました');
    // ヘッダに氏名列
    await expect(page.getByRole('columnheader', { name: '氏名' })).toBeVisible();
    // 先頭行が存在
    const rows = page.getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test('項目 OFF でプレビュー列が消える', async ({ page }) => {
    await page.getByRole('button', { name: '生成' }).click();
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toBeVisible();
    await page.getByRole('button', { name: 'メールアドレス' }).click(); // ToggleChips OFF
    await expect(page.getByRole('columnheader', { name: 'メールアドレス' })).toHaveCount(0);
  });

  test('生成前はダウンロードが無効', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダウンロード' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: E2E を実行**

Run: `npm run test:e2e -- dummy-personal-data`
Expected: 3 ケース PASS。失敗時はロケータ名（実 UI のアクセシブルネーム）に合わせて調整。

> 注: 項目 OFF テストで、ToggleChips の `メールアドレス` ボタンとプレビュー列ヘッダの両方が同名 `メールアドレス` でロール衝突する場合は、ボタンは `getByRole('button', { name: 'メールアドレス' })`、ヘッダは `getByRole('columnheader', { name: 'メールアドレス' })` でロール指定して区別する（上記コードは指定済み）。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dummy-personal-data.spec.ts
git commit -m "test: ダミー個人データ生成の E2E を追加"
```

---

## Task 12: ドキュメント更新

**Files:**

- Modify: `README.md`, `SPEC.md`, `docs/tools.md`, `docs/decisions.md`, `docs/tool-candidates.md`

- [ ] **Step 1: 各ドキュメントを更新**

- `README.md`: ツール一覧に「日本語ダミー個人データ生成」を追加（既存の generate カテゴリ記載に倣う）。
- `SPEC.md`: 2.3（新規ライブラリなし＝papaparse 既存を明記）/ 2.4 ディレクトリ（`src/utils/dummy-personal-data/`）/ 4 / 5 章のツール一覧 / 9 章チェックリストを更新。
- `docs/tools.md`: 「日本語ダミー個人データ生成」の節を追加。仕組み（自前辞書＋乱数）・整合性ロジック・携帯番号の実在回避方針（総務省「Cは0を除く」根拠）・制限（Excel 非対応・クレカ/マイナンバー対象外）を記載。
- `docs/decisions.md`: 決定を追記 — (1) faker 不採用＝バンドル過大のため自前辞書、(2) 携帯番号 `0900`/`0700`（C=0）採用＝総務省の番号種別で音声携帯は「Cは0を除く」、`0600`=FMC・`0800`=フリーダイヤルは割当済みのため除外、(3) Excel 非対応＝`xlsx`/`exceljs` のバンドル増回避、CSV を UTF-8 BOM 付きで Excel 互換。
- `docs/tool-candidates.md`: B2-18 の「状態」列に ✅ ＋ PR 番号（PR 作成後に記載）。

- [ ] **Step 2: ドキュメント整合 meta テスト**

Run: `npm run test -- meta`
Expected: PASS（README/SPEC とツール定義の整合チェックがあれば緑）。

- [ ] **Step 3: Commit**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md docs/tool-candidates.md
git commit -m "docs: ダミー個人データ生成ツールの追加に伴うドキュメント更新"
```

---

## 最終検証（push 前必須）

- [ ] `npm run test`（ユニット）→ 全 PASS
- [ ] `node_modules/.bin/astro check`（型）→ 0 errors
- [ ] `npm run lint` → PASS
- [ ] `npm run test:e2e -- dummy-personal-data` → PASS
- [ ] `npm run format:check` → PASS（崩れていれば `npm run format`）
- [ ] PC(1280x800)/スマホ(390x844) で目視（プレビュー表の横スクロール・ボタン崩れ・フォーカスリング）

## PR 後の手動作業（web セッションのトークン制約）

- VRT baseline 生成は CI の `Update Visual Regression Baseline` workflow を **PR ブランチ指定で手動 `workflow_dispatch`**（web セッションのトークンに `actions: write` 無し）。ユーザーに依頼する。

---

## Self-Review チェック結果

- **Spec coverage**: コア9項目（氏名/フリガナ/性別/生年月日/年齢/郵便番号/住所/固定電話/携帯/メール）→ Task 3〜7。CSV/JSON＋BOM → Task 8。プレビュー＋項目選択＋注意書き → Task 9。携帯 0900/0700 方針 → Task 6（陽性対照あり）。VRT 登録 → Task 10。E2E → Task 11。ドキュメント → Task 12。ギャップなし。
- **Placeholder scan**: 辞書件数は「最小 N 件・これ以上」と下限を明示（データ部のみ列挙省略、ロジックは全て実コード）。その他プレースホルダなし。
- **Type consistency**: `PersonRecord`/`FieldKey`/`Gender`/`AddressEntry`/`GenerateOptions`、関数名（`pickName`/`isConsistentName`/`pickBirthday`/`computeAge`/`formatBirthday`/`pickAddress`/`pickMobile`/`isNonExistentMobile`/`pickEmail`/`generateRecord`/`generateRecords`/`toCsv`/`toJson`）はタスク間で一貫。
