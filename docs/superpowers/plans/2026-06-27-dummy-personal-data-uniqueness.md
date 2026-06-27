# ダミー個人データ生成 一意性オプション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dummy-personal-data` ツールに「連番ID列(No.)」と「メール・固定電話・携帯番号の一意化」オプションを追加する（issue #735）。

**Architecture:** 生成ロジック（`generate.ts`）に一意化の後処理を追加し、シリアライズ（`serialize.ts`）に連番列付与を追加。UI（`DummyPersonalData.tsx`）に既存 `ToggleChips` を再利用した独立 2 トグルを追加する。氏名・フリガナは辞書規模の制約から一意化対象外。

**Tech Stack:** TypeScript / React / Astro / Vitest / Playwright / papaparse

設計書: `docs/superpowers/specs/2026-06-27-dummy-personal-data-uniqueness-design.md`

---

## 事前確認（実装前に必ず読む）

- `.agents/rules/common.md`（コミットは日本語 Conventional Commits、push 前に `npm run test` / `astro check` / `npm run test:e2e`）
- `.agents/rules/ui-conventions.md`（Tailwind primitive 色禁止・既存 UI コンポーネント再利用・`type="button"`）
- 一意化はガード/検出機構に類するため **test-gates skill を呼び陽性対照を併設**すること

参照する既存ファイル:

- `src/utils/dummy-personal-data/generate.ts`（`pickMobile` / `randomDigits` / `pickAddress` 等）
- `src/utils/dummy-personal-data/serialize.ts`
- `src/utils/dummy-personal-data/types.ts`
- `src/components/tools/DummyPersonalData.tsx`
- `src/components/ui/ToggleChips.tsx`

---

## ファイル構成（変更マップ）

- Modify: `src/utils/dummy-personal-data/generate.ts` — `GenerateOptions.unique` 追加・一意化ヘルパー・`generateRecords` 後処理
- Modify: `src/utils/dummy-personal-data/serialize.ts` — `toCsv` / `toJson` に `withSeqId` 引数
- Modify: `src/components/tools/DummyPersonalData.tsx` — `seqId` / `unique` state・ToggleChips・プレビュー No. 列・生成/DL 連携
- Modify: `src/utils/dummy-personal-data/__tests__/generate.test.ts` — 一意化テスト（陽性対照込み）
- Modify: `src/utils/dummy-personal-data/__tests__/serialize.test.ts` — No. 列テスト
- Modify: `src/pages/tools/dummy-personal-data.astro` — 解説セクション追記
- Modify: `SPEC.md` / `docs/tools.md` / `docs/decisions.md` — ドキュメント更新
- Modify (任意): E2E（既存があれば）

---

## Task 1: メールアドレス一意化ヘルパー

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`generate.test.ts` に追記:

```ts
import { makeUniqueEmail } from '@/utils/dummy-personal-data/generate';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate.test.ts`
Expected: FAIL（`makeUniqueEmail` is not exported / not a function）

- [ ] **Step 3: 実装**

`generate.ts` に追記（`pickEmail` の近く）:

```ts
/**
 * メールアドレスを一意化する。初出はそのまま、衝突時はローカル部（@ の前）へ
 * 最小の整数サフィックスを付ける。付与後も衝突する場合はインクリメントして再試行。
 */
export function makeUniqueEmail(email: string, seen: Set<string>): string {
  if (!seen.has(email)) {
    seen.add(email);
    return email;
  }
  const atIdx = email.lastIndexOf('@');
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  let n = 1;
  let candidate = `${local}${n}${domain}`;
  while (seen.has(candidate)) {
    n++;
    candidate = `${local}${n}${domain}`;
  }
  seen.add(candidate);
  return candidate;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npm run test -- generate.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: ダミー個人データのメール一意化ヘルパーを追加"
```

---

