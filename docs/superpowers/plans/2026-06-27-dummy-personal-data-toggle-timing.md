# ダミー個人データ生成: トグル反映タイミング統一 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dummy-personal-data` のトグルを「生成条件（要再生成）」と「出力の見せ方（即時反映）」の 2 セクションに分離し、生成後に生成条件が変わったら未反映インジケータを表示して、反映タイミングの不統一による誤解を解消する。

**Architecture:** 生成条件の決定論的署名を作る純関数 `generationSignature` を `generate.ts` に追加する。コンポーネントは生成時の署名を `lastGenSig` に保存し、現在の署名と一致しなければ stale（要再生成）と判定して `aria-live` 領域に `ChipLabel` の注意表示を出す。UI は 2 つの `<section>` に再編し、`unique` を生成条件側、`seqId` を出力の見せ方側へ移設する。生成ロジック・即時反映ロジックには手を入れない。

**Tech Stack:** React (TSX) / Astro / Vitest（ユニット）/ Playwright（E2E）/ Tailwind v4（semantic class のみ）

**対象 spec:** `docs/superpowers/specs/2026-06-27-dummy-personal-data-toggle-timing-design.md`

---

## File Structure

- `src/utils/dummy-personal-data/generate.ts` — **Modify**: `GenerationParams` 型と `generationSignature` 関数を追加（export）。既存ロジックは変更しない。
- `src/utils/dummy-personal-data/__tests__/generate.test.ts` — **Modify**: `generationSignature` の陽性／陰性対照テストを追記。
- `src/components/tools/DummyPersonalData.tsx` — **Modify**: 2 セクション再編・トグル移設・stale インジケータ追加（ファイル全体を書き直す）。
- `tests/e2e/dummy-personal-data.spec.ts` — **Modify**: stale インジケータの陽性／陰性対照とセクション見出しの E2E を追記。
- `SPEC.md` — **Modify**: 5.31 に UI セクション構成・stale 表示を追記。
- `docs/tools.md` — **Modify**: 該当ツールにトグルの即時反映／要再生成の区別と未反映表示を追記。
- `docs/decisions.md` — **Modify**: `[122]` として方針1+2 採用・方針3 不採用の理由を追記。

---

## Task 1: 生成条件署名の純関数を追加（TDD）

**Files:**

- Modify: `src/utils/dummy-personal-data/generate.ts`（末尾に追加）
- Test: `src/utils/dummy-personal-data/__tests__/generate.test.ts`（末尾に追加）

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/dummy-personal-data/__tests__/generate.test.ts` の import に `generationSignature` を追加する（既存の `from '@/utils/dummy-personal-data/generate'` の import リストへ 1 行加える）:

```ts
  uniquifyRecords,
  generationSignature,
} from '@/utils/dummy-personal-data/generate';
```

同ファイルの末尾に以下の describe を追加する:

```ts
// ── 生成条件署名（stale 検知用・issue #737） ──────────────────────────────────

