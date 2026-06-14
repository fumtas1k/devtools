# har-viewer: HarLog.entries の型を null 要素対応に正す（issue #702）

## 背景

HAR の `entries` 配列は手編集・切り詰めにより `null` 要素を含みうる。runtime は既に防御済み:

- `sanitize.ts:286` の sanitize ループは `if (typeof entry !== 'object' || entry === null) continue;` で null をガード。
- `HarEntryList` は `e?.request` の optional chaining で null 要素を処理。
- PR #700 で `HarEntryDetail.Props.entry` を `HarEntry | null | undefined` に正した。

にもかかわらず中核型は `HarLog.entries: HarEntry[]`（非 null 配列）のまま残り、runtime の防御コードと型が食い違っている。issue #702 はこの型不整合の解消を求める。

## 方針

issue が提示した 2 案のうち **案1（中核型を正す）** を採用（owner 判断）。最も正確で、runtime ガードと型が一致する。代償としてテストの非 null アクセスに `!` 付与が必要だが機械的変更で挙動不変。

## 変更内容

### 1. 中核型

`src/utils/har/types.ts`:

```ts
export interface HarLog {
  version?: string;
  entries: (HarEntry | null)[]; // ← HarEntry[] から変更
  [key: string]: unknown;
}
```

### 2. 境界 prop 型

`src/components/tools/HarEntryList.tsx`:

```ts
interface Props {
  entries: (HarEntry | null)[]; // ← HarEntry[] から変更
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}
```

コンポーネント内部は既に `e?.request` / `e?.response` / `e?.time` で防御済みのため**ロジック変更なし**。

### 3. 消費側の追従

- `HarViewer.tsx:81` `result.har.log.entries[selectedIndex]` は `HarEntry | null` になり、`HarEntryDetail`（`HarEntry | null | undefined` 受け）にそのまま渡せる → **変更不要**。
- `HarViewer.tsx:155` `entries={result.har.log.entries}` は新 Props 型と一致 → **変更不要**。
- `harSanitizer.worker.ts:34` `parsed.log.entries.length` は配列の length なので影響なし → **変更不要**。
- `parse.ts` の検証ロジック（配列であることのみ確認）は影響なし → **変更不要**。

### 4. テストの追従（機械的）

`har.log.entries[0].request...` 形式の非 optional アクセスは `entries[0]` が `HarEntry | null` になり型エラーになる。`entries[0]!.request...` のように `!`（non-null assertion）を付与する。

- `src/utils/har/__tests__/sanitize.test.ts`: 約 38 箇所
- `src/utils/har/__tests__/parse.test.ts`: 1 箇所

これらは「`entries[0]` が存在する fixture を自分で構築している」テスト前提を `!` で明示するもので、挙動は不変。正確な箇所と件数は `astro check` の出力で確定する。

`HarEntryList.test.tsx` / `HarEntryDetail.test.tsx` は `entries: [...]` リテラルを component に渡す形であり、リテラル `HarEntry[]` は `(HarEntry | null)[]` に代入可能なため**影響なし**。

## 検証

- `node_modules/.bin/astro check`: 型エラーゼロ。
- `npm run test`: 全 green（挙動不変）。
- UI 変更なしのため VRT・目視確認は対象外。

## スコープ外

- rules / sanitize のロジック変更。
- `HarEntryDetail` のさらなる型変更（PR #700 で対応済み）。
- 新規ヘルパー（`firstEntry(har)` 等）の導入。テスト churn を `!` で吸収する方針のため不採用。
- `README.md` / `SPEC.md` 更新（ツール追加・挙動変更ではなく型の正確性のみ）。

## 補足

- 優先度: 低（runtime は防御済みでバグはない・型の正確性のみ）。
- 出典: PR #700 レビュー（owner）指摘2 の follow-up。
