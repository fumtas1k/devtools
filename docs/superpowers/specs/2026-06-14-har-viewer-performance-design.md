# har-viewer パフォーマンス改善（issue #677）設計

## 背景・問題

`har-viewer` は UI / docs で「最大 25MB」と表示しているが、実測 7.8MB の HAR を読み込むとタブが固まり画面が白くなる（user 報告）。キャップ値が実態の処理能力と乖離し、表示が誤解を招いている。

### root-cause（コード調査による切り分け）

| 処理                                                 | 場所                                  | 問題                                                                                         |
| ---------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| 全エントリを `<tr>` で描画（仮想化・ページングなし） | `HarEntryList.tsx` `entries.map(...)` | **最有力**。中規模 HAR は数千エントリ → 数千行の DOM → レイアウト/ペイントでタブ凍結・白画面 |
| `sanitizeHar` がレンダリング中に同期実行             | `HarViewer.tsx` `useMemo`             | deep clone + 全エントリ走査。トグルのたびに全件再実行                                        |
| `JSON.stringify(.., null, 2)` を毎レンダリングで生成 | `HarViewer.tsx` `outputJson`          | コピー/DL しなくても毎回インデント付きで全体直列化                                           |

バイト数は破綻の指標として不適切（「少数の巨大ボディ」と「大量の小エントリ」で挙動が全く違う）。白画面の主因は DOM ノード数と同期処理。

## スコープ

本 PR で対応する:

1. **リスト描画のページング化**（`HarEntryList`）— 白画面の主因対策
2. **`outputJson` の遅延生成** — copy/DL 押下時のみ `JSON.stringify`
3. **`MAX_BYTES` と UI/docs 文言の見直し** — 実測ベンチに基づく cap 再設定 + 誤解表記の解消

スコープ外（別 issue 化する）:

- sanitize の **Web Worker 化 / 差分 sanitize**（redact トグル時の全件再 scrub 抑制）。元々 docs に将来課題として記載済み。本 PR ではページングで白画面（描画起因）を解消し、sanitize の非同期化は分離する。

## 設計

### 1. リスト描画のページング化（`HarEntryList`）

`HarEntryList` に内部ページング状態を持たせ、現在ページ分のみ `<tr>` を描画する。

- **ページサイズ**: 100 件/ページ（定数 `PAGE_SIZE = 100`）。100 行程度の DOM はレイアウト/ペイントで凍結しない。
- **グローバル index 変換**: 行の `onSelect` は `pageStart + localIndex`（全 entries に対する index）を返す。親 `HarViewer` の `selectedIndex` は全 entries に対する index のままで整合する。`sanitizeHar` は順序・件数を保存するため変換は単純加算で成立する。選択ハイライトは `selectedIndex === globalIndex` で判定。
- **ページャ UI**: `totalPages > 1` のときのみ表示。
  - 「前へ」「次へ」ボタン（`type="button"` 必須。lint `react/button-has-type` 対象）。境界で `disabled`。
  - 「{page+1} / {totalPages} ページ（全 {entries.length} 件）」表示。
  - 色は `src/styles/global.css` `@layer components` の既存意味クラス / 既存ボタンパターンに準拠（primitive scale 直書き禁止）。disabled の hover 無効化は `:not(:disabled)` パターン。
- **ページリセット方針**:
  - 新規ファイル読込時のみ page 0 に戻す。redact トグル時はページを保持（トグルで毎回 1 ページ目に戻る UX を避ける）。
  - 実装: 親 `HarViewer` に `loadCount` state を追加し `loadText` 成功時に increment。`<HarEntryList key={loadCount} ... />` で新規読込時のみ remount → 内部 page state が 0 にリセットされる。redact トグルは `loadCount` 不変 → ページ保持。
  - redact トグルで `entries` は新しい配列（sanitize の clone）になるが順序・件数は不変のため、保持中のページ・選択ハイライトはそのまま正しい。

### 2. `outputJson` の遅延生成

毎レンダリングで数 MB を `JSON.stringify(.., null, 2)` する `useMemo` を廃止し、copy/DL 押下時のみ生成する。

- **`DownloadButton`**: 既に `onClick` を受け取るため、`onClick` 内で `JSON.stringify` してから `downloadText` する（自然に遅延）。
- **`CopyButton`**: 現状 `text: string` を受け取る。`text` の型を **`string | (() => string)`** に拡張する（後方互換: 既存の string 呼び出しはそのまま動作）。クリック時に `typeof text === 'function' ? text() : text` で評価する。`HarViewer` からは `text={() => JSON.stringify(sanitized.har, null, 2)}` を渡す。
- `sanitized` の `useMemo` 自体は残す（sanitize 結果はリスト/詳細/件数表示に必要。トグルでの再計算は本 PR スコープ外＝別 issue）。