describe('generationSignature', () => {
  const base = { count: 100, ageMin: 20, ageMax: 80, separator: ' ', unique: false };

  it('同一の生成条件なら同一署名を返す（誤検知しない＝陰性対照）', () => {
    expect(generationSignature({ ...base })).toBe(generationSignature({ ...base }));
  });

  it('生成条件のどのフィールドを変えても署名が変化する（検知能力＝陽性対照）', () => {
    const sig = generationSignature(base);
    expect(generationSignature({ ...base, count: 101 })).not.toBe(sig);
    expect(generationSignature({ ...base, ageMin: 21 })).not.toBe(sig);
    expect(generationSignature({ ...base, ageMax: 79 })).not.toBe(sig);
    expect(generationSignature({ ...base, separator: '　' })).not.toBe(sig);
    expect(generationSignature({ ...base, unique: true })).not.toBe(sig);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- generate`
Expected: FAIL（`generationSignature` が export されておらず import エラー、または未定義）

- [ ] **Step 3: 最小実装を書く**

`src/utils/dummy-personal-data/generate.ts` の末尾（`generateRecords` の後）に追加する:

```ts
/** stale 検知に使う生成条件。出力整形系（出力項目・連番列・出力形式）は含めない。 */
export interface GenerationParams {
  count: number;
  ageMin: number;
  ageMax: number;
  separator: string; // 氏名区切り（SEP_MAP 適用後の文字）
  unique: boolean;
}

/**
 * 生成結果に影響する生成条件のみから決定論的な署名を作る（issue #737）。
 * 「生成」押下後にこの署名が変化した場合、プレビューが生成条件と乖離している
 * （＝再生成が必要）ことを UI が検知するために使う。出力項目・連番列・出力形式は
 * 即時反映または出力時のみ作用するため署名に含めない。
 */
export function generationSignature(p: GenerationParams): string {
  return JSON.stringify([p.count, p.ageMin, p.ageMax, p.separator, p.unique]);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- generate`
Expected: PASS（追加した 2 ケースを含め全 green）

- [ ] **Step 5: 型チェック**

Run: `npx astro check --filter src/utils/dummy-personal-data/generate.ts` または `node_modules/.bin/astro check`
Expected: エラー 0

- [ ] **Step 6: コミット**

```bash
git add src/utils/dummy-personal-data/generate.ts src/utils/dummy-personal-data/__tests__/generate.test.ts
git commit -m "feat: 生成条件署名 generationSignature を追加（stale 検知用 #737）"
```

---

## Task 2: コンポーネントを 2 セクションに再編し stale インジケータを追加

**Files:**

- Modify: `src/components/tools/DummyPersonalData.tsx`（ファイル全体を書き直す）

> import 追加（`ChipLabel` / `generationSignature`）と JSX 構造変更を伴うため、CLAUDE.md 9.3 に従いファイル全体を書き直す。

- [ ] **Step 1: ファイル全体を以下で置き換える**

`src/components/tools/DummyPersonalData.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useClampedInput } from '@/hooks/useClampedInput';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { downloadText } from '@/utils/download';
import { generateRecords, generationSignature } from '@/utils/dummy-personal-data/generate';
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
  const [seqId, setSeqId] = useState(false);
  const [unique, setUnique] = useState(false);
  // 直近の「生成」時点の生成条件署名。null は未生成。
  const [lastGenSig, setLastGenSig] = useState<string | null>(null);

  const fields = FIELD_DEFS.filter((f) => selected.has(f.key)).map((f) => f.key);

  // 現在の生成条件署名。生成後にこれが lastGenSig と乖離したらプレビューは stale（要再生成）。
  const currentSig = generationSignature({
    count,
    ageMin,
    ageMax,
    separator: SEP_MAP[sep],
    unique,
  });
  const isStale = records.length > 0 && lastGenSig !== null && currentSig !== lastGenSig;

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
    setRecords(generateRecords(count, { ageMin: lo, ageMax: hi, separator: SEP_MAP[sep], unique }));
    setLastGenSig(generationSignature({ count, ageMin, ageMax, separator: SEP_MAP[sep], unique }));
  }, [count, ageMin, ageMax, sep, unique]);

  const download = useCallback(() => {
    if (records.length === 0) return;
    if (format === 'csv') {
      downloadText(toCsv(records, fields, seqId), 'dummy-personal-data.csv', 'text/csv');
    } else {
      downloadText(toJson(records, fields, seqId), 'dummy-personal-data.json', 'application/json');
    }
  }, [records, fields, format, seqId]);

  const preview = records.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-6">
      <NotificationBanner variant="warning" title="架空のテストデータです">
        生成される氏名・住所・電話番号・メールアドレスはすべて開発／検証用の架空データであり、実在の個人・連絡先ではありません。電話番号・携帯番号は形式的に生成したもので、実在を保証しません。
      </NotificationBanner>

      {/* 生成条件（変更後は「生成」を押すまでプレビューに反映されない） */}
      <section className="space-y-4">
        <div>
          <p className="body-emphasis text-default">生成条件</p>
          <p className="caption text-muted">
            変更したら「生成」を押し直すとプレビューに反映されます。
          </p>
        </div>

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

        {/* 一意化（要再生成） */}
        <ToggleChips<'unique'>
          legend="一意化"
          options={[{ value: 'unique', label: 'メール・電話番号を一意化' }]}
          selected={() => unique}
          onToggle={() => setUnique((p) => !p)}
        />
      </section>

      {/* 出力の見せ方（プレビューに即時反映・生成し直し不要） */}
      <section className="space-y-4">
        <div>
          <p className="body-emphasis text-default">出力の見せ方</p>
          <p className="caption text-muted">
            プレビューに即時反映されます（生成し直しは不要です）。
          </p>
        </div>

        {/* 出力項目 */}
        <ToggleChips<FieldKey>
          legend="出力する項目"
          options={FIELD_DEFS.map((f) => ({
            value: f.key,
            label: f.label,
            disabled: REQUIRED_FIELDS.includes(f.key),
            title: REQUIRED_FIELDS.includes(f.key) ? '氏名は常に出力されます' : undefined,
          }))}
          selected={(v) => selected.has(v)}
          onToggle={toggleField}
        />

        {/* 連番列（即時反映） */}
        <ToggleChips<'seqId'>
          legend="追加する列"
          options={[{ value: 'seqId', label: '連番ID列 (No.)' }]}
          selected={() => seqId}
          onToggle={() => setSeqId((p) => !p)}
        />
      </section>

      {/* 出力形式・操作 */}
      <div>
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
        {/* 未反映インジケータ。ライブ領域は常時 DOM に置き、内容挿入で SR が読み上げる。
            role="status" は付けない（既存プレビューの status と衝突して E2E が壊れるため）。 */}
        <div aria-live="polite" aria-atomic="true" className={isStale ? 'mt-2' : undefined}>
          {isStale && (
            <ChipLabel tone="info">生成条件が変更されました。再生成してください</ChipLabel>
          )}
        </div>
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
                  {seqId && (
                    <th
                      scope="col"
                      className="text-left px-3 py-2 border-b border-default whitespace-nowrap"
                    >
                      No.
                    </th>
                  )}
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
                    {seqId && (
                      <td className="px-3 py-2 border-b border-default whitespace-nowrap">
                        {i + 1}
                      </td>
                    )}
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

Run: `node_modules/.bin/astro check`
Expected: エラー 0（特に `ChipLabel` / `generationSignature` の import 解決と `ToggleChips<'unique'>` / `ToggleChips<'seqId'>` の型一致）

- [ ] **Step 3: ユニットテストが引き続き通ることを確認**

Run: `npm run test`
Expected: PASS（既存 + Task 1 追加分）

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/DummyPersonalData.tsx
git commit -m "feat: ダミー個人データ生成のトグルを生成条件/見せ方に分離し未反映表示を追加 (#737)"
```

---

## Task 3: E2E テストを追加（陽性／陰性対照）

**Files:**

- Modify: `tests/e2e/dummy-personal-data.spec.ts`（既存 describe 内の末尾に追加）

- [ ] **Step 1: E2E ケースを追加**

`tests/e2e/dummy-personal-data.spec.ts` の `test.describe('日本語ダミー個人データ生成', () => { ... })` の閉じ括弧の直前に、以下の 3 テストを追加する:

```ts
test('セクション見出し「生成条件」「出力の見せ方」が表示される', async ({ page }) => {
  await expect(page.getByText('生成条件', { exact: true })).toBeVisible();
  await expect(page.getByText('出力の見せ方', { exact: true })).toBeVisible();
});

test('生成条件を変更すると未反映インジケータが出て、再生成で消える', async ({ page }) => {
  await page.getByRole('button', { name: '生成' }).click();
  await expect(page.getByRole('status')).toContainText('生成しました');
  // 陰性対照: 生成直後は出ていない
  await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);

  // 陽性対照: 生成条件（人数）を変更すると出る
  const count = page.getByLabel('出力する人数');
  await count.fill('200');
  await count.blur();
  await expect(page.getByText('生成条件が変更されました。再生成してください')).toBeVisible();

  // 陰性対照: 再生成すると消える
  await page.getByRole('button', { name: '生成' }).click();
  await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
});

test('即時反映トグル（連番ID列）では未反映インジケータが出ない', async ({ page }) => {
  await page.getByRole('button', { name: '生成' }).click();
  await expect(page.getByRole('status')).toContainText('生成しました');
  // 出力の見せ方トグルは即時反映なので stale にならない
  await page.getByRole('button', { name: '連番ID列 (No.)' }).click();
  await expect(page.getByRole('columnheader', { name: 'No.' })).toBeVisible();
  await expect(page.getByText('生成条件が変更されました。再生成してください')).toHaveCount(0);
});
```

> 補足: `getByLabel('出力する人数')` は `<label htmlFor="dpd-count">出力する人数</label>` と紐づく。
> 既存テスト（`連番ID列 (No.)` トグル等）はセクション移設後もロケータ（role + name）が不変なため修正不要。

- [ ] **Step 2: ビルドして E2E を実行**

Run: `npm run test:e2e -- dummy-personal-data`
Expected: PASS（追加 3 ケース含む。preview 経由で build される）

> 失敗時の切り分け: インジケータが出ない場合は `isStale` 判定（`lastGenSig` 保存・`currentSig` 比較）を、
> 既存 status と衝突する場合は新インジケータに `role` が付いていないことを確認する。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/dummy-personal-data.spec.ts
git commit -m "test: 未反映インジケータの陽性/陰性対照 E2E を追加 (#737)"
```

---

## Task 4: ドキュメント更新（SPEC / tools / decisions）

**Files:**

- Modify: `SPEC.md`（5.31）
- Modify: `docs/tools.md`（日本語ダミー個人データ生成）
- Modify: `docs/decisions.md`（`[122]` 追記）

- [ ] **Step 1: SPEC.md 5.31 に UI 構成を追記**

`SPEC.md` の 5.31 内、「**シリアライズ（…）:**」の段落の直後に以下の段落を追加する:

```markdown
**UI 構成（反映タイミングの統一・issue #737）:** トグル類を 2 セクションに分離する。「生成条件」（出力する人数・年齢範囲・氏名の区切り・一意化）は変更しても「生成」を押し直すまでプレビューに反映されない。「出力の見せ方」（出力する項目・連番ID列）はプレビューに即時反映される。生成後に生成条件を変更すると、生成ボタン近傍の `aria-live` 領域に「生成条件が変更されました。再生成してください」を表示する（生成条件署名 `generationSignature` の一致判定で stale を検知）。
```

- [ ] **Step 2: docs/tools.md に追記**

`docs/tools.md` の「日本語ダミー個人データ生成」→「仕組み・アルゴリズム」の箇条書きの末尾（「**連番ID列**: …」の項目の直後）に以下を追加する:

```markdown
- **反映タイミングの統一**: トグルを「生成条件」（人数・年齢範囲・氏名区切り・一意化＝変更後に再生成が必要）と「出力の見せ方」（出力項目・連番ID列＝プレビューに即時反映）の 2 セクションに分離して表示する。生成後に生成条件を変更すると「生成条件が変更されました。再生成してください」の注意表示（`aria-live` でスクリーンリーダーへも通知）を生成ボタン近傍に出し、再生成で消える。一意化は件数全体に作用する破壊的処理のため即時反映ではなく生成条件側に置く。
```

- [ ] **Step 3: docs/decisions.md に [122] を追記**

`docs/decisions.md` の末尾（`## [121] …` セクションの後）に追加する:

```markdown
## [122] dummy-personal-data: トグル反映タイミングを「生成条件 / 出力の見せ方」のセクション分離 + 未反映表示で統一

issue #737（PR #736 レビュー由来）。`dummy-personal-data` は「生成」押下後、出力項目チップ・連番ID列が即時反映される一方、人数・年齢範囲・氏名区切り・一意化は再生成しないと反映されず、特に「出力オプション」グループ内で連番ID列（即時）と一意化（要再生成）が同居して「押せばその場で一意化される」と誤解させていた。

採用案は **方針1（セクション分離）+ 方針2（未反映インジケータ）の併用**。UI を「生成条件」（人数・年齢範囲・氏名区切り・一意化）と「出力の見せ方」（出力項目・連番ID列）の 2 セクションに分け、グループ境界＝反映タイミングの境界を一致させた。加えて生成条件署名 `generationSignature` を生成時に保存し、現在署名と乖離したら `aria-live` 領域に「生成条件が変更されました。再生成してください」を表示する（`ChipLabel tone="info"`）。

**方針3（一意化も即時反映）は不採用**。`uniquifyRecords` の即時流用は技術的には容易だが、一意化だけ即時化すると人数・年齢・区切りは依然「要再生成」のままで新たな不整合を生む。さらに一意化は生成件数全体に作用する破壊的処理で、プレビュー（先頭 20 件）だけに適用すると全体一意性と齟齬が出る。境界の明確化という本質的解決にならないため、構造分離（方針1）を優先した。

未反映インジケータは `role="status"` を付けず `aria-live="polite"` のみとした。プレビュー側の既存 `role="status"`（生成完了アナウンス）と status ロールが二重になると `getByRole('status')` 単数 strict の既存 E2E が壊れるため。検知能力は `generationSignature` の陽性対照ユニットテスト（各生成条件フィールドを変えると署名が変化）と E2E（条件変更で出現・再生成で消滅・即時反映トグルでは出ない）で担保する。
```

- [ ] **Step 4: 整形チェックと型チェック**

Run: `npm run format` && `npm run test`
Expected: 整形差分が反映され、ユニットテスト PASS

- [ ] **Step 5: コミット**

```bash
git add SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: トグル反映タイミング統一を SPEC/tools/decisions に反映 (#737)"
```

---

## Task 5: push 前最終検証

- [ ] **Step 1: 全チェックを実行**

Run（CLAUDE.md の push 前必須）:

```bash
npm run test
node_modules/.bin/astro check
npm run lint
npm run test:e2e -- dummy-personal-data
```

Expected: すべて PASS / エラー 0

- [ ] **Step 2: 差分の自己確認**

Run: `git diff origin/develop --name-only`
Expected: `generate.ts` / `generate.test.ts` / `DummyPersonalData.tsx` / `dummy-personal-data.spec.ts` / `SPEC.md` / `docs/tools.md` / `docs/decisions.md` / spec・plan ドキュメントのみ。`aria-` 削除行・無関係ファイルが無いこと。

- [ ] **Step 3: 完了報告**

実装はここまで。push・PR 作成・VRT baseline 手動トリガー案内は親（司令塔）が実施する。

---

## VRT について（PR 後の運用）

UI 再編・インジケータ追加で VRT baseline に差分が出る。`/tools/dummy-personal-data` は `tests/e2e/visual-regression-pages.ts` に登録済み。**web セッションのトークンでは `workflow_dispatch` 不可**のため、PR 後に `Update Visual Regression Baseline` workflow を GitHub Actions タブから対象 PR ブランチで手動トリガーする必要がある（`.claude/rules/github-web-session.md`）。
