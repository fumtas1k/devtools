# markdownエディタ 入力／プレビュー高さ揃え 設計書

- 日付: 2026-06-18
- slug: `markdown-editor`
- 対象: `src/components/tools/MarkdownEditor.tsx`
- 方針: CSS のみで高さ同期（インライン style 不使用・CSP / 規約準拠）

## 1. 背景・問題

markdownエディタは 2 ペイン（左: 入力 textarea / 右: HTML プレビュー）構成。
入力欄は `min-h-96` + `resize-y` + `rows={20}` で高さが有界だが、プレビューは
`dangerouslySetInnerHTML` の `div`（`min-h-96` + `overflow-auto`・max-height なし）で
**内容に応じて青天井に伸びる**。そのため本文を入力するとプレビューが入力欄より高くなり、
左右の縦幅が揃わずデザイン的に崩れる。

json/csv 変換・設定ファイル相互変換では入力／出力が**両方 `rows={16}` の textarea**で
あるため高さが揃っている（textarea は高さ固定で内部スクロール）。markdownエディタも
これと同じ「左右が同じ高さの箱で、はみ出したら内部スクロール」という見た目に揃える。

## 2. 採用方針（実装で確定）

> **当初案からの修正**: ブレスト時は `OutputField` の `fill` 機構（親行 `items-stretch` +
> プレビュー列を `flex-1 min-h-0` で埋めて追従）を想定したが、**実装・E2E 検証で不採用**とした。
> `fill` はプレビューが **textarea のような固有高さを持つ要素**のときのみ機能する。プレビューは
> コンテンツ依存で高さが変わる `div`（`dangerouslySetInnerHTML`）であり、`flex-basis:0%` が
> 高さ未確定の flex 連鎖に対して**コンテンツ高さへフォールバック**するため、`items-stretch` で
> プレビュー内容が行全体を押し上げてしまい高さが青天井に伸びた（E2E で入力欄との差 3560px を観測）。

**採用: 固定高 + 内部スクロール方式**（`JsonFormatter` のツリー結果 `.json-tree-box` と同方式）。
div 結果を textarea 入力に揃える既存の確立パターンを踏襲する。

- **入力**: `InputField`（`multiline`・`mono`・`rows={18}`・`resize`）。`JsonFormatter` と同設定で
  実測高 ≒ 446px ≒ 28rem。
- **プレビュー箱 / 入力待ち箱**: `global.css` の `@layer components` に `.md-preview-box`
  （`height: 28rem; overflow: auto;`）を定義し適用。入力 textarea と外形を揃え、はみ出しは
  枠内スクロール。`.json-tree-box`（`global.css`）と同じ「固定高で textarea に合わせる」考え方。
- レイアウトは `items-start`（両ペインとも固定 28rem のため stretch 不要）。
- **リサイズ注記**: 入力 textarea を手動リサイズするとプレビューは追従しない（固定 28rem）。
  これは `JsonFormatter` / json-csv 変換と同じ既知の挙動で、デフォルト表示は常に一致する。
- 色・スタイルは既存規約どおり（primitive scale 直書き禁止、`@layer components` 意味クラス /
  semantic token のみ。`outline-none` 禁止。インライン `style` / `style.X=Y` の DOM mutation 不使用）。

## 3. 変換系ツールと同じ見た目への統一

「json/csv・設定ファイル変換と同じ感じ」に合わせ、入力／プレビューの構造を共通 UI に寄せる。

### 3.1 入力ペイン

- 共通 `InputField` に統一（`multiline`・`mono`・`rows={18}`・`resize`）。
- ラベルは `body-emphasis` の「markdown入力」（InputField 標準）。
- 「サンプルを入力」ボタンは InputField の `onSampleClick`（ラベル行右側）へ移設。

### 3.2 プレビューペイン

- `OutputField` のラベル行構造を踏襲（`flex items-center justify-between mb-3 min-h-8 gap-2`）。
  - 左: `body-emphasis text-default truncate min-w-0` の「プレビュー」見出し（狭い md 幅でも
    ヘッダを 1 行に保ち、入力ヘッダと上端＝箱の上端を一致させるため truncate）。
  - 右: 入力が空でないとき、`shrink-0` の群として `DownloadButton`（.mdダウンロード）+
    `CopyButton`（HTMLコピー / aria 説明付き）を並べる（結果ペインのヘッダに DL＋コピー、
    変換系ツールと同配置）。
- 箱本体は `.markdown-preview .md-preview-box` + 角丸・border。`.md-preview-box` が固定高 28rem +
  `overflow: auto` を担う。`dangerouslySetInnerHTML` で sanitize 済み HTML を描画（既存どおり）。
