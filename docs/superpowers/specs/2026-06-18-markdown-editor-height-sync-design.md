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

## 2. 採用方針（ブレストで確定）

既存の高さ同期プリミティブ **`OutputField` の `fill`** と同じ仕組み（親行 `items-stretch` +
片側が高さを決め、もう片側が `flex-1 min-h-0` で埋めて内部スクロール）を踏襲する。
実装例: `SqlFormatter.tsx:129-171`（InputField がリサイズ可能な高さドライバ、OutputField が `fill`）。

- **高さドライバ**: 入力 textarea（`resize-y` 維持）。`rows` でベース高さを決める。
- **追従側**: プレビュー列を `md:self-stretch`、内側のプレビュー箱を `md:h-full md:min-h-0 overflow-auto`
  にして入力欄の高さに合わせて伸縮し、はみ出した内容は内部スクロールさせる。
- **リサイズ追従**: 入力 textarea を手動で縦リサイズすると、`items-stretch` によりプレビューも
  自動追従する（flexbox の stretch で実現、JS 不要・CSP 安全・インライン style なし）。
- 色・スタイルは既存規約どおり（primitive scale 直書き禁止、`@layer components` 意味クラス /
  semantic token のみ。`outline-none` 禁止。インライン `style` / `style.X=Y` の DOM mutation 不使用）。

## 3. 変換系ツールと同じ見た目への統一

「json/csv・設定ファイル変換と同じ感じ」に合わせ、入力／プレビューの構造を共通 UI に寄せる。

### 3.1 入力ペイン

- 共通 `InputField` に統一（`multiline`・`mono`・`rows={16}`・`resize`）。
- ラベルは `body-emphasis` の「markdown入力」（InputField 標準）。
- 「サンプルを入力」ボタンは InputField の `onSampleClick`（ラベル行右側）へ移設。

### 3.2 プレビューペイン

- `OutputField` のラベル行構造を踏襲（`flex items-center justify-between mb-3 min-h-8`）。
  - 左: `body-emphasis text-default` の「プレビュー」見出し。
  - 右: 入力が空でないとき `CopyButton`（HTMLをコピー / aria 説明付き）。
- 箱本体は `.markdown-preview` + 角丸・border + `overflow-auto` + fill 系クラス
  （`md:h-full md:min-h-0`）。`dangerouslySetInnerHTML` で sanitize 済み HTML を描画（既存どおり）。
- **空状態**: 入力が空のときは同じ箱の中に「markdown を入力するとプレビューが表示されます」を
  従来どおり中央表示（高さ・border は埋め状態と一致させる）。

### 3.3 アクション行

- `.md`ダウンロードは下部 `flex justify-end` のアクション行へ移設（`DownloadButton` secondary、
  入力が空のとき `disabled`）。変換系ツールの下部アクション領域と同じ配置。
- 上部の独立ボタンバーは廃止（サンプル → 入力ラベル行 / コピー → プレビューラベル行 / ダウンロード → 下部）。

## 4. レイアウト構造（確定形）

```
<div class="space-y-4">
  <div class="flex flex-col md:flex-row gap-4 items-stretch">   // items-start → items-stretch
    <div class="w-full md:flex-1 min-w-0">                       // 入力列（高さドライバ）
      <InputField multiline mono resize rows={16}
                  onSampleClick=... label="markdown入力" />
    </div>
    <div class="w-full md:flex-1 min-w-0 md:flex md:self-stretch">  // プレビュー列（追従）
      <div class="w-full md:flex md:h-full md:flex-col">           // OutputField fill 相当
        <label行 min-h-8>プレビュー + (CopyButton)</label行>
        <div class="...preview box... md:flex-1 md:min-h-0 overflow-auto">
          {空 ? 案内テキスト : dangerouslySetInnerHTML}
        </div>
      </div>
    </div>
  </div>
  <div class="flex justify-end gap-2">                            // 下部アクション
    <DownloadButton .mdダウンロード disabled={input.length===0} />
  </div>
</div>
```

- モバイル（縦積み）では `md:` 系が無効なため、入力は `rows` ベース、プレビューは自然高さ
  （縦積みのため左右揃えの問題は発生しない）。既存挙動と同等。

## 5. テスト

### 5.1 E2E（`tests/e2e/markdown-editor.spec.ts` に追加）

- **高さ一致のリグレッション防止（陽性ガード）**: 長文 markdown を入力し、PC 幅（≥768px）で
  入力欄 textarea とプレビュー箱の `boundingBox().height` が一定許容差内で一致することを assert。
  - 高さ同期が壊れる（items-stretch / fill 欠落）と差が広がり fail する。
  - 比較対象は入力 textarea と `.markdown-preview` 箱。許容差は border/padding 差を考慮し数 px。
- 既存の陰性対照（変換反映）・陽性対照（XSS 除去）は維持。ボタン移設に伴うロケータ
  （サンプル / コピー / ダウンロード）の取得経路を更新。

### 5.2 VRT

- レイアウト・ボタン配置が変わるため `markdown-editor` の baseline 再生成が必要。
  CI Linux runner の `Update Visual Regression Baseline` を **手動 `workflow_dispatch`**
  （web セッションは `actions: write` 不可のため手動トリガー必須）。PR に明記する。

### 5.3 その他

- `npm run test` / `node_modules/.bin/astro check` / `npm run lint` / `npm run build` を通す。
- PC (1280x800) / スマホ (390x844) で目視確認（上端揃え・はみ出し・スクロール挙動）。

## 6. スコープ外（YAGNI）

- 分割比のドラッグ可変（スプリッタ）・スクロール同期（入力↔プレビュー連動スクロール）。
- クリアボタン新設（現状ツールに無く本件と無関係）。
- プレビューの内容・サニタイズ・marked 設定の変更（高さ問題と無関係）。

## 7. ドキュメント更新

- 高さ揃えは UI 内部実装の調整であり、ツール仕様・一覧・準拠仕様に影響しないため
  `README.md` / `SPEC.md` / `docs/tools.md` の機能記述更新は不要。
- 必要に応じ `docs/decisions.md` に「プレビューを `fill` 機構で高さ同期した」判断を 1 項追記。

## 8. 完了条件

- 入力／プレビューの高さが短文・長文・手動リサイズ後で一致する。
- 上記テスト・型・lint・build がローカルで通る。E2E 高さガード green。
- VRT baseline 再生成が必要な旨を PR に明記。