### 3. `MAX_BYTES` / 文言の見直し

ページング後の同期処理の律速は `sanitizeHar`（`structuredClone` + 全 response body の `scrubText`）。

- **実測ベンチ**（実装着手時に実施）: 合成 HAR（〜8MB / 〜25MB、エントリ数とボディサイズの2パターン）を生成し、`parseHar` / `sanitizeHar` / `JSON.stringify` の各所要時間を Node 上で計測する。「まず計測 → 主因確定」（issue 記載）の履行。
- **cap 決定**: 同期 sanitize が許容範囲（目安として最悪ケースで概ね 2 秒以内）に収まるバイト数を `MAX_BYTES` に設定する。ベンチ結果次第:
  - 25MB の sanitize が許容範囲なら、白画面の主因（DOM）はページングで解消済みのため `MAX_BYTES` は据え置き可。その場合も「最大 25MB」がスムーズ動作を含意しないよう文言を正す。
  - 許容範囲を超えるなら cap を下げる。
- **文言更新**（誤解表記の解消）:
  - `HarViewer.tsx` のファイル入力エリア注記。
  - `har-viewer.astro` の「制限事項」。
  - ハードキャップの事実に加え「大きな HAR は redact 切替時の処理に時間がかかることがある」と期待値を正す。
- バイト数キャップは「破綻指標として不適切」だが、過大ファイルのメモリ防御ガードとして残す（撤廃はしない）。

## テスト

- **ユニット**: `CopyButton` の `getText` 遅延パス（`text` に関数を渡すとクリック時に評価される）を `src/components/ui/__tests__/` に追加。
- **E2E**（UI 挙動変更のため実装と同時に追加）: 100 件超の HAR を読み込み → ページャの「次へ」操作 → 2 ページ目の entry を選択 → 詳細パネル表示、を検証。ロケーターは `getByRole` / `getByText` を使用。
- **VRT**: 既存 baseline はファイル未読込の空状態を撮影するため変化なし（ページャは出ない）。baseline 再生成不要。

## ドキュメント更新

- `har-viewer.astro` 制限事項（文言）。
- 必要に応じて `docs/tools.md` の har-viewer 節（ページング・遅延生成の挙動）。
- 設計判断（バイト cap をメモリ防御として残す理由 / sanitize 非同期化の分離）を `docs/decisions.md` に追記。

## リスク・留意

- `CopyButton` は共有コンポーネント。`text` 型拡張は後方互換だが、ユニットテストで遅延パスを担保する。
- `key={loadSeq}` による remount は内部 state リセットが目的。`HarEntryList` は副作用を持たない純表示コンポーネントのため remount コストは軽微。

## 追記（2026-06-14・実装中の設計修正）

この設計は当初「白画面の主因は DOM 描画（最有力）」という issue の root-cause 推定（**実プロファイル未実施**）に基づき、ページング + 遅延生成 + cap 見直しをスコープとし、sanitize 非同期化を別 issue へ分離していた。

**実装着手後の user 実機検証で、主因は同期 sanitize であることが判明した**: まず `sanitizeHar` がメインスレッドを数秒〜十数秒固め（「ページが応答しません」発生）、その後ようやく描画に入る、という順序。ページング/cap だけでは読み込み時のフリーズは消えない。

このため本 PR のスコープを修正し、**parse + sanitize の Web Worker 化**を主軸に据えた:

- `src/workers/harSanitizer.worker.ts`（stateful worker）+ `src/hooks/useHarSanitizer.ts`（worker ライフサイクル / `requestId` による stale result 破棄）。
- `sanitizeHar` に `onProgress` を追加し `ProgressBar` で進捗表示。
- ページング / 遅延 stringify は「描画フェーズの最適化」として維持（user が観察した「描画でさらに時間がかかる」への対策）。
- `MAX_BYTES` は 25MB を維持（フリーズが解消したためメモリ防御ガードに戻す。初版で 10MB に下げたのは撤回）。
- Vite worker サブビルドに `@/` エイリアスが伝播しないため、`sanitize.ts` の secret-scrubber import を相対パスに変更。

確定した設計判断は `docs/decisions.md [117]` を正本とする。
