# クリップボードインスペクタ（clipboard-inspector）設計書

- 日付: 2026-06-12
- 出典: `docs/tool-candidates.md` A2-4
- ステータス: 承認済み（ブレインストーミング完了）

## 1. 目的とスコープ

`paste` イベントとドラッグ&ドロップの `DataTransfer` を捕捉し、クリップボード/ドラッグデータ上の全 MIME フレーバー（`text/plain`・`text/html`・カスタム型・ファイル）の種別と中身を可視化するツール。

- **主用途**: リッチテキストエディタ開発のデバッグ、Excel/Word/ブラウザからの貼り付け挙動調査
- **ブラウザ完結の必然性**: クリップボード内容（PII・機密を含み得る）は原理的に 100% ブラウザ内で処理され、外部送信しない
- **入力経路**: ① 貼り付け（`paste` イベント） ② ドラッグ&ドロップ（`drop` イベント）。両者は同じ `DataTransfer` 構造を持ち、同一インスペクタで検査する。経路によるフレーバー差の比較自体にデバッグ価値があるため、捕捉経路をバッジ表示する

### スコープ外

- Async Clipboard API（`navigator.clipboard.read()`）— 権限プロンプトが必要で取得型も限定的。将来拡張の余地として残す
- バイナリ hex ダンプ表示
- 貼り付け履歴の保存・永続化

## 2. 構成

プロジェクト既存パターン（純ロジックを `src/utils/` に分離し、UI を `src/components/tools/` に置く）に準拠する。

| ファイル                                      | 責務                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/dataTransferSnapshot.ts`           | `DataTransfer` → 純粋なスナップショット構造体への変換。`DataTransferItem.getAsString` のコールバック API を Promise 化。items の kind/type/文字列内容、files のメタデータ（名前/型/サイズ/更新日時）、入力経路（`paste` \| `drop`）を収集。ユニットテスト可能な純ロジック |
| `src/utils/sanitizeHtml.ts`                   | DOMParser ベースの**許可リスト方式** HTML サニタイザ。`script`/`iframe`/`object`/`embed`/`link`/`meta`/`style` 等の危険要素、`on*` イベント属性、`javascript:` URL（`href`/`src`/`srcset`）を除去                                                                         |
| `src/components/tools/ClipboardInspector.tsx` | 貼り付け/ドロップ受付領域＋フレーバーカード一覧の UI                                                                                                                                                                                                                      |
| `src/pages/tools/clipboard-inspector.astro`   | ルーティング（`client:load` で React コンポーネントをマウント）                                                                                                                                                                                                           |

### tools.ts 登録

- slug: `clipboard-inspector`
- name: `クリップボードインスペクタ`
- category: `convert`（変換・解析）
- yomi: `くりっぷぼーどいんすぺくた`

## 3. UI フロー

1. 上部に大きな貼り付け＆ドロップ受付領域。フォーカスして Ctrl+V（Cmd+V）、またはファイル/選択範囲をドラッグ&ドロップ。捕捉経路（paste / drop）をバッジ表示
2. 捕捉後、フレーバーごとにカードを一覧表示:
   - **テキスト系（`text/plain` 等）**: 生テキスト＋文字数＋ `CopyButton`
   - **`text/html`**: 生ソース ⇄ サニタイズ後プレビューを `ToggleGroup` で切替。プレビューは `sandbox=""`（スクリプト不許可）の iframe `srcdoc` で表示（サニタイズ＋sandbox の二重防御）
   - **画像ファイル**: blob URL によるプレビュー（本番 CSP `img-src 'self' data: blob:` で許可済み）＋型/サイズ＋ `DownloadButton`
   - **その他ファイル**: 名前/型/サイズ/更新日時のメタデータ表示
   - **カスタム型（`application/x-*` 等）**: 文字列として取得できれば生テキスト表示
3. クリアボタンで状態をリセットして再検査

### UI 規約上の注意

- 共通コンポーネント（`CopyButton`/`DownloadButton`/`ToggleGroup`/`Section`/`ChipLabel`/`StatusBadge` 等）を優先使用
- Tailwind primitive カラークラスは使用禁止。semantic class / `@theme` トークン utility のみ
- `@layer components` 手書き class への `hover:` variant は CSS が生成されないため使用しない

## 4. セキュリティ設計

貼り付けられた HTML は攻撃ペイロードであり得る（反射型 XSS のリスク、`.agents/rules/common.md` 9.5 章）。

- **二重防御**: 自作許可リストサニタイザでの除去 ＋ `sandbox=""` iframe（`allow-scripts` なし）での描画隔離。サニタイザに見落としがあっても sandbox がスクリプト実行を阻止する
- **DOMPurify 不採用の理由**: sandbox iframe が第二防壁として存在するため、依存追加（約 20KB gzip）よりも自作許可リスト＋二重防御を選択。`docs/decisions.md` に記録する
- **CSP 制約の明示**: 本番 CSP は `style-src` strict（`unsafe-inline` なし）であり、`srcdoc` iframe は親ドキュメントの CSP を継承する。貼り付けた HTML の inline style は本番では効かず、プレビューは構造・テキスト中心になる。この制約は UI 上で注記する

## 5. テスト戦略

- **ユニットテスト（Vitest）**:
  - `dataTransferSnapshot`: モック DataTransfer での変換検証（テキスト/ファイル/混在/空）
  - `sanitizeHtml`: サニタイザは**検知・ガード機構**のため test-gates skill に従い**陽性対照テスト必須**。`<script>`・`onerror` 属性・`javascript:` URL・`<iframe>` 等の XSS ペイロードが実際に除去されることを検証。陰性対照（安全な HTML が保持されること）も併設
- **E2E（Playwright）**: 合成 `ClipboardEvent` / `DragEvent`（`DataTransfer` 構築）をディスパッチして、フレーバーカード表示・サニタイズ後プレビュー・コピー/クリア動作を検証。`applyProductionCsp` による本番 CSP 下でのプレビュー動作確認を含む
- **VRT**: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/clipboard-inspector` を追加。baseline は CI の `Update Visual Regression Baseline` workflow で生成（ローカル mac では生成しない）

## 6. ドキュメント更新

- `README.md`: ツール一覧に追加
- `SPEC.md`: 2.3, 2.4, 4, 5, 9 章
- `docs/tools.md`: 仕組み・準拠仕様・制限（CSP による style 制約を含む）
- `docs/decisions.md`: DOMPurify 不採用＝自作許可リスト＋sandbox iframe 二重防御の選定理由
