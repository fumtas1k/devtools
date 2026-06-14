# har-viewer: 壊れた entry の描画ガード 設計 (issue #681)

## 背景・問題

`HarEntryList` は各 entry を `e.request.method` / `e.request.url` / `e.response.status` で**直接参照**している。一方 `parseHar` は `log.entries` が配列であることのみを検証し、各 entry の形状は検証しない。`sanitizeHar` は壊れた entry（`{}` や `null`、`request`/`response` 欠落）を**防御的にスキップしつつ配列に残す**（`sanitize.test.ts` の「壊れた entry でも例外を投げない」が length 3 保持を確認）。

このため、`request` / `response` を欠く entry を含む HAR を読み込むと、sanitize は通っても**一覧描画時に `TypeError`（`undefined` の `.method` 参照等）で落ち**、React island がクラッシュして画面が空になりうる。`HarEntryDetail` も `const { request, response } = entry` 後に `request.method` / `response.status` を参照するため同様にクラッシュしうる。

**原因**: `sanitize` 側は防御的だが `list` / `detail` 側が無防備、という非対称。既存挙動（PR #675 由来、PR #680 のレビューで指摘・スコープ外分離）。

## 目的

壊れた entry を含む HAR を読み込んでも描画がクラッシュせず、ユーザに「壊れた entry が存在する」ことを透過的に示す。

## スコープ外

- `parseHar` / `sanitizeHar` のスキーマ検証強化（sanitize 側は既に防御的で、本 issue は描画側の非対称を解消するもの）。
- 壊れた entry の自動修復・除去（出力 HAR は入力同様 entry を保持する）。
- ページング・仮想化等のパフォーマンス改善。

## 設計

### 1. `HarEntryList` のガード（プレースホルダ行で表示）

各 entry のフィールドを直接参照せず、optional chaining + フォールバックで描画する。entry は配列にそのまま残し、**行は欠落させない**（サマリの `entryCount` と表示行数を一致させ、インデックスのズレも防ぐ）。

- `method`: `entry?.request?.method ?? '—'`
- `URL` 列: `entry?.request?.url` が string のときのみクリック可能な `<button>`（`onSelect(i)`）を描画する。欠落時は非クリックの `<span className="text-muted">（壊れたエントリ）</span>` を描画し、選択不可にする。
- `status`: `entry?.response?.status ?? '—'`
- `size`: `formatSize(entry?.response?.content?.size ?? entry?.response?.bodySize)`（`formatSize` は `undefined` を `'-'` に変換済み）
- `time`: `formatTime(entry?.time)`（既存挙動を維持）

インデックス `i` は**配列の絶対位置のまま**維持する（`HarViewer` が `result.har.log.entries[selectedIndex]` で逆引きするため）。行のスキップ・フィルタはしない。

### 2. `HarEntryDetail` のガード（プレースホルダ表示）

`entry?.request` / `entry?.response` のどちらかが非オブジェクト（`null` / `undefined`）の場合、クラッシュせずプレースホルダを表示する:

```
このエントリは request / response を欠くため詳細を表示できません。
```

`HarViewer` の自動選択（読み込み時に先頭 index=0 を選択）が壊れた entry に当たるケースでも安全になる。request/response が揃っている通常 entry は従来どおり詳細を描画する。`NameValueTable` は既に `if (!rows || rows.length === 0) return null` でガード済みのため、`headers` 等の配列欠落は追加対応不要。

### 3. 共通判定

「entry が描画可能か」の判定は `entry?.request` / `entry?.response` が**非 null のオブジェクトか**で行う。list / detail それぞれにローカルに optional chaining で実装し、新規ユーティリティは増やさない（2 箇所のみで小さく、過度な抽象化を避ける）。

## エラーハンドリング

描画はクラッシュしない（throw しない）。壊れた entry は視覚的にプレースホルダで明示し、ユーザが「データ欠落がある」と認識できる。出力 HAR（コピー / ダウンロード）は入力同様 entry を保持する（情報を失わない）。

## テスト（陽性対照を含む）

本 issue は「描画クラッシュ防止」というリグレッション防止が主目的のため、`test-gates` skill の方針に従い**壊れた entry を含む入力で throw せず描画完了することを assert する陽性対照**を必須とする。

### ユニット（component test, jsdom）

`src/components/tools/__tests__/HarEntryList.test.tsx` を新規追加:

- 壊れた entry（`{}` / `null` / `{ request: {...}, response 欠落 }`）を含む `entries` で `render` しても throw しない。
- 正常 entry の `method` / URL が描画される。
- 壊れた entry 行のプレースホルダ（`—` / 「壊れたエントリ」）が描画される。
- 壊れた entry 行の URL はクリック可能な button を描画しない（選択不可）。
- **陰性対照との区別**: ガードを外すと（直接参照に戻すと）render が throw して fail することで、検知能力があることを担保する。

`src/components/tools/__tests__/HarEntryDetail.test.tsx` を新規追加:

- `request` / `response` 欠落 entry で `render` しても throw せず、プレースホルダ文言を表示する。
- 正常 entry では従来どおり method/url/status を表示する。

### E2E

`tests/e2e/har-viewer.spec.ts` にケース追加:

- 2 件目に `request`/`response` を欠く entry を持つ HAR をアップロード → 画面がクラッシュせず、1 件目の正常 entry が描画され、壊れた行のプレースホルダが見える（陽性対照: 壊れた入力で throw せず描画完了）。

## 影響ファイル

- `src/components/tools/HarEntryList.tsx`（ガード追加）
- `src/components/tools/HarEntryDetail.tsx`（ガード追加）
- `src/components/tools/__tests__/HarEntryList.test.tsx`（新規）
- `src/components/tools/__tests__/HarEntryDetail.test.tsx`（新規）
- `tests/e2e/har-viewer.spec.ts`（ケース追加）

ツール追加・slug 変更・ライブラリ追加はないため `README.md` / `SPEC.md` の更新は不要。`docs/decisions.md` は描画ガードという小さな防御実装のため記録対象外（設計上の重要決断ではない）。