- **空状態**: 入力が空のときは `.md-preview-box`（同じ 28rem）の中に「markdown を入力すると
  プレビューが表示されます」を中央表示（埋め状態と高さ・border を一致させる）。

### 3.3 アクション行

- **ダウンロード／コピーはプレビュー（結果）側ヘッダ**に置く（変換系ツールの標準配置に準拠）。
  `.md`ダウンロードは入力 markdown 原文を保存する。いずれも入力が空のときは非表示。
- **下部 `flex justify-end` のアクション行には共通 `ClearButton`** を置き、入力をリセットする
  （`onClick={() => setInput('')}`）。変換系ツールの下部アクション領域と同じ配置。常時表示
  （json/csv 変換等の `ClearButton` と同様、空入力時は no-op）。
- 上部の独立ボタンバーは廃止（サンプル → 入力ラベル行 / ダウンロード・コピー → プレビューラベル行 /
  クリア → 下部）。

## 4. レイアウト構造（確定形）

```
<div class="space-y-4">
  <div class="flex flex-col md:flex-row gap-4 items-start">     // 両ペイン固定 28rem のため items-start
    <div class="w-full md:flex-1 min-w-0">                       // 入力列
      <InputField multiline mono resize rows={18}
                  onSampleClick=... label="markdown入力" />      // rows=18 ≒ 28rem
    </div>
    <div class="w-full md:flex-1 min-w-0">                       // プレビュー列
      <label行 min-h-8 gap-2>プレビュー(truncate) + (DownloadButton + CopyButton)</label行>
      <div class="markdown-preview md-preview-box ...">          // .md-preview-box = height:28rem; overflow:auto
        {空 ? .md-preview-box 案内テキスト : dangerouslySetInnerHTML}
      </div>
    </div>
  </div>
  <div class="flex justify-end gap-2">                            // 下部アクション
    <ClearButton onClick={() => setInput('')} />
  </div>
</div>
```

- 入力 textarea（rows=18 ≒ 28rem）とプレビュー箱（`.md-preview-box` = 28rem）が同じ外形のため、
  PC 横並びでも左右の縦幅が一致し、はみ出しは各ペイン内でスクロールする。
- モバイル（縦積み）では両ペインとも 28rem の固定高で縦に並ぶ（左右揃えの問題は発生しない）。

## 5. テスト

### 5.1 E2E（`tests/e2e/markdown-editor.spec.ts` に追加）

- **高さ一致のリグレッション防止（陽性ガード）**: 長文 markdown を入力し、PC 幅（≥768px）で
  入力欄 textarea とプレビュー箱の `boundingBox().height` が一定許容差内で一致することを assert。
  - 旧実装（プレビューが青天井に伸長）では差が広がり fail する。固定高 28rem 同士で一致する設計。
  - 比較対象は入力 textarea と `.markdown-preview` 箱。許容差は border/padding 差を考慮し数 px。
- 既存の陰性対照（変換反映）・陽性対照（XSS 除去）は維持。ボタン構成変更に伴うロケータ
  （サンプル / コピー名「HTMLコピー」/ ダウンロード / クリア）の取得経路を更新・追加。

### 5.2 VRT

- レイアウト・ボタン配置が変わるため `markdown-editor` の baseline 再生成が必要。
  CI Linux runner の `Update Visual Regression Baseline` を **手動 `workflow_dispatch`**
  （web セッションは `actions: write` 不可のため手動トリガー必須）。PR に明記する。

### 5.3 その他

- `npm run test` / `node_modules/.bin/astro check` / `npm run lint` / `npm run build` を通す。
- PC (1280x800) / スマホ (390x844) で目視確認（上端揃え・はみ出し・スクロール挙動）。

## 6. スコープ外（YAGNI）

- 分割比のドラッグ可変（スプリッタ）・スクロール同期（入力↔プレビュー連動スクロール）。
- プレビューの内容・サニタイズ・marked 設定の変更（高さ問題と無関係）。

> 補足: `ClearButton`（入力リセット）は当初スコープ外としていたが、レビュー要望により
> 変換系ツールと UI を揃える一環として本 PR に含めた（下部アクション行に配置、§3.3）。

## 7. ドキュメント更新

- 高さ揃えは UI 内部実装の調整であり、ツール仕様・一覧・準拠仕様に影響しないため
  `README.md` / `SPEC.md` / `docs/tools.md` の機能記述更新は不要。
- 必要に応じ `docs/decisions.md` に「プレビューを固定高（`.md-preview-box`）で高さ同期した」
  判断を 1 項追記。

## 8. 完了条件

- 入力／プレビューの高さが短文・長文・手動リサイズ後で一致する。
- 上記テスト・型・lint・build がローカルで通る。E2E 高さガード green。
- VRT baseline 再生成が必要な旨を PR に明記。