## Task 2: 再生成方式の一意化ヘルパー（汎用 + 固定電話）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { makeUniqueByRegen, regenPhoneKeepingAreaCode } from '@/utils/dummy-personal-data/generate';

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
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate.test.ts`
Expected: FAIL（未 export）

- [ ] **Step 3: 実装**

`generate.ts` に追記:

```ts
/**
 * 値を再生成方式で一意化する。初出はそのまま、衝突時は generator() を
 * maxAttempts 回まで呼んで未出の値を採用する。枯渇時は元値を採用（現実的には起きない）。
 */
export function makeUniqueByRegen(
  value: string,
  seen: Set<string>,
  generator: () => string,
  maxAttempts: number
): string {
  if (!seen.has(value)) {
    seen.add(value);
    return value;
  }
  for (let i = 0; i < maxAttempts; i++) {
    const c = generator();
    if (!seen.has(c)) {
      seen.add(c);
      return c;
    }
  }
  return value; // 枯渇時フォールバック（重複容認）
}

/**
 * 固定電話を市外局番を保持したまま再生成する。文字列先頭の市外局番（最初の '-' まで）を
 * 取り出し、加入者番号（市内局番 + 末尾 4 桁）のみ作り直す。全体 10 桁を維持する。
 */
export function regenPhoneKeepingAreaCode(phone: string): string {
  const areaCode = phone.slice(0, phone.indexOf('-'));
  const subscriberLen = 10 - areaCode.length;
  const lastLen = 4;
  const middleLen = subscriberLen - lastLen;
  const middle = randomDigits(middleLen);
  const last = randomDigits(lastLen);
  return `${areaCode}-${middle}-${last}`;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npm run test -- generate.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: ダミー個人データの再生成方式一意化ヘルパーを追加"
```

---

## Task 3: `generateRecords` に一意化後処理を組み込む（陽性対照込み）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts:155-198`（`GenerateOptions` と `generateRecords`）
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`

> **test-gates 必須**: ここで `npx skill test-gates` 相当の方針に従い陽性対照を併設する。
> 一意化 OFF で重複が発生することを示し、テストの検出能力を担保する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('generateRecords 一意化オプション', () => {
  const today = new Date(2026, 5, 27);
  const N = 3000;

  it('unique=true で email/phone/mobile が全件一意', () => {
    const recs = generateRecords(
      N,
      { ageMin: 20, ageMax: 80, separator: ' ', unique: true },
      today
    );
    expect(new Set(recs.map((r) => r.email)).size).toBe(N);
    expect(new Set(recs.map((r) => r.phone)).size).toBe(N);
    expect(new Set(recs.map((r) => r.mobile)).size).toBe(N);
  });

  it('一意化後も固定電話が市外局番整合・10 桁、携帯が非実在帯を維持', () => {
    const recs = generateRecords(
      500,
      { ageMin: 20, ageMax: 80, separator: ' ', unique: true },
      today
    );
    for (const r of recs) {
      expect(r.phone.replace(/-/g, '')).toMatch(/^0\d{9}$/);
      expect(isNonExistentMobile(r.mobile.replace(/-/g, ''))).toBe(true);
    }
  });

  it('陽性対照: unique=false では重複が発生する（テストの検出能力を担保）', () => {
    const recs = generateRecords(
      N,
      { ageMin: 20, ageMax: 80, separator: ' ', unique: false },
      today
    );
    const emailUnique = new Set(recs.map((r) => r.email)).size === N;
    const nameUnique = new Set(recs.map((r) => r.name)).size === N;
    // 辞書規模 ≒1,200 に対し 3,000 件なので氏名は必ず重複する
    expect(nameUnique).toBe(false);
    // 一意化 OFF なら少なくとも氏名は重複（email も高確率で重複）
    expect(emailUnique && nameUnique).toBe(false);
  });
});
```

`isNonExistentMobile` は既存 import に含まれている前提（含まれていなければ import 行へ追加）。

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- generate.test.ts`
Expected: FAIL（`unique` プロパティが型エラー / 一意性 NG）

- [ ] **Step 3: 実装**

`generate.ts` の `GenerateOptions` を変更:

```ts
export interface GenerateOptions {
  ageMin: number;
  ageMax: number;
  separator: string; // 氏名区切り
  unique?: boolean; // メール・固定電話・携帯を一意化
}
```

`generateRecords` を変更:

```ts
/** count 件を生成（unique 時はメール・固定電話・携帯を一意化） */
export function generateRecords(
  count: number,
  opts: GenerateOptions,
  today: Date = new Date()
): PersonRecord[] {
  const out: PersonRecord[] = [];
  for (let i = 0; i < count; i++) out.push(generateRecord(opts, today));

  if (opts.unique) {
    const emails = new Set<string>();
    const phones = new Set<string>();
    const mobiles = new Set<string>();
    const MAX_ATTEMPTS = 1000;
    for (const r of out) {
      r.email = makeUniqueEmail(r.email, emails);
      r.phone = makeUniqueByRegen(
        r.phone,
        phones,
        () => regenPhoneKeepingAreaCode(r.phone),
        MAX_ATTEMPTS
      );
      r.mobile = makeUniqueByRegen(r.mobile, mobiles, pickMobile, MAX_ATTEMPTS);
    }
  }
  return out;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npm run test -- generate.test.ts`
Expected: PASS（陽性対照含む）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（または既存と同数）

- [ ] **Step 6: コミット**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: ダミー個人データ生成に一意化オプションを追加"
```

---

## Task 4: シリアライズに連番(No.)列を追加

**Files:**

- Modify: `src/utils/dummy-personal-data/serialize.ts`
- Test: `src/utils/dummy-personal-data/__tests__/serialize.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`serialize.test.ts` に追記:

```ts
describe('連番(No.)列', () => {
  it('toCsv: withSeqId=true で先頭に No. 列を付与', () => {
    const csv = toCsv([rec, rec], ['name'], true);
    const body = csv.slice(1); // BOM 除去
    const lines = body.split(/\r?\n/);
    expect(lines[0]).toBe('No.,氏名');
    expect(lines[1].startsWith('1,')).toBe(true);
    expect(lines[2].startsWith('2,')).toBe(true);
  });

  it('toCsv: withSeqId 省略時は No. 列なし（後方互換）', () => {
    const csv = toCsv([rec], ['name']);
    expect(csv.slice(1).split(/\r?\n/)[0]).toBe('氏名');
  });

  it('toJson: withSeqId=true で No. を数値として先頭キーに付与', () => {
    const json = toJson([rec, rec], ['name'], true);
    const parsed = JSON.parse(json);
    expect(parsed[0]['No.']).toBe(1);
    expect(parsed[1]['No.']).toBe(2);
    expect(Object.keys(parsed[0])[0]).toBe('No.');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm run test -- serialize.test.ts`
Expected: FAIL（引数未対応）

- [ ] **Step 3: 実装**

`serialize.ts` を変更（`SEQ_HEADER` 定数を導入し toCsv / toJson に `withSeqId`）:

```ts
const SEQ_HEADER = 'No.';

/** CSV 文字列（UTF-8 BOM 付き、CSV 数式インジェクション対策込み） */
export function toCsv(records: PersonRecord[], fields: FieldKey[], withSeqId = false): string {
  const labels = fields.map(labelOf);
  const columns = withSeqId ? [SEQ_HEADER, ...labels] : labels;
  const rows = project(records, fields).map((row, i) => {
    const o: Record<string, string | number | boolean | null> = {};
    if (withSeqId) o[SEQ_HEADER] = String(i + 1);
    for (const [k, v] of Object.entries(row)) o[k] = escapeCsvFormula(v);
    return o;
  });
  const csv = Papa.unparse(rows, { columns });
  return '﻿' + csv;
}

/** JSON 文字列（整形）。withSeqId 時は No. を数値で先頭キーに付与 */
export function toJson(records: PersonRecord[], fields: FieldKey[], withSeqId = false): string {
  const projected = project(records, fields);
  const out = withSeqId ? projected.map((row, i) => ({ [SEQ_HEADER]: i + 1, ...row })) : projected;
  return JSON.stringify(out, null, 2);
}
```

> 注: 既存の BOM は `'﻿'`（U+FEFF）で表現する。元コードの直書き BOM 文字も同じ。

- [ ] **Step 4: 成功を確認**

Run: `npm run test -- serialize.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/dummy-personal-data/serialize.ts src/utils/dummy-personal-data/__tests__/serialize.test.ts
git commit -m "feat: ダミー個人データ出力に連番(No.)列オプションを追加"
```

---

## Task 5: UI にトグルとプレビュー No. 列を追加

**Files:**

- Modify: `src/components/tools/DummyPersonalData.tsx`

- [ ] **Step 1: state とトグルを追加**

`DummyPersonalData.tsx` の state 群に追加（`records` 宣言の近く）:

```tsx
const [seqId, setSeqId] = useState(false);
const [unique, setUnique] = useState(false);
```

`generate` コールバックを変更（`unique` を渡す）:

```tsx
const generate = useCallback(() => {
  const lo = Math.min(ageMin, ageMax);
  const hi = Math.max(ageMin, ageMax);
  setRecords(generateRecords(count, { ageMin: lo, ageMax: hi, separator: SEP_MAP[sep], unique }));
}, [count, ageMin, ageMax, sep, unique]);
```

`download` コールバックを変更（`seqId` を渡す）:

```tsx
const download = useCallback(() => {
  if (records.length === 0) return;
  if (format === 'csv') {
    downloadText(toCsv(records, fields, seqId), 'dummy-personal-data.csv', 'text/csv');
  } else {
    downloadText(toJson(records, fields, seqId), 'dummy-personal-data.json', 'application/json');
  }
}, [records, fields, format, seqId]);
```

- [ ] **Step 2: ToggleChips を追加**

「氏名の区切り」ブロックの後（出力項目 ToggleChips の前後どちらか、出力項目の直後）に追加:

```tsx
{
  /* 出力オプション（連番列・一意化） */
}
<div>
  <ToggleChips<'seqId' | 'unique'>
    legend="出力オプション"
    options={[
      { value: 'seqId', label: '連番ID列 (No.)' },
      { value: 'unique', label: 'メール・電話番号を一意化' },
    ]}
    selected={(v) => (v === 'seqId' ? seqId : unique)}
    onToggle={(v) => (v === 'seqId' ? setSeqId((p) => !p) : setUnique((p) => !p))}
  />
</div>;
```

- [ ] **Step 3: プレビュー表に No. 列を追加**

`<thead>` の `<tr>` 内、`fields.map` の前に追加:

```tsx
{
  seqId && (
    <th scope="col" className="text-left px-3 py-2 border-b border-default whitespace-nowrap">
      No.
    </th>
  );
}
```

`<tbody>` の各行 `fields.map` の前に追加:

```tsx
{
  seqId && <td className="px-3 py-2 border-b border-default whitespace-nowrap">{i + 1}</td>;
}
```

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 5: lint**

Run: `npm run lint`
Expected: エラーなし（button type 漏れ等なし。ToggleChips 内部は対応済み）

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/DummyPersonalData.tsx
git commit -m "feat: ダミー個人データ UI に連番列・一意化トグルを追加"
```

---

## Task 6: Astro 解説セクションを更新

**Files:**

- Modify: `src/pages/tools/dummy-personal-data.astro`

- [ ] **Step 1: 解説を追記**

「整合性」見出しの後あたりに新見出しを追加:

```astro
<h3 class="mb-2 mt-4 tool-info-heading">一意性オプション・連番列</h3>
<p class="tool-info-body">
  「メール・電話番号を一意化」を有効にすると、メールアドレス（ローカル部に連番付与）・固定電話・携帯番号が生成件数内で重複しないように調整されます。氏名は辞書規模の都合上、一意化の対象外です。「連番ID列
  (No.)」を有効にすると、各レコードに 1 始まりの連番列が出力に付与されます。
</p>
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/pages/tools/dummy-personal-data.astro
git commit -m "docs: ダミー個人データの一意化・連番列の解説を追記"
```

---

## Task 7: ドキュメント更新（SPEC / tools / decisions）

**Files:**

- Modify: `SPEC.md`（5.31 節 1296 行付近）
- Modify: `docs/tools.md`（131 行付近）
- Modify: `docs/decisions.md`（末尾に新エントリ）

- [ ] **Step 1: SPEC.md 5.31 を更新**

`SPEC.md` の 5.31「生成ロジック」記述に、一意化オプション（メール=連番付与 / 固定電話=市外局番保持再生成 / 携帯=再生成 / 氏名は対象外）と連番(No.)列の出力オプションを 1〜2 文追記する。

- [ ] **Step 2: docs/tools.md を更新**

「日本語ダミー個人データ生成」節に「一意性オプション」「連番ID列」の仕組みを段落追記する（メールは連番付与・電話/携帯は再生成・氏名は辞書規模制約で対象外、を明記）。

- [ ] **Step 3: docs/decisions.md にエントリ追加**

末尾に追記:

```markdown
## [日本語ダミー個人データ生成] 一意化はメール連番付与・電話/携帯再生成・氏名は対象外

### 決定

一意化オプション（issue #735）で、メールはローカル部への連番付与、固定電話・携帯は再生成方式で重複回避する。氏名・フリガナは一意化の対象外とする。

### 理由

辞書規模が姓 30 × 名 40 ≒ 1,200 通りに対し最大 3,000 件生成できるため、氏名の完全一意化は原理的に不可能。メールは連番付与で必ず一意化でき、固定電話（市外局番を保持し加入者番号のみ再生成＝住所整合を維持）・携帯（非実在帯 090-0XXX を維持）は十分なエントロピーがあり再生成で実用上一意化できる。連番列は主キー用途のため JSON では数値で出力する。
```

- [ ] **Step 4: コミット**

```bash
git add SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: ダミー個人データ一意化オプションを各ドキュメントへ反映"
```

---

## Task 8: E2E に一意化・連番列ケースを追加

**Files:**

- Modify: `tests/e2e/dummy-personal-data.spec.ts`（既存あり）

- [ ] **Step 1: テストを追加**

`tests/e2e/dummy-personal-data.spec.ts` の `test.describe` 内に追記:

```ts
test('連番ID列トグルでプレビューに No. 列が出る', async ({ page }) => {
  await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
  await page.getByRole('button', { name: '生成' }).click();
  await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
});

test('一意化トグルでメールが重複しない', async ({ page }) => {
  await page.getByRole('button', { name: 'メール・電話番号を一意化' }).click();
  await page.getByRole('button', { name: '生成' }).click();
  await expect(page.getByRole('status')).toContainText('生成しました');
  // プレビュー（先頭 20 件）のメール列セルを集めて重複がないことを確認
  const cells = await page.getByRole('cell').filter({ hasText: '@example.' }).allInnerTexts();
  expect(cells.length).toBeGreaterThan(1);
  expect(new Set(cells).size).toBe(cells.length);
});
```

> 注: 既存テスト `項目 OFF でプレビュー列が消える` は `name: 'メールアドレス'` で field チップを押す。
> 新チップ名 `メール・電話番号を一意化` は `メールアドレス` を部分文字列に含まないため衝突しない（確認済み）。

- [ ] **Step 2: E2E 実行**

Run: `npm run test:e2e`
Expected: 追加ケース PASS（VRT の pixel 差分はチップ追加により発生し得る。baseline 更新は勧めず、構造/computed style 差分のみ確認し人手判断に委ねる）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/dummy-personal-data.spec.ts
git commit -m "test: ダミー個人データ一意化・連番列の E2E を追加"
```

---

## 完了前チェック（push 前必須）

- [ ] `npm run test`（全ユニット）PASS
- [ ] `node_modules/.bin/astro check` エラーなし
- [ ] `npm run lint` エラーなし
- [ ] `npm run build` 成功（任意だが推奨）
- [ ] `npm run test:e2e`（VRT pixel 差分はチップ追加由来。baseline 更新は人手判断に委ね、勝手に焼かない）

## 既知の運用注意

- UI チップ追加で `/tools/dummy-personal-data` の VRT baseline に差分が出る。**web セッションのトークンでは `workflow_dispatch` 不可**のため、PR 後に `Update Visual Regression Baseline` workflow を対象ブランチで手動トリガーする必要がある。
