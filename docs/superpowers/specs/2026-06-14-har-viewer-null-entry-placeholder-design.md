# har-viewer: null 先頭 entry 自動選択時の詳細パネル一貫化（issue #684）

## 背景・課題

PR #683（issue #681 の描画クラッシュガード）のレビューで指摘された軽微な UX 非対称。

`HarViewer` は読み込み時に先頭 entry（index=0）を自動選択する。選択中 entry の詳細は `HarViewer.tsx:161` の以下のゲートで描画される。

```tsx
{
  selectedEntry && <HarEntryDetail entry={selectedEntry} />;
}
```

`selectedEntry` は `result.har.log.entries[selectedIndex]`。

- 先頭 entry が `{}`（オブジェクトだが request/response 欠落）の場合 → `selectedEntry` は truthy なので `HarEntryDetail` が描画され、「このエントリは request / response を欠くため詳細を表示できません。」のプレースホルダが出る。
- 先頭 entry が `null` の場合 → `selectedEntry` が falsy になり **詳細パネル自体が描画されない**。

どちらもクラッシュはせず PR #683 の目的（描画クラッシュ防止）は満たしているが、ユーザ視点では「壊れた entry が選択されているのに何も出ない」状態になり得る非対称が残る。`HarEntryList` は null 行を「（壊れたエントリ）」として可視化しているため、詳細パネルだけ「何も出ない」のは一覧との整合も崩れている。

優先度: 低（クラッシュなし・視覚的な抜けのみ）。

## 目的

「選択中だが描画不能（entry が null / 壊れている）」の場合に、`{}` ケースと同等のプレースホルダを一貫して表示する。

## 設計（描画ゲートを `selectedIndex` 基準に変更）

`HarEntryDetail` は既に `entry?.request` の optional chaining でガード済みで、`entry={null}` を渡しても安全にプレースホルダへ落ちる（issue #681 対応の既存ロジック）。そのため、描画ゲートを `selectedEntry` の truthy 判定から `selectedIndex` の存在判定へ切り替えるだけで非対称が解消する。

### 変更点

1. **`src/components/tools/HarEntryDetail.tsx`**
   - `Props.entry` の型を `HarEntry` から `HarEntry | null | undefined` に拡張する。
   - 内部の null ガード（`if (!request || ... || !response || ...)`）は既に optional chaining で `entry` が null/undefined のケースを吸収しているため、ロジック変更は不要。

2. **`src/components/tools/HarViewer.tsx`（161 行目付近）**
   - 描画ゲートを変更する。

   ```tsx
   // before
   {
     selectedEntry && <HarEntryDetail entry={selectedEntry} />;
   }
   // after
   {
     result && selectedIndex != null && <HarEntryDetail entry={selectedEntry} />;
   }
   ```

   - これにより、`selectedIndex` が設定されている（= 何らかの entry が選択されている）限り、entry が null でも `HarEntryDetail` が描画されプレースホルダが出る。
   - entryCount が 0 で `selectedIndex` が null のとき（読み込み済みだが entry 無し）は従来どおり詳細パネルを描画しない。

### 不採用案

- **HarViewer 側で独自プレースホルダを別途描画**: プレースホルダ文言が 2 箇所に分散し DRY 違反。却下。
- **自動選択ロジックで null entry をスキップ**: issue の意図（壊れた entry が選択されている状態を可視化する一貫性）と逆方向。`HarEntryList` が null 行を「（壊れたエントリ）」として見せる設計とも不整合。却下。

## テスト

検知機構（描画ゲート）の修正にあたり、修正がなければ fail する陽性対照を必ず添える。

1. **ユニットテスト（`src/components/tools/__tests__/HarEntryDetail.test.tsx`）**
   - `entry={null}` を渡したケースで throw せずプレースホルダ「詳細を表示できません」を表示することを追加検証する（型拡張の陽性対照）。

2. **E2E テスト（`tests/e2e/har-viewer.spec.ts`）**
   - 先頭 entry が `null` の HAR を読み込み、自動選択された詳細パネルにプレースホルダ「詳細を表示できません」が表示されることを検証する。
   - **陽性対照性**: この修正前は詳細パネル自体が描画されないため、このアサーションは fail する。修正後に pass することで、ゲート変更が実際に効いていることを担保する。

## 検証義務

push 前に以下を実行する（`.agents/rules/common.md` 3 章）。

- `npm run test`（ユニット）
- `node_modules/.bin/astro check`（型）
- `npm run test:e2e`（E2E）

## スコープ外

- HAR パース・サニタイズロジックの変更。
- プレースホルダ文言の改訂（既存文言を流用）。
- 自動選択ロジック（先頭 entry 選択）の挙動変更。
- VRT baseline 更新（新規ツール追加ではなく既存ツールの軽微な分岐追加のため、デザイントークン由来の変更はなし。pixel diff が出た場合は owner 目視判断に委ねる）。
