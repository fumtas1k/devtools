# JSON 整形・ビューア: ツリー展開ボタンの再配置 設計

- 日付: 2026-06-20
- 対象: `src/components/tools/JsonFormatter.tsx` / `src/components/tools/JsonTreeResult.tsx`
- 種別: UI 改善（バグ修正寄り）

## 背景・課題

JSON 整形・ビューアのツリー表示時、`全展開` / `全折りたたみ` ボタンが画面上部のオプション行（インデント・モード・表示切替トグルと同じ行）に置かれている。実際の操作対象である結果ツリーは画面下部にあり、ボタンとツリーが視覚的に離れているため操作しづらい。

現状は「入力欄と結果欄の単一行ヘッダ（`min-h-8`）の上端を揃える（がたつき防止）」目的で、ツリー操作をヘッダではなく上部オプション行に逃がしていた（`JsonFormatter.tsx:197-199` のコメント）。本設計はこの制約を満たしたまま、ボタンを結果の隣へ移す。

## ゴール

- `全展開` / `全折りたたみ` を結果パネルのヘッダ内、`結果` ラベルの右隣（左寄せ）に配置する。
- PC・スマホ両方でデザイン崩れ（はみ出し・上端ずれ）を起こさない。
- 文言は現状維持（`全展開` / `全折りたたみ`）。

## 非ゴール（スコープ外）

- ボタンの文言・アイコンの刷新。
- ツリーの展開/折りたたみロジックそのものの変更。
- text / mask / type 表示の結果ヘッダ（`OutputField`）の変更。

## 設計

### 状態とハンドラの所有

`treeOpen` / `treeKey` 状態と `expandAll` / `collapseAll` ハンドラは引き続き `JsonFormatter` が保持する（ツリー再マウントキーを所有しているため）。`JsonTreeResult` へは props として渡す。

### `JsonTreeResult` の props 追加

```ts
/** 全展開ハンドラ。ツリーが描画されているときヘッダに「全展開」ボタンを出す。 */
onExpandAll?: () => void;
/** 全折りたたみハンドラ。同上で「全折りたたみ」ボタンを出す。 */
onCollapseAll?: () => void;
```

### ヘッダのレイアウト

`JsonTreeResult` のヘッダ（現 `JsonTreeResult.tsx:55-63`）を次の構造にする:

```
[結果  全展開 全折りたたみ] .......... [ダウンロード コピー]
```

- 左: `<div className="flex items-center gap-3">` で `結果` ラベルとボタン群をまとめる。
- ボタン群は `tree`（非 null）かつ `onExpandAll` / `onCollapseAll` がある時のみ描画。`tooLarge` 時・無効 JSON 時は出さない（現状の `view==='tree' && hasResult && !treeTooLarge` と等価。`tree` が非 null なら描画対象が存在する）。
- 右: 現状どおり `rightSlot` + `CopyButton`。
- 外側コンテナは `flex items-center justify-between mb-3 min-h-8 gap-2` を踏襲しつつ、スマホ安全網として `flex-wrap gap-y-2` を付与。
- ボタンの class は現状踏襲: `caption text-link-plain btn-link-plain`。

### デザイン崩れの検証根拠

- **PC (md+)**: 結果パネルは入力/結果行（`flex md:flex-row`）の約半幅。左右4要素は十分収まり折り返さない。`min-h-8` 単一行を保ち、入力欄ヘッダとの上端揃え（既存コメントの懸念）を維持する。
- **スマホ (390px)**: 入力/結果行は `flex-col` で縦積みになるため、入力↔結果の上端揃え制約自体が消える。ヘッダが万一折り返しても破綻しないよう `flex-wrap gap-y-2` を安全網として付与。
- **VRT**: ページ既定は text 表示で、両ボタンは text 表示では元々非表示。よって既定スクショは不変の見込み（実装時に Playwright で確認）。

### `JsonFormatter` 側の変更

- 上部オプション行のボタンブロック（`JsonFormatter.tsx:255-272`）を削除。
- `JsonTreeResult` 呼び出しに `onExpandAll={expandAll}` / `onCollapseAll={collapseAll}` を追加。
- `JsonFormatter.tsx:197-199` のコメントを新配置に合わせて修正（「ヘッダではなく上部オプション行に置く」→「ツリー操作は結果ヘッダ内に置く」）。

## ドキュメント・テストへの影響

- `docs/tools.md` / `docs/decisions.md` に配置を明記した記述があれば整合を確認・更新する。
- E2E（`tests/e2e/json-formatter.spec.ts` / `json-formatter-tree-virtual.spec.ts`）は `getByRole('button', { name: '全展開' })` 等で参照しており、DOM 位置変更では壊れない見込み。実装後 `npm run test` / `node_modules/.bin/astro check` / `npm run test:e2e` で確認する。

## 検証計画（push 前必須）

1. `node_modules/.bin/astro check`（型）
2. `npm run test`（ユニット）
3. `npm run test:e2e`（E2E）
4. Playwright で PC (1280x800) / スマホ (390x844) のツリー表示スクショを撮り、はみ出し・上端ずれ・タップ領域を目視確認。
