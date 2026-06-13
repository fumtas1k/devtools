# Design & Architecture Decisions

このファイルは、devtools プロジェクトで行った設計・実装上の決断を記録します。
「なぜこれを選んだか」「なぜ他の選択肢を却下したか」を残すことで、将来の判断の根拠を保持します。

---

## 記法

```
## [番号] タイトル
日付 | ステータス: 採用 / 却下 / 変更

### 背景
### 決断
### 却下した選択肢
### 結果・トレードオフ
```

---

## [001] デザインシステムとして DADS を採用

**2026-04-12 | ステータス: 採用**

### 背景

初期実装は Apple HIG を参考にしたデザイン（黒ヘッダー、backdrop-filter blur、負の letter-spacing）で構築されていた。
一貫したデザイン言語が必要になり、見直しの機会に DESIGN.md を削除した。

### 決断

デジタル庁デザインシステム（DADS v2.12.0）を採用する。
カラー（#1A56DB 青基調）・タイポグラフィ（16px+、正の letter-spacing）・余白（8px基準）・コンポーネントパターンに準拠する。

### 却下した選択肢

- **Apple HIG 継続**: 継続性はあるが、日本語コンテンツに最適化されておらず、アクセシビリティ基準（コントラスト比・フォントサイズ）が不明確。
- **独自デザインシステム**: 小規模プロジェクトで一から構築するコストに見合わない。
- **Material Design / Fluent**: 日本語UIとの相性・国内ユーザーへの親和性が低い。

### 結果・トレードオフ

- ✅ アクセシビリティ基準（4.5:1 コントラスト比、14px 最小フォント）が明確になった
- ✅ コンポーネント設計の判断基準ができた
- ⚠️ ダークモードの仕様が DADS に存在しないため、別途判断が必要（→ [003]）

---

## [002] アイコンをインライン SVG で実装

**2026-04-12 | ステータス: 採用**

### 背景

ツールカード・サイドバー・ツールヘッダーで絵文字アイコンを使用していたが、
見た目がダサく、DADSの青基調デザインとも不一致だった。

### 決断

`ToolIcon.astro` コンポーネントを作成し、slug → SVG のマッピングでインライン SVG を描画する。
スタイルは stroke ベース（24x24、currentColor、stroke-width: 2）で Lucide に近い見た目に統一。

### 却下した選択肢

- **Lucide React 導入**: アイコンの種類が豊富で理想的だが、npm の `min-release-age` 制約によりパッケージ追加にリスクがある。ツールが6種類しかない現状では過剰。
- **Heroicons**: 同様の理由でパッケージ制約がネック。
- **絵文字継続**: プラットフォーム間で見た目が異なり、DADSカラーシステムとの統合が不可能。

### 結果・トレードオフ

- ✅ 外部依存ゼロ、バージョン制約の心配なし
- ✅ `currentColor` で DADS カラーシステムと自然に統合できる
- ⚠️ ツール追加のたびに `ToolIcon.astro` に手動で SVG を追加する必要がある
- ⚠️ ツールが10種類以上になったらアイコンライブラリ導入を再検討する

---

## [003] ダークモードを一時廃止

**2026-04-12 | ステータス: 採用（保留）**

### 背景

DADS はダークモードの仕様を定義していない。
初期実装では `dark:` クラスと localStorage によるテーマ切替を持っていた。

### 決断

ダークモードを一時廃止する。ヘッダーのトグルボタン・BaseLayout の初期化スクリプトを削除。
localStorage のキー構造は保持し、将来の復活に備える。

### 却下した選択肢

- **ダークモード継続**: DADS のコントラスト比要件（4.5:1）をライト・ダーク両方で満たす設計が未完成。中途半端な状態での維持はアクセシビリティ上のリスクになる。
- **DADS カラーに合わせたダークパレット設計**: 設計コストが高く、現フェーズでの優先度が低い。

### 結果・トレードオフ

- ✅ DADS ライトモードのデザインに集中できる
- ⚠️ ダークモードを好むユーザーへの対応が失われる（Phase 2 課題）

---

## [004] カテゴリ絞り込みをタブ UI で実装

**2026-04-12 | ステータス: 採用**

### 背景

ツール一覧ページでカテゴリ（生成・変換）ごとにセクションを分けて表示していたが、
ツールが増えた際のスキャンしやすさを改善したかった。

### 決断

「すべて / 生成 / 変換・解析」の3タブで絞り込む UI を採用。
JavaScript でカードの `display` を切り替えるシンプルな実装。

### 却下した選択肢

- **セクション分け継続**: ツールが少ない間は問題ないが、カテゴリが増えるとスクロールが長くなる。
- **ドロップダウン/セレクト**: タブと比べて操作ステップが増え、一覧性が低い。
- **URL パラメータ連動（?category=generate）**: シェア・ブックマーク対応が可能だが、現状の要件では過剰。

### 結果・トレードオフ

- ✅ カテゴリが増えてもタブを追加するだけで対応できる
- ⚠️ 「すべて」タブがデフォルトのため、ツールが増えると再び長くなる可能性がある
- ⚠️ URL に状態が反映されないため、特定カテゴリのブックマークができない

---

## [005] テストフレームワークに Vitest を採用

**2026-04-12 | ステータス: 採用**

### 背景

テストコードがなく、ツールのロジックバグを手動確認に頼っていた。
`JwtDecoder.tsx` のパース・有効期限判定・時刻フォーマットなど、バグが直接誤動作に直結するロジックが存在していた。

### 決断

Vitest をテストフレームワークとして採用し、コンポーネント内のロジックを `src/utils/` に抽出してテストする。
テスト対象を「純粋な関数」に絞り、コンポーネント描画テストは行わない。

### 却下した選択肢

- **Jest**: Vite プロジェクトとの統合に追加設定が必要。Vitest は Vite のコンフィグをそのまま使えるため優位。
- **React Testing Library（描画テスト）**: セットアップコストが高い割に、ロジックバグの検出には不向き。ツールの見た目変更のたびにテストが壊れる。
- **テストなし継続**: JWTの有効期限判定・URLエンコードのラウンドトリップなど、手動確認が難しいエッジケースが多いため却下。

### 結果・トレードオフ

- ✅ Vite と設定共有でき、セットアップがほぼゼロ
- ✅ ロジック抽出により `src/utils/` が明確な責務をもつ層になった
- ⚠️ コンポーネントのテストカバレッジはゼロのまま（意図的な割り切り）
- ✅ JANコード・GS1 DataBar のチェックディジット計算もテスト済み（合計 60 テスト）

---

## [006] ロジックをコンポーネントから `src/utils/` に分離

**2026-04-12 | ステータス: 採用**

### 背景

`JwtDecoder.tsx` と `UrlEncoder.tsx` 内にテスト不可能な純粋関数が混在していた（`parseJwt`、`base64UrlToBytes`、`encodeUrl` 等）。

### 決断

テスト対象の純粋関数を `src/utils/jwt.ts` と `src/utils/url-encode.ts` に抽出してエクスポートする。
コンポーネントはそれらをインポートして使う構成に変更。

### 却下した選択肢

- **コンポーネント内に残してテスト**: エクスポートなしの関数はテストできない。`export` を付けるだけでもできるが、コンポーネントファイルの責務が曖昧になる。
- **テストのためだけに export**: 目的が漏れる設計になるため不採用。

### 結果・トレードオフ

- ✅ ロジック / UI の分離が明確になり、将来の差し替えが容易
- ✅ `src/utils/` を見るだけでビジネスロジックが把握できる
- ⚠️ ファイル数が増える（小規模プロジェクトではやや過剰に見える場合がある）

---

## [007] GS1 DataBar バーコード描画に bwip-js を採用

**2026-04-12 | ステータス: 採用**

### 背景

GS1 DataBar Limited Composite（線形バーコード＋CC-A 2D合成シンボル）の生成が必要になった。
JANコードで使用した JsBarcode は EAN/UPC 系のみ対応で、GS1 DataBar は未対応。

### 決断

`bwip-js`（Barcode Writer in Pure JavaScript）を採用する。

- `bcid: 'databarlimited'` / `'databarlimitedcomposite'` で GS1 DataBar Limited をネイティブサポート
- `toSVG()` API でブラウザ・Node.js 両対応の SVG 文字列を返す
- GS1 Application Identifier（AI）フォーマット `(01)GTIN|(17)日付(10)ロット` を直接受け付ける

なお、bwip-js の `toSVG()` は `viewBox` のみで `width`/`height` を持たない SVG を返す仕様のため、
表示・PNG変換のために viewBox からピクセル寸法を抽出して属性付与する後処理を実装した。
また、`includetext: true` で合成部の上に AI テキストが描画されない bwip-js のバージョン挙動の問題は、
SVG 文字列を後処理してテキスト要素を直接注入することで解決した。

加えて、bwip-js の default 出力には `shape-rendering` 指定がないため、ブラウザ表示 / SVG→`<img>`→Canvas 経路の両方で bar/space edge が sub-pixel anti-alias で滲み、scanner が黒/白二値閾値で bar 幅を誤判定する事象が発生していた（特に composite CC-A の 1X 矩形 module でロット (10) が decode 不能）。`addSvgDimensions()` で `shape-rendering="crispEdges"` を同時注入し、PNG 変換側 (`svgContentToPngBlob` / `downloadPngFromSvgElement`) では `ctx.imageSmoothingEnabled = false` を設定し、表示プレビュー側は `.barcode-preview { image-rendering: pixelated }` で crisp edge を強制することで全経路の anti-aliasing を抑止した。

この 3 層のうち **真の砦は L1 = SVG `shape-rendering="crispEdges"`** で、ブラウザの vector rasterize 全経路 (preview / Image rasterization) に効く。L2 = Canvas `imageSmoothingEnabled = false` は `ctx.scale(2,2)` + `drawImage` の 2x upscale 段階の re-smoothing を抑止する念押し、L3 = CSS `image-rendering: pixelated` は inline SVG (vector) には UA 依存で effectively no-op が多く、raster cache 経由で SVG が bitmap 化される極端ケースのみで効く保険、という位置づけ。将来この fix の一部を revert する判断が必要になった際は **L1 を最優先で残す** こと（L1 を消すと L2/L3 はほぼ無力）。bwip-js は半画素座標 + `stroke-width="3"` で bar を描く構造のため、整数 DPR では `shape-rendering` 無しでも crisp だが非整数 DPR (モバイル 2.625x/3x 等) では anti-alias の灰色 sub-pixel ringing で decode 失敗する。L1 の `crispEdges` は SVG spec 上 stroke geometry にも適用されるため全 DPR で binary thresholding を強制でき、これが root fix となる。

### 却下した選択肢

- **JsBarcode**: GS1 DataBar 非対応のため却下。
- **Dynamsoft Barcode Generator**: 商用ライセンスが必要。
- **Canvas 自前実装**: GS1 DataBar の符号化仕様（チェックサム重み付け・CC-A 2D符号化）は複雑で自前実装は非現実的。

### 結果・トレードオフ

- ✅ GS1 DataBar Limited / Composite を含む 100 種類以上のバーコードをサポート
- ✅ ブラウザ完結（サーバー不要）で動作
- ⚠️ バンドルサイズが大きい（bwip-js は約 600KB）
- ⚠️ SVG 後処理（寸法付与・テキスト注入）が bwip-js の内部仕様に依存するため、メジャーバージョンアップ時に確認が必要

---

## [008] 複数バーコード一括ZIPに jszip を採用

**2026-04-12 | ステータス: 採用**

### 背景

GS1 DataBar を最大 10 件まで一括生成する機能を追加するにあたり、
SVG + PNG をまとめてダウンロードする手段が必要になった。

### 決断

`jszip` を採用する。

- ブラウザ完結で ZIP バイナリを生成できる
- `generateAsync({ type: 'blob' })` → `URL.createObjectURL` でダウンロードリンクを作成できる
- 軽量かつメンテナンスが続いている（weekly DL 数百万）

### 却下した選択肢

- **個別ダウンロード（ループ）**: ブラウザがポップアップブロックで複数ダウンロードを止めるリスクがあり UX が悪い。
- **Compression Streams API 手動 ZIP**: ZIP 仕様を自前実装するのは複雑でメンテコストが高い。

### 結果・トレードオフ

- ✅ SVG + PNG の両形式を 1 つの ZIP にまとめて提供できる
- ✅ ブラウザ完結で動作
- ⚠️ jszip は約 100KB（gzip 後 約 40KB）のバンドルサイズ増加

---

## [009] .npmrc によるサプライチェーン攻撃対策

**2026-04-12 | ステータス: 採用**

### 背景

npm パッケージを通じたサプライチェーン攻撃（悪意ある postinstall スクリプト、タイポスクワッティング、公開直後のパッケージへの汚染）が増加している。
グローバルの `~/.npmrc` に一部設定があっても、リポジトリをクローンした別環境・CI 環境では引き継がれないため、プロジェクトレベルで明示的に設定する必要がある。

### 決断

`.npmrc` をプロジェクトルートに追加し、以下を設定する。

| 設定                  | 効果                                                        |
| --------------------- | ----------------------------------------------------------- |
| `ignore-scripts=true` | postinstall 等のライフサイクルスクリプトを実行しない        |
| `min-release-age=7`   | npm に公開されてから7日未満のパッケージのインストールを拒否 |
| `save-exact=true`     | `npm install <pkg>` 時に `^` なしで正確なバージョンを固定   |

グローバル設定にも同じ値があるが、プロジェクト側に明示することでグローバル設定の変更・別マシン・CI に依存しない保護を保証する。

### 却下した選択肢

- **グローバル設定のみに依存**: クローン先の環境に保証がない。CI では特に無効になりやすい。
- **`audit-level=high` の追加**: 開発中に `npm install` のたびに失敗するとノイズになりやすいため、CI の別ステップで管理する判断とした。

### 結果・トレードオフ

- ✅ postinstall スクリプトによる任意コード実行を防止
- ✅ 公開直後の汚染パッケージ（7日以内）をブロック
- ✅ バージョン範囲の意図しない広がりを防止
- ⚠️ `ignore-scripts=true` により、スクリプトに依存するパッケージ（一部ネイティブモジュール等）は別途 `--ignore-scripts=false` が必要になる場合がある

---

## [010] カラートークンを CSS 変数に移行（ダークモード対応準備）

**2026-04-12 | ステータス: 採用**

### 背景

当初ダークモードの実装を予定していたが、デザイン見直しの際に一時棚上げした。
`src/utils/styles.ts` の `colors` オブジェクトが hex 値を直接持っていたため、
将来ダークモードを追加する際にコンポーネントを全件修正しなければならない構造だった。

### 決断

`colors.*` の値を hex から CSS 変数参照（`var(--color-*)`）に変更する。
実際の色値は `src/styles/global.css` の `@theme` / `:root` ブロックに集約する。

```
global.css (@theme / :root)  ← 色値の唯一の定義場所
    ↑ var(--color-*)
styles.ts (colors.*)         ← CSS 変数参照のみ
    ↑ colors.*
各コンポーネント              ← 変更不要
```

ダークモード追加時は `global.css` に `.dark { }` ブロックを追加するだけでよく、
コンポーネントは一切変更不要になる。

あわせて `CopyButton.tsx`・`JanCode.tsx` の hex 直書きも `colors.*` に統一した。

**注意**: JsBarcode・bwip-js 等のサードパーティレンダラーに渡す色は CSS 変数を解釈できないため、
それらの設定値（`background: '#ffffff'` 等）は hex 直書きのままとする。

### 却下した選択肢

- **現状維持（hex 直値）**: ダークモード追加時に全コンポーネントの修正が必要になる。
- **Tailwind のカラークラスを使う**: Tailwind クラスはインラインスタイルと混在させると管理が複雑になる。このプロジェクトは Tailwind をレイアウトのみに限定し、色はインラインスタイルで統一する方針。

### 結果・トレードオフ

- ✅ ダークモード追加時のコンポーネント変更がゼロになる
- ✅ 色値の定義が `global.css` に一元化され、重複がなくなった
- ✅ `--color-warning` の誤った値（amber-600 → WCAG AA 不合格）を amber-800 に修正できた
- ⚠️ `var(--color-*)` 文字列は TypeScript の型推論が効かないため、typo はビルド時に検出されない

---

## [011] pre-commit フックによるドキュメント更新チェック

**2026-04-12 | ステータス: 採用**

### 背景

`package.json`・`.npmrc`・デザインシステムファイル等の変更後に `docs/decisions.md` や `SPEC.md` の更新を忘れるケースが繰り返し発生した。
CLAUDE.md にルールを記載するだけでは実効性が低かった。

### 決断

`.githooks/pre-commit` スクリプトを追加し、重要ファイルの変更時に対応ドキュメントが未更新であれば警告を出す。
コミットはブロックしない（exit 0）。

| トリガー                       | 警告対象                                    |
| ------------------------------ | ------------------------------------------- |
| `package.json` 変更            | `docs/decisions.md`・`SPEC.md`              |
| `.npmrc` 変更                  | `docs/decisions.md`                         |
| `.github/workflows/` 変更      | `docs/decisions.md`                         |
| `global.css`・`styles.ts` 変更 | `docs/decisions.md`                         |
| 新規ツールページ追加           | `README.md`・`SPEC.md`・`docs/decisions.md` |

`git config core.hooksPath .githooks` を初回セットアップ時に実行することで有効になる。

### 却下した選択肢

- **コミットブロック**: 緊急時や意図的にスキップしたいケースで邪魔になる。警告のみで十分。
- **husky 等のツール導入**: 依存を増やしたくない。シェルスクリプトで十分な機能を実現できる。
- **`prepare` npm スクリプトで自動設定**: `.npmrc` の `ignore-scripts=true` により実行されないため使えない。

### 結果・トレードオフ

- ✅ コミット時に自動チェックが走り、Claude・人間どちらの操作にも有効
- ✅ 依存ゼロ（シェルスクリプトのみ）
- ⚠️ 初回クローン後に `git config core.hooksPath .githooks` を手動実行する必要がある

---

## [012] TypeScript 型チェックに @astrojs/check を採用

**2026-04-12 | ステータス: 採用**

### 背景

TypeScript の警告がコミット前に検出されず、複数ファイル・複数コミットにわたって見落とされるケースが繰り返し発生した。
`tsc --noEmit` は Astro プロジェクトの `.astro` ファイルを認識できないため、単体では不十分。

### 決断

`@astrojs/check` + `typescript` を devDependencies に追加し、pre-commit フックで `astro check` を実行する。
エラーが 1 件以上あればコミットをブロックする。

### 却下した選択肢

- **`npx tsc --noEmit`**: `.astro` ファイルを型チェックできない。
- **CI のみ**: コミット後に気づくため修正コストが高い。

### 結果・トレードオフ

- ✅ `.astro`・`.tsx`・`.ts` すべてをコミット前に型チェックできる
- ✅ エラーのみブロック、hint/warning は通過させる（開発速度を損なわない）
- ⚠️ `astro check` は初回起動がやや遅い（数秒）

---

## [013] 共通 UI コンポーネントを `src/components/ui/` に集約

**2026-04-13 | ステータス: 採用**

### 背景

ツール数が7件に増えた段階で、各ツールコンポーネントに同じパターンが重複していた。

- `label + input/textarea + error表示 + hint表示 + サンプルボタン` の組み合わせ（5ツールで重複）
- `SVGダウンロード + PNGダウンロード` のボタンペア（JanCode・Gs1Databar で重複）
- フォーカスリングハンドラ（`onFocusRing`/`onBlurRing`）の直書き（全ツールで重複）
- `role="alert"` エラー表示の `<p>` タグ（複数ツールで重複）

### 決断

以下の共通コンポーネントを `src/components/ui/` に追加する。

| コンポーネント        | 責務                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ |
| `InputField`          | label・input または textarea・error/hint・サンプルボタンを統合したフォームフィールド |
| `ErrorMessage`        | `role="alert"` 付きエラー表示。`id` を指定すると `aria-describedby` と連動できる     |
| `DownloadButtonGroup` | SVG/PNGダウンロードのボタンペア。`onDownloadPng` は省略可                            |

**新規ツールを作るときは、生の `<input>` / `<textarea>` ではなく `InputField` を使うこと。**

### 却下した選択肢

- **共通化せずに継続**: ツール数が増えるほど修正箇所が増える。フォーカスリングのスタイル変更1件でも全ツールを触ることになる。
- **Astro コンポーネントで実装**: インタラクション（エラー状態・サンプル入力ボタン）を含むため、React コンポーネントとして実装するほうが自然。
- **shadcn/ui 等の UI ライブラリ導入**: `.npmrc` の `min-release-age=7` 制約があり追加パッケージのリスクがある。DADSカラーシステムとの統合も複雑になる。

### 結果・トレードオフ

- ✅ フォームフィールド周りの変更が `InputField.tsx` 1ファイルの修正で全ツールに反映される
- ✅ アクセシビリティ属性（`aria-describedby`・`aria-invalid`・`role="alert"`）の抜け漏れがなくなる
- ✅ 各ツールコンポーネントのコード量が約 30〜40 行削減された
- ⚠️ `InputField` のラベルスタイルは `bodyEmphasis`（17px Bold）に固定されるため、それと異なるスタイルが必要な場合は生の要素を使うこと

---

## [014] JSON/XML変換に fast-xml-parser を採用

**2026-04-14 | ステータス: 採用**

### 背景

JSON/XML 相互変換ツールの追加にあたり、ブラウザ完結で動作する XML パーサー/ビルダーが必要になった。

### 決断

`fast-xml-parser` を採用する。

- `XMLParser` / `XMLBuilder` の両方を提供し、パース・シリアライズを 1 パッケージで完結できる
- `attributeNamePrefix: "@_"` / `textNodeName: "#text"` オプションで属性とテキストノードの JSON 表現を制御できる
- DOM 非依存のため Node.js（Vitest）・ブラウザ双方で動作する
- TypeScript 型定義が同梱されている

### 却下した選択肢

- **DOMParser / XMLSerializer（ブラウザ組み込み）**: ブラウザ依存のため Vitest でのユニットテストが不可能。
- **xml2js**: 双方向変換の API が統一されておらず、型定義が `@types/xml2js` の別パッケージに分かれている。
- **自前実装**: XML の仕様（属性・名前空間・CDATA 等）を完全に扱うのは非現実的。

### 結果・トレードオフ

- ✅ パース・ビルドの両方を同じ設定オプション体系で扱える
- ✅ Vitest でのユニットテストが可能
- ⚠️ XML 名前空間（xmlns）は現状未対応（仕様上スコープ外）

---

## [015] JSON/CSV変換に papaparse を採用

**2026-04-14 | ステータス: 採用**

### 背景

JSON/CSV 相互変換ツールの追加にあたり、ブラウザ完結で CSV のパースとシリアライズが必要になった。

### 決断

`papaparse` を採用する。

- `header: true` で1行目をキーとして自動マップできる
- `dynamicTyping: true` で数値・真偽値の自動型変換ができる
- `Papa.unparse()` でオブジェクト配列から CSV への逆変換も可能
- デファクトスタンダード（weekly DL 数百万）でメンテナンスが継続している
- `@types/papaparse` で TypeScript 対応済み

ネストされたオブジェクトのフラット化（ドット記法）は papaparse の責務外のため、
`src/utils/json-csv.ts` 内の `flattenObject()` で独自実装した。

区切り文字は現状カンマ固定（`delimiter: ','` を明示指定）。将来的なオプション化に備え、定数化せずに引数化できる構造にしている。

### 却下した選択肢

- **csv-parse / csv-stringify（Node.js Stream ベース）**: ブラウザ環境では動作しない。
- **自前実装**: RFC 4180 準拠（クォート・エスケープ・改行内文字列）の CSV パーサーは実装コストが高い。

### 結果・トレードオフ

- ✅ CSV パース・シリアライズを 1 パッケージで完結できる
- ✅ `delimiter: ','` 明示により単一列 CSV での `UndetectableDelimiter` 警告を回避できる
- ⚠️ ネストフラット化は自前実装のため、深い入れ子や循環参照には対応していない

---

## [016] E2E リグレッションテストに Playwright を採用

**2026-04-14 | ステータス: 採用**

### 背景

Vitest によるユニットテストは `src/utils/` の純粋関数を保護しているが、
ブラウザ上でのコンポーネント動作（入力 → 変換 → 出力表示）はテストされていなかった。
UIレイアウト変更のたびに手動でスクリーンショット確認を行っていたが、ツールが9件に増え、
変更時の手動確認コストが増大していた。

### 決断

`@playwright/test` を devDependency として追加し、`tests/e2e/` 以下に E2E テストを配置する。
テスト対象は各ツールの基本的な入出力動作（機能リグレッション）に絞る。

- 入力フィールドへの値入力 → 出力テキストエリアの内容検証
- エラー表示の確認
- モード切替（JSON→CSV / CSV→JSON 等）の動作確認

ビジュアルリグレッション（スクリーンショット比較）は現フェーズでは対象外。
ベースライン管理コストが高く、機能テストのほうが ROI が高いと判断。

### 却下した選択肢

- **React Testing Library（コンポーネントテスト）**: DOM のモックが必要で、実ブラウザ動作との乖離リスクがある。Astro Islands との統合も複雑。
- **Vitest のブラウザモード**: 実験的機能のため安定性が低い。
- **ビジュアルリグレッション（スクリーンショット比較）**: ベースライン画像の管理・更新コストが高い。機能テストで検出できるバグの優先度が高い。

### 結果・トレードオフ

- ✅ 実ブラウザ上の変換動作をテストできる（Vitest の補完）
- ✅ ツール追加・UI変更後の機能退行を自動検出できる
- ✅ `npm run dev` が起動済みの状態でテスト実行可能（CI にも組み込み可）
- ⚠️ `@playwright/test` + ブラウザバイナリのインストールが必要（CI での初回セットアップコストあり）
- ⚠️ `.npmrc` の `ignore-scripts=true` により `npx playwright install` を別途実行する必要がある

---

## [017] main → develop の自動同期に GitHub Actions を採用

**2026-04-15 | ステータス: 採用**

### 背景

feature ブランチから main へのマージ後、develop への同期を手動で行っていた。
忘れると develop が main より遅れたまま新機能開発が進み、後でコンフリクトが大きくなるリスクがあった。

### 決断

`.github/workflows/sync-main-to-develop.yml` を追加し、main への push をトリガーに
`main → develop` の PR を自動作成する。

- `gh pr list` で既存の同一 PR を確認し、重複作成を防ぐ
- `GITHUB_TOKEN` の `pull-requests: write` 権限のみで動作する
- PR 本文は `printf` で生成し、YAML のマルチライン文字列問題を回避する

### 却下した選択肢

- **`peter-evans/create-pull-request` Action**: サードパーティ Action の追加は `.npmrc` の `min-release-age` ポリシーとは直接関係しないが、外部依存を増やしたくないため `gh` CLI のみで実装。
- **`git merge` による自動マージ**: コンフリクト発生時に CI が失敗して止まるより、PR として人間が確認できるほうが安全。

### 結果・トレードオフ

- ✅ main マージ後の develop 同期漏れを防止できる
- ✅ `GITHUB_TOKEN` のみで動作し、追加 Secret 不要
- ⚠️ develop ブランチに required status checks が設定されているため、main → develop の PR は CI が通るまでマージできない（意図した動作）

---

## [018] スワイプタブに CSS scroll-snap を採用

**2026-04-15 | ステータス: 採用**

### 背景

トップページのタブ切り替えをスマホで横スワイプできるようにしたいという要件が発生した。

### 決断

CSS `scroll-snap-type: x mandatory` とブラウザネイティブのスクロールを使用する。
タブとパネルを1対1で対応させた3パネル構成とし、タブとの同期には `scrollend` イベントを使用する。

### 却下した選択肢

- **Swiper.js などのサードパーティライブラリ**: バンドルサイズが増大する割に、ネイティブの scroll-snap で代替可能なため却下
- **`touchstart` / `touchend` の手動実装**: iOS のモメンタムスクロールや慣性が失われ、コードも増える。scroll-snap に委譲すればブラウザが最適化してくれるため却下
- **`scrollIntoView` によるスクロール**: ページ全体の縦スクロールも動かす副作用があるため、`panels.scrollTo()` に変更

### 結果・トレードオフ

- ✅ JavaScript のコード量が少なく、保守しやすい
- ✅ iOS/Android のモメンタムスクロールがそのまま動作する
- ✅ 追加ライブラリ不要
- ⚠️ `scrollend` イベントは Safari 17 以降（iOS 17+）のサポート。古い環境ではスワイプ後のタブハイライトが更新されないが、対象ユーザーが開発者であること・フォールバックがなくても機能的には使えることから許容範囲と判断

---

## [019] PWA を手動実装（@vite-pwa/astro は使わない）

**2026-04-15 | ステータス: 採用**

### 背景

Android のホーム画面への追加と、アプリライクな起動体験（スタンドアロン表示）を実現するため PWA 対応を行う。

### 決断

`@vite-pwa/astro` などの統合ライブラリは使わず、以下を手動で配置する。

- `public/manifest.webmanifest` — Web App Manifest
- `public/sw.js` — Service Worker（Network-first / Cache-first の組み合わせ）
- `public/icons/icon-192.png` / `icon-512.png` — PNG アイコン
- `BaseLayout.astro` に manifest リンク・`apple-touch-icon`・`theme-color`・SW 登録スクリプトを追加

### 却下した選択肢

- **`@vite-pwa/astro`**: Workbox のバンドルサイズが増大する。また自動生成される SW のキャッシュ戦略が過剰で、静的サイトには不要な複雑さをもたらす。
- **SVG アイコンのみ**: Android Chrome は SVG manifest アイコンの対応が不安定なため PNG を採用。

### 結果・トレードオフ

- ✅ 追加 npm 依存ゼロ（実行時）
- ✅ SW のキャッシュ戦略を完全にコントロール可能
- ✅ オフライン時は `/` をフォールバックとして返す最小限の対応
- ⚠️ Workbox のような高度なキャッシュ（Stale-while-revalidate 等）は手動で追加が必要

---

## [020] UUID v7 生成に uuid ライブラリを採用

**2026-04-16 | ステータス: 採用**

### 背景

UUID v7 生成ツールの追加にあたり、RFC 9562 準拠の UUID v7 を生成するライブラリが必要になった。
手動実装も検討したが、ランダムビット生成・モノトニック性保証など、仕様に準拠した実装は複雑。

### 決断

`uuid` パッケージの `v7()` 関数を採用する。

- RFC 9562 準拠の UUID v7 を `v7()` 1 関数で生成できる
- Tree-shakable なため `import { v7 } from 'uuid'` でバンドルサイズへの影響を最小化できる
- TypeScript 型定義が `@types/uuid` で提供されている
- 週次 DL 数億件のデファクトスタンダード

UUID の 5 フィールド分解・タイムスタンプ抽出は `src/utils/uuid-v7.ts` で自前実装し、ライブラリへの依存を最小化した。

### 却下した選択肢

- **`ulidx`（ULID ツールで使用済み）を流用**: ulidx は ULID 生成専用で UUID v7 は未対応。
- **`crypto.randomUUID()`**: UUID v4 のみ生成。v7 非対応。
- **自前実装**: `unix_ts_ms` の単調増加保証など仕様の細部に落とし穴が多く、バグリスクが高い。

### 結果・トレードオフ

- ✅ RFC 9562 準拠が保証される
- ✅ タイムスタンプ抽出ロジックは自前のため、ライブラリ内部実装に依存しない
- ⚠️ `@types/uuid` を devDependency として追加する必要がある

---

## [021] Base64 エンコード/デコードはブラウザ組み込み API のみで実装

**2026-04-16 | ステータス: 採用**

### 背景

Base64 エンコード/デコードツールの追加にあたり、外部ライブラリを使うか、ブラウザ組み込み API で実装するかを検討した。

### 決断

外部ライブラリを使わず、ブラウザ組み込み API のみで実装する。

- `TextEncoder` / `TextDecoder` で UTF-8 ↔ バイト列変換
- `btoa()` / `atob()` で Base64 エンコード/デコード
- URL-safe 変換は正規表現による文字列置換と `fatal: true` オプション付き `TextDecoder` で実装

### 却下した選択肢

- **`js-base64` 等の外部ライブラリ**: `.npmrc` の `min-release-age=7` 制約があり追加リスクがある。ブラウザ API で十分な機能を実現できるため不採用。
- **Node.js の `Buffer`**: ブラウザ環境では使用不可。

### 結果・トレードオフ

- ✅ 追加 npm 依存ゼロ
- ✅ バンドルサイズへの影響なし
- ✅ `fatal: true` で非 UTF-8 バイナリを正確に検出し「テキストとして表示できないデータです」を表示できる
- ⚠️ バイナリファイルのエンコード/デコードには非対応（テキスト専用）

---

## [022] QRコード読取に jsqr を採用

**2026-04-17 | ステータス: 採用**

### 背景

QRチケットツールの検証タブで、カメラや画像ファイルからQRコードをデコードする必要がある。ブラウザ完結型のため、サーバーへ画像を送信しない実装が求められる。

### 決断

`jsqr@1.4.0` を採用する。`ImageData`（`Uint8ClampedArray` + 幅・高さ）を受け取り、QR文字列またはnullを返す純粋なJavaScript関数として使用する。カメラフレームのデコードには`requestAnimationFrame`ループ内で同期的に呼び出す。

### 却下した選択肢

- **`html5-qrcode`**: カメラUI・エラー表示を内包しており、このプロジェクトのインラインスタイル方針と競合する。バンドルサイズも大きい。
- **`BarcodeDetector` Web API**: Firefox が未対応（2026年4月時点）。Safari も対応が不完全なため、単独では採用できない。
- **動的インポート方式**: `requestAnimationFrame`ループ内での非同期呼び出しはフレーム競合を起こす可能性があるため、コンポーネントのトップレベルで静的インポートする方式を採用した。

### 結果・トレードオフ

- ✅ 純粋なJavaScript・依存ゼロ・~50KB
- ✅ `ImageData`を受け取るシンプルなAPI → カメラ・画像アップロード双方に対応
- ✅ QR仕様は安定しており、2021年最終公開でも実用上問題なし
- ⚠️ `min-release-age=7` は満たす（公開から数年経過）

---

## [023] チケット署名にWeb Crypto API（ECDSA P-256）を採用

**2026-04-17 | ステータス: 採用**

### 背景

QRチケットツールは自己完結型（DBサーバー不要）のチケット検証を実現する。チケットデータの改竄を防ぐため、暗号署名が必要。主催者（生成者）と検証スタッフが別人でも秘密鍵を共有せずに済む非対称鍵方式が適切。

### 決断

ブラウザ組み込みの`Web Crypto API`（`crypto.subtle`）を使用し、ECDSA P-256 / SHA-256で署名・検証する。外部暗号ライブラリは不要。

- 生成: `crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])`
- 署名: `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data)`
- 検証: `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, sig, data)`
- 鍵の持ち運び: JWK形式（JSON）でエクスポート・インポート

### 却下した選択肢

- **`noble-curves`（@noble/curves）など外部暗号ライブラリ**: Web Crypto APIで十分な機能を提供できる。追加依存を増やすべきでない（Decision [002][009]の方針）。
- **HMAC-SHA256（対称鍵）**: 生成者と検証者が同一の秘密鍵を共有する必要があり、スタッフへの鍵配布が安全でない。

### 結果・トレードオフ

- ✅ 追加ライブラリゼロ
- ✅ Node.js 22+・モダンブラウザすべてで動作（プロジェクトの `engines.node >= 22.12.0` を満たす）
- ✅ JWK形式で鍵をテキストとしてコピー・保存・共有できる
- ⚠️ ステートレス検証のため同一QRの重複スキャン防止は行わない（設計上の意図的な制約）

---

## [024] QRチケットのデータ形式に JSON を採用（JWT ではなく）

**2026-04-18 | ステータス: 採用**

### 背景

QRチケットツールでチケットデータをQRコードにエンコードする際、データ形式としてJWTとJSONの2つの選択肢があった。

### 決断

署名フィールド（`s`）を含むフラットなJSONオブジェクトを採用する。

```json
{ "e": "イベントID", "s": "base64url署名", "t": "チケットID", "x": "2026-04-20T18:00" }
```

### 却下した選択肢

- **JWT（JSON Web Token）形式**: 以下の理由で不採用。
  - **オーバースペック**: JWTはヘッダー（`alg`・`typ`）を必須とするが、本ツールでは署名アルゴリズムがECDSA P-256固定であり、ヘッダー部分が冗長。
  - **QRコードのサイズ増大**: JWTは `header.payload.signature` の3パートすべてをBase64URLエンコードするため、同じ情報量でもフラットJSONより長くなる。QRコードの容量制約上、コンパクトな形式が有利。
  - **既存ツールとの役割重複**: 本プロジェクトにはJWTデコーダーが別ツールとして存在しており、QRチケットでもJWT形式を使うと両者の境界が曖昧になる。

### 結果・トレードオフ

- ✅ QRコードのデータ量を最小限に抑えられる
- ✅ パース処理が単純（`JSON.parse` のみ）
- ✅ JWTデコーダーとの役割が明確に分離される
- ⚠️ JWT標準に準拠しないため、外部システムとの相互運用には別途変換が必要

---

## [025] PWAアイコンを `any` / `maskable` に分離し、マークを `>_` に刷新

**2026-04-19 | ステータス: 採用**

### 背景

Android でホーム画面に追加すると円形マスクが適用され、`</>` マークが大きすぎてバランスが悪かった。  
原因は `manifest.webmanifest` で `"purpose": "any maskable"` と宣言していたにもかかわらず、  
アイコン PNG がマスカブル用の「セーフゾーン」（内側80%円）設計になっていなかった点。

### 決断

1. **`any` と `maskable` を別ファイルに分離**（W3C 推奨）
   - `icon-192/512.png`：角丸背景。ブラウザ・iOS 向け。
   - `icon-maskable-192/512.png`：背景を canvas 端まで塗りつぶし、マークをセーフゾーン内に配置。
2. **マークを `>_`（ターミナルプロンプト）に変更**
   - 円形マスクでの視覚バランスが良い（マーク中心からの最大距離 ≈10.3 < セーフゾーン半径 12.8）。
   - 開発者ツールとしてのアイデンティティが明確。
   - `favicon.svg` も同デザインに統一。

### 却下した選択肢

- **`any maskable` を単一ファイルで継続**：OS がマスク用と通常用を同一ファイルで兼用するため、セーフゾーン調整が難しい。
- **`</>` のまま縮小のみ**：バランスは改善されるがスタイリッシュさが不足。
- **`D/` モノグラム**：視認性は高いが文字ベースで他ツールとの差別化度が低い。

### 結果・トレードオフ

- ✅ Android 円形マスクでマークが見切れない
- ✅ ブランドアイデンティティが刷新されスタイリッシュになった
- ✅ W3C maskable アイコン仕様に準拠
- ⚠️ アイコンファイルが 2 枚 → 4 枚に増加（計 ~50KB 増）

---

## [026] 文字コード判定・変換に encoding-japanese を採用

**2026-04-24 | ステータス: 採用**

### 背景

文字コード判定・変換ツールの追加にあたり、UTF-8・Shift_JIS・EUC-JP・ISO-2022-JP・UTF-16LE/BE の相互変換と自動判定をブラウザ完結で実現する必要があった。
日本語レガシーデータ（SJIS CSV、EUC-JP ログ、ISO-2022-JP メール等）を扱う現場での文字化け問題が解決の動機。

### 決断

`encoding-japanese@2.2.0` を採用する。

- `Encoding.detect()` による文字コード自動判定と `Encoding.convert()` による相互変換を 1 パッケージで提供
- ピュア JavaScript でブラウザ・Node.js 両対応（Vitest でのユニットテストも可能）
- ~60 KB minified。Astro のページ単位コード分割により、他ツールのバンドルへの影響ゼロ
- MIT ライセンス、バージョン固定（`save-exact=true`）で固定管理

**実装上の注意点:**

- `Encoding.detect()` の戻り値は `'UTF16'` / `'UNICODE'` 等の表記揺れがあるため、`EJ_NORMALIZE` マップで内部 `EncodingName` 型に正規化している
- BOM 判定は `Encoding.detect()` だけでは不十分なため、先頭バイトを自前で確認（UTF-8: `EF BB BF` / UTF-16LE: `FF FE` / UTF-16BE: `FE FF`）
- UTF-8 BOM の付与: `encoding-japanese` の `bom: true` オプションは UTF-8 BOM を付与しない（UTF-16 にのみ有効）。UTF-8 BOM は `[0xef, 0xbb, 0xbf, ...result]` で手動プリペンドする
- UTF-16 BOM の付与: `to: 'UTF16'` + `bom: 'LE'/'BE'` を使用する（`to: 'UTF16LE'/'UTF16BE'` と `bom: true` の組み合わせでは BOM が付かない）
- 巨大文字列の `String.fromCharCode` によるスタック溢れ防止: 8192 刻みのチャンク処理を実装

### 却下した選択肢

- **`TextDecoder` 単独**: UTF-8 以外へのエンコードができないため変換機能が成立しない
- **`iconv-lite`**: Node.js 前提で `Buffer` 依存。ブラウザバンドルが重い
- **`jschardet`**: 判定のみで変換機能がなく、変換には別ライブラリが必要になり二重依存になる

### 結果・トレードオフ

- ✅ 判定・変換を 1 パッケージで完結できる
- ✅ ブラウザ完結（サーバー不要）で動作
- ✅ E2E テストで SJIS/EUC-JP/UTF-8 BOM の変換バイト列を検証済み
- ⚠️ テキスト入力（ブラウザ内は常に UTF-8）から SJIS/EUC-JP 等への変換は、入力を UTF-8 として扱う前提になる
- ⚠️ 入力サイズ上限を 10 MB に設定（ブラウザメモリ保護のため）

---

## [027] 改行コード正規化で UTF-16 を対象外とした

**2026-04-25 | ステータス: 採用**

### 背景

Issue #51 で文字コード変換ツールに改行コード正規化オプション（そのまま / LF / CRLF）を追加した。UTF-16 は 2 バイト単位でコードユニットを扱うため、単純なバイト単位の `0x0D`/`0x0A` 置換では不正なコードユニット列を生成する恐れがある。

### 決断

UTF-16LE / UTF-16BE ターゲット選択時は改行コードトグルを非表示にして「そのまま」相当に固定する。UI に「UTF-16 では改行コード正規化は適用されません」と明示する。

### 却下した選択肢

- **2 バイト単位で正規化する**: UTF-16LE の `\r\n` は `0x0D 0x00 0x0A 0x00`、UTF-16BE は `0x00 0x0D 0x00 0x0A` として扱う必要がある。さらにサロゲートペアとの境界確認も必要で、実装・検証コストが Issue の明文スコープ（「`0x0D 0x0A` ↔ `0x0A`」のバイト置換）と不釣り合いだった。

### 結果・トレードオフ

- ✅ UTF-8/SJIS/EUC-JP/JIS/ASCII の主要ユースケースを安全に処理できる
- ✅ バイト単位の 1 パス実装でシンプルかつ高速
- ⚠️ UTF-16 ターゲット時は改行コード変換不可（将来の拡張候補）

---

## [028] SVG 手動組立時の XSS 対策として HTML エスケープを徹底

**2026-04-25 | ステータス: 採用**

### 背景

`Gs1Databar.tsx` にて、ライブラリが生成した SVG にユーザー入力を後からテキストとして挿入する際、文字列結合で `<text>` 要素を組み立てていた。
この入力がエスケープされずに `dangerouslySetInnerHTML` で描画されていたため、反射型 XSS の脆弱性が発生した。

### 決断

SVG 文字列を直接操作してユーザー入力を挿入する場合は、必ず HTML エンティティエスケープを適用する。

- `escapeHtml` ユーティリティを共通化し、文字列結合の直前に適用する。
- ユーザー入力を含むテキストノードを組み立てる際は、`escapedText` を使用する。
- 幅計算（`text.length` 等）には、エスケープ前の元の文字列を使用する（ブラウザ描画上の文字数と一致させるため）。

可能であれば、文字列結合ではなく JSX や DOM API を使用して SVG を構築することを優先するが、
ライブラリが生成した文字列を加工する必要がある場合は、このエスケープルールを強制する。

### 却下した選択肢

- **バリデーションでの制限**: AI フィールドのバリデーションを厳しくして `<>&` を禁止することも可能だが、仕様上それらの文字を許容すべきケースがあるため不採用。
- **サニタイズライブラリ（DOMPurify 等）の導入**: 単純なテキストエスケープで十分対応可能であり、依存を増やしたくないため不採用。

### 結果・トレードオフ

- ✅ セキュリティリスクを最小限のコード変更で解消できる。
- ✅ 外部依存を増やさずに対応可能。
- ⚠️ 手動での文字列操作が残るため、開発者がエスケープを忘れるリスクが依然として存在する。コードレビューや静的解析でのチェックが必要。

---

## [029] SJIS 表示ラベルを "Shift_JIS (CP932)" に変更

**2026-04-25 | ステータス: 採用**

### 背景

文字コード変換ツールの内部エンコーディング識別子は `SJIS` であり、`encoding-japanese` ライブラリの SJIS 実装は実質的に **CP932（Windows-31J）** と同等の動作をする（NEC 特殊文字・IBM 拡張漢字を含む Windows ファイルを正しく処理できる）。

しかし表示ラベルが `'Shift_JIS'` のままだと、JIS X 0208 ベースの純粋な Shift-JIS のみ対応しているかのように見える。Windows ユーザーが生成するファイルの大半は CP932 エンコーディングであるため、ラベルの実態との乖離がユーザーの混乱を招く可能性があった。

### 決断

`ENCODING_LABELS.SJIS` を `'Shift_JIS'` から `'Shift_JIS (CP932)'` に変更する。  
実装ロジック・型・内部識別子・トグルボタンの短縮ラベル（`'SJIS'`）は変更しない。

### 却下した選択肢

- **ラベルを "CP932" のみにする**: CP932 / Windows-31J という表記は技術者以外には馴染みが薄く、親しみのある Shift-JIS という名称を残す方が分かりやすい。
- **CP932 を独立したエンコーディングとして追加**: `encoding-japanese` の SJIS が既に CP932 互換であるため、二重管理になり不要な複雑さを招く。

### 結果・トレードオフ

- ✅ ライブラリの実際の動作とラベルが一致し、ユーザーの期待と齟齬が生じにくくなる
- ✅ 実装ロジックへの変更ゼロで適用可能
- ⚠️ "CP932" という補足表記が初見のユーザーには若干馴染みづらい可能性はあるが、知っている人には正確な情報として有益

---

## [030] base64url 変換を `src/utils/base64url.ts` に集約

**2026-04-25 | ステータス: 採用**

### 背景

base64url（`+`→`-`, `/`→`_`, パディング `=` 除去）の相互変換ロジックが 3 箇所で独立に再実装されていた。

- `src/utils/base64.ts` の urlSafe パス（テキスト⇄テキスト、UTF-8 経由）
- `src/utils/jwt.ts` の `base64UrlToBytes`（バイト列向け）
- `src/utils/qr-ticket.ts` の `bufferToBase64Url` / `base64UrlToBuffer`（ArrayBuffer 向け）

それぞれパディング補完・正規化の実装が微妙に異なり、テストも個別に書かれていた。バグ修正や仕様追加が一箇所で済まない。

### 決断

`src/utils/base64url.ts` を新設し、低レベル（バイト／ArrayBuffer）⇄ base64url 文字列の変換を一元実装する。

公開 API:

- `bytesToBase64Url(bytes: Uint8Array): string`
- `base64UrlToBytes(str: string): Uint8Array<ArrayBuffer>` — `crypto.subtle.verify` 等の `BufferSource` を要求する API に直接渡せるよう戻り型を絞り込む
- `bufferToBase64Url(buf: ArrayBuffer): string`
- `base64UrlToBuffer(str: string): ArrayBuffer`

`jwt.ts` は `base64UrlToBytes` を再エクスポートして互換性を維持し、`qr-ticket.ts` は内部ローカル関数を削除して `base64url.ts` を直接利用する。`base64.ts` の Tool 公開 API（`encodeBase64` / `decodeBase64`）はエラーメッセージ仕様を維持するため触らない。

### 却下した選択肢

- **`base64.ts` の中に統合する**: 既存の `base64.ts` は UTF-8 テキスト⇄文字列のレイヤで、Error メッセージの詳細仕様（"有効なBase64文字列ではありません" など）が日本語ローカライズされた Tool API。バイト／ArrayBuffer のレイヤは責務が異なるため別ファイルに切る方が境界が明確。
- **`Result<T, E>` 型を導入してエラーハンドリングを統一**: 全 utils を巻き込む大改修になるためスコープ外。今回は重複削除のみに絞る。

### 結果・トレードオフ

- ✅ 同一アルゴリズムの実装が 1 箇所に集約され、Vitest テスト（往復・パディング・全バイト域 0x00-0xFF・日本語 UTF-8）も一箇所で網羅
- ✅ `jwt.ts` の `base64UrlToBytes` はモジュール外から見える挙動が変わらないため後方互換
- ⚠️ `Uint8Array<ArrayBuffer>` という TS 5.7+ 由来の絞り込み戻り型を使用しており、TypeScript のバージョンを下げる場合は要再検討

---

## [031] 入力→デバウンス→変換→出力 パターンを `useCodec` フックに抽出

**2026-04-25 | ステータス: 採用**

### 背景

Base64 / JSON↔XML / JSON↔CSV の各変換ツールで以下のボイラープレートがほぼ完全にコピーされていた。

```tsx
const [input, setInput] = useState('');
const [output, setOutput] = useState('');
const [error, setError] = useState('');

useEffect(() => {
  if (!input) {
    setOutput('');
    setError('');
    return;
  }
  const timer = setTimeout(() => {
    try {
      setOutput(transform(input));
      setError('');
    } catch (e) {
      setOutput('');
      setError(e instanceof Error ? e.message : '変換に失敗しました');
    }
  }, 300);
  return () => clearTimeout(timer);
}, [input, ...deps]);
```

修正やデバウンス時間の調整・エラーフォールバック文言の統一が一箇所でできない。

### 決断

`src/hooks/useCodec.ts` を新設し、`useEffect` と同形のシグネチャ `useCodec(transform, deps, options?)` で上記パターンをカプセル化する。`{ input, setInput, output, setOutput, error, setError, reset }` を返し、利用側はモード切替時の即時クリアなどで個別セッターを使える余地を残す。

適用ツール: `Base64Codec`、`JsonXml`、`JsonCsv`。

### 却下した選択肢

- **`UrlEncoder` にも適用**: 当ツールは同期計算＋ライブバリデーション（`validateDecodeInput` は throw せず空文字列／エラー文字列を返す）であり、`useCodec` を強制すると 300ms のデバウンス遅延が混入し UX を損なう。出力カードのみ `OutputField` に置換した。
- **`EncodingConverter` にも適用**: 当ツールは入力種別（テキスト／ファイル）・モード（判定／変換）・複数のエンコーディングオプションが入り組んだ多次元状態で、単一の `transform: string => string` には収まらない。出力カードのみ `OutputField` に置換した。
- **コールバック自体をメモ化必須にする API**: 利用側に `useCallback` を強制すると毎ツールで定義が増える。`useEffect` と同じ deps 配列方式に揃え、`react-hooks/exhaustive-deps` をフック内部で意図的に無効化する設計を選んだ。
- **フック単体テストを追加**: 既存方針（[005][006]）で React Testing Library を不採用としているため、フック内部はテスト対象外。動作担保は既存の Playwright E2E（`base64.spec.ts` 等）で行う。

### 結果・トレードオフ

- ✅ 各ツールの行数が減り、デバウンス時間・エラー文言の統一が一箇所で可能
- ✅ `useEffect` と同じ `(callback, deps)` 形式のシグネチャで学習コストが低い
- ⚠️ フック内部は単体テストされていないため、リグレッションは E2E で検出する必要がある

---

## [032] 出力カードを `OutputField` 共通コンポーネントに集約

**2026-04-25 | ステータス: 採用**

### 背景

出力エリアの DOM 構造（ラベル＋ visibility 制御 CopyButton ＋ readOnly textarea）が Base64 / JSON-XML / JSON-CSV / URL-encode / EncodingConverter で類似コピーされており、ヘッダ高さ（`minHeight: 2rem`）・空値時のレイアウト保持（`visibility: hidden`）・`monospace` 切替などの細部の差分管理が散らばっていた。

### 決断

`src/components/ui/OutputField.tsx` を新設し、上記 5 ツールに適用する。`rightSlot` プロップで CSV ダウンロード／変換ファイルダウンロードなどの追加要素をヘッダ右側に並置できるようにし、`showCopy={false}` で CopyButton を抑止できる（EncodingConverter で UTF-8 以外の出力時に使用）。

ヘッダ全体（rightSlot ＋ CopyButton）を値が空のとき `visibility: hidden` でまとめて非表示にし、これまで個別ツールがバラバラに実装していたパターンを正規化した。

### 却下した選択肢

- **`InputField` に出力モードを追加（`readOnly` プロップ拡張）**: 入力欄と出力欄では「ヒント・サンプルボタン・エラー表示」の有無が大きく異なり、合流させるとプロップが増えて責務が曖昧になる。別コンポーネントに切る方が読みやすい。
- **コンポーネント単体テストを追加**: フック同様、プロジェクト方針 [005][006] により対象外。

### 結果・トレードオフ

- ✅ 出力カードの細部仕様が一箇所に集約され、CopyButton の visibility・ヘッダ最小高さ・モノスペース切替の挙動が統一される
- ✅ 各ツールの「出力」セクションが 30 行前後 → 数行に短縮
- ⚠️ コンポーネント API の安定までは追加プロップが発生する可能性あり（例: 検索ハイライト、行番号表示などが将来要件として出てきた場合）

---

## [033] Tailwind 色クラス違反の根絶（`Gs1Databar` / `JanCode`）

**2026-04-25 | ステータス: 採用**

### 背景

CLAUDE.md（プロジェクト規約）で「Tailwind のカラークラス（`text-blue-500` 等）は使わない。色はすべて `src/utils/styles.ts` の `colors.*` をインラインスタイルで指定する」と定めているにも関わらず、以下の違反が残っていた。

- `Gs1Databar.tsx`: `hover:bg-red-50`, `hover:bg-neutral-100`, `hover:bg-neutral-50`, `hover:bg-blue-50`
- `JanCode.tsx`: `text-neutral-700`, `hover:bg-neutral-50`, `hover:bg-neutral-100`, ハードコード hex `#6B7280`

ホバー時の色変化はインラインスタイルで直接表現できないため、これまで Tailwind のホバークラスが残ってしまっていた。

### 決断

`onMouseEnter` / `onMouseLeave` でインラインスタイルを差し替えるパターン（既存の `onFocusRing` / `onBlurRing` と同流儀）を採用し、すべて `colors.errorBg` / `colors.bgSubtle` / `colors.primaryBg` などの DADS トークンに置換する。レイアウト系クラス（`flex`, `gap-*`, `rounded-lg` など）はそのまま残す。

```tsx
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
>
```

### 却下した選択肢

- **`hover:bg-[var(--color-error-bg)]` のような任意値 Tailwind**: 一見筋が通るが、CLAUDE.md の「Tailwind カラークラス禁止」規約を字義通り回避しようとする抜け道に近く、保守時に「これは OK／NG なのか」の判断が増える。インラインへの統一が明示的で読みやすい。
- **CSS Modules や styled-components を導入**: ホバー擬似クラスを書きやすいが、依存追加と既存スタイルパターンの分裂を引き起こす。今回 1 ツールあたり数箇所のためインライン手法で十分。

### 結果・トレードオフ

- ✅ ツール本体（`Gs1Databar` / `JanCode`）の Tailwind 色クラス違反が解消し、ホバー挙動も DADS トークンに統一
- ✅ ダークモード追加（[003] 参照）時には CSS 変数値の差し替えだけで全箇所が追従
- ⚠️ ホバー切替を毎回 `onMouseEnter`/`onMouseLeave` 2 行で書く必要がある。頻出するなら将来的に `useHoverStyle` フックに括り出す余地あり
- ⚠️ ページ／レイアウト系（`src/pages/*.astro`、`src/components/layout/*`、`src/components/ui/DownloadButtonGroup.tsx`）には Tailwind 色クラスが残存している。今回はツール本体の規約違反のみをスコープとし、ページ／レイアウトは別タスクで扱う

---

## [034] 文字コード選択UIを ToggleGroup から Select に変更

### 背景

`EncodingConverter.tsx` の文字コード選択は「元の文字コード（7択）」「変換後の文字コード（6択）」と選択肢が多い。`ToggleGroup` は `gridTemplateColumns: repeat(N, 1fr)` の単一行前提で、7択を1行に並べると横潰れ・スマホ崩れが発生するため、ROW1/ROW2 に分割して `some()` で「他行が選択中なら自分は非選択」とみなすワークアラウンドで実装していた。

### 決断

ネイティブ `<select>` を使った `Select<T>` 共通コンポーネント（`src/components/ui/Select.tsx`）を新規作成し、文字コード選択に採用する。`ToggleGroup` と同じジェネリック API 形状（`options / value / onChange / ariaLabel`）にして将来の置き換えも容易にした。

理由:

- **a11y**: ネイティブ要素のため矢印キー操作・スクリーンリーダー読み上げが OS 標準で完璧
- **スマホ対応**: OS ネイティブピッカーが開くため幅不足の心配がない
- **コード簡潔化**: `some()` ワークアラウンドと2行分の `ToggleGroup` が1行の `Select` に集約
- **縦スペース節約**: ラベル＋2行が1行に収まる

「自動判定」は Select の先頭オプションとして他の選択肢と同列に並べた。

### 却下した選択肢

- **ToggleGroup を flex-wrap 対応に改修**: 見た目は保てるが、`ToggleGroup` のアーキテクチャ（単一行 `grid`）から大きく外れ、`some()` ワークアラウンドは残ったまま。a11y 改善効果もない。
- **ハイブリッド（「自動判定」のみ独立トグル + Select）**: 操作のアフォーダンスが混在して一貫性が下がる。ユーザーが「Select に統一」を選択したため採用しない。

### 結果・トレードオフ

- ✅ `some()` ワークアラウンドが解消し、`encoding.ts` の選択肢配列が統合（`SOURCE_ENCODINGS` / `TARGET_ENCODINGS`）
- ✅ スマホ・タブレットでネイティブピッカーが使える
- ✅ a11y 向上（矢印キー選択・スクリーンリーダー対応）
- ⚠️ ToggleGroup に比べて「選択肢をひと目で見比べる」体験が失われる（クリックで開く必要がある）。ただし7択の文字コードは短縮名（UTF-8/SJIS 等）で差異が大きく、ひと目で比較するメリットは薄い

---

## [035] テストカバレッジの可視化

### 背景

プロジェクトの成長に伴い、テストの網羅性を客観的に把握する必要が出てきた。特に PR 時のデグレード防止や、未テスト箇所の特定を容易にしたいという要望があった。

### 決断

README.md にテストカバレッジのバッジを表示し、GitHub Actions で自動更新する仕組みを導入する。

理由:

- **品質の可視化**: 開発者がテストの不足を即座に認識できる。
- **外部サービス不要**: GitHub Actions と Shields.io 完結で構成することで、設定の簡略化、コスト削減、およびプライバシー（コード情報の外部送信なし）を確保。
- **自動運用**: `main` ブランチへのプッシュ時に `vitest` の `json-summary` レポーターから数値を抽出し、README.md を自動更新・コミットする。

### 却下した選択肢

- **Codecov / Coveralls 等の外部ツール**: 高機能だが、OSS 無料枠の制限や、コードベースを外部サービスにスキャンさせることへのプライバシー懸念がある。本プロジェクトは「ブラウザ完結・外部送信なし」をコンセプトとしているため、カバレッジ管理も極力セルフホストに近い形が望ましいと判断した。

### 結果・トレードオフ

- ✅ プロジェクトの品質状況をひと目で確認できるようになった
- ✅ 外部サービス依存を排除し、GitHub 完結で安全な運用が可能
- ⚠️ バッジ更新のための自動コミットが `main` ブランチに発生する（`[skip ci]` タグを付与して無限ループを防止）
- ⚠️ `json-summary` のパースや `sed` による置換ロジックのメンテナンスが必要

---

## [036] モバイル UX の向上（MobileDrawer とアクセシビリティの改善）

**2026-04-26 | ステータス: 採用**

### 背景

モバイル環境において、ナビゲーションメニュー（サイドバー相当）の操作性が低かった。また、ハンバーガーメニュー展開時のフォーカストラップや、タップターゲットのサイズが DADS 基準に達していなかった。

### 決断

`MobileDrawer` コンポーネントを刷新し、以下の改善を行った：

- **フォーカストラップ**: メニュー展開時に背景へのフォーカス移動を防止し、キーボード操作性を向上。
- **タップターゲット**: すべてのリンクとボタンを 44x44px 以上のクリックエリアに拡大。
- **アニメーション**: CSS 遷移を利用したスムーズな展開・収納を実現。

### 却下した選択肢

- **ページ下部ナビゲーション**: ツール数が多いため、すべてのツールへのアクセスを保証するサイドバー/ドロワー方式が最適と判断。

### 結果・トレードオフ

- ✅ スマホでのツール切り替えが容易になった
- ✅ a11y 評価（Lighthouse）が向上した
- ⚠️ 画面左上からのスワイプ等、ジェスチャーによる開閉には未対応（今後の課題）

---

## [037] focus-visible をCSSで一括適用（JS ハンドラ廃止）

**2026-04-26 | ステータス: 採用**

### 背景

`InputField`・`Select` コンポーネントの focus ring は `onFocusRing`/`onBlurRing` という React ハンドラ（インライン style で outline を JS 操作）で実装されていた。
`ToggleGroup`・`DownloadButtonGroup`・`CopyButton` 等のボタン系は focus ring が存在しなかった。
アクセシビリティ（キーボード操作）の観点で全インタラクティブ要素への一貫した focus ring が必要だった。

### 決断

`global.css` に `:where(button, a, [role="button"], input, textarea, select):focus-visible { outline: var(--focus-ring); outline-offset: 2px; }` を追加し、CSS で一括適用する。
`InputField.tsx`・`Select.tsx` の `onFocusRing`/`onBlurRing` ハンドラと `outline: none` の inline style を削除。
`styles.ts` の `onFocusRing`/`onBlurRing` 関数は `@deprecated` として残存（Phase 2 でツールコンポーネントから順次除去予定）。

### 却下した選択肢

- **JS ハンドラ継続**: 適用漏れが発生しやすく、新コンポーネント追加のたびに追加が必要。
- **:focus（非 focus-visible）**: マウスクリック時にも outline が表示され、視覚ノイズになる。

### 結果・トレードオフ

- ✅ 全インタラクティブ要素に一貫した focus ring が自動適用される
- ✅ 新コンポーネント追加時に追加対応不要
- ⚠️ inline style で `outline` を指定しているコンポーネントは CSS より優先されるため、Phase 2 で順次 inline outline を除去する

---

## [038] デザイントークン整備（secondary/tertiary/elevation/radii）

**2026-04-26 | ステータス: 採用**

### 背景

`src/utils/styles.ts` の `colors` に `secondary`・`tertiary` が未エクスポートで React 側から参照不可だった。
`shadows.tab` が `--elevation-*` CSS 変数と二重管理されていた。
`radii` トークンが `global.css` の `@theme` に定義済みだったが、React 側から利用できなかった。
ツールコンポーネント内にハードコード hex（`#1A56DB`・`#ffffff`・`#f5f5f7`・`#DBEAFE`・`#E5E7EB` 等）が約15箇所存在した。

### 決断

- `colors` に `secondary`・`tertiary`・`bgPrimary` を追加（`primaryBg` は `@deprecated` として残存）
- `shadows` を `@deprecated` 化し、`elevation` オブジェクト（CSS変数参照）で置換
- `radii` オブジェクト（CSS変数参照）を新規追加
- `micro` を `@deprecated`（`caption` の alias として残存）
- ハードコード hex をすべてトークン参照に置換

### 却下した選択肢

- **ハードコード hex の維持**: ダークモード追加時に置換漏れが生じる。デザイン変更の際に修正箇所が散在する。

### 結果・トレードオフ

- ✅ React コンポーネントからすべてのセマンティックカラーにアクセス可能になった
- ✅ バーコードライブラリ（JsBarcode）の描画オプション内の hex は DOM スタイルでないため変換対象外とした
- ⚠️ `JwtDecoder.tsx` の syntax highlight 用カラー（`#6e4f0e`・`#9333ea`）は可視化専用色のためトークン化せず維持

---

## [039] Astro 側の Tailwind カラークラスを CSS 変数経路に統一

**2026-04-26 | ステータス: 採用**

### 背景

`src/components/layout/*.astro`・`src/layouts/*.astro`・`src/pages/*.astro` 等の Astro ファイルで `text-neutral-900`・`bg-blue-50`・`text-neutral-700` 等の Tailwind プリミティブカラークラスが約 30 箇所残存していた。TSX 側は [010][033][038] によって `colors.*` + CSS 変数経路に統一済みだったが、Astro では `colors.*` が使えないという事情から手つかずになっていた。ダークモード切替時（[003] 保留中）に `:root` を `.dark` でオーバーライドしても、Tailwind カラークラスはプリミティブ値のままハードコードされるため、対象箇所が取り残される問題があった。また同一要素内で Tailwind class と CSS 変数直書きが混在する箇所（`index.astro:27`）が見つかり、可読性の問題もあった。

加えて、`styles.ts` の deprecated エントリ（`primaryBg`・`shadows`・`micro`・`onFocusRing`/`onBlurRing`）が [037][038] 後も TSX 5 ファイルから import されたままだった。

### 決断

1. **Astro 側のカラー置換**: Tailwind カラークラスを CSS 変数の `style` 属性直書きまたは `<style>` ブロックに置換。セマンティックエイリアス（`--color-text`・`--color-muted`・`--color-bg`・`--color-border` 等）が存在する場合はそれを優先し、存在しない場合はプリミティブ変数（`--color-neutral-700` 等）で 1:1 置換する。hover 等の擬似クラスは `<style>` ブロック内で CSS 変数を使用する。

2. **deprecated 解消**: `micro` → `caption` に置換。`onFocusRing`/`onBlurRing` をすべての呼び出し箇所から削除（CSS の `:focus-visible` で一括適用済みのため不要）。`colors.primaryBg` → `colors.bgPrimary` に置換。置換完了後、`styles.ts` から deprecated 定義を削除。

### 却下した選択肢

- **完全 Tailwind 化**: `colors.*` を廃止し `bg-[var(--color-text)]` 等の arbitrary values に統一する。書き方は統一されるが、ダークモード対応で各箇所に `dark:` プレフィックスを追加する必要があり、CSS 変数一元管理の利点が失われる。
- **現状維持**: ダークモード追加時に Astro 側のカラーが取り残される技術的負債が解消されない。

### 結果・トレードオフ

- ✅ Astro・TSX 共通で「色は CSS 変数経路」の原則が統一された
- ✅ ダークモード追加時（[003]）に `:root` → `.dark` の 1 ブロック追加で全ページに波及できる
- ✅ `styles.ts` から deprecated エントリが削除され、import 時の型補完ノイズがなくなった
- ⚠️ Astro では `colors.*` が使えないため、CSS 変数を `style` 属性に直書きするパターンが TSX と異なる。新しく Astro ファイルを書く際は CLAUDE.md のルールを参照すること

**補足（PRレビュー指摘対応）**: ナビ active 背景 (`bg-blue-50`) と バッジ背景 (`bg-blue-100`) にプリミティブ変数・キーカラー変数が混入していた指摘を受け、`:root` に `--color-bg-active` / `--color-badge-bg` を追加してセマンティック変数経路に揃えた。またタブの色切替を JS `classList.toggle` から CSS 属性セレクタ (`[aria-selected="true/false"]`) 宣言に移行し、詳細度競合を排除した。

---

## [040] Gemini CLI 用のプロジェクト指示書 (GEMINI.md) の作成

**2026-04-26 | ステータス: 採用**

### 背景

異なる AI エージェント（Claude Code, Gemini CLI 等）を使用する際、エージェントごとにデフォルトの挙動やコマンドの誤認（例: `npm run test:e2e` を `npm run e2e` と誤認する）が発生していた。また、プロジェクト固有のルール（Tailwind カラークラスの禁止、日本語コミットメッセージの強制等）を、使用ツールを問わず確実に遵守させる必要があった。

### 決断

Gemini CLI が優先的に読み込む指示書として `GEMINI.md` を作成する。
このファイルには以下を集約する：

- 正しいコマンドリファレンス（特に間違いやすいテストコマンド）
- スタイリング規約・言語設定等のコア mandate
- 過去のセッションで得られた教訓やヒント

### 却下した選択肢

- **CLAUDE.md のみで運用**: Gemini CLI が常に CLAUDE.md を完璧に解釈する保証がなく、また CLI 固有のコマンド間違い（エイリアスの不在）に対応しきれない。
- **システムプロンプト（メモリ）への保存**: 永続的ではあるが、プロジェクトリポジトリ内に明示的なドキュメントとして残らないため、他の開発者や将来の自分との共有が難しい。

### 結果・トレードオフ

- ✅ エージェントによるコマンドミス（存在しない `npm run e2e` の実行等）が解消された
- ✅ プロジェクトの重要ルールが二重に強化された（CLAUDE.md との並立）
- ⚠️ `CLAUDE.md` と内容が重複するため、将来的に共通規約の外部ファイル化等の整理が必要になる可能性がある

---

## [041] pre-commit フックによる自動フォーマットと CI でのチェック

**2026-04-26 | ステータス: 採用**

### 背景

手動でのフォーマット（`npm run format`）忘れにより、末尾空白の混入やコードスタイルの不一致がレビュー指摘として頻発していた。また、CI でフォーマットチェックが行われていなかったため、未整形のコードがマージされるリスクがあった。

### 決断

1. **pre-commit による自動化**: `.githooks/pre-commit` を更新し、`git commit` 時にステージングされたファイルに対して `prettier --write` を自動実行し、再度 `git add` する処理を追加した。
2. **CI でのガード**: `.github/workflows/test.yml` に `npm run format:check` ステップを追加し、万が一整形されていないコードがプッシュされた場合にビルドを失敗させるようにした。

### 却下した選択肢

- **GitHub Actions での自動コミット（パターン 1）**: CI がコミットを追加するとローカルとリモートの履歴がズレ、開発者の手元で `git pull` が必要になる煩わしさがある。
- **CI でのチェックのみ（パターン 2）**: 安全だが、指摘されるたびに手元で直して再プッシュする手間が発生する。
- **現状維持**: 今回のような大規模なフォーマット修正が再度必要になり、レビューコストが増大する。

### 結果・トレードオフ

- ✅ 開発者は意識することなく、常に整形された綺麗なコードをコミットできる
- ✅ フォーマットに関するレビュー指摘をゼロにできる
- ✅ CI により、リポジトリのコードスタイルが常に保証される
- ⚠️ `git commit` 実行時にコンマ数秒のオーバーヘッドが発生するが、許容範囲内である

---

## [042] CI (GitHub Actions) 設定の最適化と重複実行の防止

**2026-04-26 | ステータス: 採用**

### 背景

CI（GitHub Actions）の実行コスト削減と、不要な重複ジョブの排除が必要だった。同一ブランチや PR に対して連続してプッシュが行われた際、古いジョブが走り続けるのはリソースの無駄であり、結果の確認も遅れる原因となっていた。

### 決断

1. **重複ジョブの自動キャンセル**: `concurrency` ブロックを導入し、同一ワークフローかつ同一 PR/ブランチにおいて新しいジョブが開始された場合、実行中の古いジョブを自動的にキャンセルするように設定した。
2. **PR トリガーの精緻化**: `pull_request` イベントに対して `types: [opened, synchronize, reopened, ready_for_review]` を明示的に指定し、PR の状態変化（ドラフト解除など）に適切に反応するようにした。

### 却下した選択肢

- **現状維持**: 重複してジョブが走り続け、GitHub Actions のクォータを無駄に消費し続けるため却下。

### 結果・トレードオフ

- ✅ 無駄なリソース消費が抑えられ、最新のプッシュに対する結果がより早く得られるようになった
- ✅ ドラフト PR から `Ready for review` に切り替えた際にも自動でテストが走るようになった
- ⚠️ 実行途中でジョブが止まるため、デバッグ中に過去の実行ログが途切れる場合があるが、実用上のメリットが上回る

---

## [043] lint-staged 導入による partial-commit 安全な自動フォーマット

**2026-04-27 | ステータス: 採用**

### 背景

[041] で導入した `.githooks/pre-commit` の Prettier 自動整形には、partial-commit（同一ファイル内の staged 変更と unstaged 変更を分けてコミットする運用）を壊す未解決の課題があった。`prettier --write <file>` はワーキングツリー側（unstaged を含む）を整形し、続く `git add <file>` で unstaged 変更まで一緒にステージしてしまう。直近 `28a4c60` でファイル名スペース対応は堅牢化したが、partial-commit 問題は残っていた（PR #88 レビュー）。

### 決断

1. `lint-staged` を devDependency として導入し、partial-commit 時には内部で `git stash` 相当の処理により未ステージ変更を退避してから整形・add するように切り替えた。
2. 整形コマンドと拡張子セットは `package.json` の `"lint-staged"` 設定に集約し、pre-commit フック側は `npx lint-staged` 1 行のみに簡素化した。
3. CI の `npm run format:check`（`.github/workflows/test.yml`）はそのまま維持し、フックが何らかの理由でスキップ（`--no-verify`）された場合の最終防衛線とした。
4. `core.hooksPath=.githooks` の運用は維持（`ignore-scripts=true` ポリシーのため Husky の `prepare` スクリプト方式は採用しない）。

### 却下した選択肢

- **Husky 導入**: `.npmrc` の `ignore-scripts=true` で `prepare` が走らないため、クローン直後の自動セットアップが利かず、利点を活かせない。
- **自前スクリプト改修で `git stash` を扱う**: 実装と保守コストが高く、lint-staged の枯れた実装と比較して優位性がない。
- **現状維持**: partial-commit を破壊する運用上の地雷が残るため却下。

### 結果・トレードオフ

- ✅ partial-commit のセマンティクスを破壊しない
- ✅ ファイル名のクオート処理は lint-staged 側で堅牢に処理される
- ✅ 設定が `package.json` に集約され、フックスクリプトが簡素化された
- ⚠️ devDependency が 1 つ増えるが、`min-release-age=7` / `save-exact=true` のサプライチェーン保護下で固定バージョン運用するため許容範囲

---

## [044] commit-msg フックによる Conventional Commits 形式の強制

**2026-04-27 | ステータス: 採用**

### 背景

プロジェクト規約（`.agents/rules/common.md`）では、コミットメッセージを日本語かつ Conventional Commits 形式で書くことが定められていますが、既存の `.githooks/commit-msg` フックでは形式チェック（prefix の有無等）が行われていませんでした。これにより、規約違反のコミットが混入するリスクがありました。

### 決断

`.githooks/commit-msg` フックを更新し、以下のバリデーションを導入します：

1.  **形式チェック**: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`, `ci`, `revert` のいずれかの type で始まり、コロンとスペースが続くことを正規表現で強制します。
2.  **日本語チェック**: 既存の日本語文字検出ロジックを統合し、本文が日本語であることを保証します。
3.  **除外設定**: `Merge`, `Revert`, `fixup!`, `squash!` で始まる特殊なコミットはチェックをスキップします。
4.  **エラーメッセージ改善**: 規約ドキュメント（`.agents/rules/common.md`）への直リンクを含め、修正方法を具体的に提示します。

### 却下した選択肢

- **CI でのチェックのみ**: ローカルでコミットをブロックする方がフィードバックが早く、修正コストが低いため却下。

### 結果・トレードオフ

- ✅ プロジェクト規約の遵守が自動的に保証されるようになりました。
- ✅ 規約違反時の修正方法が明確になり、エージェント・人間双方の負担が軽減されました。
- ⚠️ 外部ツール（Renovate 等）による自動コミットが type 違反で失敗する可能性があるため、必要に応じて除外パターンを追加する等のメンテナンスが必要になる可能性があります。

---

## [045] リンクスタイル (:visited) の追加と下線設計の刷新

**2026-04-28 | ステータス: 採用**

### 背景

Issue #115 にて、訪問済みリンクの区別（`:visited`）がついていないことが指摘された。また、従来は各ページで個別に `underline hover:no-underline` 等のクラスを当てていたが、DRY でないため共通スタイルとして再定義する必要があった。

### 決断

1. **`.text-link` クラスの刷新**:
   - ベースで `text-decoration: underline` を付与し、非色覚情報でもリンクであることを明示する。
   - ホバー時は `text-decoration-thickness: 2px` とし、視覚的なフィードバックを強化する。
2. **`:visited` の追加**:
   - 訪問済みリンクの色として `--color-link-visited: #7c3aed` (Purple) を定義。
3. **`.text-link-color` クラスの新設**:
   - トップページのツールカード等、下線を付けたくないがリンク色と `:hover`/`:visited` の挙動は共通化したい箇所のために、色のみを制御するクラスを分離した。
4. **WCAG 1.4.1 (色の使用) に関する判断**:
   - 訪問済みかどうかの区別は現状「色のみ」に依存している。
   - `:visited` 擬似クラスはブラウザのプライバシー保護仕様により、`color` 以外のプロパティ（`text-decoration` 等）の変更が無視される。
   - したがって、技術的な制約から色以外の手段での区別が困難であるため、現状のデザインを妥当と判断した。
   - コントラスト比 (背景 #ffffff に対して):
     - 未訪問 (#2563eb): 4.65:1 (WCAG AA 合格)
     - 訪問済み (#7c3aed): 5.37:1 (WCAG AA 合格)
     - ※ コントラスト比は [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) にて背景 #ffffff に対して算出。

### 却下した選択肢

- **`:visited` で下線を消す/太くする**: 前述の通り、ブラウザ仕様により動作しないため却下。
- **すべてのリンクに `.text-link` を強制適用する**: トップページのカード内リンクなど、デザイン上シンプルに保ちたい箇所（下線がノイズになる箇所）があるため、用途に応じてクラスを使い分ける方針とした。

### 結果・トレードオフ

- ✅ リンクの状態（通常・ホバー・訪問済み）が一貫したデザインで提供されるようになった。
- ✅ 各ページから個別のスタイル指定を削除でき、DRY な構成になった。
- ⚠️ 訪問済みかどうかの判別は色に依存しているが、ブラウザの仕様制限の範囲内で最善の対応としている。

---

## [046] Gemini CLI サンドボックスとセキュリティポリシーの導入

**2026-04-29 | ステータス: 採用**

### 背景

Claude Code 側に `.claude/settings.json` でサンドボックスとアクセス制御が設定済みであったが、Gemini CLI にはエージェント用のセキュリティポリシーが存在しなかった。使用ツールによってエージェントの行動範囲が異なるリスクを解消するため、両ツールで一貫したセキュリティレベルを確保する必要があった。

### 決断

1. **`.gemini/settings.json`**: macOS `sandbox-exec` を有効化。ブラウザエージェントがアクセス可能なドメインを制限し、環境変数の機密情報マスキング（Redaction）を有効化。
2. **`.gemini/policies/security.toml`**: deny / allow / ask_user の 3 段階ルールを定義。Claude Code 側の `permissions` と対称になるよう設計。
   - **deny**: フォースプッシュ・`rm -rf /`・`npm publish`・`gh repo delete` 等の破壊的操作、GraphQL mutations/DELETE via `gh api`、リモートコンテンツのパイプ実行、機密ファイルへの直接アクセス。
   - **allow**: `git pull` / `git fetch` / `gh pr diff` を含む、Claude Code 側で許可されている全ての読み取り専用コマンド（`gh pr list`, `node --version` 等）を同期。これにより、ツール間でのエージェントの挙動とユーザーへの確認頻度を一貫させた。
   - **ask_user**: `git push`・`gh pr create` 等の外部影響を伴う操作、設定ファイル（`.gemini/`, `.claude/`）自体の変更。および、単体での `curl` / `wget` 実行（Claude 側との同期）。
3. **ブラウザエージェントの許可ドメイン同期**: `.gemini/settings.json` および `.claude/settings.json` の `allowedDomains` に `docs.anthropic.com` や `code.claude.com` に加え、Gemini 関連の主要リソースである `ai.google.dev` を追加。広範な `*.google.com` の許可は Gmail 等の個人データへのアクセスリスクがあるため避け、開発に必要な特定ドメインのみに限定した。
4. **パイプ実行禁止の対象インタープリタ拡張**: 当初 `sh|bash|zsh|python|node` のみだったが、defense-in-depth として `perl|ruby|php` を追加。`exec` は組み込みコマンドであり既存のシェルパターン（`sh` 等）で十分捕捉されるため追加しない。
5. **`~` 経由のパスバイパス対策**: `.aws` / `.ssh` の deny 正規表現が絶対パスのみを拒否していた。Gemini CLI が `~` を展開せずに `read_file` へ渡した場合にバイパスが生じるリスクがあるため、`^(~[^/]*|/Users/[^/]+|/home/[^/]+)/\.aws/.*` のように `~[^/]*` を追加。
6. **`excludedCommands` から `git pull/fetch` を除外**: サンドボックス外で `git pull/fetch` を実行すると、`post-merge`/`post-checkout` フックがサンドボックス保護の外で動作するリスクがある。`network.allowedDomains` に `github.com` 系は既に登録されており、サンドボックス内の書き込み許可スコープ（`.` 以下）も `.git/` を含むため、サンドボックス内での実行に問題はないと判断し除外。（※この判断は HTTPS 経由の git remote を前提としていた。SSH 経由の remote では `~/.ssh/known_hosts` アクセスが sandbox の deny に阻まれ失敗することが後に判明し、[049] にて `git pull/fetch` を `excludedCommands` に再追加した。）

### 却下した選択肢

- **`exec` を禁止インタープリタリストに追加**: `exec` は現プロセスを置き換える組み込みコマンドであり、既存の `sh|bash|zsh` パターンで十分。独立した追加は過剰一致を招く恐れがあるため却下。
- **Claude 側 deny ルールへの正規表現構文（`\b` 等）の適用**: Claude Code の `permissions` は glob ベースであり正規表現メタ文字を解釈しない。Gemini 側の `commandRegex` をそのまま移植することは仕様上不可能なため、glob による近似で十分と判断。

### 結果・トレードオフ

- ✅ Claude Code / Gemini CLI で対称的なセキュリティポリシーが確立された。
- ✅ `git pull/fetch` のサンドボックス内実行移行により、Git フック経由の意図しないコード実行リスクが低減した。
- ⚠️ Gemini CLI が `~` を展開してから `read_file` を呼ぶ場合、`~[^/]*` の追加は冗長になるが副作用はない。
- ⚠️ `.gemini/settings.json` の `tools.sandbox = "sandbox-exec"` は macOS 専用設定（`sandbox-exec` は Apple のセキュリティ機構）。Linux / Windows / WSL 環境では Gemini CLI 側で当該設定が無視されるかエラー扱いになるため、CI などで Linux ベースの実行が必要な場合は別途 `"sandbox": "none"` または Docker ベースの sandbox 戦略へフォールバックする運用とする。本リポジトリは現状 macOS 開発を前提とするため未対応。

---

## [047] `.claude/settings.json` セキュリティレビュー反映

**2026-04-29 | ステータス: 採用**

### 背景

Issue #122 にて `.claude/settings.json` の一貫性・不要記載・セキュリティ面のレビューを実施。[046] で Gemini 側との対称化が完了した状態を起点に、Claude Code 公式ドキュメント（パーミッション仕様）を精査した結果、以下の課題が浮上した。

### 決断

1. **`gh api graphql*` deny パターンの word-boundary 補強**: 公式仕様上、`Bash(gh api graphql*)` は `gh api graphqlfoo` のような誤コマンドにも当たってしまう（`*` は word boundary を持たない）。`Bash(gh api graphql)` と `Bash(gh api graphql *)` の 2 本に分割し、同様に `Bash(gh api * graphql*)` も 2 本に分割することで誤マッチを排除した。

2. **`npm install` 系 allow の統合**: `Bash(npm install)` / `Bash(npm install --save-dev *)` / `Bash(npm install --save *)` の 3 本を `Bash(npm install *)` 1 本に統合。glob の `*` は空文字列を含むため引数なし呼び出しもカバーする。`deny: Bash(npm install -g*)` が deny → ask → allow の順で先評価されるため、グローバルインストールの拒否は維持される。

3. **`curl` / `wget` 全体を ask へ移動**: 公式が「Bash パターンでの引数制約は脆弱（オプション挿入・空白・引用符でバイパス可能）」と明示警告しており、既存の `Bash(curl * | sh*)` 等のパイプ deny は `curl https://...|sh`（パイプ直前の空白省略）でバイパス可能。curl/wget 全体を ask にすることで一律確認を要求し、WebFetch ベースの運用に誘導する。既存パイプ deny は defense-in-depth として残置。

4. **`sandbox.network.allowedDomains` に `docs.anthropic.com` と `code.claude.com` を追加**: `permissions.allow` に `WebFetch(domain:docs.anthropic.com)` / `WebFetch(domain:code.claude.com)` は宣言済みだったが、sandbox の egress allowedDomains 側に未同期だった。Anthropic 公式ドキュメントは現在 `code.claude.com` が正典 URL。

5. **`settings.local.json` の `Bash(gh api:*)` allow を削除**: グローバル `ask: Bash(gh api *)` をローカルで上書きしており、対称ポリシーの主旨（gh api 系は実行前に確認）に反する。

### 却下した選択肢

- **`curl*` / `wget*` 全体を deny にする**: 将来 curl を読み取り用に使うユースケース（例: API レスポンス確認）を排除しすぎるため、ask に留めた。
- **PreToolUse hook による引数制約の強化**: glob では `gh api graphql`（空白の数・絶対パス経由）や `curl|sh`（リダイレクト・変数展開）の完全遮断ができない。hook 化で Gemini 側 `commandRegex` と同等の精度を確保できるが、実装・メンテコストとの兼ね合いから別 issue で判断する。

### 結果・トレードオフ

- ✅ `gh api graphql` の deny パターンが意図通りの word-boundary で機能するようになった。
- ✅ `npm install` 系の allow が 1 本に整理され、deny との連携が明確になった。
- ✅ `curl` / `wget` が ask 化され、パイプ実行の glob 脆弱性が軽減された。
- ✅ sandbox の egress ドメインと WebFetch 許可ドメインが一致した。
- ⚠️ `gh api graphql` のバイパス（空白2個、絶対パス経由 `/usr/bin/gh`）は glob 制約のため残存。完全対策は hook 化が必要。

---

## [048] PR #122 6 回目レビュー反映（npm グローバルインストール補完・Bash メタ防御追加）

**2026-04-29 | ステータス: 採用**

### 背景

[047] で `npm install -g*` を deny 化したが、npm 7+ 公式サポートの `--global` / `--location=global` や短縮形 `npm i -g` / `npm i --global` がいずれも deny を素通りし `Bash(npm install *)` allow に当たってしまうことが 6 回目レビューで指摘された。また、Claude 側は `Edit/Write(./.claude/**)` / `Edit/Write(./.gemini/**)` の ask でエディタ経由の設定改変をガードしているが、Bash 経由（`rm` / `sed -i` / `tee`）は対象外であり、Gemini 側のメタ防御 regex との非対称が残っていた。`statusline-command.sh` はプロンプト毎に実行されるため、この経路は永続 RCE 経路として性質が重い。

### 決断

1. **npm グローバルインストール deny の補完**: Claude 側 `deny` に `Bash(npm install --global*)` / `Bash(npm install --location=global*)` / `Bash(npm i -g*)` / `Bash(npm i --global*)` を追加。Gemini 側は `commandRegex = "^npm (install|i)\\s+.*(-g\\b|--global\\b|--location\\s*=\\s*global\\b)"` の 1 本化で全形式を網羅（既存 `commandPrefixes` の `"npm install -g"` は除去）。

2. **Claude 側 Bash 経由のメタ防御追加**: glob 制約の近似として `permissions.ask` に以下を追加し、設定ファイルの削除・上書きをユーザー確認必須にする。
   - `Bash(rm .claude/*)` / `Bash(rm -rf .claude*)` / `Bash(rm .gemini/*)` / `Bash(rm -rf .gemini*)`
   - `Bash(sed -i* .claude/*)` / `Bash(sed -i* .gemini/*)`
   - `Bash(tee .claude/*)` / `Bash(tee .gemini/*)`

3. **`excludedCommands: ["gh *"]` の責任分界の明文化**: `gh *` はサンドボックス外で実行される（後述の TLS 証明書ストアアクセス制限により技術的必然）ため、サンドボックスの filesystem / network deny は `gh` には適用されない。permissions の deny / ask が唯一の防御線であり、新規 `gh` サブコマンドを使用する際は `permissions` への影響をレビューすることが必須の運用方針とする。

4. **`ai.google.dev` の意図の明示**: `allowedDomains` に追加した `ai.google.dev` は Gemini CLI のドキュメントサイトであり、API エンドポイント（`generativelanguage.googleapis.com`）ではない。Gemini API を呼び出す機能を追加したい場合は別途 API ドメインの許可を検討する必要があり、`ai.google.dev` の追加がその代替にはならない。

### 却下した選択肢

- **`npm publish`・`rm -rf` に近い完全 deny**: `rm .claude/*` は ask（確認要求）に留めた。legitimate な運用シナリオ（手動クリーンアップ等）でユーザーが明示的に承認できるよう、deny ではなく ask を選択。
- **glob `Bash(rm*)` の全件 ask 化**: 過剰一致で開発フローが阻害されるため却下。`.claude/` / `.gemini/` パスを明示した限定的な追加に留める。
- **Gemini 側 commandRegex をそのまま Claude 側に移植**: Claude Code の `permissions` は glob ベースで正規表現メタ文字を解釈しない（[046] 承知済み）。
- **`gh` コマンドのサンドボックス内実行への移行**: `[046]` の `git pull/fetch` 移行と同様にサンドボックス内実行に戻すことを検討・実機検証したが、`gh` CLI は Go の TLS 実装で macOS の証明書ストア（Security フレームワーク）に依存しており、sandbox-exec がそのアクセスをブロックするため `tls: failed to verify certificate: x509: OSStatus -26276` で全コマンドが失敗した。`git` が独自の証明書バンドルを持つのと対照的に、`gh` はこの制約を回避できない。`gh` は sandbox 外実行が技術的必然（[049] で確定）。なお、`excludedCommands` のワイルドカードパターンを `gh *` から使用済みサブコマンド単位に絞り込む最小特権化は [049] で別途実施している。

### 結果・トレードオフ

- ✅ npm グローバルインストールの全表現形式（`-g`, `--global`, `--location=global`, `npm i` 短縮形）が両ツールで deny される。
- ✅ Bash 経由の `.claude/` / `.gemini/` 改変（rm / sed / tee）がユーザー確認必須になり、Gemini 側メタ防御との非対称が解消された。
- ✅ `gh *` の sandbox 外実行が macOS sandbox-exec による **TLS 証明書ストアアクセスの制限** という技術的制約に起因することが実機検証で確定し（`x509: OSStatus -26276`）、permissions による deny / ask が唯一の防御線である旨が確定した。
- ✅ `ai.google.dev` の意図（ドキュメントサイト、API エンドポイントではない）が明示され、将来のドリフトが防止される。
- ⚠️ Claude 側 Bash メタ防御は glob 近似であり、`rm -rf .claude/foo/bar` のように深いパスや複雑なコマンドは完全にはカバーできない。Gemini 側 regex との精度差は残存。

---

## [049] `excludedCommands` のスコープ原則確立

**2026-04-29 | ステータス: 採用**

### 背景

[046] で `git pull/fetch` を `excludedCommands` から除外し、sandbox 内実行に戻した。その判断の根拠は「`network.allowedDomains` に `github.com` が登録済みであればサンドボックス内で実行可能」というものだったが、この前提は **HTTPS 経由の git remote** にのみ成立する。SSH 経由の remote（`git@github.com:...`）では、接続時に `~/.ssh/known_hosts` の読み取りが必要であり、これが sandbox の `Read(~/.ssh/**)` deny に阻まれるため `git pull` が失敗することが実機で確認された。

また、`curl` / `wget` についても、macOS では HTTPS 通信時にシステム証明書ストア（Security フレームワーク）へのアクセスが必要であり、`gh *` と同様の TLS 証明書検証エラーが発生することが想定される。

これらを受けて、`excludedCommands` の追加判断基準を明文化し、現状の設定を修正する。

### 採用した原則

**`excludedCommands` には、sandbox-exec が制限する OS レベルのリソース（TLS 証明書ストア / SSH known_hosts / keychain / Security フレームワーク）にアクセスする必要があるコマンドのみを登録する。**

サブプロセスや任意スクリプトを実行しうるコマンド（`npm install`, `npm run`, `npx` 等）は、たとえ `permissions.allow` に登録されていても sandbox 内で実行し、 defense-in-depth（`.env`, `~/.ssh`, `~/.aws` への書き込み・読み取り deny）を維持する。

### 決断

`excludedCommands` を以下の構成にする:

```jsonc
"excludedCommands": [
  "git push*",    // SSH（既存）
  "git pull*",    // SSH known_hosts（[046] での除外を取り消し、再追加）
  "git fetch*",   // SSH known_hosts（同上）
  "gh pr *",      // TLS 証明書ストア。permissions 登録済みサブコマンドのみに絞り込み
  "gh issue *",   // 同上
  "gh repo *",    // 同上
  "gh release *", // 同上
  "gh workflow *",// 同上
  "gh api *",     // 同上
  "curl*",        // TLS 証明書ストア（macOS curl は Security framework 使用）
  "wget*"         // TLS 証明書ストア（同上）
]
```

`gh *` を 6 サブコマンドパターンに絞り込んだ理由: `gh auth *` / `gh codespace *` / `gh copilot *` / `gh extension *` 等は `permissions` に登録がなく sandbox 外実行を認める必要がない。これらのコマンドが使用された場合はユーザー確認プロンプトが出た上でサンドボックス内実行となり TLS エラーで失敗する（二重の防御層）。`gh repo delete*` 等の deny 済みコマンドはサブコマンドパターン指定下でも deny が優先される。

検証: `git fetch origin` が正常終了することを確認（SSH 接続成功）。

### 却下した選択肢

- **`permissions.allow` / `ask` の全 Bash コマンドを `excludedCommands` に追加（wholesale 化）**: `npm install` / `npm run` / `npx` 等のサブプロセスを含むコマンドを sandbox 外に出すと、post-install スクリプトや任意の npm scripts が `.env` や `~/.ssh` にアクセス可能になる。防御対象（外部からの悪意あるコード）に対して defense-in-depth が失われるため却下。
- **`sandbox.Read(~/.ssh/**)` deny の解除**: SSH 秘密鍵（`~/.ssh/id_rsa` 等）への読み取りアクセスを許可することになり、sandbox 内で動作するコマンド（npm スクリプト等）が秘密鍵を読み取れるリスクが生じる。`excludedCommands` での限定的な除外で同等の実用性を達成できるため却下。

### 結果・トレードオフ

- ✅ SSH-based git remote での `git pull` / `git fetch` が動作する（[046] の前提ミスを修正）。
- ✅ `curl` / `wget` が sandbox 制約（TLS 証明書ストア）に阻まれず使える。
- ✅ `npm install` / `npm run` / `npx` 等のサブプロセス起動コマンドは引き続き sandbox 内で動作し、defense-in-depth が維持される。
- ✅ `excludedCommands` の追加判断基準（OS リソース要求の有無）が文書化されたことで、将来のコマンド追加時の判断が容易になる。
- ✅ `gh *` ワイルドカードを `permissions` 登録済みの 6 サブコマンドパターンに絞り込み、未承認の `gh` サブコマンドに対してサンドボックスによる二重防御が機能するようになった。
- ✅ `curl*` の TLS 証明書ストア依存を検証済み: macOS 同梱の `/usr/bin/curl` は **SecureTransport**（Apple Security フレームワーク）を使用するため、`gh` と同じく sandbox-exec 配下で TLS 検証に失敗する。`excludedCommands` への登録は技術的必然。
- ⚠️ `wget*` は環境依存: macOS は `wget` を同梱せず、Homebrew の `wget` は **OpenSSL**（`/opt/homebrew/opt/openssl@3`）を使用する。OpenSSL 自身の証明書バンドルにアクセスできれば sandbox 内動作も可能だが、同梱 curl との挙動対称性および将来的な証明書バンドル参照経路の変更リスクを考慮し、`excludedCommands` に残置する判断とした。

---

## [050] Gemini CLI ソースコード検証で発覚した `security.toml` 重大バグの修正

**2026-04-29 | ステータス: 採用**

### 背景

PR #122 の再レビュー指摘に対応するため、Gemini CLI のソースコード（`packages/core/src/policy/toml-loader.ts`・`utils.ts`）を直接精査した。その結果、`.gemini/policies/security.toml` に 3 件の重大バグが発覚した。

### 発覚したバグと根拠

**バグ 1: `commandPrefixes`（複数形）は無効フィールド**

Gemini CLI の Zod スキーマは `commandPrefix`（単数形）を定義しており、`commandPrefixes` は未認識フィールドとして Zod の `.strip()` モードにより無視される。その結果、prefix 条件を持たない `toolName = "run_shell_command"` のみのルールが残り、意図しない全コマンドマッチまたは全コマンドブロックが生じる。官方サンプル（`.gemini/skills/async-pr-review/policy.toml`）でも `commandPrefix = [...]`（単数形・配列）が使用されている。

**バグ 2: `commandRegex` での `^` アンカーが機能しない**

`buildArgsPatterns` 関数（`utils.ts` L52）は `commandRegex` を `"command":"<regex>` に変換してから JSON 文字列全体にマッチさせる。そのため `^npm` は `{"command":"npm...` ではなく先頭 `{` にアンカーされ、永遠にマッチしない。影響を受けたルール: npm グローバルインストール deny / フォースプッシュ deny / gh api graphql deny の 3 件すべて。

**バグ 3: `(.*\\s)?` が `isSafeRegExp` でネスト量詞として拒否される**

`isSafeRegExp` は `/\([^)]*[*+?{].*\)[*+?{]/` でネスト量詞パターンを検出する。`^gh api (.*\\s)?(graphql\\b|...)` の `(.*\s)?` はグループ内に `*`、グループ後に `?` を持つため ReDoS 防御としてルール自体が拒否される（エラーログには出るが UI には出ない）。

### 決断

1. **全 3 ブロックの `commandPrefixes` → `commandPrefix` に修正**: deny / allow / ask_user の全ブロック。

2. **npm グローバルインストール deny を `commandPrefix` 配列に変換**:
   `commandRegex`（`^` アンカー付き）を廃止し、`commandPrefix` で全形式を網羅。同時にバグ 2 で修正できなかった Claude 側の accepted gap（`--location global` スペース区切り）も Gemini 側で完全カバーし、Claude 側 deny にも `Bash(npm install --location global*)` を追加して両ツールで対称化した。

3. **フォースプッシュ deny: `commandRegex` から `^` を除去**:
   `^git push .*( --force|-f).*` → `git push .*( --force|-f).*`。`^` を除くことで、内部変換後の argsPattern `"command":"git push .*( --force|-f).*` が JSON 文字列中の `git push` にマッチするようになる。

4. **gh api graphql/DELETE deny を 2 ルールに分割**:
   - `commandPrefix = ["gh api graphql"]` で GitHub GraphQL API エンドポイントを拒否（バグ 2・3 の両方を回避）。
   - `commandRegex = "gh api .* (--method DELETE|-X DELETE)"` で REST DELETE を拒否（ネスト量詞なし・`^` なし）。
   - ただし `gh api <REST-path> graphql`（中間パスに graphql を含む）は今回のパターンではカバーされない点は Claude 側の `gh api * graphql` glob と同じ制約として許容する。

### 却下した選択肢

- **`commandRegex = "npm.*(-g|--global|--location.*global)"`**: `^` なし regex で書けば動作するが、`echo "npm install -g"` のような文字列含有コマンドにも誤マッチしうる。`commandPrefix` による前方一致の方が意図が明確で安全。
- **`commandRegex = "gh api graphql.*"` でバグ 3 を回避**: ネスト量詞は解消されるが `commandRegex` は `"command":"` 変換後にサブストリングマッチになるため `gh api graphql` で十分。`commandPrefix` の方がより正確な前方一致。

### 結果・トレードオフ

- ✅ 全 prefix ベースルール（deny / allow / ask_user）が正式フィールド `commandPrefix` で動作するようになった。
- ✅ `^` アンカー付き `commandRegex` を廃止・修正し、npm グローバル / フォースプッシュ / gh api 各 deny ルールが実際に機能するようになった。
- ✅ `npm install --location global`（スペース区切り）が Claude / Gemini 両側で deny されるようになり、[048] で accepted gap として残っていた非対称が解消された。
- ⚠️ `gh api <REST-path> graphql`（中間パスに graphql を含む）は今回のパターンではカバーされない（Claude glob `gh api * graphql` との精度差は残存）。
- ⚠️ `.gemini/policies/` はワークスペースティアに配置されているが、Gemini CLI の issue #18186 によりワークスペースポリシーは現在無効化されている（[046] で言及済みだが未解決）。今回のバグ修正は将来 issue が解消された際に正しく機能するための先行対応である。それまでの代替措置として `~/.gemini/policies/security.toml` へのコピーまたはシンボリックリンクを検討することを推奨する。

---

## [051] Cloudflare Web Analytics の導入を却下

**2026-04-29 | ステータス: 却下**

### 背景

Cloudflare Pages ダッシュボードに「Web 分析」を有効化するボタンがあり、
ワンクリックで cookieless なアクセス解析が利用できる。トラフィック可視化は運用上有益。

ただし Cloudflare Web Analytics は有効化時に Cloudflare がエッジで
`static.cloudflareinsights.com/beacon.min.js` を HTML に自動挿入し、
`cloudflareinsights.com` にページビュー（URL・リファラ・画面サイズ・UA 等）を送信する。
Cookie 不使用・IP 非保存ではあるが、外部スクリプトのロードと外部送信は発生する。

### 決断

有効化しない。Cloudflare ダッシュボード側で「無効」のまま据え置く。

### 却下した選択肢

- **コンセプトを再定義して有効化**: 「ツール処理データの外部送信ゼロ」と「サイト訪問の集計」を分離する案。SPEC.md §11.1（外部リソース ゼロ）・§11.2（CSP `connect-src 'none'`）・privacy.astro・about.astro・README.md の文言全てを修正する必要があり、本プロジェクトの差別化ポイントである「外部送信ゼロ」のメッセージが弱まる。
- **手動で beacon `<script>` を挿入**: 自動注入と挙動は同じ（同じ beacon が同じドメインに送信される）。実装の見え方が変わるだけで方針への影響は同一。

### 結果・トレードオフ

- ✅ 「外部送信ゼロ・トラッキングなし」のコミットメントを完全保持
- ✅ プライバシーポリシー・SPEC・README の整合性を維持
- ⚠️ サイトのアクセス状況（ページビュー・流入元）を把握する手段が無い（Cloudflare Pages のトラフィック集計は Web Analytics を有効化しないと表示されない）

---

## [052] 設定ファイル相互変換に yaml / smol-toml / ajv を採用

**対象ツール**: 設定ファイル相互変換（`config-converter`）

### 背景

YAML・JSON・TOML・.env の相互変換ブラウザ完結ツールを実装するにあたり、各形式のパース/シリアライズライブラリと JSON Schema 検証ライブラリを選定した。

### 決断

#### YAML: `yaml`（eemeli/yaml）を採用

- `js-yaml` は lockfile に transitive で存在するが、コメント保持に必要な `parseDocument` / `Document` API を持たない
- `yaml` パッケージは `parseDocument()` + `.toString()` でコメントを含む AST round-trip が可能
- 同形式（YAML→YAML）整形時はコメントを完全保持する要件を満たすのは `yaml` のみ
- gzip 約 30KB

#### TOML: `smol-toml` を採用

- Astro の transitive dep として lockfile に存在し、ブラウザ完結での TOML 1.0 対応実績あり
- コメント保持は非対応（仕様上「同形式整形でコメントが失われる」旨を UI で警告）
- `@ltd/j-toml` はコメント保持可能だが、round-trip の実装複雑性とバンドルサイズのトレードオフを考慮し見送り

#### .env: 自前パーサを採用

- `dotenv` は Node.js の `fs` モジュールに依存しブラウザ完結不可
- `KEY=VALUE` 形式の自前パーサは数十行で実装可能で、バンドルサイズへの影響なし
- ダブルクォート内のエスケープは `\\` と `\"` のみアンエスケープし、`\n` 等のシーケンスは文字列リテラルとして保持する（POSIX dotenv の `expand` 相当の改行展開は MVP では未対応。将来的に `expand` オプションとして追加余地あり）

#### JSON Schema 検証: `ajv` + `ajv-draft-04` + `ajv-formats` を dynamic import で採用

- `ajv` は Astro の transitive dep として lockfile に存在し実績あり
- gzip 約 40KB と大きいため、スキーマ検証パネルを開いた瞬間に `await import()` で遅延ロードし、初期チャンクへの影響をゼロにした
- draft-04 対応は `ajv-draft-04` を使用。`yaml-language-server` の transitive dep として lockfile に存在していたが、本番ビルドで `--omit=dev` 解決が走ると欠落するリスクがあるため `dependencies` に明示登録した

#### HCL: Phase 2 後送り

- 純 JS の HCL2 パーサが事実上存在しない
- `@cdktf/hcl2json` は WASM（Go コンパイル）で 4-7MB になりブラウザ初期ロードへの影響が大きい
- MVP (YAML/JSON/TOML/.env 4 形式) で十分な価値を提供できると判断し、HCL は Phase 2 以降に先送り

### 却下した選択肢

- **`js-yaml`**: コメント保持 API がない。transitive dep として存在するが明示追加しない
- **`@ltd/j-toml`**: TOML のコメント保持可能だが実装複雑性が高く、smol-toml で十分
- **`dotenv`**: Node.js 専用、ブラウザ不可
- **`@cdktf/hcl2json`（WASM）**: 初期ロード 4-7MB、Phase 2 で再評価

### 結果・トレードオフ

- ✅ 初期バンドルへの影響: gzip で yaml+smol-toml で約 40KB 追加（ajv は遅延ロード）
- ✅ ブラウザ完結: 4 形式すべてネットワーク送信なしで変換可能
- ✅ YAML コメント保持: 同形式整形で完全保持
- ⚠️ TOML コメント保持: smol-toml の制約で保持不可（UI で明示）
- ⚠️ HCL: 未対応（Phase 2 で `@cdktf/hcl2json` または代替手段を検討）

---

## [053] QRリーダーツールを QRチケットから分離して新設

**2026-04-30 | ステータス: 採用**

### 背景

`qr-ticket` の検証タブは「ECDSA 署名付きチケットの読取・検証」という特化した用途で設計されており、汎用の QR デコード（生のテキスト確認・画像ファイルからの読取）には適していない。開発者が他システムで生成した QR の内容確認や、スクリーンショット内の QR を手軽にデコードしたいというニーズが別途ある。特にスマートフォン標準カメラは QR をリアルタイムで読めるが、**画像ファイル（スクリーンショット等）からの QR 読取は標準搭載されておらず**、専用ツールの価値がある。

### 決断

独立ツール `qr-reader`（`/tools/qr-reader`、カテゴリ: `convert`）を新設する。`jsqr` / `useQrCamera` フックなどの既存インフラを最大限再利用し、カメラとファイルアップロードの両方に対応する汎用 QR デコーダーとして実装する。URL 自動検出（HTTP/HTTPS のみ）とフィッシング警告 UI も含める。

### 却下した選択肢

- **`qr-ticket` に「鍵なし読取モード」を追加**: 公開鍵の有無でフローが分岐し UI が複雑化する。`qr-ticket` の「署名検証が本質」という役割が希薄になる。独立ツールの方がシンプル。
- **`BarcodeDetector` Web API の採用**: Safari は 2024 時点で未対応。`jsqr` がすでに依存に含まれており追加コストなし（[022] 参照）。

### 結果・トレードオフ

- ✅ 鍵不要の汎用 QR デコードが `/tools/qr-reader` で利用可能になった。
- ✅ `qr-ticket` の責務（署名検証）が明確になり、両ツールのコードが単純に保たれた。
- ✅ URL の自動リンク化を行わず、`http:`/`https:` 以外のスキームも `text` として扱うことでフィッシング・XSS リスクを最小化した。
- ⚠️ Wi-Fi / vCard / mailto 等の QR フォーマット解析は今回スコープ外（将来の拡張候補）。

---

## [054] CSP / セキュリティヘッダを `public/_headers` で付与

**2026-04-30 | ステータス: 採用**

### 背景

ブラウザ完結型 DevTools として「ユーザーデータが外部送信されない」ことが価値の根幹だが、レスポンスヘッダレベルの多層防御（CSP / nosniff / Referrer-Policy / Permissions-Policy）が一切付与されていなかった（issue #158）。

`dangerouslySetInnerHTML` を使う箇所が現状 3 箇所（`QrCode.tsx:115` / `Gs1Databar.tsx:352` / `qr-ticket/GenerateTab.tsx:459`）あり、入力源は QR/バーコード行列のため XSS は成立しないが、依存更新・機能追加で実害化する経路を残していた。また `qr-reader` / `qr-ticket` でカメラ権限を取得する一方、`connect-src` 制約が無く、万一スクリプト実行が成立した場合の二次被害（情報送信）が大きい状態だった。

### 決断

静的ホスティング（現在の Cloudflare Pages：`devtools-d9w.pages.dev`）向けに `public/_headers` を新設し、以下のヘッダを `/*`（全ルート）に付与する。Astro は `public/` 配下を `dist/` にそのままコピーするため、ビルド設定変更は不要。

```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=()
```

各ディレクティブの根拠:

| ディレクティブ                                          | 値                       | 根拠                                                                                                                                                                                                                   |
| :------------------------------------------------------ | :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`                                           | `'self'`                 | 既定で外部送信・読込を全拒否                                                                                                                                                                                           |
| `img-src`                                               | `'self' data: blob:`     | QR/JAN/GS1/UUID 等で `<canvas>` の `toDataURL()`（`data:`）と画像変換時の `URL.createObjectURL()`（`blob:`）を使用                                                                                                     |
| `media-src`                                             | `'self' blob:`           | `qr-reader` / `qr-ticket` のカメラ映像ストリーム（MediaStream → blob:）                                                                                                                                                |
| `style-src`                                             | `'self' 'unsafe-inline'` | `style={{...}}` 219+ 箇所、Astro `style="..."` 多数。詳細は本決断の "却下した選択肢" 参照                                                                                                                              |
| `script-src`                                            | `'self' 'unsafe-inline'` | Astro 6.1.5 SSG が hydration runtime と MobileDrawer/index 等の島を **インラインスクリプトとして埋め込む**ため必要（`dist/*.html` を `npm run build` 後に grep で確認済み）。`<script is:inline>` も BaseLayout に存在 |
| `connect-src`                                           | `'self'`                 | アプリは全データをブラウザ内で処理し、外部 API 呼び出しは存在しない（`grep "fetch(" src/` で確認）                                                                                                                     |
| `worker-src`                                            | `'self'`                 | `sw.js`（Service Worker）登録の許可                                                                                                                                                                                    |
| `object-src`                                            | `'none'`                 | `<object>`/`<embed>`/`<applet>` 経由の埋め込みを完全禁止                                                                                                                                                               |
| `frame-ancestors`                                       | `'none'`                 | クリックジャッキング防止（`<iframe>` 埋め込み拒否）                                                                                                                                                                    |
| `base-uri`                                              | `'none'`                 | `<base>` タグ改ざんによる相対リソースのリダイレクトを防止                                                                                                                                                              |
| `form-action`                                           | `'self'`                 | フォーム送信先を自身に限定（現状 form 送信は無いがゼロトラスト）                                                                                                                                                       |
| `Permissions-Policy` `camera=(self)`                    | —                        | `qr-reader` / `qr-ticket` 用に自身のみ許可                                                                                                                                                                             |
| `Permissions-Policy` `microphone=()` / `geolocation=()` | —                        | 利用していないため明示的に無効化                                                                                                                                                                                       |
| `upgrade-insecure-requests`                             | —                        | PR #170 レビューで追記。Cloudflare Pages は HTTPS 既定で実害は小さいが、混在コンテンツ防止の補強としてゼロコストで採用                                                                                                 |
| `X-Frame-Options: DENY`                                 | —                        | PR #170 レビューで追記。`frame-ancestors 'none'` でモダンブラウザはカバーされるが、業界慣習として旧ブラウザ向けに併記                                                                                                  |

### 却下した選択肢

- **`script-src 'self'` のみ（`'unsafe-inline'` 無し）**: Astro 6.1.5 の SSG 出力には hydration ブートストラップやページ固有の島制御が**インライン `<script>` / `<script type="module">`**として埋め込まれるため、CSP 違反で全ページが破壊される。Astro 標準では nonce/hash 注入機構が無く、ビルド後 HTML を後処理する独自スクリプトが必要となるため、本 PR スコープ外で先送り。
- **`style-src 'self'`（`'unsafe-inline'` 無し）**: React TSX で `style={{...}}` を 219 箇所、Astro でも `style="..."` を多用しており、すべてを CSS Modules / `<style>` ブロックに移行するのは大規模リファクタになる。本 PR では互換性を優先。
- **`<meta http-equiv="Content-Security-Policy">` での代替**: `frame-ancestors` / `report-uri` 等は meta 経由では効かないため、レスポンスヘッダ方式を採用。
- **`netlify.toml` / `vercel.json` 等の併設**: 現在のホスティングは Cloudflare Pages のみ。複数ホスティングを実際に使う段階で追加する（YAGNI）。

### 結果・トレードオフ

- ✅ デフォルト全拒否（`default-src 'self'`）+ 利用ディレクティブの個別許可で多層防御が成立。
- ✅ `frame-ancestors 'none'` でクリックジャッキング、`X-Content-Type-Options: nosniff` で MIME sniffing、`Referrer-Policy` でリファラ漏えいを抑止。
- ✅ Permissions-Policy で未使用機能（microphone / geolocation）を明示的に無効化し、将来追加コードでの誤利用を防止。
- ✅ `connect-src 'self'` により、万一 XSS が成立しても外部送信経路を断つ。
- ⚠️ `script-src` と `style-src` に `'unsafe-inline'` を残しているため、インラインスクリプト/スタイル経由の XSS 緩和効果は限定的。Astro の nonce 対応 or インラインスタイル削減を将来課題として継続的に検討する（追跡 issue: [#176](https://github.com/fumtas1k/devtools/issues/176)）。なお dev / preview server の挙動差で security.csp が未検証だった件は [063] で解消、`script-src 'unsafe-inline'` の実質削減 (meta strict layer 採用) は [064] で実施。
- ⚠️ Cloudflare Pages 以外のホスティング（Netlify は同形式で動作するが、Vercel は `vercel.json` 形式）に切り替える際は別途設定追加が必要。
- ℹ️ E2E テストでのヘッダ検証は、Playwright が `npm run dev`（Astro dev server）経由で起動しており dev server は `_headers` を解釈しないため、本 PR では `public/_headers` ファイル内容の Vitest 単体テストに留めた。preview サーバーまたは実デプロイ後の検証は将来課題とする → **[063] で E2E を preview ベースに移行して解消**。

---

## [055] 月次 issue メトリクス収集ワークフローを追加

**2026-04-30 | ステータス: 採用**

### 背景

devtools リポジトリの issue 活動量（新規作成数・クローズ率等）を定量的に把握し、開発サイクルの健全性を継続モニタリングしたい。手動集計は属人的で継続しづらいため、GitHub Actions で自動化する。

### 決断

`.github/workflows/metrics.yml` を追加し、毎月 1 日 UTC 3:00（JST 12:00）に `github/issue-metrics@v3` で前月分の issue メトリクスを収集し、`peter-evans/create-issue-from-file@v6` でレポート issue を自動作成する。

- `SEARCH_QUERY` は `repo:${{ github.repository }}` でリポジトリ名をハードコードせず、フォーク・リネームにも対応。
- job-level permissions は `issues: write` のみ（`is:issue` 限定クエリのため `pull-requests: read` は不要）。
- `workflow_dispatch` を追加しテスト手動実行を可能にしている。

### 却下した選択肢

- **手動集計**: 継続性に欠ける。
- **外部 SaaS 利用**: ブラウザ完結・データ送信なしの方針と相反する。

### 将来課題

- `peter-evans/create-issue-from-file` のサードパーティ action は現状タグ参照。サプライチェーンリスク低減のため SHA pinning への移行を検討（#174）。

---

## [057] 2026-05-01 — E2E 実行責務をサブエージェントから親（司令塔）に移管

**2026-05-01 | ステータス: 採用**

### 背景

worktree 並列実行を採用しているため、複数のサブエージェントが同時に `npm run test:e2e` を起動すると port 4321 を奪い合い、`waitForReactHydration` timeout として誤報告される事故が頻発した（PR #181 / #188 で実害発生）。また sandbox 制約で dev server を起動できないケースもあり、サブエージェント側の E2E 実行は信頼性が低い。

### 決断

- サブエージェント: **E2E テストコードの追加義務は維持**（11 章原則）。`npm run test:e2e` の **実行は禁止**。検証範囲を unit + 型チェックに限定。
- 親（司令塔）: push 前後に worktree 内で 1 回だけ E2E を serial 実行。複数 worktree がある場合は同時実行禁止（直列化）。環境由来の失敗が続く場合は CI を最終判断とする。

### 却下した選択肢

- **サブエージェント側で port を可変化**: playwright config と Astro dev server の双方を同期する必要があり、複雑性に見合わない。直列化で十分。
- **E2E テスト自体を unit 化**: `waitForReactHydration` を含む WCAG / アクセシビリティ系の挙動はブラウザでないと検証できない。

### 安全性確認

- E2E **実装義務**は維持されるため、テストカバレッジは低下しない（実装コードと同時にテストコードが PR に入る原則は変更なし）。
- CI が最終ゲートとして機能（`.github/workflows/` の e2e ジョブで全件検証）。
- 親による代行実行は復旧コマンド（`lsof -ti:4321 | xargs kill -9`）と直列化を含むため、port 衝突起因の誤報告は排除される。

### 将来の見直しトリガー

- CI で port 動的割り当てが導入された場合は 3.1 の「実行禁止」を緩和できる（playwright config と Astro dev server の連携が自動化されることが前提）。

### 経緯追記

- **レビュー取得の取りこぼし事故** (2026-05-01): PR #187 / #188 / #189 で親が `gh api .../issues/<n>/comments` のみ確認し、GitHub の "Submit review" 機能経由の正式レビュー（`gh api .../pulls/<n>/reviews`）を 3 件取りこぼした。再発防止として 3.2 章「親向けレビュー取得手順」を追記。

### 関連 PR

- PR #192（本 PR、`.agents/rules/common.md` 3 章改訂）
- PR #181（fix #149: 元の手順では E2E 待ちで時間切れ）
- PR #188（refactor #168: worktree 並列で E2E が誤 timeout）

---

## [058] 2026-05-02 — 「先送り表現」の issue 化忘れ検出を script として切り出す

**2026-05-02 | ステータス: 採用**

### 背景

PR レビュー返信や教訓記録に「予定 / 候補 / follow-up / 将来課題」などの先送り表現が含まれているのに、対応する issue 番号 (`#NNN`) が併記されないケースが頻発し、ユーザー指摘を受けて事後起票する事故が複数発生（2026-05-01 の PR #188 → #196、PR #189/#192 → #197/#198）。`.agents/rules/common.md` 6.4 章「先送り時は必ず issue 化する」の規約はあるが、機械的にチェックする手段がなかった。

### 決断

検出ロジックを `scripts/check-followup-refs.sh` として切り出し、memory checklist (`feedback_commander_checklist.md` F 章) と `.claude/hooks/`（#199 で段階導入予定）から **single source of truth として呼び出せる**形にする。

```bash
bash scripts/check-followup-refs.sh /tmp/claude/issues/reply-*.md
bash scripts/check-followup-refs.sh docs/agent-lessons.md
```

exit 1 で `[WARN] file:line: 該当行` を出力し、issue 番号併記がない先送り表現を炙り出す。

### 却下した選択肢

- **skill 化** (`skills/pr-review-followup/`): SKILL.md + script + reference をパッケージ化する形だが、現時点では grep スクリプト 1 本に対して構造が大きすぎる。PR レビュー対応フローが定着したら再検討（#199 にて保留記録済み）。
- **`.claude/hooks/PreToolUse(Bash:gh pr comment*)` でフック化**: 完全自動化だが、フック実装・テスト・配布のコストがある。まず script + memory checklist で運用試行し、効果が見えたらフック化する段階導入を選択（#199）。
- **memory checklist に正規表現直書き**: 軽量だが single source of truth でなく、サブエージェント完了報告 / hook で重複する。

### 安全性確認

- script は read-only（grep のみ）。誤検出があってもファイル破壊はない。
- 検出ロジックの誤差（false positive / false negative）は run コストが軽いため許容。実運用で精度の問題が出たら正規表現を更新する。

### 拡張候補（issue 化の判断は実運用後）

- `.claude/hooks/` への移植（#199）: PR レビュー返信投稿前に自動で script を実行し、exit 1 ならブロックする hook を導入する。
- skill パッケージ化（#199）: PR レビュー対応の完走ワークフローが定着したら、skill としてパッケージ化する案。

### 関連 PR / issue

- PR #199（本決定で採用された script 本体）
- PR #196（起票忘れ事例: useQrCamera signal 伝播）
- PR #197（起票忘れ事例: force-with-lease push 運用ルール）
- PR #198（起票忘れ事例: permissions precedence 実機確認）
- `.agents/rules/common.md` 6.4 章「先送り時は issue 化必須」

---

## [059] 2026-05-02 — Web セッション向けプラグイン運用：marketplace 宣言のみ採用、自動 install と `.mcp.json` は実証で却下し手動 install + harness 待ちに確定

**ステータス: 採用（A 案（hook 自動 install）/ `.mcp.json` 二重宣言は実証で却下、C 案（手動 install + upstream issue 追従）に確定。context7 Web 403 は harness 側 egress allowlist 対応待ち）**

### 背景

Claude Code Web (claude.ai/code) で `.claude/settings.json` の `enabledPlugins` 配下プラグインに以下の問題が同時発生していた（issue #191）。

| プラグイン                                | 種別     | 症状                                      |
| ----------------------------------------- | -------- | ----------------------------------------- |
| `superpowers@claude-plugins-official`     | スキル型 | スキル一覧に出ない（未 install）          |
| `frontend-design@claude-plugins-official` | スキル型 | 同上                                      |
| `context7@claude-plugins-official`        | MCP 型   | MCP は登録されるが API 呼び出しが全て 403 |

レビュー時にライブラリ仕様の裏取りや、設計・計画・TDD の支援フローが回らず、誤った提案を投稿して撤回する事案も発生（PR #187）。

### 真因究明の経緯（PR #204 内の段階的検証）

| ステップ                                                                            | 推定された真因（当時）                                                                                                                                                                                                                | 検証結果                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ①初期仮説（issue #191 本文）                                                        | Context7 上流 API の認証・レート制限・障害                                                                                                                                                                                            | 採用未検証で保留                                                                                                                          |
| ②Web 1 回目検証                                                                     | サンドボックスの `allowedDomains` 不足                                                                                                                                                                                                | `*.context7.com` を追加して再検証 → 効果なし                                                                                              |
| ③Web 2 回目検証 + WebSearch                                                         | Context7 が API キー必須化（`ctx7sk-` プレフィクス）                                                                                                                                                                                  | 強すぎる断定であった                                                                                                                      |
| ④CLI セッションで API キー未設定でも疎通することを確認                              | Context7 無認証レート制限が直近で厳格化、Web の共有 IP で 403 を引きやすい                                                                                                                                                            | 推定であって実証されていなかった                                                                                                          |
| ⑤Web 側調査で `curl` のレスポンスヘッダ／ボディを直接観測（PR #204 review comment） | **Anthropic クラウドコンテナの egress プロキシで `context7.com` / `mcp.context7.com` が host allowlist に未登録**（レスポンスヘッダ `x-deny-reason: host_not_allowed` / ボディ `Host not in allowlist`）。Context7 まで到達していない | 採用（リポジトリ側の `.claude/settings.json` / `.mcp.json` / API キー設定では解消不可。Anthropic harness 側の egress allowlist 対応待ち） |

403 は HTTP プロトコル層では Context7 のアプリ層エラーと区別がつかないが、レスポンスヘッダ `x-deny-reason: host_not_allowed` で **Anthropic 側の egress プロキシが返したもの**と判明。リポジトリ側で書き換え可能な層（local sandbox / MCP server 設定 / API キー）はすべて egress プロキシより内側にあるため、設定変更で解消する余地がない。CLI / Desktop はこの egress プロキシを経由しないため影響なし。

### 決断

PR #204 で最終的に採用する変更は以下の **1 点のみ** に絞る（A 案・`.mcp.json` 併設はいずれも実証で却下した）。

1. **`extraKnownMarketplaces` の宣言**: `.claude/settings.json` に `claude-plugins-official`（GitHub: `anthropics/claude-plugins-official`）を宣言。`~/.claude/plugins/known_marketplaces.json` に登録メタデータが書かれることまでは確認済み（Web セッションでも観測）。**ただしカタログ本体のフェッチや plugin install のトリガーまでは行われない**（既知制約、後述）。
2. **CLAUDE.md / decisions [059] の運用記述更新**: Web は手動 `/plugin install` を 1 回だけ実施する運用に確定。context7 Web 403 は harness 側 egress allowlist 待ち。API キーは optional で、設定する場合は `~/.claude/settings.json`（user-scoped）の `env` セクションに置けばプラグイン MCP が読む。

### 検証で判明した事実（CLAUDE.md にも反映）

- `extraKnownMarketplaces` は `~/.claude/plugins/known_marketplaces.json` への登録まで動くが、**plugin の install トリガーにはならない**（Claude Code 本体側の既知制約、upstream issue #23737 等）。
- 既に trust 済みのリポジトリでは Web の install prompt は発火しない（trust 直後イベントに紐づく）。
- SessionStart hook 内の `claude plugin install` は Web セッションで全 3 件 `Plugin "<name>" not found in marketplace` で fail する。`claude plugin marketplace update` を前置しても同症状（marketplace.json には完全一致で 3 プラグインとも存在することは curl で確認済み）。`claude plugin install` の CLI 経路は cloud session の plugin lookup と整合せず、現状リポジトリ側からの auto-install は不可能。
- Context7 は API キー必須ではない（CLI / Desktop は無認証で疎通）。`@upstash/context7-mcp` は env `CONTEXT7_API_KEY` で受け取り、`~/.claude/settings.json` の env 経由で渡せばプラグイン MCP も読む。
- **Web セッションでは Anthropic クラウドコンテナの egress プロキシが `context7.com` / `mcp.context7.com` を host allowlist 未登録で遮断中**（curl レスポンスヘッダ `x-deny-reason: host_not_allowed` を観測）。リポジトリ側で対処不能、harness 側対応待ち。CLI / Desktop はこの egress を経由しないため影響なし。

### 却下した選択肢

- **A 案：SessionStart hook で `claude plugin install` を自動実行**: PR #204 で実装・検証したが Web セッションで全 3 件 fail（`Plugin "<name>" not found in marketplace`）。`claude plugin marketplace update` 前置でも同症状。CLI 経路と cloud session 内部の plugin lookup が整合しないと推測。最終的に hook を撤去して C 案に確定。
- **`.mcp.json` でプロジェクト直起動の context7 を併設**: PR #204 で実装したが、(i) Web 403 は egress 段で発生するため `.mcp.json` 経由でも解消しない（実証済み）、(ii) CLI / Desktop はプラグイン版の MCP（`mcp__plugin_context7_context7__*`）だけで無認証疎通する、(iii) API キーは `~/.claude/settings.json` の env 経由でプラグイン MCP にも propagate する、ため `.mcp.json` を残す根拠が消失。`mcp__context7__*` と `mcp__plugin_context7_context7__*` の二重登録は混乱の元なので KISS / YAGNI で削除確定。
- **API キーを `.mcp.json` に直接書く**: secret の commit になり許容できない（`.mcp.json` 自体を撤去したため moot）。
- **API キーを `.claude/settings.json`（プロジェクトの env）に書く**: 同様に commit されるので不可。`~/.claude/settings.json` の user-scoped 配置に揃える。
- **`sandbox.network.allowedDomains` に `context7.com` / `*.context7.com` を追加**: 当初「サンドボックス遮断が真因」推定で追加したが、HTTP 403 がアプリ層から返ってきている事実によりサンドボックスは透過していると確認された。「将来の sandbox 仕様変更に備える preventive 措置」として残す案も検討したが、共通規約の YAGNI 原則に反するため**追加せず**確定。
- **`CLAUDE_CODE_PLUGIN_SEED_DIR` で pre-populated `~/.claude/plugins/` を使う**: Docker image を build できる環境（自前 CI）では有効だが、claude.ai のクラウドコンテナは Anthropic 側 build のため不可。

### 採用した選択肢（C 案：手動 install + upstream 追従）

- 各環境で `/plugin install superpowers@claude-plugins-official` 等を 1 回だけ実行する運用に確定。
- upstream issue #23737 / #17832 / #19275 の進捗を監視し、`autoInstallEnabledPlugins` 等が ship されたら CLAUDE.md / decisions [059] を更新。
- context7 Web 403 は harness 側 egress allowlist 対応待ち。

### トレードオフ

- ✅ `extraKnownMarketplaces` で marketplace 宣言は documented な書き方を残し、運用記述（CLAUDE.md / decisions [059]）を実態に合わせて確定。実証で否定された機能を載せず、PR の scope を「事実の文書化」に集約。
- ❌ **Web セッションでは plugin install と context7 疎通の両方が現状動かない**（前者は upstream 既知制約、後者は harness 側 egress allowlist 未対応）。リポジトリ側で完全には解消できないため、運用で吸収（手動 install + harness 待ち）。
- ⚠️ Web では 3 プラグインを 1 回だけ手動 install する手間が残る。CLAUDE.md「推奨プラグイン」節に明記。
- ⚠️ A 案（SessionStart hook）の試行と却下、`.mcp.json` の追加と削除を同 PR 内で繰り返しており、commit 履歴上は迷走の跡が残る。本決定（[059]）に経緯を集約しているので、後追い時は本記録を読めば十分。

### 後続タスク

- harness 側の `context7.com` / `mcp.context7.com` egress allowlist 追加が確認できたら Web で context7 を再検証する → issue #205 で追跡。
- upstream issue #23737 / #17832 / #19275 の進捗を監視し、`autoInstallEnabledPlugins` / Skill 動的 reload 等が ship されたら本決定を更新（手動 install 手順を撤去）→ issue #206 で追跡。

### 関連 PR / issue

- PR #204（本決定の実装、段階的真因究明を含む）
- issue #191（症状の整理、本 PR で close）
- issue #205（後続: Web context7 egress 解消後の再検証）
- issue #206（後続: plugin auto-install / Skill 動的 reload 制約への対応見直し）
- PR #187（context7 不在による誤レビュー事例）

---

## [060] 2026-05-02 — qr-ticket: `sanitizeField` を silent 置換から throw 方針に変更

**2026-05-02 | ステータス: 採用**

### 背景

`src/utils/qr-ticket.ts` の `sanitizeField` は従来 `|` を半角スペースに silent 置換していた。これは QR ペイロードのデリミタ衝突回避のための応急処置だったが、ユーザーが意図して入力した `|` がデータ復元時に失われる問題があった（署名対象の payload 文字列に対しても置換後の値が使われるため、再現性の観点でも望ましくない）。

issue #169 項目 3 で `serializeTicket` / `parseQrString` の対称シリアライザペアを整理する過程で、silent な値破壊を残したままにしておくと「シリアライザの可逆性」を成立させられない（往復で値が変わる）ことが明確になり、本決定で挙動方針を変更する。

### 決断

`sanitizeField` を「`|` を含む値が来たら throw する validation 関数」に変更する。silent な値破壊を排し、明示エラーとしてハンドリング可能にする。throw メッセージは `フィールド値に | を含めることはできません: "<value>"` として、どのフィールドが問題かを呼び出し側で特定できるようにする。

### 影響 / 移行

- `serializeTicket` / `buildPayload` / `signTicket` / `ticketToQrString` を経由するコードパスで、`|` 含有の入力時に従来は通っていたところが throw する。
- 上位 UI 層（`QrTicket.tsx`）では現状汎用 try/catch に拾われて「QRコードの生成中にエラーが発生しました」と表示されるため、UX 観点での専用エラーメッセージ化（`handleGenerate` 事前 validation）は **PR #221（#167-B QrTicket 3 hook 分割）merge 後のフォローアップ PR** で別途対応する（衝突回避のため本 PR では触らない）。issue 番号は親 PR 側で起票・記録予定。
- E2E テスト・ユニットテストへの直接影響なし（既存テストは `|` を含まない正常系。本 PR で「`|` 含有時に throw する」テストへ更新済み）。
- 公開 API のシグネチャ（戻り値の型・引数）は変更なし。

### 却下した選択肢

- **silent 置換のまま維持**: 可逆性が成立せず、署名対象の payload と入力値が異なるため将来の検証ロジックで混乱を招く。
- **置換文字を `|` 以外（例: `_`）に変更**: silent な値破壊である本質は変わらず、解決にならない。
- **エスケープ方式（`\|` などで `|` をリテラル化）**: parser 側のロジックが複雑化し、QR コード化したときのバイト数増にもつながる。短期的には throw 方針の方が KISS。

### 関連 PR / issue

- PR #218（本変更）
- issue #169（refactor 親 issue、項目 3 として記録）
- PR #221（#167-B QrTicket hook 分割、merge 後に UX フォローアップ PR で `handleGenerate` 事前 validation を追加）

---

## [061] 2026-05-02 — config-converter のスキーマ検証を `@cfworker/json-schema` へ差し替え + CSP デグレ検知ゲート追加

**2026-05-02 | ステータス: 採用**

### 背景

`src/components/tools/ConfigConverter.tsx` の「JSON Schema で検証する」ボタンが Cloudflare Pages 本番で次のエラーを返し、機能不全になっていた:

```
/: スキーマが無効です: Evaluating a string as JavaScript violates the following
Content Security Policy directive because 'unsafe-eval' is not an allowed source
of script: script-src 'self' 'unsafe-inline'.
```

直接原因は `src/utils/config-converter/schema-validator.ts` で使用していた Ajv 8.x が、スキーマを `new Function()` で JIT コンパイルする設計のため `script-src 'unsafe-eval'` を要求すること。`public/_headers` の CSP は `unsafe-eval` を許可していないため本番のみで失敗していた。

より深刻な問題は **CI で検知できなかった** こと。`playwright.config.ts` は `npm run dev`（Astro dev server）で起動するが、dev / preview server は `public/_headers` を解釈しない。結果、ユニット (jsdom) も E2E (Astro dev) も CSP 制約無しで実行され、本番限定の eval 依存違反が素通りした。これは [054] 末尾で「将来課題」と明記していた既知の穴で、本決定でその穴を塞ぐ。

### 決断

2 つの修正をセットで実施する。

**A: バリデータライブラリの差し替え (`ajv` → `@cfworker/json-schema`)**

- `package.json` から `ajv` / `ajv-draft-04` / `ajv-formats` を direct dep から外し、`@cfworker/json-schema@^4.1.1` を追加
- `schema-validator.ts` を `Validator` ベースに全面書き換え。draft-04 / 7 / 2019-09 / 2020-12 は `$schema` 文字列から検出（既定 draft-07）
- cfworker は interpreter 実装で `eval` / `new Function` を使わず、CSP `'unsafe-eval'` 不要

**B: E2E に本番相当 CSP を注入するリグレッション検知ゲート**

- `src/utils/csp.ts` に `PRODUCTION_CSP` 定数を新設し、`public/_headers` の CSP 値の single source of truth とする
- `src/utils/__tests__/headers.test.ts` で `_headers` の CSP 値と `PRODUCTION_CSP` が完全一致することをアサート（片方更新の事故を防ぐ）
- `tests/e2e/helpers.ts` に `applyProductionCsp(page)` を追加。`page.route` で HTML レスポンスに `PRODUCTION_CSP` を注入し、`console` / `pageerror` を購読して CSP 違反メッセージを蓄積、`assertNoViolations()` で test failure に昇格させる
- `tests/e2e/config-converter.spec.ts` に `applyProductionCsp` 経由の検証成功シナリオを 1 本追加し、同種の事故を CI で検知できるようにする

### 却下した選択肢

- **CSP に `'unsafe-eval'` を追加**: 最小修正だが、ツール 1 つのために全ページの `script-src` allow-list を緩めることになり、CSP 全体の XSS 緩和効果を後退させる。本ツールは現状ユーザー操作で任意 JSON Schema を `eval` 相当に流せる UX なので、`unsafe-eval` 緩和は将来 schema validator 以外の場所での誤利用も含めて被害面積が大きい。不採用。
- **Ajv standalone (事前コンパイル)**: 静的に既知のスキーマしか扱えない。本ツールはユーザーが任意の JSON Schema を実行時に貼り付ける UX なので適用不可。
- **`@hyperjump/json-schema`**: spec 準拠は同等に高いが API が非同期＋スキーマ事前 register 必須で `validateWithSchema` のシグネチャ変更が大きく、unpacked size も 423 KB と cfworker (173 KB) の 2.4 倍。今回の用途では cfworker の方が単純で副作用が少ない。
- **`wrangler pages dev` で E2E を駆動**: `_headers` を本番同等に解釈できるが、起動コスト・依存追加が大きく、CI 全体に波及する。Playwright `page.route` 注入で目的を達成できるため見送り。
- **`<meta http-equiv="Content-Security-Policy">` を BaseLayout に追加**: [054] で `frame-ancestors` 等が meta 経由では効かないとして全 CSP の meta 化は却下済み。`script-src` 部分だけの meta 追加は二重管理になり、Playwright route 注入の方が source of truth を一元化できる。

### 影響 / 移行

- **挙動差**: cfworker は JSON Schema 仕様に準拠して未知のキーワード（旧 Ajv `strict: true` で検出していたもの）や型と無関係なキーワード（例: `type: number` に対する `minLength`）を **無視** する。Ajv の独自警告に依存していたユーザーには UX 面の小さな後退があるが、spec 準拠を優先する。`schema-validator.test.ts` に当該挙動を明示する回帰防止テストを置いた。失われた検出能力は将来「スキーマ lint」機能として復活させる予定（追跡: [#235](https://github.com/fumtas1k/devtools/issues/235)）。
- **依存サイズ**: `ajv-formats` は direct dep から削除（cfworker は draft 既定の formats を内蔵）。`ajv` / `ajv-draft-04` は他の devDependencies の推移依存として残るが、本コードからの import は無し。
- **CSP gate の射程**: 当初は `tests/e2e/config-converter.spec.ts` の検証ボタン経路 1 本のみ適用。他のツールへ広げる作業は [#234](https://github.com/fumtas1k/devtools/issues/234) で別途議論する（一気に全テスト適用すると、現状混入している他の `unsafe-*` 依存が浮上する可能性があり、本 PR スコープを膨らませるため）。

### 関連 PR / issue

- 本 PR (config-converter CSP 修正 + デグレ検知ゲート)
- 決定 [054]（CSP 初実装。末尾の「dev/preview 非適用 CSP の検証は将来課題」が本件で具体化）

---

## [062] 2026-05-03 — `agent-worktree-setup.sh` を廃止し SessionStart hook で `npm ci` 自動化に移行

**2026-05-03 | ステータス: 採用**

### 背景

`scripts/agent-worktree-setup.sh` は subagent isolation worktree で E2E を回す前に node_modules を「整地」するヘルパーとして 2026-05-02（PR #212）に追加された。docstring が想定する 4 つの問題:

1. sandbox 由来の read-only ファイルを `chmod -R u+w` で書き込み可能化
2. 古い node_modules を `rm -rf` で削除
3. `~/.npm` が root-owned 問題を `--cache "$TMPDIR/npm-cache"` で回避
4. port 4321 を `lsof | xargs kill -9` で解放

PR #240（ルールファイル整理）の派生検証で、上記いずれも **fresh subagent isolation worktree では実態として発生しない** ことが判明した。さらに、スクリプト自身が sandbox 環境では `.idea/` `.vscode/` 同梱の推移依存パッケージで `rm -rf node_modules` が EPERM になり中断する弱点も持つ（実際に検証中、親の作業ディレクトリで誤って実行され node_modules を破壊する事故が発生し復旧が必要だった）。

### 検証結果（sonnet subagent + isolation worktree、2026-05-03）

| 想定された問題             | 実態                                           |
| -------------------------- | ---------------------------------------------- |
| (1) sandbox 由来 read-only | fresh worktree に node_modules 不在 → 発生せず |
| (2) 古い node_modules 削除 | 同上                                           |
| (3) `~/.npm` root-owned    | 現環境では 501:20 owned で正常 → 回避不要      |
| (4) port 4321 占有         | fresh worktree に dev server 無し → 発生せず   |

素の `npm ci` で **exit 0 / 5〜10 秒 / 558 packages** インストール完了、`astro check` 0 errors を実測。

### 決断

`scripts/agent-worktree-setup.sh` を削除し、subagent への node_modules 整備手段を素の `npm ci` 一本化する。

加えて、subagent が `npm ci` を忘れて E2E が hydration timeout になる事故を防ぐため、`.claude/settings.json` の SessionStart hook を以下の通り緩和して subagent isolation worktree でも auto-run するようにする:

```diff
- "command": "if [ \"$CLAUDE_CODE_REMOTE\" = \"true\" ] && [ ! -d node_modules ]; then npm ci; fi"
+ "command": "if [ ! -d node_modules ] && [ -f package-lock.json ]; then npm ci; fi"
```

`CLAUDE_CODE_REMOTE` 限定だった条件を「lockfile があり node_modules 不在なら一律実行」に変更することで、cloud session・subagent isolation worktree・初回 clone のいずれでも発火する。

3 層防御で「subagent が npm ci を忘れる」事故を抑止する:

1. **SessionStart hook (自動・主要)**: 緩和した条件で auto-run
2. **Playbook 規約**: `docs/playbooks/pr-creation.md` 1.1 章のブランチ作成手順に `npm ci` 行を明示追加
3. **Playbook step 0**: `docs/playbooks/e2e-validation.md` push 前必須チェックリスト ステップ 0 で再確認

### 却下した選択肢

- **スクリプトを修正して動くようにする**（`mv` フォールバック等）: そもそも 4 つの想定問題が fresh worktree で発生しないため、複雑性を足す価値がない。「問題を起こすコードを丁寧に修正する」より「問題を起こさない単純解に置き換える」が KISS。
- **スクリプトを残し deprecation コメントだけ追加**: 親の作業ディレクトリで誤って実行された際の node_modules 破壊リスクが残る。実際に検証中に発生したため、削除が安全。
- **SessionStart hook を変更しない**: subagent が `npm ci` を忘れた場合、E2E が hydration timeout で失敗するまで気付けない。手動回復は復旧に時間がかかる（過去の症状が再発する）。
- **`CLAUDE_CODE_REMOTE` の代わりに subagent 検出（cwd に `.claude/worktrees/agent-` を含むか）を条件にする**: より厳密だが、ローカル CLI 環境で初回 clone した場合などにも npm ci を auto-run したいので、よりシンプルな「lockfile + node_modules 不在」で十分。

### 影響 / 移行

- **削除ファイル**: `scripts/agent-worktree-setup.sh`
- **更新ファイル**:
  - `scripts/README.md` — 該当 section 削除
  - `docs/playbooks/e2e-validation.md` — step 0 を `npm ci` に変更、補足注に npm install シナリオ別 caveats を追加
  - `docs/playbooks/pr-creation.md` — ブランチ作成完成形に `npm ci` 追加、step 0 を `npm ci` に変更
  - `docs/agent-lessons.md` — 2026-05-01 entry に「2026-05-03 追記」セクション
  - `.claude/settings.json` — SessionStart hook 条件緩和（本 PR の別 commit で対応予定）
- **後方互換**: `bash scripts/agent-worktree-setup.sh` を呼ぶ既存の指示書 / プロンプトテンプレートが残っていたら `npm ci` に置換する必要あり

### npm install シナリオ別の sandbox caveats（補足）

`npm ci` 後に `npm install` 系を走らせる場合の sandbox 影響:

- **新規追加** `npm install foo`: 問題なし（network / 新規 dir 作成 / lockfile 更新は全て allow 範囲）
- **アップグレード** `npm install foo@new`: foo が `.idea/` `.vscode/` 同梱の場合、古い版の削除フェーズで EPERM の可能性
- **削除** `npm uninstall foo`: アップグレードと同様

該当しそうな推移依存: `iconv-lite`（`.idea/` 同梱）/ `stream-replace-string`（`.vscode/` 同梱）。直接依存ではないが推移依存先のメジャー更新で巻き込まれる可能性あり。詰まったら親 CLI セッションで実行するか、`mv` で退避してから再 install。

### 関連 PR / issue

- 本 PR (#241 対応、agent-worktree-setup.sh 廃止 + hook 緩和)
- issue [#241](https://github.com/fumtas1k/devtools/issues/241)（廃止検討）
- PR [#240](https://github.com/fumtas1k/devtools/pull/240)（ルール整理、本検証の発端）
- 決定 [057]（E2E 実行責務の親移管。本 [062] で subagent への自動 npm ci によって責務分担が再度更新される）

---

## [063] 2026-05-03 — E2E を `astro dev` から `astro build && astro preview` ベースに切替

**2026-05-03 | ステータス: 採用**

### 背景

[054] で導入した CSP は `public/_headers` 経由でレスポンスヘッダとして配信される。後続の [#176](https://github.com/fumtas1k/devtools/issues/176) 改善（`script-src 'unsafe-inline'` 削減）で採用予定の Astro 6.x `security.csp` 機能は、ビルド時に各ページへ `<meta http-equiv="content-security-policy">` を注入してインラインスクリプト/スタイルをハッシュベースで許可する。

しかし [Astro 公式ドキュメント](https://docs.astro.build/en/reference/configuration-reference/#securitycsp) は明確に、`security.csp` は **dev mode で動作せず build/preview モードのみで有効** と記載している。`playwright.config.ts:webServer.command` は `npm run dev` を起動していたため、このまま [#176] を採用しても E2E は `<meta>` 不在の環境で回り、本番との prod-parity が崩れる（[061] で同種の dev/prod 乖離による事故が発生済み）。

[054] 末尾の「preview サーバーまたは実デプロイ後の検証は将来課題とする」の解消にもあたる。

### 決断

`playwright.config.ts:webServer.command` を `npm run build && npm run preview -- --port 4321` に切り替え、E2E を `dist/` 配信に対して実行する。

- `webServer.timeout` は build 時間を含むため 30s → 120s に延長
- CI（`.github/workflows/test.yml`）の e2e job にも `npm run build` step を明示追加（ログ可読性 + 早期失敗切り分け）
- `applyProductionCsp` ヘルパは現状ロジック（route 介入で response header に `PRODUCTION_CSP` を上書き）を維持。本 PR 時点では `<meta>` は未生成（`security.csp` 未採用）のため response header のみで評価されるが、後続 [#176](https://github.com/fumtas1k/devtools/issues/176) で `security.csp` が採用されると build 時に `<meta>` が注入され、route 介入の header と AND 評価される構成になる
- `.agents/rules/common.md` / `docs/playbooks/e2e-validation.md` / `docs/playbooks/pr-creation.md` / `README.md` / `CLAUDE.md` を preview 前提に整合

### 副次効果（重要）— Vite asset inline 化の構造的修正

preview 切替で **本番にも存在していた CSP 違反**が表面化した: `@fontsource/jetbrains-mono` の小さな subset font (cyrillic-ext 等) が Vite デフォルトの `assetsInlineLimit: 4096` で `data:font/woff2;base64,...` として CSS に inline 化され、`public/_headers` の CSP は `font-src` を明示しないため `default-src 'self'` で block されていた。dev mode では asset を bundling せず元ファイル URL のまま配信するため発現せず、長期間気付かれなかった。

`astro.config.mjs` の `vite.build.assetsInlineLimit: 0` で全 asset の inline 化を無効化し、dev/preview/prod の挙動を一致させた。CSP に `font-src 'self' data:` を追加する選択肢もあったが、(a) 同種の問題（小さな画像 / SVG の data: URI 化）が将来再発する温床を残すこと、(b) CSP の許可面を増やすことより asset 配信を統一する方が構造的に強いこと、から inline 無効化を採用した。

inline 化解除のトレードオフ — HTTP/1.1 環境では小ファイルの個別 GET が増えるが、本番ホスト Cloudflare Pages は HTTP/2/3 デフォルトで multiplex 配信されるため実質的なロード差は無い。さらに `@fontsource/jetbrains-mono` は `unicode-range` で subset を gate しており、日本語/英数中心ユーザーのブラウザは cyrillic-ext 等のサブセットを fetch しないため発火経路自体が稀。`dist/` 全体サイズは inline 化解除前後で 16M 据え置きで、ファイル数のみ +7（cyrillic-ext / greek / vietnamese 等の小サブセットが個別ファイル化された分）。

### 却下した選択肢

- **dev のまま維持し、`<meta>` 注入だけ E2E helper で再現**: `dist/` の build 成果物から `<meta>` を抽出して注入する設計が必要で、build 出力と E2E 注入の二重管理になり brittle。prod-parity の本質（実ビルド成果物への E2E）から外れる。
- **`wrangler pages dev` で E2E を駆動**: [061] で同様検討済み。起動コスト・依存追加が CI 全体に波及する。preview で十分。
- **`security.csp` 採用を諦めて [#176] を A-2 (post-build hash 化) に倒す**: A-2 は実装複雑度・将来 Astro builtin との互換性で劣る。preview 切替は本番一致のため独立して価値があり、[#176] 以外にも波及効果がある（同種の eval 依存事故 [061] の早期検知精度向上、副次効果欄の data:font 事故も dev/prod parity 確保で恒久的に防止）。
- **CSP に `font-src 'self' data:` を追加**: 副次効果欄の通り、structural fix を選好。

### 影響 / 移行

- **E2E 実行時間**: cold start で build に 15〜25s 程度上乗せ。`reuseExistingServer: true` のためローカル連続実行では 2 回目以降スキップ。CI では毎回 build が走る（許容範囲）。実測: 1 worker 145 テスト + build 込みで約 1.3 分
- **手元実行**: `npm run test:e2e` のコマンドは変わらない。内部的に build が走るため初回は数十秒かかる旨を `e2e-validation.md` 0 章に明記
- **port 4321**: dev / preview で同じため衝突リスクは変わらず。`npm run pretest:e2e` の port kill ロジックも変更不要
- **preview と dev の挙動差**: `assetsInlineLimit: 0` で吸収できた。test spec への変更は不要だった
- **dist サイズ**: inline 化解除で 7 ファイル増（cyrillic-ext font 等）。合計サイズはほぼ不変（16M）。HTTP/2 multiplexing 下で実質的なロード差なし
- **後続作業の解禁**: [#176] の A-1 PR が安全に着手可能になる

### 関連 PR / issue

- 本 PR: #246 で起票
- 後続: [#176](https://github.com/fumtas1k/devtools/issues/176)（A-1 採用）
- 過去: [054]（CSP 初導入）／[061]（CSP 違反 CI 検知ゲート初導入）／[062]（worktree setup 簡素化）

---

## [064] 2026-05-03 — `script-src 'unsafe-inline'` 削減: Astro `security.csp` で `<meta>` を strict layer 化、ヘッダは permissive defense-in-depth に分離

**2026-05-03 | ステータス: 採用**

### 背景

[054] で導入した CSP は `script-src 'self' 'unsafe-inline'` を含み、Astro の hydration runtime / island 制御スクリプト / `is:inline` ServiceWorker 登録が inline `<script>` で出力されるため `'unsafe-inline'` が必須だった。これは `dangerouslySetInnerHTML` 利用箇所（QrCode / Gs1Databar / qr-ticket GenerateTab の 3 箇所）が将来 sink 化した場合に XSS 防御が効かない既知の弱点だった。[#176](https://github.com/fumtas1k/devtools/issues/176) で 3 案 PoC 並走の結果、A-1（Astro `security.csp` 採用）が第一推奨と確定。E2E の preview 切替（[063]）が完了し A-1 を安全に検証できる土台が整ったため本 PR で実施。

### 当初プランと実装中に判明した architectural な制約

当初プランは「`_headers` から `script-src 'unsafe-inline'` を削除し strict 化」だったが、実装中に CSP 仕様の **Multiple Policies AND 評価**による architectural な制約が判明:

- Astro `security.csp` は `<meta http-equiv="content-security-policy">` を build 時に注入し、inline script を SHA-256 hash で auto-allowlist する
- 一方、`public/_headers` は HTTP response header 経由の CSP として配信される
- ブラウザは **複数 CSP policy を AND 評価**: inline script が pass するためには、すべての policy で許可されている必要がある
- `_headers` の `script-src` から `'unsafe-inline'` を削除すると、header policy が hash も `'unsafe-inline'` も持たない `script-src 'self'` になり、**header 単体で全 inline script を block する**
- 結果として `<meta>` の hash があっても AND 評価で header が落とし、Astro island loader / SW 登録など Astro 自身の inline script も動かなくなる（preview と本番 Cloudflare Pages の両方で）

### 決断

**「`<meta>` を script-src strict layer、`_headers` を permissive defense-in-depth 層」と再定義する。**

実装内訳:

- `astro.config.mjs` に `security: { csp: { algorithm: 'SHA-256' } }` を追加。Astro の build pipeline が処理する inline `<script>` を自動で SHA-256 hash 化し `<meta>` に列挙
- `BaseLayout.astro` の SW 登録 `<script is:inline>` から `is:inline` を削除し、Astro pipeline で外部 module bundle に変換（auto-hash 対象に）
- `astro.config.mjs` に `stripMetaStyleSrc()` カスタム integration を追加し、`<meta>` から `style-src` ディレクティブを除去（後述「style-src の例外」参照）
- `public/_headers` の `script-src 'self' 'unsafe-inline'` は **意図的に維持**。header は permissive のまま、AND 評価で `<meta>` の hash 制約が支配する
- `src/utils/csp.ts:PRODUCTION_CSP` に「meta が strict layer の設計」コメント追加。`src/utils/__tests__/headers.test.ts` も同方針に揃え、`'unsafe-inline'` 保持を陽性アサート（comment で意図明記）
- `src/utils/__tests__/meta-csp.test.ts` を新設し、build 後の `dist/*.html` の `<meta>` CSP が `script-src 'self' 'sha256-...'`（`'unsafe-inline'` 不在）を保つことを Vitest で検証。**meta strict layer の崩壊を CI で即時検知**

### セキュリティ効果

XSS sink への inline script 注入 (`<script>maliciousCode()</script>`) を考えた場合:

- header policy: `'unsafe-inline'` で許可（permissive 層なので）
- meta policy: hash が一致しないため block
- AND 評価: meta が block → **全体として block**

これにより `dangerouslySetInnerHTML` 経由の sink 化が起きても CSP で実行を防げる。「`'unsafe-inline'` 削除」の本来の security goal は meta 層で達成された。

`_headers` の `'unsafe-inline'` は misleading に見えるが、コメントで AND 評価設計を明記し、`docs/decisions.md` [064] へリンクすることで現場の誤解を防ぐ。

### `style-src` の例外（`stripMetaStyleSrc()` integration）

`security.csp` を有効にすると Astro はデフォルトで `style-src` にも sha256 hash を付与する。しかし CSP Level 2+ 仕様により **`style-src` に hash と `'unsafe-inline'` が共存するとブラウザは `'unsafe-inline'` を無視する**。本 PR では style-src の strict 化は scope 外（B 案で React `style="..."` 200+ 箇所の段階移行と合わせて行う必要がある）ため、`<meta>` から `style-src` を strip して header 側 (`'self' 'unsafe-inline'`) のみで制御する。

`stripMetaStyleSrc()` は `astro:build:done` フックで `dist/*.html` の `<meta>` content から `style-src ...;` を regex で除去するインライン integration として実装（30 行）。B 案 完了時に **integration ごと削除**し、style-src も meta strict 層に組み込む計画。

### 残課題（B 案 — 別 PR）

`style-src 'unsafe-inline'` は依然として残る。React TSX の `style={{...}}` 200+ 箇所が build 後 `style="..."` 属性として出力されるためで、属性ベース inline style は CSP 仕様上 hash/nonce 照合の対象外。CSS Modules / scoped style への段階移行（[#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B）を別途進める。完了時に `stripMetaStyleSrc()` integration も削除する。

### 却下した選択肢

- **`_headers` の script-src を完全削除**: header 側に `script-src` ディレクティブを置かなければ `default-src 'self'` にフォールバック。`default-src 'self'` も inline を block するため同じ AND 評価問題が発生。`default-src` を緩めるのは defense-in-depth を後退させるため不採用
- **`_headers` の script-src に build 時 hash を埋め込んで sync**: build ごとに hash が変わるため `_headers` を build artifact として動的生成する必要があり、Cloudflare Pages の `_headers` 静的配信モデルから外れる。Astro builtin の利点を捨て A-2 (post-build hash 化) と実装複雑度が同等以上になる
- **A-2 (post-build hash 化) に切替**: 自前 integration で全ページの inline script を抽出 → hash 計算 → header に列挙。Astro builtin (`security.csp`) の auto-hash を捨てることになり、将来 Astro が直接 header CSP 出力をサポートした際の移行コストも増える。A-1 が builtin に乗れる選択肢として優位
- **A-3 (CSP3 strict-dynamic + nonce)**: 静的 SSG では per-request nonce が出せず、固定 nonce は CSP-Evaluator が HIGH severity 判定。1 ページに nonce 無しの inline script が複数あるため transitive trust も活きない。技術的に実装不可
- **SW 登録 script の手動 hash 列挙 (`scriptDirective.hashes`)**: SW script の中身が変わるたびに hash 再計算が必要。`is:inline` 削除のほうが zero-maintenance で堅牢

### 影響 / 移行

- **CSP の XSS 緩和効果**: meta layer による hash-only 制約により、`dangerouslySetInnerHTML` 利用箇所が将来 sink 化した場合のインライン XSS 注入が CSP で block されるようになる
- **build 出力**: 全ページに `<meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-...'">` が注入される（`stripMetaStyleSrc()` で style-src は除去済み）。dist サイズわずかに増、誤差レベル
- **dev mode**: `security.csp` は dev で動作しない（[063] で確認済の Astro 公式仕様）。dev は引き続き `'unsafe-inline'` 許容で動作するため開発体験への影響なし。E2E は preview ベース ([063]) で評価
- **CSP gate 強度**: `applyProductionCsp` ヘルパが response header (permissive) と `<meta>` (strict) の AND を評価する形で実体化。新たな inline script を Astro pipeline 外から追加すると CI が違反検出して止まる（meta-csp.test.ts と E2E の両層で検知）
- **後続作業**: B 案（`style-src 'unsafe-inline'` 削減）は独立 PR として継続。完了時に `stripMetaStyleSrc()` integration を削除し style-src も meta strict 化

### 関連 PR / issue

- 本 PR: [#249](https://github.com/fumtas1k/devtools/pull/249)
- 解消する issue: [#176](https://github.com/fumtas1k/devtools/issues/176)（A-1 完了）
- 前提依存: [063]（E2E preview 切替）／[061]（CSP 違反 CI 検知ゲート）／[054]（CSP 初導入）
- 後続: [#176](https://github.com/fumtas1k/devtools/issues/176) の B 案（`style-src 'unsafe-inline'` 削減）

---

## [065] 2026-05-03 — Playwright `webServer` を `process.env.CI` で分岐

**2026-05-03 | ステータス: 採用**

### 背景

[063] で `webServer.command` を `npm run build && npm run preview ...` に切替えた際、`.github/workflows/test.yml` 側でも `npm run build` step を追加したため **CI で build が 2 回走る**構成になっていた（webServer 内 build は incremental cache で軽いとはいえ wasteful、CI ログ可読性も悪化）。加えて `reuseExistingServer: true` + preview の組み合わせで、ローカルで開発者が手動 `npm run preview` を起動したまま `npm run test:e2e` を回すと **古い `dist/` に対して E2E が silent pass** する罠が発生する（dev 時代は HMR で吸収されていた）。

PR #247 セルフレビューの I-2 / I-3 として #248 に分離し別 PR で対応することにした。

### 決断

`playwright.config.ts:webServer` を `process.env.CI` で分岐する:

- **CI**: `command: 'npm run preview -- --port 4321'`（事前 step で build 済み）、`timeout: 30_000`（preview 起動は瞬時、env 由来失敗を早期検知）、`reuseExistingServer: true`（fresh runner なので影響なし）
- **Local**: `command: 'npm run build && npm run preview ...'`（build 忘れの safety net）、`timeout: 120_000`（build 時間込み）、`reuseExistingServer: false`（毎回新規 build/preview で stale dist trap を回避）

ローカルで毎回 build が走るのは incremental cache で 2 回目以降数秒、開発体験への影響は軽微。

### 影響 / 移行

- **CI 実行時間**: build の重複実行がなくなり ~25s 短縮（cold start で計測）
- **ローカル開発**: `npm run test:e2e` 実行ごとに incremental build が走る。手動 preview を別途起動した状態での E2E は port 衝突で失敗するため、`npm run pretest:e2e` で port 解放してから実行
- **fail-fast**: CI の env 由来失敗（webServer 起動不可等）が 30s で確定
- **後続作業**: なし（独立完結）

### 関連 PR / issue

- 本 PR: [#251](https://github.com/fumtas1k/devtools/pull/251)
- 解消する issue: [#248](https://github.com/fumtas1k/devtools/issues/248)
- 起源: PR #247 セルフレビュー I-2 / I-3
- 関連: [063]（preview 切替）

---

## [066] 2026-05-03 — VRT (Visual Regression Test) を独立 PR + 専用 workflow + 非 required check で導入

**2026-05-03 | ステータス: 採用**

### 背景

`#176` B 案 ui migration (`style={{}}` 200+ 箇所の className 化) に向けた visual regression 検出基盤として VRT を導入する。当初は ui migration と同じ PR で導入を試みた（旧 PR #253）が、以下 3 つの構造的問題で破綻し close:

1. **VRT setup を feature work と bundle した結果 infra 設計が後回し**: deterministic mock の注入タイミング、baseline 撮影タイミング、required check 化、すべてが場当たり的になった
2. **mock を最初から組まなかった**: baseline が non-deterministic な状態で撮影され、後付けで mock を入れても baseline 側が古いまま flake が継続。構造的に fix 不可能
3. **VRT を required check 想定で作った**: 意図的 visual 変更（例: BareInput の `mono` prop 由来の system mono → JetBrains Mono web font 移行）のたびに merge ブロックが発生する運用 friction

旧 PR #253 のレビュー過程で「修正前の状態でランダムを固定して snapshot を取る必要がある」「修正を意図的にした場合は、こけてても通す必要があるから必須テストに入れてはダメ」とユーザー指摘あり。完全に正当な architectural critique のため close した。

### 決断

VRT を **独立 PR (本 PR)** で先行導入し、以下の 5 つの設計原則を最初から適用する:

1. **Playwright project 分離**: `playwright.config.ts` で `e2e` (通常テスト) と `visual-regression` (VRT 専用) に分離。通常 `npm run test:e2e` は VRT を実行しない
2. **Deterministic mock 注入**: spec 内 `page.addInitScript()` で `Math.random` (seeded LCG) / `crypto.randomUUID` (incremental counter) / `Date.now` (固定 timestamp) を navigation 前に decorate。production code 無変更
3. **baseline は CI Linux で生成**: `update-visual-baseline.yml` workflow が CI runner で `--update-snapshots` を実行、bot が同 branch に commit back。ローカル mac の OS 差を排除
4. **専用 workflow + PR comment + artifact**: `visual-regression.yml` が PR trigger で VRT 実行、結果を PR comment（pass/fail サマリ + artifact link）で報告、`continue-on-error: true` で job 単体は fail しても workflow_run としては記録される
5. **branch protection の required check に含めない**: GitHub Settings UI で user が手動設定。意図的 visual 変更が merge ブロックしない設計

加えて `update-visual-baseline.yml` には **default branch guard** (`if: github.ref != 'refs/heads/develop' && github.ref != 'refs/heads/main'`) を入れ、誤って develop / main 上で trigger されても no-op となり branch protection 違反を回避。

### 却下した選択肢

- **VRT を ui migration と同 PR で導入**: 旧 PR #253 で破綻した
- **VRT を required check に含める**: 意図的 visual 変更のたびに merge friction が発生し、reviewer の判断機会を奪う。non-required + PR comment + workflow_dispatch baseline 更新の組み合わせがバランス良い
- **mask で動的領域を screenshot から除外**: 表面的な解決にとどまる。`addInitScript` で source の non-determinism を断つ方が clean
- **darwin baseline も commit**: ローカル mac DX が改善するが、Linux baseline と乖離した時の混乱が大きい。CI Linux baseline を SoT に固定し、ローカル diff は無視する運用が clean

### 副次効果 / 移行

- 旧 PR #253 で得た 3 件のメモリ (`feedback_vrt_setup_sequencing.md` / `feedback_subagent_verification_trust.md` / `feedback_infra_feature_separation.md`) を保存済み。同じ構造的失敗の再発を抑止
- 後続 ui migration PR (B 案 PR 1〜PR 6) は本 PR の VRT 監視下で実施。意図的変更は baseline 更新で accept、意図しない regression は fix
- `tests/e2e/visual-regression.spec.ts` の `addInitScript` mock 範囲は将来追加 page で不足する可能性あり（新 page で別の non-deterministic API を使う場合）。発見次第 mock を拡張する運用

### 関連 PR / issue

- 本 PR: [#254](https://github.com/fumtas1k/devtools/pull/254)
- 失敗 PR: [#253](https://github.com/fumtas1k/devtools/pull/253) (closed)
- 起源: `#176` B 案（`style-src 'unsafe-inline'` 削減）の前提整備
- 過去: [063] (preview 切替), [064] (CSP A-1), [065] (webServer CI 分岐)
- 後続: B 案 PR 1（基礎工事 + ui/\* simple 11 ファイル migration）から再着手

## [067] 2026-05-08 — `ResultTable` の `setProperty` 経路が CSP `style-src` strict 化と非互換 → B 案最終 flip を別 PR に延期

### 背景

`#176` B 案計画では PR 8 で `_headers` / `<meta>` 両側から `style-src 'unsafe-inline'` を削除し、最終 flip を完了する予定だった ([064] のフォローアップ)。PR 1〜7b で React `style={{` (200+ 箇所) と Astro `style="..."` (65 箇所) を全廃 + PR 8 commit 1 で SVG inline style も `currentColor` 化と、表面的な inline style 経路は完全に撲滅したと認識していた。

### 発覚

PR 8 で実際に `style-src 'self'` strict 化を試みた E2E (`npm run test:e2e`) で 11 件の violation が検知された:

```
Applying inline style violates the following Content Security Policy directive 'style-src 'self''.
Either the 'unsafe-inline' keyword, a hash ('sha256-...'), or a nonce ('nonce-...') is required.
```

失敗 spec はすべて **生成→ResultTable 表示** 経路 (`ulid-generator.spec.ts` 5 件 / `uuid-v7.spec.ts` 6 件 / `config-converter.spec.ts` JSON Schema 検証 1 件)。原因は `src/components/ui/ResultTable.tsx:62-78` の以下 2 箇所:

```ts
el.style.setProperty('--result-table-min-width', minWidth);
el.style.setProperty('--col-width', col.width);
```

これらは PR 1.5 (#261) で `style={{}}` 撲滅と引き換えに導入した CSSOM API 経由の動的 width 設定であり、`inline-style-migration.test.ts` の検出 regex も `\.style\.setProperty(` を意図的に除外していた。当時の前提は「CSSOM API は CSP 観点で `style="..."` HTML 属性とは別経路」だったが、これは誤りだった。

### 根本原因

CSP3 仕様 (`https://www.w3.org/TR/CSP3/#directive-style-src`) では `style-src` の制御対象に以下が含まれる:

- `<style>` 要素
- `style` 属性 (HTML attribute)
- **JavaScript による style modification** (`CSSStyleDeclaration.cssText`, `setProperty`, `style` プロパティ書換え)

`el.style.setProperty('--col-width', '120px')` は DOM 上で `<el style="--col-width: 120px">` を生成し、これは CSP の `style-src` に対して inline style として評価される。`'unsafe-inline'` / hash / nonce のいずれも無いと block される。

### 評価した解 (3 案)

| 案                                | 仕組み                                                                                                                                                            | 実現性                    | 工数                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| (a) Constructable Stylesheets     | `new CSSStyleSheet()` + `document.adoptedStyleSheets` で programmatic stylesheet を attach。CSP3 で programmatic stylesheet は `style-src` 対象外と仕様上扱われる | 高 (要 Chromium 動作確認) | ResultTable 1 hook の API 切替、UX 維持                                      |
| (b) CSS class swap                | 連続値 width を有限 bucket (例: `.col-width-XX`) に discretize、pre-defined static CSS で実現                                                                     | 確実 (CSP 仕様非依存)     | ResultTable + 利用 hook の refactor、UX 影響 (微細な列幅調整不可)            |
| (c) `'unsafe-hashes'` + hash 列挙 | 各 setProperty が生成する style attribute 値の hash を CSP に列挙                                                                                                 | **不可**                  | 連続値で hash 空間無限                                                       |
| (d) per-request nonce             | 各リクエストに nonce を発行し setProperty 直後に matching nonce を style attribute へ付与                                                                         | 不可                      | Astro 静的 build / Cloudflare Pages では request 単位の nonce を発行できない |

### 決定

- **(a) Constructable Stylesheets を最有力候補として PR 9 で技術検証 + refactor**。Chromium で `setProperty` 経由 violation が `adoptedStyleSheets` 経路で解消することを実機確認後に確定。
- 不適なら (b) CSS class swap に fallback (確実だが UX 影響を許容)。
- B 案最終 flip (`_headers` + `<meta>` 両側 strict 化 + `stripMetaStyleSrc` 撤去 + test 群 strict 化) は **PR 10 (新規)** に延期。

### 本 PR (PR 8 scope 縮小) で達成

- Gs1Databar SVG `<text>` の inline style を `fill="currentColor"` + 親 `.gs1-svg-container` の `color: var(--color-text)` 化 (将来の strict 化に向けた事前 refactor)
- `inline-style-migration.test.ts` に `.astro` glob を並列追加 (Astro 側回帰防止網の整備)
- 本 entry 記録

`_headers` / `<meta>` / `astro.config.mjs` / test 群の strict 化 commit は **本 PR から rebase で削除**。原実装 7 commit のうち 4 commit (Gs1Databar / Astro 検出網 / decisions [067] / SoT 同期) のみ残す。

### 残課題

- **PR 9 (新規)**: ResultTable `setProperty` の Constructable Stylesheets 化 (or CSS class swap)。`#234` 19 spec 横展開と並行検討の余地あり。
- **PR 10 (新規)**: B 案最終 flip。PR 8 から削除した 3 commit (CSP flip / `stripMetaStyleSrc` 撤去 / test 群 strict 化) を再投入。

### Lessons learned

- **CSSOM API ≠ CSP `style-src` 対象外**: 「`setProperty` は CSP 観点で別経路」という PR 1.5 設計時の前提は誤り。CSP3 spec を熟読しなかったツケ。
- **migration test の検出 regex は実 violation を保証しない**: `inline-style-migration.test.ts` で `setProperty` を意図的に除外していたが、CSP の実評価とは独立して評価される (regex は文字列マッチ、CSP は DOM 状態)。陽性対照テストの境界条件として E2E `applyProductionCsp` gate を 1.5 段階で導入していれば早期検知できた。
- **「前提崩壊」は overstating**: 当初「B 案不可能」と過剰評価したが、refactor で達成可能。ブロッカー検出時は解決策の現実性を冷静に列挙する習慣が必要。

### PR 9 outcome (2026-05-08)

**採用**: (a) Constructable Stylesheets。Phase 0 minimal repro spec (`tests/e2e/csp-constructable-stylesheet.spec.ts`、永続) で Chromium 実機検証 (陽性対照: インライン `<style>` 要素は violation 起こす / 陰性対照: `new CSSStyleSheet()` + `document.adoptedStyleSheets` は violation 起こさず適用される / CSS 変数注入経由でも問題なし) を pass、refactor 確定。

**scope 拡張**: 当初 issue [#304] / 本 entry は ResultTable のみ言及だったが、PR 9 spec 起草時の調査で `config-converter` violation 1 件の真因が `ToggleGroup.tsx` の `setProperty('--toggle-cols', N)` (12 ツールで使用) と判明。PR 9 で **ResultTable + ToggleGroup を一括 refactor**。

**実装**:

- 共通 hook `src/hooks/useDynamicStyleSheet.ts` (SSR-safe / `useId` ベース) に Constructable Stylesheets 経路を集約
- `src/utils/css-length.ts` の `assertCssLength` で `replaceSync` 経由 CSS injection を防御 (defense in depth)
- `tests/e2e/helpers.ts` に `applyStrictStyleSrcCsp` を追加 — `PRODUCTION_CSP` から `style-src 'unsafe-inline'` を `replace` で除いた派生定数 + module load 時の sanity guard で drift を CI 検知
- `tests/e2e/csp-constructable-stylesheet.spec.ts` を永続 regression 検出網として残す (Chromium 動作変更 / CSP 仕様改訂への早期検知)
- `inline-style-migration.test.ts` の `setProperty` 除外を撤去し陽性 guard に反転
- `vitest.config.ts` に `setupFiles: ['./src/test-setup.ts']` を追加 — jsdom polyfill (CSSStyleSheet.replaceSync / document.adoptedStyleSheets) を ToggleGroup / ResultTable をテストする全 jsdom test に共通適用

**Phase 2 検証で発覚した PR 10 への申し送り事項**:

PR 9 の Phase 2 (13 ツール spec を strict CSP local run) で **Astro 島ランタイムが injection する固定 inline `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>`** (sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=) が headers 側 strict CSP の `style-src 'self'` で block される現象を確認。PR 9 の React refactor 自体は無問題 (Phase 0 spec が `/` で pass、`useDynamicStyleSheet` 経路は violation 起こさず) で、本件は [064] / `stripMetaStyleSrc` 構造由来の **PR 10 責務範囲**:

- PR 10 で `_headers` strict 化と同時に Astro island runtime の inline style hash を `style-src` directive に取り込む経路設計が必要
- 案: `astro.config.mjs` の `security.csp` integration を活用 + `stripMetaStyleSrc` 撤去で `<meta>` 側に hash が付与されるため、headers 側にも同 hash を反映するメカニズムを設計 (Astro 公式 build hook で hash を抽出して `_headers` を生成 / または handcoded hash を Astro 側 fingerprint 安定運用)
- PR 9 完了判定は「React 経由 setProperty 0 件 + Phase 0 spec PASS + 全既存 e2e (`withProductionCsp` 通常 run) PASS」に縮小、Phase 2 strict CSP 検証は PR 10 に統合

### Follow-up decisions (PR 10 着手前、2026-05-08)

PR 9 merge 後の review で 2 件の follow-up issue が起票され、PR 10 着手前に方針を確定した。

#### #309 ResultTable FOUC → option A (現状容認)

**現象**: `useDynamicStyleSheet` は `useEffect` 内で `adoptedStyleSheets` に attach するため、SSR HTML → hydration 1 frame だけ dynamic style 未適用 (`min-width` / `width` が auto)。

**評価した解**:

| 案  | 仕組み                                   | 採否                                       |
| --- | ---------------------------------------- | ------------------------------------------ |
| A   | 現状容認 + JSDoc 明記                    | ✅ **採用**                                |
| B   | `global.css` に「型代表値」fallback 復元 | 不採用 (callsite 固有値で代表値原理的不在) |
| C   | SSR `style="..."` 属性経路 (Astro hash)  | 不採用 (CSP3 strict 化と非互換)            |

**A 採用根拠**:

- callsite 2 箇所 (`UuidV7Generator` minWidth=42rem / `UlidGenerator` minWidth=36rem) すべて hard-coded literal、props 動的変化なし → FOUC は「初回画面の 1 frame」限定
- `ToggleGroup` `var(--toggle-cols, 2)` の dimensionless 整数 fallback とは異なり、`ResultTable` の `min-width` / `width` は callsite 固有値で 1 つの代表値が原理的に存在しない (option B が常に乖離)
- PR 10 VRT は `toHaveScreenshot` が networkidle + hydration 後撮影 → FOUC frame は捕捉しない (想定、PR 10 で実測予定)

**対応**: `useDynamicStyleSheet.ts` JSDoc に FOUC expected behavior 明記 (本 PR で実装)、issue `#309` を close。

#### #308 useDynamicStyleSheet sheet 再利用最適化 → (ii) 実装見送り

**現状**: rules 変更ごとに `new CSSStyleSheet()` 生成、cleanup で `adoptedStyleSheets` を filter 走査して取り外す。

**API 設計意図との乖離**: Constructable Stylesheets API は本来 sheet を retain して `replaceSync(newRules)` で in-place 更新できる設計。`useRef<CSSStyleSheet>` で sheet 保持 → 初回のみ attach、以降 `replaceSync` のみで更新の最適化が可能。

**評価**:

| 案                                 | 採否                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| (i) 今 PR で `useRef` 化実装       | 不採用 (rules 変化頻度ゼロで実害なし、YAGNI)                                      |
| (ii) decision メモのみ、実装見送り | ✅ **採用**                                                                       |
| (iii) close as won't-fix           | 不採用 (将来 dynamic rules 利用時に再起票より open 維持の方が context 保全に優位) |

**(ii) 採用根拠**:

- 現 callsite (`ResultTable` / `ToggleGroup`) は rules 変化頻度ほぼゼロ (props で columns / minWidth が変わるユースケースなし) → 最適化 ROI 低い
- API 非整合は事実だが、将来 dynamic な rules 利用が出た時に再評価で十分

**再評価条件**: `useDynamicStyleSheet` callsite で props に応じて rules が頻繁に変化するユースケースが追加された時 / `adoptedStyleSheets` 配列が観測可能なほど肥大化した時。

**対応**: 本 entry に decision 記録、issue `#308` は **open のまま** (future enhancement として残置)、本 PR では実装変更なし。

### Update (2026-05-19) — PR #450 で `.gs1-svg-container` 撤回

本 ADR の「本 PR (PR 8 scope 縮小) で達成」項目に記載した「Gs1Databar SVG `<text>` の inline style を `fill="currentColor"` + 親 `.gs1-svg-container` の `color: var(--color-text)` 化」は、**PR #450 で撤回** した。

**撤回理由**: `<text>` injection 自体 (`injectCompositeText` 関数) が、composite component (CC-A/CC-B) 上端 GS1 quiet zone (1X) にテキストのディセンダーを侵入させ、scanner が decode 不能になることが実機 Dynamsoft Barcode Reader 検証で発覚 (詳細 `docs/agent-lessons.md` 2026-05-19 entry)。`textRowH` を 3X (= 9px) に広げる代替案も decode 不能で撤回し、`injectCompositeText` 関数本体と参照 className / CSS rule (`.gs1-svg-container`) をまとめて削除。

**CSP strict 化への影響**: bwip-js v4.9.0 の `toSVG` 出力は `fill="#000000"` / `stroke="#000000"` 固定で `currentColor` 参照を含まず、inline `style=""` も 0 件のため `style-src` 強化 ([068] 完了済み) に対する追加リスクなし。currentColor 化 refactor の意図 (将来 dark mode 等) は別途検討余地あり (本 ADR scope 外、新 issue で扱う可能性)。

### 関連 PR / issue

- 本 entry を記録: PR 8 (scope 縮小、merge `e2efd24`)、PR 9 outcome 追補
- 後続: PR 10 (B 案最終 flip + Astro island runtime style hash 取り込み)
- 過去: [064] (CSP A-1 / script-src strict 化)
- 起源: `#176` B 案 PR 1.5 (#261) で導入された `setProperty` パターン

## [068] 2026-05-09 — `#176` B 案完了 (両層 `style-src` strict 化 + Astro island hash 取り込み)

### 背景

`#176` B 案 = `style-src 'unsafe-inline'` 削減 (A-1 [#249] 完了後の続編、`docs/decisions.md` [064] 参照)。

`<meta>` strict + `_headers` permissive の AND 評価設計 ([064]) では、header 側に `'unsafe-inline'` を残しているため `<meta>` 自動 hash が壊れた状況 (Astro `security.csp` integration の bug / 設定ミス / build hook 失敗 / Astro 仕様変更) で fallback policy が permissive になる潜在リスクがあった。両層を strict (`'self'` + 必要 hash のみ) に揃えることで XSS 緩和の defense-in-depth を完成させる goal。

PR 0〜10 series で段階的に React / Astro inline style と CSSOM mutation を全廃し、最終 PR 10 で両層 flip + Astro island runtime hash 取り込みを実施。

### B 案 PR 0〜10 series 依存図

```
PR 0   (#254)  VRT 導入 (mock 注入版、CI Linux baseline、required check 外し)
PR 1   (#256)  基礎工事 + ui/* simple 11 ファイル (ClearButton CSSOM 撤去含む)
PR 1.5 (#261)  ui/* complex (ResultTable + InputField, API redesign)
PR 2   (#272)  qr-ticket/* + #225 同梱
PR 3   (#275)  JwtDecoder + UuidV7Generator + #262 partial
PR 4   (#277)  Gs1Databar + EncodingConverter + DummyText
PR 5a  (#283)  ConfigConverter + QrReader + JanCode (CSSOM hover 含む)
PR 5b  (#286)  残 7 ツール + zero-style 登録 + ulid-generator E2E gate / #262 close
PR 6   (#290)  styles.ts 削除 + migration tracker glob 化
PR 7a  (#294)  layout/ui Astro inline 23 件
PR 7b  (#299)  pages Astro inline 42 件
PR 8   (#303)  scope 縮小 (setProperty CSP3 制約発覚で延期、[067])
PR 9   (#307)  ResultTable + ToggleGroup setProperty を Constructable Stylesheets 化
PR 9 follow-up (#313)  #309 / #308 decision メモ化
PR 10  (本 PR) 両層 strict 化 + Astro island hash 取り込み
```

### 本 PR (PR 10) で達成

- `public/_headers` / `src/utils/csp.ts`: `style-src 'unsafe-inline'` を削除し `style-src 'self' 'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='` に flip
- `astro.config.mjs`: `stripMetaStyleSrc()` 暫定 integration ([064] 由来) を完全撤去
- `<meta>` 側 CSP は Astro `security.csp` で hash 付き strict 形式に自動切替
- test 群 strict 化 (`headers.test.ts` / `meta-csp.test.ts` / `astro-config-csp.test.ts`)
- Astro island hash 検出網追加 (dist HTML literal + `_headers` hash 整合性 + 陽性対照メタテスト)

### Astro island hash 取り込みの設計選定

PR 9 Phase 2 で発覚した、Astro 島ランタイムが React island を含むページに injection する固定 inline style `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` の sha256 hash `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` を `_headers` の `style-src` に取り込む必要があった。

**評価した解**:

| 案  | 仕組み                                  | 採否                                    |
| --- | --------------------------------------- | --------------------------------------- |
| α   | handcoded fingerprint + 検出網          | ✅ **採用**                             |
| β   | `astro:build:done` hook で自動抽出      | 不採用 (overkill: hash は 1 個固定)     |
| γ   | `_headers` permissive 維持、meta strict | 不採用 (B 案 goal「両層 strict」と矛盾) |

**α 採用根拠**:

- 取り込む hash は 1 個 (Astro が当該文字列を変更しない限り stable)
- β の 80-150 行 hook 実装は 1 hash の自動抽出に対して overweight
- γ は `<meta>` が壊れた状況で `_headers` permissive のみが効くため XSS 緩和の最終防衛ラインが緩い → goal「両層 strict」と部分矛盾
- α の運用コスト「Astro 更新で hash 変わると CI fail」は検出網で能動検知できるため silent regression にならない

### 削除した暫定 infra

- `stripMetaStyleSrc()` integration ([064] / `astro.config.mjs`):
  CSP3 仕様で hash と `'unsafe-inline'` 共存時にブラウザが `'unsafe-inline'` を無視する制約により、`<meta>` から `style-src` を除く暫定。本 PR で両層 strict 化により不要化、撤去。
- `MIGRATED_FILES` array (`inline-style-migration.test.ts`):
  PR 6 で glob 化済 (`src/components/**/*.{tsx,astro}` 等)、本 PR では touch せず。
- `applyStrictStyleSrcCsp` helper (`tests/e2e/helpers.ts`):
  PR 9 で `applyProductionCsp` から派生として追加。本 PR で `applyProductionCsp` 自体が strict になるため不要化。**削除は別 cleanup PR** に切り出す候補 (memory `feedback_infra_feature_separation.md` 準拠)。

### 設計判断 KEEP 記録

PR 6 必須チェックリスト末尾の未消化項目を本 entry で「現状維持」と確定:

- **`.text-primary` 命名衝突リスク**: PR 2 で導入した `.text-primary` (`--color-primary` 由来) は Tailwind `text-primary` auto-utility と衝突する可能性があるが、現状 `@theme` に `--color-primary` を登録していないため衝突は発生していない。**現状維持**: 将来 `@theme` 切替する場合は `text-brand` 等への rename を検討。→ **[073] で再評価済**: その後 `--color-primary` は `@theme` 登録済となり、auto-utility と完全同名・同挙動の重複となったため、本 entry の「現状維持」を更新し `.text-primary` 手動定義を削除して auto-utility に統一した。
- **Tailwind `border` utility と `@layer components` の `border-color` 優先度**: PR 2 で導入した `.alert-success` / `.alert-error` は `<div className="rounded-lg p-4 border alert-success">` のように Tailwind `border` と併用。layer 順序によっては期待色にならないリスクが PR 2 review で指摘済だが、CSP strict 化後の VRT 再撮影でも diff が出ていないため実害は未顕在。**現状維持**: 将来 Tailwind v4 layer 仕様変更で問題が顕在化したら再評価。

### 検出網運用ノート

B 案完了後も継続運用する検出網:

- `inline-style-migration.test.ts` (glob、PR 6 で導入): `src/components/**/*.{tsx,astro}` 等で `style={{` / `style="..."` の string match が出現した場合に fail。新規ファイル追加時の自動検出網。
- `applyProductionCsp(page)` E2E gate (`tests/e2e/helpers.ts`、PR 3 / PR 5b で確立): 本番相当 CSP を dev server に注入して E2E 走行、CSP violation 発生で fail。19 spec のうち重要経路で適用。
- `csp-constructable-stylesheet.spec.ts` (PR 9 で導入、永続): Phase 0 minimal repro spec。Chromium で `useDynamicStyleSheet` 経路の strict CSP 互換を陽性 / 陰性対照で検証。Chromium 動作変更 / CSP 仕様改訂への早期検知用。
- 本 PR (PR 10) の Astro island hash 検出網 (`meta-csp.test.ts` / `headers.test.ts` 拡張):
  - dist HTML 内に Astro inline style literal が含まれること (React island ありページに `distPages.some()` で検出)
  - `_headers` の `style-src` に対応 hash が含まれること
  - dist HTML inline style content から計算した sha256 が `_headers` の hash と一致すること (陽性対照メタテスト)

### 関連 PR / issue

- 本 entry を記録: PR 10 (本 PR、`#305` 対応)
- B 案 series 全 PR: PR 0 (#254) / PR 1 (#256) / PR 1.5 (#261) / PR 2 (#272) / PR 3 (#275) / PR 4 (#277) / PR 5a (#283) / PR 5b (#286) / PR 6 (#290) / PR 7a (#294) / PR 7b (#299) / PR 8 (#303) / PR 9 (#307) / PR 9 follow-up (#313) / PR 10 (本 PR)
- 過去: [054] (CSP 採用根拠) / [064] (CSP A-1 / script-src strict 化) / [067] (PR 8 setProperty CSP3 制約 + PR 9 outcome + Follow-up decisions)
- close: `#176` (本 entry で完了確認) / `#305` (PR 10 issue)

### Lessons learned

- **CSP3 仕様の事前確認**: PR 1.5 で `setProperty('--var', value)` パターンを導入した時、「CSSOM API は CSP 観点で `style="..."` HTML 属性とは別経路」という前提で設計したが、これは誤りだった (`[067]` で発覚)。CSP3 仕様 (`https://www.w3.org/TR/CSP3/#directive-style-src`) では `setProperty` 経由の DOM mutation も `style-src` 対象と明記されている。**教訓**: 新規 CSP 関連パターン導入時は仕様を熟読し、E2E `applyProductionCsp` gate を 1.5 段階で導入していれば早期検知できた。
- **Astro island runtime の暗黙 inline style**: PR 9 Phase 2 で発覚。Astro 自身が injection する inline style は `<meta>` 側 hash には自動取り込みされるが `_headers` 側には自動反映されない。**教訓**: build 出力の HTML 全体を grep して全 inline style 経路を網羅するチェックを strict 化前に実施。
- **ガード/バリデータには陽性対照を必須とする**: PR 5b の `withProductionCsp` meta-test (#281) や本 PR の Astro hash 検出網メタテストのように、検出網自体が silent pass しないことを陽性対照で能動確認する運用が定着。memory `feedback_positive_control_for_gates.md`。
- **段階的 PR の本数管理**: B 案は当初 PR 1〜6 想定だったが、実際は PR 0〜10 + follow-up で計 15 PR (含む scope 縮小 PR / 計画外発覚での分割)。「PR の自然分割は infra / foundation / 個別 migration / docs」の方針 (memory `feedback_pr_size.md`) に従ったため、各 PR は review 単位で適切な大きさを維持できた。
- **subagent 委譲方針の使い分け**: PR 4 / 5a / 5b で「subagent 非 commit + 親で順次 commit」運用を確立、PR 7a / 7b / 8 / 9 / 10 では「親 Opus 直接実装」へ移行 (CSP flip / 高 stakes 検証は subagent verification trust の観点で親直接が安全)。memory `feedback_subagent_verification_trust.md` / `feedback_subagent_model.md`。

## [069] 2026-05-09 — VRT baseline 更新経路の audit + secret 焼き付き防御 2 層導入 (`#255`)

### 背景

`#254` (VRT 専用 PR 導入) のセルフレビューで提起された 2 件 (I-1: bot push の branch protection bypass 可能性、I-2: baseline PNG への secret 焼き付き leak リスク) を `#255` として fix。

### 決定

**I-1: branch protection 監査 — solo dev 体制での適用不可を確認**

- `gh api repos/<owner>/<repo>/branches/develop/protection` は 2026-05-09 時点で **404 "Branch not protected"** を返した。develop は **branch protection 未設定**。
- ただし solo dev 体制（PR 作成者 = レビュアー = merger が同一人物）では `Require approvals` を有効化すると **self-approve 不可で自分の PR が永久 merge 不能になり詰む**（GitHub policy）。`Require pull request before merging` 単体では「他人による review」を強制せず、`Restrict who can push` も PR 経由の self-merge を block しない。**branch protection 単体で「review なしマージを block する」効果は solo dev では得られない**。
- bot push (`update-visual-baseline.yml` の最終 step) は `actions/checkout@v6` の `ref: ${{ github.head_ref || github.ref_name }}` により PR の feature branch に push されるため、bot の baseline 変更は **既存 PR の diff の一部** として review pipeline に乗る（develop へ直 push していない）。`if: github.ref != 'refs/heads/develop' && !main` で default branch 上の `workflow_dispatch` 誤 trigger は no-op の二次 safety も既存。
- → I-1 の **issue 当初想定（bypass list 経由の許可漏れ）は team 体制前提の概念**で solo dev には直接適用できないと結論。短期対策（protection 追加）も中期対策（peter-evans/create-pull-request 化）も solo dev では実効薄。本 PR は audit 結果と適用不可の理由を `docs/playbooks/e2e-validation.md` 7.5 に文書化し、actionable な対策は「VRT PR comment が出た PR は merge 前に diff 目視」運用の継続（既存 7.2 章）に集約する。

**I-2: baseline PNG への secret 混入予防 (本 PR で 2 層実装)**

1. **spec 層 (`tests/e2e/visual-regression.spec.ts`)**: `addInitScript` 冒頭で `localStorage.clear()` / `sessionStorage.clear()` を実行。将来 spec に `setItem('apiKey', ...)` 等が誤って追加されても、init script で直前に clear することで永続化前の baseline 撮影を保証。
2. **workflow 層 (`.github/workflows/update-visual-baseline.yml`)**: build 前に `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD` / `*_CREDENTIAL` 命名の env var が baseline 生成 step に流れていないか early-fail check。allow list は `GITHUB_TOKEN` / `RUNNER_*` / `GITHUB_RUN_*` / `ACTIONS_*` / `GH_*` / `PIP_*` / `PYPI_*` (GH Actions runtime 由来)。

### Lessons learned

- **Audit 前提が事実と異なるケース**: issue は「bypass list の許可漏れ」を懸念したが、実態は protection 未設定 + solo dev で `Require approvals` 適用不可の二重ズレだった。`gh api` 経由の事実確認 + 体制（solo / team）の文脈確認 が無いと存在しない監査対象や適用不可な対策を議論し続ける危険。**教訓**: ops 系 issue は最初に `gh api` / `gh pr/issue view` で前提事実を読み取り、team / solo の体制差分も明示してから設計する。
- **PNG への secret 焼き付きは text scan の盲点**: gitleaks / git-secrets は textual content を scan するため、image 内 OCR レベルの leak は検出できない。**教訓**: 画像生成系 workflow は spec 側 (storage clear) と workflow 側 (env audit) の 2 層防御が原則。
- **Allow list の例外管理**: `GITHUB_TOKEN` 等の GH Actions runtime 由来 env を allow に入れる際は、push 用途で必要であることを明示。allow list が肥大化したら audit 範囲が崩れるため PR review で都度評価。

### 関連 PR / issue

- 本 entry を記録: PR `#333` (`#255` 対応)
- 起源: `#254` (VRT 専用 PR 導入) のセルフレビュー I-1 / I-2
- 親 issue: `#255` (本 PR で短期 + 防御 2 層完了、長期の peter-evans 化は別議論)
- 関連: `#176` B 案 [066] (VRT 導入)、本番リリース前 TODO `#323`

---

## [070] 2026-05-09 — char-count: `Intl.Segmenter` をフォールバックなしで採用

日付 2026-05-09 | ステータス: 採用 | issue #345

### 背景

文字カウントツールで書記素クラスタ (grapheme cluster) を正確に数えるライブラリを選定。

### 決断

`Intl.Segmenter` (ブラウザネイティブ API) をフォールバックなしで採用。
`SPEC.md` §2.2「最新 2 版」サポートポリシーのもと Chromium 87+ / Firefox 125+ / Safari 16.4+ が対象であり、
対象ブラウザ全てが `Intl.Segmenter` を実装している。

### 却下した選択肢

- `graphemer` / `@formatjs/intl-segmenter-polyfill`: 追加 npm 依存が発生し、既にネイティブ実装があるブラウザで不要なバンドルサイズ増加を招く。

### 結果・トレードオフ

モジュールスコープで 1 インスタンスを生成して使い回す (`const seg = new Intl.Segmenter('ja', ...)`）ことで生成コストを回避。

---

## [071] 2026-05-09 — char-count: `encoding-japanese` round-trip 方式でエンコーディング互換性を判定

日付 2026-05-09 | ステータス: 採用 | issue #345

### 背景

Shift_JIS / EUC-JP で表現不能な文字を正確に検出する方法の選定。

### 決断

`encoding-japanese` (既存依存) を用いた round-trip 判定を採用:

1. 文字列全体を目標エンコーディングへ変換
2. 逆変換して元文字列と照合
3. 不一致なら 1 code point ずつ再判定して `failedCount` と breakdown を収集

入力は UTF-16 code unit 配列 (`Array.from({length: s.length}, (_, i) => s.charCodeAt(i))`) とする。
`[...s]` (code point iteration) は surrogate pair を分解するため不適。

### 却下した選択肢

- Unicode ブロック範囲による静的判定: Shift_JIS の対応範囲が CP932 拡張を含み正確な境界をハードコードしにくい。

### 結果・トレードオフ

追加 npm 依存ゼロ。1MB 超のテキストでは `String.fromCharCode` の stack overflow を回避するため CHUNK=8192 の分割処理が必要。

---

## [072] 2026-05-09 — char-count: 非対応エンコーディングの ? 置換 byte 数を表示しない

日付 2026-05-09 | ステータス: 採用 | issue #345

### 背景

非対応エンコーディングに変換した際、`encoding-japanese` は変換不能文字を `?` (0x3F) に置換する。
この置換後の byte 数を表示することは DB 保存時のサイズ・挙動と一致しないため誤誘導になる。

### 決断

`EncodingCompat.bytes` は `ok=false` のとき `null` とし、UI 側では byte 数を表示しない。
代わりに `failedCount` (不可文字数) と `breakdown` (絵文字/VS/ZWJ/CJK拡張B+/その他の内訳) を表示する。

### 背景にある事故

このツールを作りたいと思ったきっかけ: 絵文字を「1 文字」としてカウントした結果、
MySQL utf8mb3 カラムへの INSERT が SMP 文字 (U+10000 以上) で失敗するエラーを踏んだ。
? 置換後の byte 数を出すと「問題なく保存できる」と誤解させる。

### 結果・トレードオフ

ユーザーは「なぜ ❌ か」を不可文字数・内訳で把握できる。byte 数は互換時のみ意味のある情報として提示。

---

## [073] 2026-05-10 — `#176` B 案完了後の semantic alias 整理 (`@theme` auto-utility 重複削減 + `.drawer-backdrop` `color-mix()` 化)

### 状況

`#176` B 案完了 ([068]) 後、PR 1〜5b / 7a で `@layer components` に追加した「色 token text utility」series が Tailwind v4 の `@theme` auto-utility と一部重複していることが判明 (#295 で観察)。

| `@layer components` 手動 class | `@theme` 登録 var                 | Tailwind auto-utility (重複) |
| ------------------------------ | --------------------------------- | ---------------------------- |
| `.text-primary`                | `--color-primary`                 | `text-primary`               |
| `.text-tertiary`               | `--color-tertiary`                | `text-tertiary`              |
| `.text-icon`                   | `--color-neutral-700` (primitive) | `text-neutral-700`           |

加えて `.drawer-backdrop` は `rgba(17,24,39,0.5)` を hardcode しており、`--color-neutral-900` の 50% alpha と同値だが token 値変更に追従しない。

### 判断

**(a) `.text-primary` / `.text-tertiary` を削除**: semantic token 経由のため auto-utility と完全同名・同挙動。callsite 変更ゼロで重複定義のみ排除できる。

**(b) `.text-icon` は維持**: `--color-neutral-700` は primitive scale。auto-utility (`text-neutral-700`) 直書きは「なぜ 700? 600 じゃダメ?」が読み取れず保守性が下がる。意味クラスで隠蔽することで、将来 hover/focus/disabled 状態追加時に `.text-icon:hover { ... }` で集約定義できる余地も残す (7.1 章の variant 非対応問題により、`@layer components` 手動 class の方が擬似クラス追加で柔軟)。

**(c) `.drawer-backdrop` を `color-mix()` 化**: `color-mix(in srgb, var(--color-neutral-900) 50%, transparent)` で token 値変更に自動追従。ブラウザ対応 (Chrome 111+ / Firefox 113+ / Safari 16.2+) は十分。

**(d) 「Tailwind カラークラス禁止」rule の精緻化** (`.agents/rules/common.md` 7 章): semantic token (`text-primary` 等) は意味的命名のため auto-utility 使用可、primitive scale (`text-blue-500` / `text-neutral-700` 等) は引き続き禁止。境界基準は「token 名から用途が読み取れる (semantic) か、palette 段階値に過ぎない (primitive) か」。

### 残課題 / 副次効果

- `.text-error` / `.text-success` も `@theme` 登録 token 経由のため理論上は同様に削除可能だが、callsite 影響が広く、本 PR では `.text-primary` / `.text-tertiary` のみに留める (issue #295 のスコープ外、必要に応じて別 issue で追加判断)。
- 他の rgba 直書きは `--elevation-*` の黒シャドウのみで、`var(--color-X)` の alpha 違いではないため `color-mix()` 化対象外。

### 関連

- 解消する issue: [#295](https://github.com/fumtas1k/devtools/issues/295)
- 上位 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) (B 案完了は [068])
- rule 更新: `.agents/rules/common.md` 7 章

---

## [074] 2026-05-10 — VRT slider レポートの baseline 解決を `-expected.png` 直参照に変更

日付 2026-05-10 | ステータス: 採用 | issue #362

### 背景

`scripts/generate-vrt-slider.mjs` が VRT 失敗時に「baseline が見つかりません」を出して slider レポートを生成しないバグ (issue #362)。PR #361 で `/tools/char-count` に行追加した時に初の visual diff が発生して顕在化した。

### 根本原因

Playwright 1.59 の `windowsFilesystemFriendlyLength = 60` (`node_modules/playwright/lib/util.js:208-217` の `trimLongString`) により attachment 側ファイル名が 60 文字 + 中央 SHA1 5 桁で truncate される。一方 baseline (`tests/e2e/visual-regression.spec.ts-snapshots/`) は non-truncated の長いファイル名。スクリプトは両者を同名前提で照合していたため全ページで lookup 失敗。

### 採用案: `-expected.png` 直参照 (C 案系統 ハイブリッド)

`node_modules/playwright/lib/matchers/toMatchSnapshot.js:67,149` で `legacyExpectedPath = addSuffixToFilePath(outputBasePath, "-expected")` が定義され、diff 検出時に `writeFileSync(this.legacyExpectedPath, expected)` が同期実行される。`-actual.png` の隣に同じ truncated base 名で `-expected.png` が物理コピーされるため、baseline 名復元は不要。

ラベル整形だけ `error-context.md` の `- Name:` 行 (`node_modules/playwright/lib/errorContext.js:44-90` の literal template) から best-effort で full title を復元。format 不一致時は raw fallback で slider 機能は止めない。

### 不採用案: error-context.md parse + baseline 名復元 (issue #362 推奨の F 案)

`error-context.md` の MD format と baseline naming テンプレート両方への format 依存があり脆弱。Playwright が既に物理コピーを置いているのに使わないのは冗長。

### failure mode

- `handleMissing` 経路 (baseline 不在で `--update-snapshots` 走った時) は `-expected.png` が出ないが、その経路では slider 比較が成立しないため `expected が見つかりません` で skip (正しい挙動)
- `error-context.md` format ドリフト → `makeLabelFromContextContent` が null 返却 → 既存 `makeLabel` で raw 表示 (slider 本体は影響なし)

### 関連

- issue #362, PR #361 (再現 PR、既に merge 済み)
- meta test: `tests/meta/vrt-slider-report.test.ts`
- 教訓: `docs/agent-lessons.md`

---

## [075] 2026-05-10 — char-count: X (旧 Twitter) 文字数を twitter-text 公式仕様に準拠

日付 2026-05-10 | ステータス: 採用 | issue #376

### 背景

既存 `twitterWeight()` は `cp <= 0x10FF ? 1 : 2` のみで、URL 短縮 (t.co = 23 weighted chars) / 補助 weight ranges / 前後空白 trim を未対応だった。「概算」ラベルで誤差を黙認していたが、URL を含む典型的な X 投稿で実際の文字数と乖離が大きく、ユーザー目線で実用性が低かった。

### 決断

twitter-text 公式 conformance 仕様 v3 (`maxWeightedTweetLength: 280`, `defaultWeight: 200`, `transformedURLLength: 23`) に準拠する。具体的には:

1. **trim**: 入力前後の空白 (半角・全角) を `String.prototype.trim()` で除去
2. **URL 検出 + 23 weighted 換算**: `/https?:\/\/[^\s<>"]+/gi` でマッチした URL を 23 weight の placeholder に置換 (末尾の `.,!?;:'")\]}` は URL から除外しテキスト側に戻す)
3. **weight-1 範囲**: U+0000–U+10FF / U+2000–U+200D / U+2010–U+201F / U+2032–U+2037 を weight 1、それ以外を weight 2

「概算」ラベルは UI から削除。実装後の精度は ~99% (URL regex 簡易性のみが残差)。

### 不採用案: `twitter-text` npm パッケージの採択

trade-off:

- ✅ pros: IDN / cashtag / mention 等の周辺仕様を含む完全互換、メンテナンスは Twitter 側
- ❌ cons: bundle 増 (1MB 超の正規表現テーブル含む)、依存追加の保守コスト、本ツールはブラウザ完結型で軽量重視

→ devtools プロジェクトは「依存最小化 + 軽量」が core value のため自前 regex 採用。完全互換が必要になった時点で別 issue で再検討。

### 不採用案: 「概算」ラベル維持 + 簡易ロジックのまま

trade-off:

- ✅ pros: 工数ゼロ
- ❌ cons: URL を含む投稿で実用性が低く、ツール価値が大きく毀損

→ 改修コストが小さく (helper 関数 + 正規表現 + テスト 23 件)、ユーザー価値が大きいため改修採用。

### 結果・トレードオフ

- 一致率 ~95% (typical http(s) URL はカバー、t.co の正規化や IDN ドメインは非対応)
- バンドルサイズ増 ~0 KB (依存追加なし、関数 30 行程度)
- twitter-text の `extractUrls()` 完全互換が必要になった場合は別 issue で再検討

### 既知制約

- **括弧で閉じる URL** (`https://en.wikipedia.org/wiki/Foo_(bar)` 等): `TRAILING_PUNCT = /[.,!?;:'")\]}]+$/` が末尾 `)` を URL から除外するため、URL 内最後の `(...)` の閉じ括弧がテキスト側に戻る。Wikipedia 系 URL で発生し得るが X 投稿の頻度は低く、自前 regex 維持の trade-off として許容。完全対応する場合は URL 内の `(` / `)` 数のバランス判定を入れるか、`twitter-text` lib 採択を検討する (issue #378)。

### 関連

- issue #376, follow-up #378
- 設計書: `docs/superpowers/specs/2026-05-10-char-count-sns-redesign-design.md`
- 実装計画: `docs/superpowers/plans/2026-05-10-char-count-sns-redesign.md`
- twitter-text v3 conformance 仕様 (`twitter-text-config.json`)

---

## [076] 2026-05-11 — OutputField の aria-live を常時 polite + textarea wrap に統一

**日付 2026-05-11 | ステータス: 採用 | issue #382, PR #402**

### 背景

issue #382 で `OutputField` の a11y 欠落を改修。初期実装 (PR #402 初版) は issue 提案通り最外殻 `<div>` に `role="status"` + `aria-live={hasValue ? 'polite' : 'off'}` の動的切替を採用した。PR レビューで以下 2 件の中優先度指摘を受領:

1. `role="status"` のスコープが label + CopyButton + textarea の全体に及び、status region として広すぎる
2. `off → polite` の同一レンダー切替は SR が announce を取りこぼす known anti-pattern（Safari/VoiceOver、JAWS での事例あり）

### 決断

- `aria-live` は **常時 `"polite"`** で固定（動的切替を廃止）
- `role="status"` は **textarea を wrap する内側 `<div>`** に限定（label/CopyButton を status region から除外）
- `aria-atomic="false"` を明示し、一部 SR が `role="status"` を atomic として扱う実装に備える
- 初期 mount 時の過剰通知は ARIA spec の「live region 初期 content は announce しない」挙動に依拠

### 却下した選択肢

- **条件 mount (JanCode パターン)**: `hasValue` が真のときのみ live region をマウントする案。textarea 要素の重複描画または条件 wrapper によるツリー再 mount でフォーカス喪失リスクがある
- **視覚隠し SR ミラー**: `<div class="sr-only" role="status">` に value を text node として複製する案。Base64 等の長い出力を全文読み上げる UX 課題と、2 つの真実の源が生じるメンテナンスコスト

### 結果・トレードオフ

- ✅ `off→polite` の同一レンダー race condition を排除
- ✅ `role="status"` のスコープが textarea のみで意味論的に明確
- ✅ `aria-atomic="false"` 明示で SR 間の atomic 扱い差異を吸収
- ⚠️ `readOnly textarea` の value 変更を live region 内でも通知しない SR（NVDA / VoiceOver の特定バージョン）が存在する—spec グレーゾーン。実機 SR 検証は issue #403 で追跡
- ⚠️ 複数 OutputField を同一ツール内で使う場合の多重 `role="status"` は YAGNI で preemptive 対応なし。該当ケースが発生したら `ariaLabel` prop を status wrapper に転記して識別可能にする

## [077] 2026-05-12 — Gs1Databar の id 生成を `useId` 化 + hydration mismatch 検知 meta infra (陰性+陽性対照) を追加

**日付 2026-05-12 | ステータス: 採用 | PR #408**

### 背景

`src/components/tools/Gs1Databar.tsx` で `useState(() => [{ id: crypto.randomUUID() }])` の lazy initializer が SSR と CSR で別の UUID を生成し、React の hydration mismatch (production の `Minified React error #418`) を引き起こしていた。

- 元 commit `4c21a58` (2026-04-12) で StrictMode 二重マウントと hot reload での ID 衝突回避のために導入されたが、Astro `client:load` 経由の SSR ↔ CSR 境界で UUID が割れる問題が考慮されていなかった
- 既存 e2e (`helpers.ts` の console listener) は CSP 違反のみを watch しており hydration warning は filter から漏れていた
- production build では React が silent recovery してメッセージが minify されるため目視でも気付きにくく、1 ヶ月以上潜在した
- 「修正したのに修正の確認ができない PR」を回避するため、本 PR で fix と検知 infra を同梱

### 決断

1. **fix**: `crypto.randomUUID()` を React 18 の `useId()` + monotonic counter (`${idPrefix}-card-${n}`) に置換。SSR/CSR で同一 ID を保証しつつ、StrictMode / hot reload での衝突回避意図 (`[4c21a58]`) も継承
2. **検知 listener**: `tests/e2e/helpers.ts` に `watchHydrationWarnings` を追加。CSP guard と独立、dev message + production minified ID 両対応の regex (具体パターン一覧は `helpers.ts` の `HYDRATION_WARNING_RE` を SoT として参照)
3. **陰性対照**: `tests/e2e/hydration-check.spec.ts` が `visual-regression-pages.ts` の全 `PAGES` を 1 context 内で巡回し warning 0 件を assert。新ツール追加時も自動カバー
4. **陽性対照** (test-gates skill 要件): `tests/e2e/hydration-check.gate.spec.ts` + `src/pages/test-fixtures/hydration-broken.astro` (SSR で `SERVER`・CSR で `CLIENT` を出す fixture) で listener の検知能力を保証。Playwright preview の production code path を実走させ、`console.log('[hydration-gate] captured: ...')` で CI artifact に hit message を残し将来の minified ID 変化を早期検知
5. **fixture の prod 除外**: `public/_redirects` の `/test-fixtures/* /404 404` で Cloudflare Pages 本番のみ 404 化。`public/robots.txt` の `Disallow: /test-fixtures/` で indexing も二重防御

### 却下した選択肢

- **Astro middleware で `import.meta.env.PROD` 分岐**: Playwright `webServer.env` に flag を渡す必要があり CI workflow 変更も波及する。`_redirects` 1 行で同じ目的を達成できるため不採用
- **`_` prefix で fixture を build 除外**: Astro convention の `_` 除外は preview build にも適用されるため Playwright e2e から到達不能になり陽性対照が機能しない
- **fixture を Playwright `page.route` で intercept**: React bundle 配信や CSP との両立で実装複雑度が上がる。fixture page を直接配信し本番だけ `_redirects` で消す方が簡単
- **per-page で `newContext` を立てる構造**: 当初 19 page を別 test として実行していたが、context 生成コストが CI 時間を圧迫するためレビュー指摘 (#4) で 1 test + 内部 loop に統合

### 結果・トレードオフ

- ✅ Gs1Databar の hydration mismatch を解消、CI で同種 regression を陰性+陽性対照で機械的に catch する infra が整った
- ✅ astro preview は `_redirects` を解釈しないため fixture page は e2e で従来通り到達可能、本番のみ攻撃面を消せる (middleware / CI workflow 変更を回避)
- ✅ 陽性対照が production code path (Astro `client:load` → React `hydrateRoot`) を実走するため、将来 React 19+ への upgrade で minified ID が変わった際は spec が即 fail に昇格 → regex 縮退を早期検知
- ⚠️ 陰性対照 spec を 1 test に統合した結果、Playwright reporter での粒度が page 単位 → spec 単位に低下。failure 時の page 特定は `expect(..., { message: path })` で明示
- ⚠️ Gs1Databar が `crypto.randomUUID` を呼ばなくなったため、VRT spec ([066]) の `crypto.randomUUID` mock 注入が dead code 化。cleanup は issue #412 で別途追跡
- ⚠️ `_redirects` の destination `/404` は `src/pages/404.astro` が未整備のため CF default 404 に解決される (status 404 は保証)。サイト全体の 404 UX 改善は issue #411 で別途追跡

## [078] 2026-05-13 — dev mode 経路の hydration check を併設し attribute mismatch も catch する 2 層検知 infra

**日付 2026-05-13 | ステータス: 採用 | issue #414, PR #415**

### 背景

[077] で導入した hydration mismatch 検知 meta spec は Playwright `webServer = preview` (= React production build) 経路で動作する。本番 Cloudflare Pages を実機検証して (https://devtools-d9w.pages.dev/tools/gs1-databar/) console error 0 件であることが確認できたが、その理由は **React 18 が attribute mismatch を production build で silent recovery する仕様** にある:

| mismatch 種別                                              | dev mode                                                                                                              | production build                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **attribute mismatch** (例: `<input id="...">` 属性値違い) | console.error (`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.`) | **silent recovery (warning / error 一切なし)**    |
| **text content / structure mismatch**                      | console.error                                                                                                         | pageerror で `Minified React error #418` を throw |

つまり [077] の meta spec は text/structure mismatch しか catch できず、今回 PR #408 で fix した Gs1Databar の `<input id>` attribute mismatch のような bug が **再度入っても production 経路では検知できない** 穴がある。

### 決断

1. **dev server 併走**: Astro `npm run dev` (React dev build) を port 4322 で並列起動し、`watchHydrationWarnings` の dev message regex (`A tree hydrated but some attributes...`) を経由で attribute mismatch を catch
2. **専用 Playwright project**: `hydration-dev` project (testMatch: `hydration-check-dev*.spec.ts`, baseURL override: localhost:4322) で dev 経路の spec を分離。既存 `e2e` project は testIgnore で dev mode spec を除外し相互独立
3. **port 分離**: preview 4321 / dev 4322 で衝突回避、`pretest:e2e:dev` で両 port を clean
4. **attribute mismatch 専用 fixture**: SSR で `data-rendered="server"` CSR で `data-rendered="client"` を出す `<div>` を `client:load` mount。`<input id>` ではなく `data-*` を使うことで「真に attribute mismatch only」の経路を経由し検知能力を純粋に保証する
5. **CI step は 2 step 分離**: `.github/workflows/test.yml` で `npm run test:e2e` (e2e project) と `npm run test:e2e:dev` (hydration-dev project) を別 step に分け、failure 時のレポート粒度を保つ

### 却下した選択肢

- **dev mode に統一して preview 経路を廃止**: text/structure mismatch 用の production code path 実走の保証が失われる ([077] の `Minified React error #418` 検知能力)。2 層検知を維持
- **既存 `hydration-check.spec.ts` を dev mode に切替**: production code path の検知能力が消える。spec を分離して両方を保持する方が安全
- **CI で 1 step に統合 (`playwright test --project=e2e --project=hydration-dev`)**: webServer 1 回起動で CI 時間 -15s だが、失敗 step の粒度が落ち e2e / hydration-dev の failure が混在する。failure granularity 優先で 2 step 分離を採用 (PR #415 レビュー指摘 #1)
- **per-project webServer**: Playwright は native でサポートしておらず `process.env.PLAYWRIGHT_PROJECT` 等で `playwright.config.ts` 側構築切替が必要。config 複雑化に対して得られる節約は小さく不採用

### 結果・トレードオフ

- ✅ Gs1Databar 型の attribute mismatch が再度入った場合に CI で機械的に catch される (test-gates checklist #2: 旧 `crypto.randomUUID()` 版で陰性対照が `gtin-input-<UUID_SERVER>` vs `<UUID_CLIENT>` の attribute diff を捕捉して fail 昇格を実機確認)
- ✅ 既存 [077] の text/structure mismatch 検知 + 本 [078] の attribute mismatch 検知が **直交する 2 層**を成し、hydration mismatch を網羅的にカバー
- ✅ `watchHydrationWarnings` の regex は既存資産を流用 (helper 改修ゼロ)、`_redirects` の `/test-fixtures/*` rule も attribute fixture を同 redirect でカバー
- ⚠️ CI step を 2 つに分けたため `webServer` 配列 (preview + dev) が両 step で起動される (preview build artefact は reuse されるが dev server は cold start)。CI 時間影響は実測 +15s 程度で failure granularity との trade-off で許容
- ⚠️ dev server を CI で起動する分の起動 timeout (`30_000`) は preview と同値。Astro dev server の初回 vite bundle が CI runner で遅延した場合の tight 化リスクは観測ベースで未発生のため現状値で運用

## [079] 2026-05-13 — TOTP/HOTP ジェネレータ (`totp-hotp`) 追加

### 背景

`docs/tool-candidates.md` のブレスト候補から、「ブラウザ完結の必然性が高く・実装コストが低い」基準で TOTP/HOTP を選定。2FA シークレット鍵は外部サービスへの送信が原則 NGのため、クライアントサイド計算との親和性が非常に高い。

### 設計判断

**[079-1] Base32 デコードを自前実装**

`package.json` に Base32 系の依存ライブラリが存在しないため自前実装（約 30 行）。`src/utils/base64url.ts` と同等のプリミティブとして `src/utils/totp-hotp.ts` に集約。RFC 4648 §6 に準拠し、大文字/小文字許容・padding 任意・不正文字で throw。

**[079-2] otpauth URI 内に QR コードを直接描画しない**

secret を含む QR コードをページ内に自動表示すると、画面録画・スクリーンショット等で意図せず secret が露出するリスクがある。本ツールは otpauth URI を出力するにとどめ、QR コードへの変換は `/tools/qr-code` ツールへ手動コピーで誘導する設計を採用。

**[079-3] 検証 window を ±1 固定**

RFC 6238 §5.2 推奨値。30 秒周期で前後 1 period を許容（実質 90 秒）。`verifyTotp` の引数として `window?: number` を受け付け将来の拡張に備えつつ、UI では固定値を使用。

**[079-4] `timestamp?: number` を util 関数に注入**

`Date.now` をモックせず RFC 6238 Appendix B の公式テストベクタ（T=59, 1111111109, ... の 18 ケース）を直接検証可能にするため、`totp` と `verifyTotp` の opts に `timestamp?: number` を追加。テストでは `timestamp: T * 1000` を渡す。

**[079-5] 型安全: `Uint8Array<ArrayBuffer>` を使用**

TypeScript 5.9.3 では `Uint8Array = Uint8Array<ArrayBufferLike>` だが、Web Crypto API (`crypto.subtle.importKey` 等) は `BufferSource = ArrayBuffer | ArrayBufferView<ArrayBuffer>` を要求する。`base32Decode` の戻り値・`hotp`/`totp`/`verifyTotp` の secret 引数を `Uint8Array<ArrayBuffer>` に明示することで型エラーを解消。

---

## [080] 2026-05-18 — VRT slider レポートの img-comparison-slider を npm dep + 同梱化 (unpkg CDN 依存排除)

日付 2026-05-18 | ステータス: 採用 | issue #352

### 背景

`scripts/generate-vrt-slider.mjs` が生成する HTML が unpkg.com から `img-comparison-slider@8` を動的ロードしていた。CDN 依存には以下の問題があった:

- unpkg.com に SLA なし → ダウン時に VRT viewer (gh-pages) が全滅
- `@8` major-only pin で patch リリースが任意にロードされる
- SRI hash なしで CDN 改竄の検出機構が無い

### 採用案: devDependency 化 + `vrt-slider-report/lib/` への物理同梱

1. `img-comparison-slider@8.0.7` を devDependency に exact pin (lockfile 再現性確保)
2. `scripts/generate-vrt-slider.mjs` 起動時に `node_modules/img-comparison-slider/dist/{index.js,styles.css}` を `vrt-slider-report/lib/` へ物理コピー
3. 生成 HTML の `<script>` / `<link>` 参照を `lib/index.js` / `lib/styles.css` に書き換え

### 不採用案

- **SRI hash 付与のみで CDN を継続**: SLA・patch ロード不確定の問題が残る。npm に既に正規 dist がある以上 CDN 経由する積極的理由が無い
- **`import.meta.resolve` で動的に node_modules path 解決**: 現スクリプトは cwd=project root の前提で全パスが書かれており (`TEST_RESULTS_DIR='test-results'` 等)、整合性を保つため同じ前提で `'node_modules/img-comparison-slider/dist'` を hardcode

### failure mode

- `npm ci` 前にスクリプトを実行 → `existsSync` check で早期 throw (silent CDN fallback はしない: 再現性保証の意義が失われるため)
- 上記 throw は CI workflow (`visual-regression.yml`) で `npm ci` step が必ず先行するため通常発生しない

### 関連

- issue #352
- meta test: `tests/meta/vrt-slider-report.test.ts` の `generateHTML (slider lib 参照経路)` describe (陰性対照: ローカル `lib/` 参照を assert) + `[陽性対照] CDN 参照検知 assertion が機能している` describe (`unpkg.com` / `cdn.jsdelivr.net` を含む synthetic HTML で検知 assertion 自体の機能を担保)
- CI workflow: `.github/workflows/visual-regression.yml` (改修不要、`npm ci` step が既に存在)

---

## [081] 2026-05-20 — Gs1Databar Composite に `paddingwidth: 10` を追加 + PR #450 のコメント誤読を訂正

**日付 2026-05-20 | ステータス: 採用**

### 背景

`databarlimitedcomposite` で生成した GS1 DataBar Limited 合成シンボルを PC スキャナで読み取ると、**GTIN-14 (AI 01) は decode されるがロット番号 (AI 10) など CC-A 部が一切返らない** 事象が報告された。他ツールで作成した同種シンボルは同じスキャナで読めており、当ツールの出力に GS1 仕様面の不足があると判明。

PR #450 (`height` オプション削除) と PR #453 (`shape-rendering="crispEdges"` 注入) で 2 段階の修正を入れていたが、本症状は再発した。bwip-js v4.9.0 の内部構造を再調査した結果、以下 2 点が判明した。

### bwip-js v4.9.0 内部構造の再整理

1. **`databarlimitedcomposite` は linear と CC を別レンダラで描画する**
   - linear 部: `bwipp_renlinear` (`bwipp.js` 周辺の renlinear 経路)。`borderleft: 10` / `borderright: 10` を default で持ち 10X quiet zone を確保
   - CC 部 (CC-A/CC-B): `bwipp_renmatrix` 経由で `bwipp_micropdf417` が `borderleft: 1` / `borderright: 1` しか渡さない → **CC の左右 quiet zone が 1X (= 3 svg-px @ scale=3) しかない**
2. **CC-A モジュールが 1X × 2X 長方形なのは ISO/IEC 24723 仕様準拠**
   - `bwipp_micropdf417` は `rowmult: 2` を default に持ち、CC-A 各行の高さは 2X となる
   - GS1 General Spec 5.9.2.2 が要求する「X-dim 一致」は **横方向のみ** で、CC モジュールが正方形である必要はない (= PR #450 のコメント「~1X×1X 正方形」は GS1 仕様の誤読だった)
   - PR #450 が本当に解決したのは「`height: 6mm` 指定が renmatrix の processoptions で CC 行高も上書きしていた (cc module = 1X × 4X に潰れた)」点で、修正そのものは正しい

### 決断

1. **`bwipjs.toSVG()` に `paddingwidth: 10` を composite 時のみ条件付き適用** (`src/components/tools/Gs1Databar.tsx`)
   - `FixupOptions` (`bwip-js` 公式 type 定義) で `paddingleft = paddingright = 10 * scale = 30 svg-px` が viewBox 左右に挿入される
   - renlinear が linear 部に確保していた 10X とは別経路で、**CC 部含む symbol 外周** に GS1 推奨の 10X quiet zone を確実に確保
   - 結果として CC 左右の quiet zone は実質 `1X (micropdf417 内側) + 10X (paddingwidth)` に拡張され、厳密実装のスキャナでも CC を分離検出できる
   - **non-composite (`databarlimited` 単独) には適用しない**: renlinear が default で持つ `borderleft/right=10` で既に 10X quiet zone が確保されているため、`paddingwidth: 10` を追加すると実質 20X となり symbol 全幅が必要以上に拡大する (仕様違反ではないが過剰)。`isComposite = hasAnyAiValue` の判定で適用範囲を composite に限定し、レイアウト影響を最小化する (#456 レビュー指摘)
2. **PR #450 のコメントを訂正**: `Gs1Databar.tsx` の `bwipjs.toSVG()` 上の説明を「~1X×1X 正方形モジュール」から「CC-A 1X × 2X (ISO/IEC 24723 準拠) + CC 部 quiet zone 不足の経緯」に書き直し、将来の誤解の温床を断つ
3. **陽性対照テスト 2 件** (`tests/e2e/gs1-databar.spec.ts`):
   - **composite 経路**: AI フィールド入力で composite シンボルを生成し SVG の最も左にある描画要素 (`<path>`) の `getBBox().x` が `> 25 svg-px` であることを assert。`paddingwidth` を削ると leftmost x が 4.01 → 削除時 fail、`paddingwidth: 10` 適用時は 34.01 → pass
   - **non-composite 経路**: GTIN のみ入力 (AI フィールド未入力) で `databarlimited` 単独を生成し `getBBox().x` が `< 25 svg-px` であることを assert。条件分岐を削除して常時 `paddingwidth: 10` 適用する旧実装に戻すと leftmost x が 7 → 37 にシフトして fail することを実機検証済
   - 両方とも test-gates skill 要件 (旧実装で fail することを実機検証) を満たす

### 却下した選択肢

- **`rowmult: 1` で CC 行高を 1X に強制**: ISO/IEC 24723 違反になり、厳密実装の物理スキャナで逆に decode 不能になる懸念。`paddingwidth` で解決しない場合のみ別タスクで段階的に検証する方針
- **`parse: true` / `parsefnc: true` 追加**: 現コードの bracket syntax `(01)x|(10)y` は bwip-js の `gs1process` が既に自動処理しているため不要
- **`scale` を 3 → 4/5 に増やす**: 横方向の X-dim は既に linear と CC で一致しており、scale 増加では quiet zone 不足の根本解決にならない
- **`ccversion: 'b'` で CC-B 強制**: ユーザー要件 (CC-A 維持) に反する
- **`paddingwidth: 10` を non-composite にも常時適用**: renlinear で既に 10X 確保されているため二重 padding (実質 20X) になり symbol 幅が必要以上に拡大。GS1 仕様違反ではないが過剰。条件分岐で composite のみに限定 (上記 1) する方針

### 結果・トレードオフ

- ✅ CC 部の左右 quiet zone が GS1 推奨の 10X (実質 11X) に拡張され、厳密実装スキャナでも CC-A を分離検出できる見込み
- ✅ PR #450 の GS1 仕様誤読がコード comment 上から除去され、将来「~1X×1X」を根拠にした逆走 fix を防げる
- ✅ non-composite (`databarlimited` 単独) は従来通りの symbol 幅を維持。VRT baseline 差分は composite 経路に限定される
- ⚠️ composite シンボル (`databarlimitedcomposite`) の SVG / PNG 全幅は 60 svg-px 拡張される → composite ケースの VRT baseline 差分が発生する可能性がある。CLAUDE.md 6.8 に従い数値根拠で baseline 更新を recommend せず、user 目視確認後に CI `workflow_dispatch` で更新
- ⚠️ 実機スキャナで decode 改善するかは user 検証次第。改善しない場合は `paddingheight: 2` (CC 上下 2X 追加) / `rowmult: 1` (spec 違反だが scanner 寛容性に賭ける) を段階的に試す別 issue を起票する

### 関連

- bwip-js 公式 type (`node_modules/bwip-js/dist/bwip-js.d.ts:79-85`): `paddingwidth` / `paddingleft` 等は公式 typed option
- 過去 fix: PR #450 (`height` 削除), PR #453 (`shape-rendering` 注入)
- 陽性対照 (composite): `tests/e2e/gs1-databar.spec.ts` の `composite シンボルに GS1 推奨の 10X quiet zone (paddingwidth) が確保されている`
- 陽性対照 (non-composite): 同 spec の `non-composite シンボルには paddingwidth が適用されない`

## [082] 2026-05-20 — PNG 変換 Canvas2D の透明背景が原因の reader decode 失敗を白塗りで解消

### 背景

`[081]` の `paddingwidth: 10` で composite の左右 quiet zone を GS1 推奨 10X に拡張したが、ユーザーから「ツールで生成した PNG (`gs1-databar-04987000000017.png`) が読取サイト (Dynamsoft Barcode Reader online) で `Found 0 barcodes` になるが、同 PNG を画面 screenshot 経由で再ラスタライズしたものは confidence=100 で decode 成功する」という事象が報告された。

### 根本原因（仮説の差し替え経緯）

**初期仮説 (誤り)**: 垂直 quiet zone (上下余白) の不足。bwip-js の `bordertop/borderbottom` が default 0 のため bars / CC-A 上端が image 上端に密着しており、image-based scanner が symbol 境界を検出できないと推定し、`paddingheight: 10` の追加を試した。

しかし `paddingheight: 10` で上下 30 svg-px の quiet zone を確保しても、Dynamsoft は依然 `Found 0 barcodes` を返した。一方、同じ PNG の screenshot は依然 decode 成功する。垂直 quiet zone は decode 成立条件ではなかったため `paddingheight` 案は revert した。

**真因 (実機 pixel 計測で確定)**: `src/utils/download.ts` の `svgContentToPngBlob` / `downloadPngFromSvgElement` が **Canvas2D default の透明背景** (RGBA=0,0,0,0) のまま `drawImage(svg)` を呼んでいた。bwip-js / JsBarcode の SVG は黒バーのみ `<path>` で描画し背景 `<rect>` を持たないため、生成 PNG の **quiet zone / バー間 pixel が完全 transparent** になっていた (Playwright で `getImageData` 計測: 4 隅すべて α=0, RGB=(0,0,0))。

ブラウザ表示時はページ白背景が透過するため視覚上は白だが、image-based barcode reader (Dynamsoft 等) は **transparent pixel を「黒」と解釈** する実装があり、quiet zone が黒判定 → 全面ノイズ → decode 不能になっていた。screenshot 経由で読めるのは、ブラウザが PNG を白ページ上に rendering した結果を screen capture すると実 RGB 値が白になり、再生成 PNG が通常の white-background 画像になるためである。

### 決定

1. **PNG 変換 Canvas の背景を白で塗る** (`src/utils/download.ts`)
   - `svgContentToPngBlob` / `downloadPngFromSvgElement` 両方で `ctx.scale()` 前に `ctx.fillStyle = 'white'` + `ctx.fillRect(0, 0, canvas.width, canvas.height)` を呼ぶ
   - 順序は **fillRect (device px 単位) → ctx.scale (retina 変換) → drawImage (bars を overdraw)**。scale 後だと rect 寸法が CSS px 扱いになり半分しか塗れない
   - 影響範囲: GS1 DataBar (`svgContentToPngBlob` 経由) と JAN コード (`downloadPngFromSvgElement` 経由) の両 PNG ダウンロード
2. **陽性対照テスト** (`src/utils/__tests__/download.test.ts` + `tests/e2e/gs1-databar.spec.ts`):
   - unit: `svgContentToPngBlob` / `downloadPngFromSvgElement` の `fillStyle === 'white'`, `fillRect` の引数 (canvas 全面 device px), 呼び出し順序 (fillRect → scale → drawImage) を assert (各経路 3 件 × 2 経路 = 6 件)
   - E2E: composite 生成 PNG を Canvas で実生成し 4 隅の quiet zone pixel が `α=255 / RGB=(255,255,255)` であることを `getImageData` で assert。fix を revert すると α=0 (transparent) に戻り全件 fail する設計

### 検討した代替案

- **垂直 quiet zone (paddingheight) のみで解決を目指す**: 当初の仮説。実機検証で否定 (Dynamsoft 依然 `Found 0`)。screenshot 経由が読める真因は余白ではなく **再ラスタライズで透明→白に変換される** ことだった。誤仮説で追加した `paddingheight: 10` と陽性対照 2 件 (`non-composite シンボルに垂直 quiet zone` / `composite シンボルに垂直 quiet zone`) は user 判断で revert した (YAGNI: scope discipline 優先)
- **SVG 側に背景 `<rect width="100%" height="100%" fill="white"/>` を注入**: bwip-js 出力の SVG を post-process することで Image→Canvas 経路に依存せず白背景を持たせる選択肢。だが SVG 内に rect を入れると `addSvgDimensions` の regex match 経路に影響し、preview 表示時の image-rendering: pixelated との相互作用も発生するため副作用が大きい。**Canvas 側で fill する方が影響範囲が局所的** (`svgContentToPngBlob` / `downloadPngFromSvgElement` の 2 関数のみ) で安全
- **`canvas.getContext('2d', { alpha: false })`**: alpha チャネルを完全に無効化する選択肢。canvas の background が黒になる仕様で、`fillRect` で白塗りする必要があるため結局同じ工程になる。明示的な `fillStyle = 'white' + fillRect` のほうが意図が読みやすい

### 結果・トレードオフ

- ✅ Dynamsoft Barcode Reader (online) で composite シンボルが `Found 1 barcode (confidence: 100)` で decode 成功することを実機検証 (user 環境で確認)
- ✅ JAN コード (`downloadPngFromSvgElement`) も同じ修正の恩恵を受け、同様の reader 互換性向上が見込まれる
- ✅ SVG viewBox / preview の見た目は変更なし。PNG 画素値のみ「quiet zone を透明から白に変える」局所修正なので VRT baseline (`/tools/gs1-databar`) への影響は preview 経路では無し

### 関連

- 関連 fix: PR #456 (`paddingwidth: 10` for composite, decisions `[081]`)
- 陽性対照 (unit): `src/utils/__tests__/download.test.ts` の `svgContentToPngBlob: PNG 背景白塗り (transparent decode 失敗修正)` describe / `downloadPngFromSvgElement` の `陽性対照: fillStyle が white にセットされて fillRect が canvas 全面で呼ばれる` / `陽性対照: 呼び出し順序は fillRect → scale → drawImage`
- 陽性対照 (E2E): `tests/e2e/gs1-databar.spec.ts` の `生成 PNG の quiet zone が透明ではなく白 (α=255) で塗られている`

## [083] 2026-05-21 — Gs1Databar 合成シンボル上部の AI テキスト injection を `injectCompositeText` 復活で再導入

### 背景

`[067]` update / PR #450 (commit `c563cf5`, 2026-05-19) は、合成シンボル (`databarlimitedcomposite`) 上部に AI テキスト ((17)YYMMDD / (10)LOT 等) を SVG `<text>` で注入する `injectCompositeText` 関数を撤去した。撤去理由として「テキストのディセンダー (paren `( )` の下端カーブ ~4px) が composite 上端の 1X quiet zone に侵入し Dynamsoft Barcode Reader が decode 不能 (0 件)」「textRowH を 3X gap (= 9px) に広げる代替案も decode 不能で撤回」と記録されていた。

しかし `[082]` / PR #458 で composite PNG decode 不能の真因が **Canvas2D の透明背景** (`svgContentToPngBlob` が `fillStyle = 'white'` 未設定で α=0 のまま) と判明。PR #450 当時の実機検証はすべて透明背景時に行われており、descender 仮説は **transparent 背景という別バグに巻き込まれた red herring** だった可能性が極めて高いと user が指摘した。

### 根本原因の再評価

PR #450 で行った decode 検証 3 種類:

1. `injectCompositeText` 有効、1X gap → Dynamsoft 0 件
2. `injectCompositeText` 有効、3X gap (textRowH 拡大) → Dynamsoft 0 件
3. `injectCompositeText` 撤去 → Dynamsoft 100% 認識

3 検証はすべて PNG 背景が transparent のまま実施。reader が transparent pixel を黒判定するため、quiet zone の幅に関わらず全面ノイズ → decode 不能になっていた。撤去ケース (3) で decode 成功した理由は、SVG 出力が小さく screenshot 経由などで再ラスタライズされる経路を含んだ可能性がある (詳細は当時のテスト手順が残っていない)。

実機 user 検証 (本 PR 2026-05-20): PR #458 の白背景 fix を merge した状態で `injectCompositeText` を旧 geometry (textRowH = fontSize + 6 = 24px、text baseline y=21、barcode translate y=24) でそのまま復活 → Dynamsoft online reader (https://demo.dynamsoft.com/barcode-reader-js/) で `Found 1 barcode + GS1_COMPOSITE + confidence: 100` の decode 成功を確認。

descender 仮説は本 PR で **明確に否定** された。GS1 仕様の「composite 周囲 1X quiet zone」要求自体は依然有効だが、image-based reader の binary threshold 動作には透明背景の方が遥かに支配的な影響を与えていた。

### 決定

1. **`escapeHtml` / `injectCompositeText` を `src/utils/gs1-databar.ts` に復元**: PR #450 撤去時 (commit `c563cf5`) から geometry / 関数シグネチャ不変で復元。コメントブロックで「PR #450 撤去 → PR #458 真因判明 → 本 PR 復活」の時系列を明示
2. **`src/components/tools/Gs1Databar.tsx` の wiring を復元**: `addSvgDimensions(rawSvg)` 後に `compositeText` (非空時) を `injectCompositeText` に通す
3. **`.gs1-svg-container` クラスを `src/styles/global.css` に復元**: `<text fill="currentColor">` が `color: var(--color-text)` を継承するための container 色設定。preview wrapper (`Gs1Databar.tsx:352`) に `barcode-preview gs1-svg-container` 併用
4. **陽性対照テスト**:
   - unit (`src/utils/__tests__/gs1-databar.test.ts`): `escapeHtml` 6 件 + `injectCompositeText` 8 件。geometry (y=21, height +=24, translate y=24)、XSS escape (`<script>` → `&lt;script&gt;`)、text < barcode width / text > barcode width の centering 両条件
   - E2E (`tests/e2e/gs1-databar.spec.ts`): composite 入力時に `<text>` 要素 + `(17)...(10)...` 内容 + y="21" / text-anchor="middle" / fill="currentColor" を assert。non-composite (AI 未入力) では `<text>` 要素に AI 文字列が含まれないことも別 case で assert (常時 injection regression 検知)

### 検討した代替案

- **`textRowH` を旧 3X gap (= 34px) で安全側に**: GS1 spec 推奨に厳密に揃える案。だが旧 geometry (textRowH=24) で実機 decode 成功を確認できたため YAGNI で見送り。後続 reader 互換性問題が出たら拡張する
- **AI テキストを SVG 外 (HTML レベル) で render**: preview には表示できるが downloaded PNG に反映されないため、印刷用バーコードとしての利用 (一般的な GS1 ラベル慣習) を満たさない。user 要求と不一致
- **TEC-IT 等 reference 実装相当の独自 layout を組む**: 既存 `injectCompositeText` 復元で要件を満たすため過剰

### 結果・トレードオフ

- ✅ user 要求「合成シンボル内容を人間可読で確認」を満たす ((17)YYMMDD / (10)LOT 等を visual に確認可能)
- ✅ Dynamsoft Barcode Reader (online) で `confidence: 100` decode 成功 (実機検証済 / 2026-05-20)
- ✅ PR #458 白背景 fix と組み合わせで symbol 構造に影響なし
- ⚠️ 生成 SVG / PNG の **全高が 24 svg-px 拡張** される (textRowH = fontSize + 6)。VRT baseline (`/tools/gs1-databar`) は composite シンボル表示時の差分が出る可能性 → CI `workflow_dispatch` で生成 → user 目視確認後に commit (CLAUDE.md 6.8)
- ⚠️ AI 値が長い (例: lot 20 文字) と SVG 全幅が barcode より広がり centering される (旧実装の挙動と同じ)。preview / PNG の見た目は受け入れ可能だが、将来 layout 上の問題が出たら multi-line 対応も検討

### 関連

- 関連 fix: PR #450 (撤去, decisions `[067]` update) / PR #458 (透明背景真因判明, decisions `[082]`)
- 陽性対照 (unit): `src/utils/__tests__/gs1-databar.test.ts` の `escapeHtml` / `injectCompositeText` describe
- 陽性対照 (E2E): `tests/e2e/gs1-databar.spec.ts` の `composite シンボルに AI テキスト ((17)... (10)...) が SVG 上部に注入される` / `non-composite (AI フィールド未入力) シンボルには AI テキスト注入されない`

---

## [084] 2026-05-23 — ツール並び順を yomi（読み仮名）五十音順に統一

### 背景

`src/data/tools.ts` の `tools` 配列はツールの **追加（作成）順** のまま並んでおり、Sidebar / MobileDrawer / index / about の 4 箇所がこの配列順をそのまま（または category で filter して）表示していた。ツールが増えるほど目的のツールを探しづらく、追加のたびに「どこに挿入するか」を考える必要があった。

### 決定

`Tool` interface に `yomi`（ひらがなの読み仮名）フィールドを追加し、`src/data/tools.ts` のモジュール読み込み時に `yomi` で `localeCompare('ja')` ソートした配列を `export` する。

- ソース上のエントリ順は追加順のまま残し（可読性維持）、表示順だけソートで決める。
- `filter` はソート済み配列の相対順序を保つため、category 内も自動的に五十音順になる。消費側（Sidebar / MobileDrawer / index / about）は変更不要。
- 全 `yomi` がひらがなのため collation は安定（ひらがなは Unicode 上も五十音順に連続）。

### 却下した選択肢

- **使用頻度順**: 本サイトはクライアント完結でアクセス解析・トラッキングを一切持たない設計（about.astro 設計方針）のため、頻度の実測データが存在しない。結局「たぶんよく使う順」という主観の手動メンテになり、ツール追加のたびに判断が発生して形骸化するため不採用。
- **単純な name 順（`name` で localeCompare）**: ツール名が Latin 始まり（URL/JWT/Base64）と日本語始まり（ダミー/文字）で混在しており、直感的な五十音読み順とズレるため不採用。`yomi` フィールドで読み順を明示する方式を採用した。

### 結果・トレードオフ

- ✅ 新規ツール追加は `yomi` を埋めるだけで自動整列。手動の位置決めが不要になり、順序ズレが構造的に発生しない（= 表示順を強制する guard テストは不要）。
- ⚠️ `yomi` は読み仮名の主観が入る（特に頭字語の読み）。追加時に既存の表記（QR→「きゅーあーる」等）と揃える運用が必要。
- ⚠️ Sidebar が全ツールページに表示されるため、表示順変更で `/`・`/about`・全 `/tools/*` の VRT baseline が変わる。CI `Update Visual Regression Baseline` workflow を `workflow_dispatch` で再生成する（CLAUDE.md 6.8 / ローカル生成不可）。

---

## [085] 2026-05-24 — ツールカテゴリを 2 分類 → 4 分類（ドメイン軸）へ拡張

### 背景

17 ツールが `generate`（生成 8）/ `convert`（変換・解析 9）の 2 分類しかなく、両セクションが肥大化して「探す手がかり」として機能が薄くなっていた。特に QR 系（QRコード生成・QRチケット・QRリーダー）が `generate` と `convert` に分断され、ユーザーが「QR 関連ツール」を横断的に見つけにくかった。[004] でタブ UI は「カテゴリが増えてもタブ追加で対応できる」設計意図を明記済みで、2 分類は固定ではない。

### 決定

ドメイン軸の 4 分類へ拡張する。`ToolCategory` 型・`categoryLabel`・`categories` 配列（`src/data/tools.ts`）を更新し、各ツールの `category` を再割り当てした。

| key        | ラベル               | ツール                                                         |
| ---------- | -------------------- | -------------------------------------------------------------- |
| `generate` | 生成                 | ULID / UUID v7 / ダミーテキスト / TOTP・HOTP                   |
| `code`     | コード・バーコード   | QRコード / JAN / GS1 DataBar / QRチケット / QRリーダー         |
| `encode`   | エンコード・デコード | URL / Base64 / JWT                                             |
| `convert`  | 変換・解析           | JSON⇔XML / JSON⇔CSV / 設定ファイル / 文字コード / 文字カウント |

- 表示順は `categories` 配列順（`['generate', 'code', 'encode', 'convert']`）。各カテゴリ内は [084] の yomi 五十音ソートで自動決定。
- 消費側（Sidebar / MobileDrawer / index タブ / カードバッジ / パンくず）は `categories` を map するデータ駆動のため、データ定義変更だけで自動反映される。
- `index.astro` に残っていた `categories` のハードコード重複（`['generate', 'convert']`）を撤去し、`@/data/tools` の `categories` を import する形に統一した（将来のカテゴリ増減で漏れない）。
- index タブが 2→4（+「すべて」で 5）に増え、長ラベルでスマホ幅を超えるため、タブバーを `overflow-x-auto` + スクロールバー非表示（`#panels` と同方式）にして全ラベルを横スクロールで保持する。

### 却下した選択肢

- **アクション軸の 3 分類（生成 / エンコード・デコード / 変換・解析）**: 既存の生成/変換の考え方を保てるが、QR 系が生成カテゴリに留まり QRリーダーだけ変換に残る分断が解消されない。「QR 関連を 1 か所で」というドメイン軸の利点を優先して不採用。
- **現状維持（2 分類）**: セクション肥大化と QR 系分断の課題が残るため不採用。
- **ラベル短縮でタブ溢れ回避**: 「コード」「符号化」等への短縮は意味が伝わりにくい。横スクロールで全ラベルを保持する方を採用。

### 結果・トレードオフ

- ✅ QR/バーコード系が 1 カテゴリに集約され横断的に探せる。各セクションの件数が均され（4/5/3/5）スキャンしやすい。
- ✅ 型 union 化で全ツールの `category` 値はコンパイル時検証される（不正値は `astro check` で検出）。
- ⚠️ index タブバー・全ツールページの Sidebar 見出し・移動ツールのパンくずラベルが変わるため VRT baseline 差分が出る。CI `Update Visual Regression Baseline` workflow を `workflow_dispatch` で再生成する（ローカル生成不可 / CLAUDE.md 6.8）。

---

## [086] 2026-05-24 — トップページにツール横断検索を追加

**2026-05-24 | ステータス: 採用**

### 背景

トップページ (`src/pages/index.astro`) はカテゴリタブ + スワイプパネルでの一覧表示のみで、名前や用途で直接ツールを探す手段がなかった。ツール数（17）は増加傾向にあり、カテゴリタブだけでは目的のツールへの到達コストが上がっていく。

### 決断

トップページのタブバー上部に検索ボックスを追加する。入力があるとタブ/パネルを隠し、全ツールを横断で絞り込んだ結果を 1 つのグリッドに表示する（空にすると元のタブ UI に復帰）。

- **実装方式**: トップページは React 非依存の Astro + Vanilla JS 構成のため、検索もこれに合わせ新たな React 依存を持ち込まない。マッチ判定ロジックのみ純粋関数 `src/utils/tool-search.ts`（`normalizeQuery` / `buildSearchText` / `kataToHira`）に切り出し、Vitest で陽性/陰性対照付きの単体テスト（`src/utils/__tests__/tool-search.test.ts`）を書く。Astro `<script>` から `normalizeQuery` を import し、ビルド時に `ToolCard.astro` が `buildSearchText` で算出した `data-search` 属性を実行時に `includes()` で照合する。
- **検索対象**: ツール名・説明文・slug・読み仮名(`yomi`)・カテゴリ名。`buildSearchText` で小文字化 + カタカナ→ひらがな正規化を適用するため、`json`・`JSON`・`じぇいそん`・`ジェイソン` がすべて同一視される。
- **複数語クエリ**: クエリは空白で分割（`queryTokens`）し、全トークンの AND マッチ（`matchesSearchText`）。`json csv` で JSON/CSV 変換のみヒットし、順序非依存。haystack は各フィールドを単一スペースで連結した 1 本の文字列のため、単純 `includes` だと `json csv` が連続部分文字列として一致せず 0 件になる問題を回避する。
- **カード markup の共通化**: パネルと検索結果グリッドの 2 箇所で同一カードを使うため `src/components/ui/ToolCard.astro` を新設し、index.astro のインライン markup を移設。
- **表示制御**: CSP style-src を侵さないよう inline style / CSSOM mutation を使わず、`el.hidden` 属性トグルで実装。Tailwind の `.flex` / `.block` に UA 既定 `[hidden]{display:none}` が詳細度で負ける問題は、`global.css` に `[hidden]{display:none!important}` を 1 箇所追加して解消した。

### 却下した選択肢

- **React コンポーネント化**: `useDebouncedValue` 等の既存フックは流用できるが、現状 React island ゼロのトップページに hydration コストと CSP/VRT の考慮を増やす。Vanilla JS で十分軽量に実現できるため不採用。
- **inline style / `el.style.display` での表示制御**: `inline-style-migration.test.ts`（#176 / [067]）が Astro の inline `style=` を禁止しており、CSSOM mutation も CSP style-src 違反になる。`hidden` 属性 + global `[hidden]` ルールで回避した。
- **外部あいまい検索ライブラリ（Fuse.js 等）**: 17 ツール規模では `includes` による部分一致 + yomi 正規化で十分。依存追加・bundle 増を避けて不採用。

### 結果・トレードオフ

- ✅ 名前・用途・読み（ひらがな/カタカナ）・カテゴリのいずれからでも全ツールを横断検索でき、カテゴリ分断を越えて到達できる（例: 「json」で別カテゴリの設定ファイル変換もヒット）。
- ✅ マッチ判定が純粋関数として単体テスト可能になり、陽性/陰性対照で検知能力を担保。
- ⚠️ トップページ (`/`) のレイアウトが変わるため VRT baseline 差分が出る。CI `Update Visual Regression Baseline` workflow を `workflow_dispatch` で再生成する（ローカル生成不可 / CLAUDE.md 6.8）。

---

## [087] 2026-05-26 — SQL整形ツールの追加と sql-formatter ライブラリの採用

**2026-05-26 | ステータス: 採用**

### 背景

開発者が手書きや ORM 生成の SQL をレビュー・共有する際、インデントやキーワード大文字化がばらばらで可読性が低いケースが多い。ブラウザ完結でインストール不要な整形ツールへの需要があるため、変換・解析カテゴリにツールを追加することとした。

### 決断

`sql-formatter`（v15.8.0、MIT）を採用し `src/utils/sql/format.ts` でラップした上で `SqlFormatter.tsx` コンポーネントとして提供する。

- **方言サポート**: MySQL / PostgreSQL / SQLite / SQL Server の 4 方言をセレクトで切り替え可能にする。
- **整形オプション**: `keywordCase: "upper"`（キーワード大文字化）+ `tabWidth: 2`（インデント 2 スペース）を固定設定とし、UI 上の設定項目を最小限に抑える。
- **リアルタイム整形**: 入力変更・方言変更をトリガーに `useCodec` フック（既定 300ms デバウンス）で整形し、ユーザーが確定操作なしに結果を確認できる。
- **スコープ**: PR1 はインデント・キーワード大文字化の整形のみ。バインド変数展開（パラメータ埋め込み）は別 PR で対応予定。

### 却下した選択肢

- **`prettier-plugin-sql`**: Prettier 本体への依存が発生しバンドルサイズが増大する。ブラウザ実行に適さないため不採用。
- **`node-sql-parser`**: AST ベースのパース・生成ができるが、再シリアライズ側の実装コストが高く整形品質が `sql-formatter` を下回る。
- **手製の正規表現整形**: キーワード抽出・インデントロジックの実装・テストコストが高い上、方言差異への対応が困難。既存ライブラリが MIT で利用可能なため採用する理由がない。

### 結果・トレードオフ

- ✅ `sql-formatter` は 4 方言すべてを一つのライブラリでカバーし、追加依存を最小化できる。
- ✅ `src/utils/sql/format.ts` の薄いラッパー構成により、ライブラリのバージョンアップ時の差し替えコストが小さい。
- ⚠️ `sql-formatter` の追加分だけツールのバンドルサイズは増えるが、ツールページは Astro の `client:load` で遅延ロードされるため、トップページの初期ロードには影響しない。

### PR2 追記 — パラメータ埋め込み機能の追加（2026-05-27）

- **プレースホルダスキャナ**: 正規表現による素朴な置換ではなく、文字列リテラル・ラインコメント（`--`）・ブロックコメント（`/* */`）・クォート済み識別子をスキップする軽量スキャナを実装。`WHERE note = 'why?'` の `?` を誤検出しない。
- **方言別値レンダリング**: boolean は PostgreSQL では `TRUE`/`FALSE`、その他方言では `1`/`0` に変換。文字列はシングルクォートで囲み `'`→`''` エスケープを適用。出力はデバッグ表示専用であり、UI に「実行禁止・デバッグ表示用」警告バナーを常時表示する。
- **既知制約**（いずれも PR #486 レビューで指摘。デバッグ表示用ツールのため当面は記録に留め、`embedParams.test.ts` の「既知の制約 / 現状固定」で現状挙動をテスト固定）:
  - PostgreSQL ドル引用符文字列（`$tag$...$tag$`）はスキャナ未対応。
  - 文字列内エスケープは標準 SQL の `''`（クォート二重化）のみ対応。MySQL 既定のバックスラッシュエスケープ（`'can\'t'` の `\'`）は未解釈で、`?` が文字列内に飲み込まれ silent に無変換となる（標準 SQL / PostgreSQL では `\` は非特殊文字のため現状の挙動が正しい）。
  - 識別子内の `$`（MySQL の `col$1` 等）は番号プレースホルダ（`$1`）と誤検出しうる。
  - 数値は `JSON.parse` 由来のため 2^53 を超える整数は精度が落ちる（`10000000000000000001` → `10000000000000000000`）。デバッグ用途では許容。
  - パラメータ未入力（空欄）はプレースホルダがある場合に「パラメータ（JSON）を入力してください」と案内する（「JSON 不正」の誤解防止）。

---

## [088] 2026-05-27 — 正規表現ビジュアライザ＆ReDoS検出ツールの追加

**2026-05-27 | ステータス: 採用**

### 背景

入力バリデーション用の正規表現が ReDoS（壊滅的バックトラッキング）に対して安全かどうかを、ブラウザ完結でインストール不要に確認できるツールへの需要があった。あわせて複雑な正規表現の構造を AST ツリーで可視化する機能も提供する。

### 決断

#### `regexp-tree@0.1.27` の採用（AST パーサ）

`regexp-tree` は ECMAScript 正規表現を位置情報付き AST へパースする純粋 JS ライブラリ（MIT）。手書きパーサの実装コストを避け、`loc` 情報（offset）を利用して ReDoS hotspot とのオフセット座標系を揃える（offset-1 補正: `regexp-tree` は `/pattern/` リテラル基準のため先頭 `/` 分を引く）。型定義を同梱しており型 shim 不要。

#### `recheck@4.5.0` の採用（ReDoS 検出）

- **ブラウザフィールド採用**: `recheck` は `browser` フィールドに `lib/browser.js` を持ち、Worker・`synckit`・ネイティブバイナリへの依存がない pure JS 実装を提供する。クライアントビルドは Vite が `browser` フィールドを自動選択。
- **async `check` 不採用理由（CSP 制約）**: `recheck` の async `check()` は内部で `blob:` Worker を生成する。本番 CSP は `script-src 'self'` かつ `worker-src` 未設定のため `blob:` Worker が永久ブロックされ、Promise が resolve しない。**CSP を変更せず**、同期 API `checkSync(source, flags, { timeout: 1000 })` を採用した。`timeout` は必須（同期=メインスレッド占有のため病的入力での UI フリーズ防止）。
- **`safe-regex` 不採用**: 静的解析のみで false negative が多く、攻撃文字列・計算量種別の情報も得られない。
- **install script**: `recheck` のオプショナル依存（ネイティブバイナリ）は `.npmrc` の `ignore-scripts=true` で skip される。`lib/browser.js` のみ使用するため問題なし。`min-release-age=7` にも適合（v4.5.0 は適合済み）。

#### バンドルコストの許容

`recheck` の browser チャンク（2.7MB raw / 334KB brotli）は大きい。`client:load` 遅延ロードにより正規表現ビジュアライザページのみに影響し、トップページの初期ロードには無影響。ユーザー承認済み。

#### CJS 依存（recheck / regexp-tree）を SSR graph から外す（動的 import）

`recheck` / `regexp-tree` は CJS のみのパッケージ。これらを React コンポーネントで静的 import すると、`client:load` の SSR レンダリング時に Astro の SSR module graph へ載り、**dev SSR で CJS（`module.exports`）が ESM として評価され `module is not defined` → 500 / hydration mismatch（React #418）** になる（PR #490 の CI cold cache で発覚）。

当初 `vite.resolve.alias` + `vite.ssr.noExternal` + カスタム environment プラグインで CJS→ESM 変換を試みたが、Astro 6 の dev SSR は `vite.ssr.noExternal` を honor せず解決できなかった。

採用した解法: 解析ユーティリティ（`parseRegex` / `analyzeRedos`）は **client 専用**（解析は debounce effect 内でのみ実行）なので、`RegexVisualizer` から **動的 import**（`import('@/utils/regex-visualizer')`、型は `import type` で別途）して SSR graph から外す。これにより:

- SSR は recheck/regexp-tree を一切ロードしない（dev SSR エラー解消、bundle も client 専用 chunk に分離）。
- `astro.config.mjs` は SSR 向け alias / noExternal / プラグインを撤去でき、**dev client 用の `optimizeDeps.include: ['recheck', 'regexp-tree']` のみ**に簡素化（client build は Vite が recheck の `browser` フィールド = `lib/browser.js` を自動選択）。

unit テストは `vitest.config.ts` の alias で `recheck` を `lib/browser.js` に解決し、陽性対照が出荷 client と同じ browser ビルドを守るようにしている。

#### ReDoS 3 状態の誠実さ方針

`checkSync` の返値は `safe` / `vulnerable` / `unknown` の 3 状態。`timeout` 超過時は `unknown`（判定不能）となる。**「不明」を「安全」と表示しない**設計とし、UI でも 3 状態を厳密に区別する。

#### prod-parity E2E gate

async `check` への将来的な回帰（`checkSync` → `check`）を CI で検知するため、E2E を `withProductionCsp` 下で実行する。`blob:` Worker を使う `check` に戻すと CSP 違反が発生し `assertNoViolations()` が fail する。`tests/e2e/regex-visualizer.spec.ts` の「脆弱な正規表現で危険判定…（CSP 下で checkSync 動作）」テストが prod-parity regression gate として機能する。

### 却下した選択肢

- **async `check` + CSP 変更**: `worker-src blob:` を追加すれば動作するが、CSP を弱化することになり不採用。
- **`safe-regex`**: 静的解析のみで false negative が多く、攻撃文字列・計算量種別が得られない。
- **手製 ReDoS 検出**: 正確な多項式/指数時間判定を実装する工数が過大。

### 結果・トレードオフ

- ✅ ブラウザ完結・CSP 変更不要で ReDoS 検出が動作する
- ✅ 3 状態誠実表示で「不明を安全」と誤認しない
- ✅ prod-parity E2E gate により async `check` への回帰を CI で自動検知
- ⚠️ 334KB brotli の追加バンドル（ユーザー承認済み。遅延ロードで他ページ無影響）
- ⚠️ `checkSync` はメインスレッドを占有する同期処理（timeout: 1000ms で上限設定）

---

## [089] 2026-05-27 — 正規表現鉄道図レンダラの採用（PR2a: 基盤＋連結/終端/グループ＋タブ）

**2026-05-27 | ステータス: 採用**

### 背景

正規表現ビジュアライザに AST ツリー表示に加えて鉄道図（railroad diagram）を追加することで、正規表現の構造をより直感的に可視化できるようにする。

### 決断

#### 自前 React SVG を採用（railroad-diagrams / regexper 却下）

サードパーティライブラリを評価した結果、**自前の React `<svg>` 要素で描画する**方式を採用した。

- **`railroad-diagrams` 却下理由**: SVG 文字列を直接生成する API で、`dangerouslySetInnerHTML` なしに React tree に組み込めない。`dangerouslySetInnerHTML` は XSS リスクがあり本プロジェクトのポリシーに反する。また CJS パッケージで SSR 制約（[088]）にも抵触する。
- **`regexper` 却下理由**: 独自パーサを持つ重厚なライブラリ。既に `regexp-tree` を採用済みであり、二重パーサを抱えるコストが過大。ライセンス（AGPL-3.0）も本プロジェクトの MIT 方針と整合しない。
- **自前実装の優位性**: `RailNode` という純粋な値ツリーを組んで React で描画するアーキテクチャにより、XSS なし・SSR 安全・テスト容易性を全て満たせる。

#### アーキテクチャ: pure layout 分離 + builder は動的 import 経由

SSR 安全性を維持するために以下の 2 層に分離した:

- **`railroad-layout.ts`（SSR 安全・静的 import 可）**: `RailNode` 型・レイアウト定数・`measure*` 関数のみ。CJS モジュールへの依存ゼロ。`RegexRailroad.tsx` から静的 import してよい。
- **`railroad.ts`（client 専用）**: `regexp-tree`（CJS）を使って AST → `RailNode` を組む `buildRailroad`。既存の動的 import 経路（`RegexVisualizer` の `useEffect` 内 `import('@/utils/regex-visualizer')`）経由でのみ呼び出す。静的 import すると dev SSR で `module is not defined` になる（[088] 参照）。

#### PR2a/2b/2c への分割方針

実装を段階的に PR 分割する:

- **PR2a（本 PR）**: 基盤（`railroad-layout.ts` / `railroad.ts`）＋終端（Char / CharacterClass）・連結（Alternative）・グループ（Group）の描画＋タブ切替 UI。未対応構文（Disjunction / Repetition / Assertion / Backreference）はフォールバック破線枠で継続描画。
- **PR2b（完了）**: 選択肢（Disjunction）＋アサーション（Assertion）の本実装。Disjunction は左ネスト二分木を `flattenDisjunction` で平坦化し縦分岐（split/merge S字 bezier path）として描画。単純アンカー（`^` `$` `\b` `\B`）は pill（両端半円 rect）で表示。先読み/後読み（`(?=)` `(?!)` `(?<=)` `(?<!)` ）は `measureGroup` を再利用して内部式を内包するコンテナとして描画。CSS は `.rr-assertion`（`@layer components` 手書き class）を追加。
- **PR2c（完了）**: 量指定子（Repetition）＋後方参照（Backreference）＋hotspot ハイライト（`loc` 情報を活用した ReDoS 危険箇所の強調）。量指定子は skip 弧（上/0 回バイパス）と loop 弧（下/繰り返し）を SVG path で描画。後方参照は破線枠（`.rr-backref`）で視覚的に区別。hotspot は「自身が重なり かつ どの子も重ならない最深ノード」に `.rr-box-hot`（警告色）を適用。鉄道図シリーズ（PR2a/2b/2c）完了。

#### フォールバック戦略

PR2a 未対応の構文ノードは `measureFallback` で破線枠として描画し、**エラーを出さず継続描画する**設計にした。実際の正規表現（`a+` など量指定子を含む）を入力しても鉄道図タブがクラッシュしない。

### 却下した選択肢

- **`railroad-diagrams`**: `dangerouslySetInnerHTML` が必要・CJS・XSS リスク。
- **`regexper`**: AGPL-3.0・二重パーサ・重量。
- **builder を静的 import**: dev SSR の `module is not defined` エラー再発（[088] の教訓に反する）。

### 結果・トレードオフ

- ✅ XSS なし（`dangerouslySetInnerHTML` 不使用、React 要素として描画）
- ✅ SSR 安全（`railroad-layout.ts` は静的 import 可、`railroad.ts` は動的 import 経由）
- ✅ 段階的 PR 分割により各 PR のレビュー負荷を低減
- ✅ フォールバック枠で未対応構文でも継続描画
- ✅ PR2b 完了: 選択肢（縦分岐 split/merge）・アサーション（pill / lookaround group）を本実装
- ✅ PR2c 完了（鉄道図シリーズ完了）: 量指定子（skip/loop 弧）・後方参照（破線枠）・hotspot ハイライト（最深ノードに警告色 `.rr-box-hot`）を本実装

---

## [090] 2026-05-27 — SessionStart フックの依存インストールを lockfile ハッシュガードに変更

**2026-05-27 | ステータス: 採用**

### 背景

`.claude/settings.json` の `SessionStart` フックは `if [ ! -d node_modules ]` を条件に `npm ci` を実行していた。Claude Code on the web はフック完了後にコンテナ状態（`node_modules` を含む）をスナップショット・キャッシュするため、初回スナップショット以降は `node_modules` が常に存在し、ガード条件が常に false になって `npm ci` が二度と再実行されない。結果、`develop` から依存が変わったブランチに切り替えても古い依存のまま作業してしまうギャップがあった。

`session-start-hook` skill はこのキャッシュ特性を理由に `npm ci` より `npm install`（冪等・増分）を推奨しているが、`npm install` は lockfile を書き換え得る／semver 範囲で別バージョンを解決し得るため、**レビュー済み lockfile から外れた版を引くサプライチェーンリスク**がある。

### 決断

`npm ci`（lockfile を唯一の真実源とし、lock を書き換えない・不整合なら fail する）を維持したまま、ガード条件を `node_modules` の有無ではなく **`package-lock.json` のハッシュ**に変更した。

```bash
if [ -f package-lock.json ]; then
  H=$({ sha256sum package-lock.json 2>/dev/null || shasum -a 256 package-lock.json; } | cut -d' ' -f1)
  if [ ! -d node_modules ] || [ "$(cat node_modules/.lockhash 2>/dev/null)" != "$H" ]; then
    npm ci && echo "$H" > node_modules/.lockhash
  fi
fi
```

`node_modules/.lockhash` に前回 install 時の lock ハッシュを記録し、現在の lock と一致する場合のみ `npm ci` を skip する。`npm ci` は `node_modules` を全消去してから再構築するため、スタンプは clean install 後に書き直され自然に同期する。

ハッシュ取得は `sha256sum`（GNU coreutils、CI の Linux runner にある）を優先し、無い環境（macOS は既定で `sha256sum` を持たず `shasum` のみ）では `shasum -a 256` に fallback する。`2>/dev/null` で `command not found` の stderr ノイズも抑制する。これが無いと mac のローカル開発で `H` が空になり lock 変更検知が無言で no-op 化する（PR #495 レビュー指摘）。

ロジックは `settings.json` インラインではなく **`.claude/scripts/session-install.sh`** に外出しし、フックは `bash .claude/scripts/session-install.sh` で呼ぶ（既存 `PreToolUse` の `test-edit-context.sh` と同方式）。これにより JSON の `\"` エスケープ脆さを解消し、コメントで意図を残せ、shell テストで回帰検知できる。ガードである以上 **陽性対照**が必須（test-gates skill）なため、`tests/meta/session-install.test.ts` で「lock 変更 → `npm ci` 再実行」を検知するテストを併設した。旧実装（`node_modules` 有無のみのガード）に当てると node_modules 常在で再実行されず fail する設計で、検知能力を証明している。

### 却下した選択肢

- **`npm install` へ変更**: 起動レイテンシは下がるが lockfile 改変・別バージョン解決のサプライチェーンリスクを負う。セキュリティ要件と相反するため却下。
- **ガードを外して毎回 `npm ci`**: 最も確実だが起動のたびに clean install が走り遅い。キャッシュの利点を捨てるため却下（必要なら async モードで隠す案は残す）。

### 結果・トレードオフ

- ✅ `npm ci` のサプライチェーン特性（lock 厳密・lock 不変・不整合 fail）を維持
- ✅ lock 不変時は skip しコンテナキャッシュの起動高速化を維持
- ✅ `develop` から依存が変わったブランチに切り替えたとき `npm ci` が再実行され古い依存を解消
- ⚠️ セッション途中の `git checkout` / `git worktree add` は `SessionStart` を発火させないため依然フック対象外（従来どおり手動 `npm ci` が必要。CLAUDE.md §6.2.1）
- ✅ `sha256sum`→`shasum -a 256` fallback で mac ローカル開発でも lock 変更検知が機能
- ✅ ロジックを `.claude/scripts/session-install.sh` に外出しし、`tests/meta/session-install.test.ts` の陽性対照で回帰検知可能にした（JSON エスケープ脆さも解消）

## [091] 2026-05-28 — 正規表現ビジュアライザにマッチテスト機能を追加（PR3）

### 背景

regex-visualizer は PR1（AST + ReDoS）/ PR2（鉄道図）で構造可視化と脆弱性検出を提供してきた。設計時にスコープ外（将来 PR3 候補）としていたマッチテスト（regex101 風のテスト文字列マッチ・キャプチャグループ表示）を追加する。

### 決断

- **マッチ実行は native `RegExp`**: regexp-tree / recheck（CJS・動的 import 必須）と異なり、マッチは native `RegExp` で実行できる。CJS 非依存のため `match.ts` を import ゼロの純粋モジュールとして静的 import する（SSR 安全を維持）。
- **ReDoS 判定でマッチ実行をゲート**: native `RegExp` はメインスレッド同期実行で中断不可。Worker は導入しない（PR1 が CSP の blob Worker 制約で checkSync を選んだ経緯と整合）。判定が **safe=自動ライブマッチ / unknown=明示ボタン + 入力長キャップ（先頭 1000 文字）/ vulnerable=ライブマッチ無効化** とする。入力長キャップは指数時間バックトラッキングを防げない（数十文字でも凍る）ため、vulnerable は実行手段を提供しないのが唯一確実な凍結回避という判断。
- **g フラグ忠実**: g なし=最初の1件のみ、g あり=全マッチ。学習・可視化ツールとして実際の挙動をそのまま見せる（regex101 の「常に全マッチ」とは異なる）。g なし時は「g で全マッチ」のヒントを表示。
- **相互強調はクリック選択**: ハイライト span / 表行クリックで選択し相互強調。ResultTable 内蔵のキーボード操作（Enter/Space）を活かし、hover のみのキーボード非対応を避けた。

### 却下した選択肢

- **Web Worker + タイムアウト**: vulnerable を確実に中断できるが、static worker ファイル + Astro バンドル + 本番 CSP 下 E2E 検証のコストが PR の本筋に対して過大。
- **入力長キャップのみ（常時自動実行）**: 指数時間バックトラッキングは入力長に対し指数的で、長さ制限だけでは凍結を防げない。
- **置換プレビュー（substitution）**: 今回スコープ外（YAGNI）。将来候補。

### 結果・トレードオフ

- vulnerable な正規表現は「短い安全な入力で試す」ことができない（マッチ実行自体を無効化）。誠実な凍結回避を優先したトレードオフ。攻撃文字列は ReDoS パネルに表示済みのためそちらを案内する。
- グループ名解決は pattern を自前走査する `groupNames`（エスケープ・文字クラス・非キャプチャ・先読み/後読みを考慮）で行い、regexp-tree への依存を避けた。

---

## [092] 2026-05-29 — JSON整形・ビューアツールの追加と jsonc-parser の採用

**2026-05-29 | ステータス: 採用**

### 背景

開発者が API レスポンスやログ中の圧縮 JSON を読みやすく整形・確認する需要は高い。既存の `json-xml` / `json-csv`（変換）、`config-converter`（JSON Schema 検証）と重複しない「整形・閲覧・調査」専任ツールとして `json-formatter` を変換・解析カテゴリに追加する。プライバシーファースト（ブラウザ内完結）を活かし「本番の機密 JSON をそのまま貼っても外部送信しない」ことを価値の中心に据える。本 PR は v1（整形 + ツリー + 検証）で、型生成 / 探索クエリ / 機密マスキングは後続 PR でモード追加する方針。

### 決断

- **`jsonc-parser`（v3.3.1、依存ゼロ・MIT）を採用**。`parseTree` を strict オプション（`disallowComments: true` / `allowTrailingComma: false` / `allowEmptyContent: false`）で実行し、`errors` 配列で構文エラーを検知、offset を行・列に変換して日本語メッセージで表示する。
- **整形/最小化は lossless な自前シリアライザ**: `parse → JSON.stringify` の往復は大きな整数（例 `1234567890123456789`）や数値表記（`1.0` / `1e3`）を JS number 化で欠落させる。これを避けるため、`parseTree` の AST を走査しプリミティブは元ソース slice を使うシリアライザ（`format.ts`）で整形・最小化する。
- **const enum を値 import しない**: `jsonc-parser` の `ParseErrorCode` / `SyntaxKind` は `const enum` で、esbuild/Vite ではランタイム未定義になりうる。エラーコード→名前変換は通常関数の `printParseErrorCode` を使い、AST 走査は文字列ユニオンの `Node.type` で分岐する。
- **ツリーは表示専用**: `RegexAstTree` と同方針で `role="tree"` は付けず入れ子リストに留める（トグルは `button` + `aria-expanded`）。各行 hover/focus でパス・値コピーを表示。

### 却下した選択肢

- **native `JSON.parse` + 自前エラー位置算出**: 依存ゼロだが、エンジン差でエラーメッセージ・位置がばらつき、寛容パース（trailing comma 等の区別）や将来の JSON5/コメント許容モードへの拡張性に欠ける。
- **`quicktype-core` 等の重量級ライブラリ**: v1 では不要（型生成は後続 PR）。バンドル肥大のため見送り。

### 結果・トレードオフ

- ✅ 整形・最小化テキストは数値精度・エスケープを保持（lossless）。一方ツリー表示の値は `Node.value`（JS number）由来のため、超大整数はツリー上の表示のみ精度が落ちる（コピー対象の raw / 整形テキストは正確）。
- ✅ `jsonc-parser` は v3.3.1 が 2024-06-24 公開で `.npmrc` の `min-release-age=7` を満たし、`save-exact=true` によりバージョン固定で導入。
- ⚠️ v1 はツリー仮想化なし。大容量 JSON のツリー描画パフォーマンスは後続「機密データ保護」PR で Web Worker + 仮想スクロールとして対応予定。
- 検証（不正 JSON 検知）は検知機構のため陽性対照を併設（`parse.test.ts` / `index.test.ts` / E2E）。

---

## [093] 2026-05-29 — json-formatter に JMESPath クエリ抽出を追加（PR2）

**2026-05-29 | ステータス: 採用**

### 背景

json-formatter（PR #506, v1）の段階リリース第 2 段として、貼った JSON から値を抽出するクエリ機能を追加する（フィルタ条件を含む抽出が要件）。

### 決断

クエリエンジンに **`jmespath`**（v0.16.0、固定）を採用。本番 CSP は `script-src 'self' 'unsafe-inline'`（`unsafe-eval` 無し、`src/utils/csp.ts`）のため、フィルタ式を `eval`/`Function` で評価するエンジンは使えない。jmespath は独自パーサ/インタプリタで eval 非使用＝CSP 安全、約 81KB と軽量、フィルタ・射影・関数に対応する。

- クエリ評価は `src/utils/json-formatter/query.ts` の `runQuery` でラップし、不正式は日本語メッセージに変換。
- クエリは codec の外で `useMemo`＋軽い debounce で評価し、抽出結果は `JSON.stringify(result)` を既存 `processJson` に通して整形/ツリー経路を再利用する。
- エラーは入力 JSON 不正（入力欄下）とクエリ式不正（クエリ欄下）の 2 系統に分離。

### 却下した選択肢

- **`jsonpath-plus`**: JSONPath 構文だが約 644KB と重く、フィルタ評価の safe モードが strict CSP 下で無違反かの実機検証リスクが残る。
- **自作 JSONPath + フィルタ評価器**: 構文・依存ゼロ・CSP 安全を満たすが、式評価器の実装・テスト量が PR2 単体には過大。

### 結果・トレードオフ

- ✅ CSP 安全がエンジン選定時点で確定。E2E（production CSP）でフィルタ式実行時の **CSP 違反ゼロを陽性対照**として検証し、eval 非使用を実機で証明。
- ⚠️ クエリ結果は計算値のため lossless（元ソース slice）対象外で、JSON 数値表現に準拠する（大きな整数は精度欠落しうる）。全体表示（クエリ空）は v1 の lossless 経路を維持。
- 構文は JMESPath（JSONPath とは別）。プレースホルダ・ヒントで例示して吸収する。

---

## [094] 2026-05-29 — json-formatter に機密データマスキングを追加（PR3）

**2026-05-29 | ステータス: 採用**

### 背景

json-formatter 段階リリース第 3 段。ブラウザ内完結を活かし、PII/シークレットを検出して伏字化した「共有用に安全な JSON」を作れるようにする。

### 決断

- **検出方式はキー名 + 値パターンの両方**。キー名規則（password/token/secret 等の部分一致）は値全体を `[REDACTED:SECRET]` に置換。値パターン（EMAIL/JWT/IP/CREDIT_CARD/PHONE_JP）は文字列内の部分一致も置換。
- **マスク表現は種別ラベルプレースホルダー**（`[REDACTED:EMAIL]` 等）。何があったか文脈を残しつつ原値を完全に隠す。
- **誤検出しやすい種別（CREDIT_CARD/PHONE_JP）は種別トグルで個別 off 可能**。CREDIT_CARD は Luhn 検証で誤検出を抑制。
- 実装は純関数 `maskValue`（`src/utils/json-formatter/mask.ts`）。マスク結果は `JSON.stringify` → 既存 `processJson` に通し表示経路を再利用（PR2 と同方式）。クエリ有効時は抽出結果をマスク対象にする。依存追加なし・CSP 影響なし。

### 却下した選択肢

- **完全伏字（`\***`）/ 部分マスク（`ab**\*@`）**: 前者は種別が分からず、後者は残部から原値が推測されるリスク。種別ラベル方式を採用。
- **大容量対応（Web Worker + 仮想スクロール）を同梱**: 独立 subsystem かつ CSP（blob worker 不可）で別途設計を要するため別 issue に分離。

### 結果・トレードオフ

- ✅ test-gates 陽性対照で「原値が出力に一切残らない」を単体・E2E（production CSP）で保証。
- ✅ 数値で格納された機密（例 `{"card": 4111111111111111}`）も検出する。`2^53` 未満の整数は lossless に round-trip するため文字列値と同じパターンを `String(value)` に適用し、置換時のみプレースホルダー文字列化する（非機密の数値は型を保持）。レビュー #513 で発覚した false-negative を修正。
- ⚠️ 正規表現ベースのため検出は完全ではない（未知形式の PII は漏れうる）。マスク結果は計算値で lossless 非対象（JSON 数値準拠）。
- **既知の制約（後続課題）**:
  - **値パターンはキー名ではなく値のみ対象**。`{"taro@example.com": "online"}` のようにキー自体が PII の場合は残る（キー名規則は機密キーの「値」を隠す用途）。
  - **IP は IPv4 のみ**。IPv6（`2001:db8::1` 等）は未対応。
  - 検出種別の拡張・カスタム正規表現・大容量対応（issue #512）は後続課題。

---

## [095] 2026-05-29 — json-formatter に TypeScript 型生成を追加（PR4）

**2026-05-29 | ステータス: 採用**

### 背景

json-formatter 段階リリースの最終段（クエリ・マスク・型生成の 3 軸の最後）。実 API レスポンスを貼って TypeScript 型を起こす機能を、ブラウザ内完結で提供する。

### 決断

- **エンジンは自作エミッター**（`src/utils/json-formatter/type-gen.ts`、依存ゼロ・CSP 影響なし・小バンドル）。`inferType` で全要素マージ推論（欠けキー→optional、型違い→union、空配列→`unknown[]`）、`generateTypeScript` でネスト object を別 interface に切り出して命名（PascalCase・衝突サフィックス・配列要素 +Item）。
- **スコープは TypeScript のみ**。Go struct / Zod は推論コアを再利用して後続で追加可能。
- 基準値はクエリ有効なら抽出結果、無ければ入力全体（mask と共有）。マスクは適用せず実構造から型を起こす。

### 却下した選択肢

- **`quicktype-core`**: 多言語対応だが unpacked 2.3 MB と重く、TS-only の v1 にはオーバーキル。
- **`json-to-ts`**: TS 専用だが 2017 年製で `es7-shim` 等 3 依存を持ち込み、将来 Zod に使い回せない。

### 結果・トレードオフ

- ✅ 依存ゼロ・CSP 安全・小バンドル。推論コアと emitter を分離し将来の Go/Zod 追加に再利用可能。
- ⚠️ 推論は構造ベースで、リテラル型・enum・日付等の意味推論は行わない。
- `JsonFormatter.tsx` が 4 モード（text/tree/mask/type）＋クエリで肥大化。モード切り出し refactor は別 issue に分離。

---

## [096] 2026-05-29 — json-formatter のツリー遅延構築と大入力ガード（#507 / #512 一部）

**2026-05-29 | ステータス: 採用**

### 背景

`processJson` が表示モードに関係なく毎回 `buildTree` を実行し（#507）、巨大 JSON のツリー表示で全ノード DOM 化により凍結する（#512）。

### 決断

- **ツリー遅延構築**: `processJson` の即時 `tree` を `makeTree: () => TreeNode` サンクに置換。コンポーネントは `view==='tree'` の `useMemo` でのみ構築する。`view` を codec deps に入れないことで、#507 が懸念した表示切替時の debounce ラグを回避。
- **大入力ガード**: 整形済みテキスト長が 500_000 文字を超えるときはツリーを自動構築せず「保留→[ツリーを表示]ボタン」で明示構築させ、巨大ツリーの DOM 凍結を回避。`displayOutput` 変化で force をリセット。
- **measure-first で据え置き**: 重い処理の同一オリジン Worker オフロードとツリー仮想化（#512 本体）は、遅延＋ガードで主要な無駄・凍結が解消されるため、実測で必要性を確認してから別サイクルとする（YAGNI）。`getNodeValue`(value) の遅延化も同様に据え置き。

### 結果・トレードオフ

- ✅ テキスト/マスク/型表示中はツリーを構築しない。巨大入力でも自動凍結しない。
- ⚠️ 閾値超のツリーは明示操作後に構築するため、強制表示すると依然重い（仮想化は後続）。閾値は整形済み長の単純指標で、ノード数とは厳密一致しない。
- ツリー仮想化 / Worker オフロードは #512 残として follow-up。

---

## [097] 2026-06-01 — CopyButton と compact ボタンの角丸を rounded-lg に統一（issue #320 / c案）

**2026-06-01 | ステータス: 採用**

### 背景

PR #318 後も `CopyButton`(default) は `rounded`(0.25rem)、`ActionButton`(size="compact") / `DownloadButton` は `rounded-lg`(0.5rem) で border-radius が不一致だった。class 名 assert ベースの unit test では片方だけ変わる silent drift を検出できない問題があった（issue #320）。

### 決断（c案）

- **rounded-lg に統一**: CopyButton 側を 0.25rem → 0.5rem に上げ、ActionButton compact / DownloadButton に揃える。プロジェクトの主流は rounded-lg。
- **共有定数化**: `src/components/ui/_compactButton.ts` に `COMPACT_BUTTON_SHAPE_CLASSES = 'rounded-lg font-bold px-3 py-2 leading-none'` を切り出し、`ActionButton`(compact 経路) と `CopyButton`(default 経路) の両方から import して使う。
- **cross-component drift 検知テスト追加**: `src/components/ui/__tests__/compact-button-radius-drift.test.tsx` で両コンポーネントの compact token 集合が一致することを assert。陽性対照テスト（旧実装 rounded に戻すと fail するテスト）を同ファイル内別 describe に併設（test-gates 準拠）。

### 結果・トレードオフ

- ✅ 両コンポーネントの角丸が共有定数で一元管理され、以降の一方の変更は即座に test fail で検知される。
- ✅ CopyButton 固有（caption / tracking-wide / gap-1.5 / btn-copy 等）・ActionButton 固有（btn-action / variant class 等）のクラスは各自に残し、共有するのは「compact 高さ + 角丸」部分のみ。
- ⚠️ CopyButton の見た目（角丸）が変わるため VRT baseline 差分が発生する。CI Linux runner の `Update Visual Regression Baseline` workflow を workflow_dispatch で再生成が必要（ローカル不可）。

---

## [098] 2026-06-05 — GS1 DataBar 印刷実寸を SVG 属性で指定（CSP style-src 撤去と両立）

**2026-06-05 | ステータス: 採用**

### 背景

GS1 DataBar 生成ツールに A4 印刷機能を追加するにあたり、バーコードを mm 実寸で印刷する必要がある。プリンタ DPI に依存しない実寸指定が必須だが、本プロジェクトは CSP `style-src 'unsafe-inline'` を撤去済み（issue #176）のため、JSX の `style={{}}` や `el.style.setProperty` による動的サイズ指定は使用できない。

### 決断

- **SVG ルート要素の presentation attribute（`width`/`height` 属性）で mm 値を指定する**（例: `<svg width="52.14mm" height="13.20mm" ...>`）。SVG presentation attribute は CSS inline style ではなく HTML 属性であるため、CSP `style-src` の制約対象外。
- `setSvgPrintSize(svg, xdimMm, scale=3)` 関数を `src/utils/gs1-databar.ts` に追加。bwip-js の `scale: 3`（1 モジュール = 3px）を基準に `factor = xdimMm / scale` で mm/px 換算し、viewBox の W/H にかけて width/height 属性を mm 値に置換する。
- 列数（1/2/3）は静的 CSS クラス `.print-grid--cols-1/2/3` を `className` で切替えるだけにし、動的 inline style を一切使用しない。

### X-dimension プリセット根拠（GS1 General Specifications 準拠）

| プリセット | X-dim (mm) | 用途                                     |
| ---------- | ---------- | ---------------------------------------- |
| 小         | 0.330      | GS1 DataBar target X-dim（密集配置向け） |
| 中         | 0.495      | 標準的な流通用途                         |
| 大         | 0.660      | 一般流通の上限付近（カメラ距離向け）     |

全体を同一 factor で拡大するため、合成シンボルの text/quiet zone を含んでもリニア部のモジュール幅は常に xdimMm に一致する。

### 却下した選択肢

- **CSS custom property (`--print-width: 52.14mm`) を `@layer components` に動的注入**: `useDynamicStyleSheet` 経由で constructable stylesheet に書き込む手法（ToggleGroup の実装と同様）も CSP 準拠だが、印刷用途では SVG 自体が寸法を持つほうがシンプルで外部依存が少ない。
- **`style={{}}` JSX inline style**: CSP 違反（`style-src 'unsafe-inline'` 不在）のため却下。
- **`position: absolute; inset: 0` + `body * { visibility: hidden }` の単ページ前提パターン**: 印刷の定番パターンだが、絶対配置コンテナは Chrome 等で **2 ページ目以降がクリップされ印刷されない既知挙動**がある。`MAX_CARDS = 10` × 大サイズ（0.66mm）× 1 列だと A4 印刷可能高さ（約 273mm）を超え多ページになるため、10 件バッチ印刷で末尾がサイレントに欠落する。これを避けるため、印刷コンテナを `createPortal` で `document.body` 直下へ出し、`@media print` で `body > *:not(.print-area) { display: none }` により兄弟（ページ chrome）を隠して `.print-area` を**通常フロー配置（position:static）**でページ送りさせる方式に変更した（PR レビュー指摘で修正）。`createPortal` は Astro `client:load` の SSR で `document` 不在で落ちるため、`mounted` フラグで mount 後に限定する。

### 結果・トレードオフ

- ✅ CSP `style-src 'unsafe-inline'` なしで mm 実寸印刷が実現できる。
- ✅ `setSvgPrintSize` の出力は画面表示用 SVG とは別物であり、`svgContentToPngBlob`（`width="(\d+)" height="(\d+)"` px 隣接 contract）には渡さない設計を JSDoc で明記。
- ✅ 印刷コンテナを `createPortal` で body 直下へ出し通常フロー配置にしたことで、**複数ページ印刷でも 2 ページ目以降がクリップされない**（10 件バッチ印刷の正当利用に対応）。
- ⚠️ 大サイズ（0.660mm）× 3 列は A4 印刷可能**幅**（約 186mm）を超過し得る。これは幅方向の別問題で portal では解決しない。UI に「大サイズは 1〜2 列を推奨」ヒントを表示するがハードな制限は設けない（MVP）。
- ⚠️ 操作バーに印刷コントロールが追加されるため VRT baseline の更新が必要。CI Linux runner の `Update Visual Regression Baseline` workflow を明示承認後に dispatch すること（ローカル不可）。

---

## [099] CIDR/サブネット計算機: 外部ライブラリなし・BigInt 統一設計 (PR1, 2026-06-06)

### 課題

IPv4（32bit）と IPv6（128bit）のアドレス演算を、安全かつブラウザ完結で実装する方法を選定する。

### 選定理由

**ブラウザ完結の必然性**: CIDR 計算は入力データ（プライベート IP やインフラ構成）を含む。外部 API へ送信しない設計はプロダクトコアバリュー（`SPEC.md 1.3`）に必須。

**BigInt 採用理由**: IPv4 は 32bit、IPv6 は 128bit であり、JavaScript の `number` 型（53bit 精度）では IPv6 の全アドレス空間を精度損失なく扱えない。`BigInt` はブラウザ標準 API で依存追加が不要。マスク計算・ビット演算が直感的に記述できる。

**外部ライブラリ不採用**: `ip-address` / `ipaddr.js` 等の OSS は機能が豊富だが、今回必要なのは parse/format/mask 演算のみ。自実装のほうがバンドルサイズを抑えられ、依存バージョン固定ポリシー（`docs/decisions.md [036]`）の管理コストも発生しない。

**IPv4/IPv6 統一設計**: 両バージョンを同じ `BigInt` 表現で扱うことで、計算ロジックの大半（mask/network/host-range）を共通化できる。型 `IpVersion = 4 | 6` で分岐を最小限に絞った。

### 却下した選択肢

- **`number` 型で IPv6 演算**: 128bit を上位・下位 64bit の 2 分割で扱う実装も可能だが、ビット演算が複雑化し誤りを招きやすい。
- **`ip-address` npm パッケージ**: 機能過剰・バンドルサイズ増加・依存管理コスト。

### 結果・トレードオフ

- ✅ IPv4/IPv6 を BigInt で統一的に扱い、シンプルなロジックで正確なネットワーク計算を実現。
- ✅ 外部依存ゼロでブラウザ完結を維持。
- ⚠️ IPv4-mapped IPv6（`::ffff:x.x.x.x`）は BigInt にパースできるが、フォーマット時に IPv4 形式には戻さない（表示は純 IPv6）。

---

## [100] 2026-06-10 — テスト陽性対照強化 (#316/#324/#334)（issue #533）

### 課題

以下の 3 つのテスト / CI 設定に「検知機構が壊れても green が継続する」陰性対照のみの設計が残っていた:

- **#316**: `meta-csp.test.ts` の Astro island inline style hash 整合性テストが、定数 `ASTRO_ISLAND_INLINE_CONTENT` を hardcode して比較する 2 段構造だったため、Astro が inline style 文字列を変更しても旧 hash を `_headers` に残したまま陰性対照で素通りする危険があった。
- **#324**: `visual-regression.yml` の「PR comment 本文を組み立て」step は VRT 失敗時のみ通る経路で CI 実証手段がなく、`( ... ) || true` による regression 修正が正しいかを手元で確認する手段がなかった。
- **#334**: `update-visual-baseline.yml` の secret env audit step は陰性対照のみで、grep パターンが壊れても silent pass するリスクがあった（`FAKE_API_KEY` を注入して検知を確認する陽性対照が欠如）。

### 決断

**#316（dist 直読化）**: `meta-csp.test.ts` の integrity テストを dist HTML から `<style>` 中身を全件抽出して sha256 を計算する 1 段構造に書き換え。dist と `_headers` を直接比較する設計で定数の二重管理を排除。「dist に inline style が少なくとも 1 件存在する」assert を陽性対照として追加し、抽出 regex が 0 件で空回りする偽 green を防止。

**#324（陽性対照スクリプト）**: `scripts/test-vrt-comment-build.sh` を新設し、workflow 内の失敗 spec 抽出 pipeline を bash 環境で再現。陰性対照 2 件（空 log / fixture log）に加え、`|| true` を外した旧実装で空 log を流したとき pipeline が確実に中断することを assert するケース C（陽性対照）を追加。`tests/meta/vrt-comment-build-script.test.ts` で `npm run test` に自動組み込み。

**#334（案 1: 別 workflow + 週次 cron）**: `.github/workflows/test-baseline-audit.yml` を新設し、`FAKE_API_KEY=sentinel-value-not-a-real-secret` を job env に注入した状態で audit pipeline を実行。FAKE_API_KEY が検知されなければ `::error::` で fail させる（陽性対照）。さらに FAKE_API_KEY を除外した step で GH Actions runtime 由来 env が allow list で正しく除外されることを確認（陰性対照）。inline 複製した grep パターンの drift は `tests/meta/baseline-audit-positive-control.test.ts` が `npm run test` で自動検知する。

### 案 2・案 3 を却下した理由（#334）

- **案 2（composite action 化）**: action の抽象化により grep パターンを DRY にできるが、workflow のステップを action でラップすると `env:` コンテキストが変わり sentinel 注入の設計が複雑化する。メンテナンスコストが案 1 を上回ると判断。
- **案 3（bats 導入）**: bash 専用テストフレームワークを導入すれば表現力が上がるが、npm 管理の vitest と二重管理になる。小規模な検証に対してオーバーエンジニアリング。

### inline 複製を meta テストで drift guard する判断

`test-baseline-audit.yml` は `update-visual-baseline.yml` の grep パターンを「一字一句同一」で inline 複製している。DRY でないことは意図的なトレードオフで、以下の理由から許容する:

- grep パターンは短く変更頻度が低い（audit 対象の secret 命名規則が変わった場合のみ更新）。
- `tests/meta/baseline-audit-positive-control.test.ts` が両 workflow のパターンを抽出して完全一致を assert するため、drift は `npm run test` で即時検知できる。
- composite action 化より運用が単純で、CI 設定追加の安全性も高い（`permissions: contents: read` のみ、sentinel は実 secret でない）。

### 結果・トレードオフ

- ✅ #316: dist HTML から直接 hash を計算する設計で定数の二重管理を排除。Astro の inline style 変更を自動検知。
- ✅ #324: pipeline の `|| true` 有無の違いをケース C が実証し、regression クラス全体をテストハーネスが検知できることを証明。
- ✅ #334: 週次 cron と `workflow_dispatch` の両建てで、audit step の silent drift を定期自動確認。meta テストで grep パターンの inline 複製 drift を CI から検知。
- ⚠️ #334: `test-baseline-audit.yml` の陰性対照（Step 2）は shell の `unset FAKE_API_KEY` で「env に存在しない」状態を再現する。step env で `FAKE_API_KEY: ''` と空文字上書きする案はレビューで却下した — GH Actions は空文字でも env var を set するため `env` 出力に `FAKE_API_KEY=` が残り、detect パターン（`...KEY=` 接尾辞マッチ）に必ずマッチして陰性対照が常時 fail する。

---

## [101] web セッションの Playwright Chromium 確保は SessionStart hook で行う (2026-06-10)

### 課題

Claude Code on the web で Playwright スクリーンショット / E2E を使うため、環境セットアップスクリプトに `npx -y playwright install chromium` を設定したが、セッション開始時点でブラウザ（このリポジトリの Playwright 1.59.1 が要求する build 1217）が `/opt/pw-browsers/` に存在しなかった。ベースイメージ焼き込みの build 1194 はバージョン不一致で使われない。

### 原因分析

環境セットアップスクリプトはコンテナ作成時（SessionStart hook の `npm ci` より前）に走るため、`npx -y playwright` が playwright パッケージ自体の npm registry 取得から始まる。ネットワーク許可構成によってはブラウザダウンロード以前に失敗し、`set -e` でスクリプト全体が異常終了する。どの home の `~/.cache/ms-playwright` にも痕跡がないことから、別パスへのインストールではなく実行自体が完了していないと判定。

### 選定理由

`.claude/scripts/session-install.sh`（SessionStart hook、動作実績あり）の `npm ci` 後に `CLAUDE_CODE_REMOTE=true` ガード付きで `npx playwright install chromium` を追加。

- **npm ci 後**なので lock 固定版 playwright が使われ、必要なネットワークは `cdn.playwright.dev` のみ。
- **`CLAUDE_CODE_REMOTE` ガード**で web セッション限定。ローカル開発者の playwright cache には触れない。
- install 済みなら即 no-op（実測 約3秒）。web はフック完了後のコンテナ状態キャッシュにより約 280MB のダウンロードは環境ごとに実質 1 回。

### 却下した選択肢

- **環境セットアップスクリプトの修正続行**: 環境側 UI でしか管理できずリポジトリで再現・レビューできない。registry 許可の追加も環境ごとの手作業になる。
- **ガードなしで hook に追加**: ローカルセッションでもブラウザダウンロードが走り、開発者のローカル環境を汚染する。

### 結果・トレードオフ

- ✅ web セッションで Playwright スクリーンショット撮影・E2E 実行が再現可能に。
- ⚠️ 環境側のセットアップスクリプト（`npx -y playwright install chromium`）は不要になるため削除してよい。

---

## [102] リンク用ユーティリティクラスを semantic 命名に統一（.text-link-color → .text-link-plain）（2026-06-10）

### 課題

PR #116 で新設した `.text-link-color` クラスは「色のみを制御する」という **属性ベース命名** であり、クラス名を見ただけでは「下線なし」という利用意図が読み取りにくかった。また、既存の `.text-link`（下線あり汎用リンク）との命名上の対比が不明確だった。

### 決断

`.text-link-color` を **`.text-link-plain`** に改名する。

- `.text-link`（下線あり）と `.text-link-plain`（下線なし）で **用途ベースの一貫したペア** が成立する。
- BEM modifier 形式（例: `.text-link--no-underline`）ではなく独立クラス名にした理由: 実態として `.text-link` と `.text-link-plain` は**併用されず単独で使われている**。modifier 表記は「base クラスとの併用」を示唆するため、用途を誤解させる可能性がある。

### 変更対象

- `src/styles/global.css`（セレクタ 3 件 + コメント）
- `src/components/ui/InputField.tsx`
- `src/components/ui/ToolCard.astro`
- `src/components/tools/JsonFormatter.tsx`（2 件）
- `src/components/tools/JsonTreeResult.tsx`
- `src/components/tools/ConfigConverter.tsx`
- `src/components/tools/TotpHotpGenerator.tsx`（3 件）
- `src/components/tools/Gs1Databar.tsx`
- `src/components/tools/qr-ticket/GenerateTab.tsx`
- `tests/e2e/link-styles.spec.ts`

### 結果・トレードオフ

- ✅ 命名規則が用途ベースで一貫し、新規実装者が `.text-link` / `.text-link-plain` のどちらを使うべきか直感的に判断できる。
- ✅ 挙動・見た目は不変（純粋な rename）。
- ℹ️ `docs/superpowers/plans/` / `docs/superpowers/specs/` 配下の point-in-time 履歴記録は変更対象外（旧名が残るが意図的）。

---

## [103] 2026-06-11 — json-formatter ツリーの行数閾値仮想化（#512 残スコープ①）

**2026-06-11 | ステータス: 採用**

### 背景

decisions [096] のツリー遅延構築 + 500KB ガード後も、ガードを明示解除した巨大ツリーは全ノード再帰 DOM 化で重く、ガード未満（数百 KB）でも数万ノードで描画・操作が重い（issue #512 残スコープ）。

### 計測（measure-first）

5000 要素の配列（全展開換算 約 60,000 行・整形済み 500KB 超）での実測（Playwright MCP / preview ビルド / 2 回計測）:

| 指標                       | before（全行 DOM 化） | after（仮想化） |
| -------------------------- | --------------------- | --------------- |
| 強制表示 → ツリー出現 (ms) | 5,307                 | 44              |
| DOM 行数 (li.json-row)     | 45,001                | 39              |
| 全折りたたみ応答 (ms)      | 2,666                 | 53              |

（before: Run1 renderMs 5484 / collapseMs 2694、Run2 renderMs 5129 / collapseMs 2638。after: Run1 renderMs 64 / liCount 39 / collapseMs 52、Run2 renderMs 24 / liCount 39 / collapseMs 53）

### 決断

- **行数閾値で仮想化**: 全展開換算の総行数（`countRows`）が `TREE_VIRTUALIZE_THRESHOLD = 2_000` 超のとき `JsonTreeViewVirtual`（自前 windowing）へ切替。以下は従来の再帰ツリーのまま（DOM・見た目・VRT 不変）。
- **自前 windowing 採用**: 行は等高（1 行固定・nowrap）・固定高コンテナ（28rem）という最も単純なケースで、可視範囲計算は純粋関数 `computeWindow` 1 つ。`@tanstack/react-virtual` は公式パターンが全可視行の inline style（transform/height）前提で CSP `style-src 'unsafe-inline'` 撤去（#176）と衝突し、依存 2 パッケージ追加の割に提供価値が薄いため不採用。
- **spacer は SVG height 属性**: 範囲外の高さは aria-hidden な li 内の SVG presentation attribute で表現（decisions [098] と同方式・CSP 対象外）。`useDynamicStyleSheet` は `useEffect` 経由で描画より 1 フレーム遅れスクロールジッターが出るため不採用。
- **開閉状態の XOR 集中管理**: 「デフォルト開閉からの反転 行キー集合」で保持し、全折りたたみ時の全キー列挙を回避。全展開/全折りたたみは既存の key 再マウント方式を踏襲。行キーは「親の行キー + 相対セグメント + 兄弟内出現回数 `#n`」で構成し、重複キーがなければ path と一致する。重複キー JSON（strict パースでも構文エラーにならない）では兄弟の path も、重複親が同名の子を持つ場合の cousin の path も衝突するが、兄弟は親ごとの局所採番・cousin は親キー連鎖（`$.a.b` と `$.a#1.b`）で区別されるため、他 subtree の開閉に影響されず安定する（PR #622 レビュー・再レビュー指摘で対応）。
- **500KB ガードは維持**: ツリー構築（makeTree）自体のメインスレッド同期コストは仮想化では解消しない。Worker オフロードと `getNodeValue` 遅延化は #512 残スコープとして継続。

### 結果・トレードオフ

- ✅ 閾値以下の通常入力は DOM・見た目とも完全不変（VRT baseline 更新不要）。
- ✅ 陽性対照 E2E（DOM 行数 < 総行数）を配線前に実行して fail（liCount 4501）を実機確認済み（test-gates 準拠）。
- ⚠️ 仮想パスでは入れ子 ul の罫線（インデントガイド）を省略し depth ベースの spacer で代替。
- ⚠️ 仮想パスは可視行のみ DOM 化するため、ブラウザのページ内検索（Ctrl+F）は画面外の行にヒットしない。
- ⚠️ 仮想パスはフラット ul のため、入れ子 ul が伝えていたリストのネスト（深さ）情報がスクリーンリーダーに伝わらない（表示は depth ベースのインデントのみ）。両ビューとも表示専用で `role="tree"` を付けない方針（RegexAstTree と同じ）の範囲内だが、仮想パス固有の後退として記録。将来 `aria-level` 等の付与を検討する場合は仮想パス側から。
- ⚠️ キーボード操作中にフォーカス中の行が可視範囲外へスクロールアウトすると行ごと unmount され、フォーカスが body へ落ちる（windowing の既知制限。巨大入力時のみ・対応保留）。
- ⚠️ spacer の SVG はブラウザの要素高上限（Firefox 約 17.8M px ≒ 行高 24px で約 74 万行）を超えると破綻する理論上限がある。500KB ガード強制解除時のみ到達し得る規模のため現状対応不要だが、Worker オフロード導入でガード緩和を検討する際に再評価する。

## [104] 2026-06-11 — json-formatter 重い処理の Worker オフロードは見送り（#512 残スコープ②・measure-first no-go）

**2026-06-11 | ステータス: 不採用（measure-first により見送り）**

### 背景

issue #512 の残スコープ②として、parse / format / mask / query（+ makeTree / type-gen）の同一オリジン静的 Worker オフロードを検討。メインスレッド同期実行による大入力時フリーズの解消が目的。decisions [096] の方針どおり measure-first で、実装前に「どの処理が実際にフリーズ要因か」「postMessage の structured clone 往復コストを差し引いても Worker 化が得か」を実測した。

### 計測（measure-first）

Node v22 で各純粋関数の CPU 時間（中央値）と `structuredClone` の往復コストを実測。`正味便益 = CPU − (clone_in + clone_out)`。判定基準: 大入力で CPU > 約 50ms（long task / INP 閾値）をフリーズ要因、正味便益が明確に正（目安 2 倍ヘッドルーム）なら Worker 対象。詳細表とフィクスチャ定義は `docs/superpowers/specs/2026-06-11-json-formatter-offload-measurement.md`。

| 処理                | 1.4MB CPU | 14.5MB CPU | 正味便益(14.5MB) | 判定                                                                                         |
| :------------------ | --------: | ---------: | ---------------: | :------------------------------------------------------------------------------------------- |
| parseJson           |      30ms |      407ms |         -1,286ms | no-go（返す Node AST の clone が CPU の約 5 倍。jsonc-parser の親参照で循環し clone が爆発） |
| buildTree           |      15ms |      130ms |           -608ms | no-go（TreeNode の clone_out が CPU を大幅超過）                                             |
| maskValue           |      12ms |          — |                — | no-go（最大 22ms で 50ms 閾値未達）                                                          |
| runQuery            |     0.4ms |          — |                — | no-go（CPU < clone_in の 1/20。桁違いにオーバーヘッド負け）                                  |
| formatJson / minify |      10ms |   103/86ms |        +94/+78ms | ~15MB+ でのみ go（string→string で clone 最小）                                              |
| generateTypeScript  |      39ms |      293ms |           +159ms | ~15MB+ でのみ条件付き go（clone_in 134ms でヘッドルームぎりぎり）                            |

ブラウザ実測（native JSON 代理・throwaway Playwright）では ~1.4MB〜~3MB で long task 未発生。Blob Worker は本番 CSP（`worker-src 'self'`）で塞がるため往復は `structuredClone` で近似。

### 決断

- **Worker オフロードは実装しない（見送り）**。素直なオフロードは structured clone の往復コストに負けて逆効果。フリーズが実際に起きる大入力（~15MB+）で唯一成立する設計は「parse+format/minify を Worker 内で完結し**文字列だけ返す**」案だが、これは整形/minify のみ救い、ツリー表示・mask・query は救えない（構造を main に戻す時点で clone に負ける）。PR #622 の仮想化後、現実的サイズ（数 MB）では恩恵が限定的で、適用ユーザーも狭いため YAGNI で見送る。
- **計測レポート + 再現用ベンチを成果物として残す**。`offload.bench.ts`（vitest、`npm run test` の glob 外で CI 非汚染）と `fixtures.ts` をコミットし、将来 ~15MB+ 対応が要件化したときに数値から再判断できるようにする。

### 結果・トレードオフ

- ✅ 空振り実装（複雑な Worker 通信基盤）を回避。measure-first の本来の使い方で対象を数値で除外できた。
- ✅ ベンチは `.bench.ts` で `npm run test` の include glob（`*.test.{ts,tsx}`）外。CI を汚染しない。実行は `npx vitest bench src/utils/json-formatter/__tests__/offload.bench.ts`。
- ⚠️ 超大入力（~15MB+）を将来サポートする場合は、本ベンチの数値を起点に「parse+format を Worker 内完結・文字列返し」の狭い設計から再検討する（別 issue/サイクル）。
- ⚠️ ブラウザ実測は実 `parseJson`(jsonc-parser) でなく native `JSON.parse`/`stringify` を代理に使ったため、実パスの long task 有無は厳密には未検証。ただし同一 V8 エンジンの Node 実関数値で像は確定しており、結論は変わらない。

## [105] 2026-06-11 — json-formatter getNodeValue の遅延評価は見送り（#512 残スコープ③・measure-first no-go）

**2026-06-11 | ステータス: 不採用（measure-first により見送り）**

### 背景

issue #512 の任意スコープ③。`processJson` は入力が変わるたび `value: getNodeValue(root)` を eager 評価して `meta.value` に格納するが、`meta.value` を読むのは query 入力時 / mask ビュー / type ビューのみ。デフォルトの text ビューと tree ビューでは一切使われない（text は整形文字列、tree は `buildTree`）。つまり最頻パスで「毎キーストローク計算されるが読まれない無駄仕事」になっており、消費する view のときだけ評価する遅延化（thunk 化）がフリーズ削減に効くかを decisions [096]/[104] と同じ measure-first で実測した。

### 計測（measure-first）

Node v22、ウォームアップ後 10 回中央値。判定基準は [104] と同じ「大入力で CPU > 約 50ms（long task / INP 閾値）」。再現: `npx vitest bench src/utils/json-formatter/__tests__/getnodevalue.bench.ts`。

| サイズ             |   parse | format | getNodeValue | 必須計(parse+format) | 無駄率 | long task |
| :----------------- | ------: | -----: | -----------: | -------------------: | -----: | :-------- |
| ~1.4MB (n=5,000)   |  30.6ms |  7.8ms |    **2.2ms** |               38.4ms |   5.8% | no        |
| ~2.9MB (n=10,000)  |  54.7ms | 16.4ms |    **4.9ms** |               71.0ms |   6.9% | no        |
| ~14.5MB (n=50,000) | 351.9ms | 89.7ms |   **40.9ms** |              441.6ms |   9.3% | no        |

### 決断

- **getNodeValue の遅延評価は実装しない（見送り）**。無駄仕事であることは確認できたが規模が小さい: 最大 14.5MB でも 40.9ms で long task 閾値 50ms 未達、現実的サイズ（≤3MB）では ≤5ms のノイズレベル。真のボトルネックは parse+format（必須計の 90%+）で、これは整形文字列を常に表示する以上どの view でも遅延できず、getNodeValue 遅延化ではフリーズは消えない。なお絶対値はマシン依存（遅い環境の再計測では 14.5MB で 87ms と閾値超えの例あり）だが、その環境でも必須計は 13 倍の 1,128ms であり、無駄率ベースの論拠（parse+format 支配）はハードウェア非依存で結論は不変。
- 再現用ベンチ `getnodevalue.bench.ts` を成果物として残す（[104] の `offload.bench.ts` と同じ流儀・`npm run test` の glob 外）。

### 結果・トレードオフ

- ✅ issue #512 の全スコープ（①仮想化=実装 / ②Worker=no-go / ③getNodeValue 遅延化=no-go）が measure-first で決着。
- ⚠️ `makeTree` は thunk で遅延化済みなのに `value` だけ eager という非対称は残る。整合性のための thunk 化（~15 行）は安価だが、数値上の便益がノイズレベルのため YAGNI で見送り。将来 `processJson` 周りを触る機会があれば ride-along で揃えてよい。

## [106] 2026-06-11 — Web セッションの enabledPlugins 自動 install を SessionStart hook で再導入

**2026-06-11 | ステータス: 採用**

### 背景

`.claude/settings.json` の `enabledPlugins`（superpowers / frontend-design / context7）は Claude Code on the web で silent skip され（trust dialog 非発火、upstream #23737）、superpowers のスキル群が web セッションで使えなかった。PR #204 で hook 自動化を試みた際は `claude plugin install` が `not found in marketplace` で失敗し「手動 install 運用」に確定していた。

### 再検証で判明したこと（2026-06、Claude Code 2.1.173）

- 現行の Claude Code は**セッション開始時に `extraKnownMarketplaces` を `~/.claude/plugins/marketplaces` へ自動 clone する**ようになっており、PR #204 当時の失敗原因（marketplace 未解決）が解消。web コンテナの hook から `claude plugin install` が 3 プラグインとも成功することを実機確認。
- superpowers は marketplace 同梱でなく外部 repo（`obra/superpowers.git`、sha pin）から clone される external プラグインで、install 実行なしでは実体が取得されない（これが「marketplace clone はあるのにスキルが無い」状態の正体）。
- `claude plugin install` は冪等（install 済みなら "already installed" で exit 0、再 clone なし）。

### 決断

`.claude/scripts/session-install.sh`（SessionStart hook）に web 限定（`CLAUDE_CODE_REMOTE=true`）の enabledPlugins 自動 install を追加。プラグイン一覧は `.claude/settings.json` から動的に読む（ハードコードによる宣言との drift を防止）。失敗は warn のみで非致命（npm ci / playwright install の結果に影響させない・次セッション再試行で self-healing）。meta テスト（`tests/meta/session-install.test.ts`）に fake claude による陽性対照・陰性対照を併設し、旧実装で fail することを確認済み。

### 結果・トレードオフ

- ✅ 各環境 1 回の手動 `/plugin install` 運用が不要になる（手動コマンドはフォールバックとして docs に残置）。
- ⚠️ スキルのロードはセッション開始時のため、**新規コンテナの初回セッションでは未反映**。コンテナ状態キャッシュ（`~/.claude/plugins` 含む）により同一環境の次セッション以降で有効。
- ⚠️ CLI / Desktop は従来どおり trust dialog の自動 prompt に委ね、hook では触らない（開発者ローカルの user scope 状態を hook が暗黙に書き換えない）。
- ⚠️ context7 の MCP は web では egress 403 の別制約が残る（decisions [059]、リポジトリ側で解消不可）。

## [107] 2026-06-11 — シークレットスクラバーを独立モジュール（secret-scrubber/）として実装

**2026-06-11 | ステータス: 採用**

### 背景

`docs/tool-candidates.md` S2-1「シークレット/ログマスキング」の実装。LLM・Issue への貼り付け前の機密除去ユースケース。既存の `src/utils/json-formatter/mask.ts` は JSON 構造の値走査に特化しており、テキスト全文への正規表現適用・一貫トークン化・優先度付き重複解決といった要件が異なるため、独立モジュール（`src/utils/secret-scrubber/`）として新設した。

### 決断

1. **独立モジュール方針**: `json-formatter/mask.ts` とは要件が根本的に異なる（JSON 値走査 vs テキスト全文走査、固定プレースホルダ vs 一貫トークン化連番）ため、統合せず独立モジュールとした。共通基盤化（S2-3）は将来判断。

2. **プレースホルダ形式 `[REDACTED:<CATEGORY>_<n>]`**: 既存の `[REDACTED:EMAIL]`（固定）と家族的整合性を保ちつつ、同一カテゴリ内の異なる値を連番で区別できる形式を採用。同一値は同一番号（一貫性）。

3. **エントロピー閾値 base64 ≥ 4.0 / hex ≥ 3.0**: 実測ベースで選定。低すぎると平文の単語で誤検出、高すぎると本物のシークレットを取りこぼす。hex はアルファベット種が少ないため base64 より低い閾値を設定。UUID は識別子の可能性が高くノイズになるため除外。

4. **maskGroup でキー名を保持**: `password=secretvalue` の代入式では `secretvalue` のみをマスクし `password=` を残すことで、マスク後のテキストのコンテキストを保持する。

5. **priority 付き重複解決（含有は破棄・はみ出しは union マージ）**: 重なるマッチは priority（PRIVATE_KEY=95 > ANTHROPIC_KEY=92 > OPENAI_KEY=91 > その他 API_KEY=90 > JWT=85 > CREDENTIAL=80 > CREDIT_CARD=65 > EMAIL=60 > PHONE_JP=55 > IP=50 > HIGH_ENTROPY=10）で勝者を決め、負けた側が勝者のフルマッチ範囲（maskGroup が意図的に残すキー名・ホスト等の「考慮済み領域」）に完全に含まれるなら破棄（Authorization ヘッダ内 JWT の二重置換防止・URL の `パスワード@ホスト` へのメール誤マッチ抑制）、はみ出すなら範囲を union にマージする。負けた側を丸ごと破棄する単純方式は、高エントロピー文字列の内側だけが AWS キーにマッチした場合に前後の断片が漏えいする（PR #631 レビューで指摘・union 化で修正、再現入力を陽性対照テストとして同梱）。

6. **maskGroup の位置特定は RegExp `d` フラグの indices**: グループ位置を `m[0].indexOf(groupVal)` で探す実装は、キー名/ユーザー名と値が同一文字列のとき（`password=password` / `postgres://admin:admin@...`）に値側を取り違えてパスワードが漏えいするため不可。この漏えいケースは陽性対照テストとして同梱（旧実装に当てると fail することを実機確認済み）。

### 却下した選択肢

- **ML 検出（言語モデルやベクトル類似度）**: ブラウザ完結・外部送信なし・依存ライブラリなしの制約と相容れないため却下。
- **json-formatter/mask.ts との統合**: 既存ツールの挙動変更リスクが高く、2 つのユースケースで異なる API が必要（MaskOptions vs ScrubOptions）。S2-3 実装タイミングで改めて判断。
- **File System Access API でのフォルダ走査**: C2-16 として別 PR スコープ。

### 結果・トレードオフ

- ✅ 完全ブラウザ完結・外部ライブラリ追加なし（pure JS・既存依存ゼロ増）。
- ✅ 一貫トークン化により同一値のプレースホルダが揃い、マスク後テキストの読解性が高い。
- ⚠️ エントロピー閾値は実測ベースの経験則であり、環境によっては誤検出・検出漏れが発生しうる。ユーザーへの「共有前に目視確認」の注記を ToolInfoSection に明記。
- ⚠️ IPv6・プロバイダ固有の非標準形式は対象外（docs/tools.md 制限事項に記載）。

## [108] 2026-06-12 — superpowers をプラグイン運用から `npx skills add` vendor 方式へ移行

**2026-06-12 | ステータス: 採用**

### 背景

decisions [106] の SessionStart hook 自動 install を導入した後も、Claude Code on the web で superpowers プラグインが install されない事象が継続した（新規コンテナの初回セッション未反映の制約に加え、その後のセッションでも install が反映されないケースが発生）。superpowers のスキル群（writing-plans / systematic-debugging / TDD 等）は本プロジェクトの開発ワークフローの前提であり、web セッションで使えない状態は許容できない。

### 決断

`npx skills add` で obra/superpowers の 14 スキルを `.agents/skills/` にリポジトリ内 vendor し、プラグイン依存を外した（PR #632）。

1. **vendor + lockfile 管理**: スキル実体を `.agents/skills/` にコミットし、`skills-lock.json` で出典（source / skillPath）と computedHash を管理。upstream との突き合わせ・改変検知が可能（PR #632 レビューで `npx skills check` により全 14 スキルの upstream byte 一致を検証済み）。
2. **MIT ライセンス対応**: vendor は public リポジトリへの再配布にあたるため、`LICENSE-superpowers`（obra/superpowers）・`LICENSE-mattpocock-skills`（既存 vendor の grill-me 用）を同梱し、出典・ライセンス対応表を `.agents/skills/README.md` に集約。vercel-labs/agent-skills は upstream に LICENSE ファイルが無いため README の MIT 宣言を出典リンク付きで明記。
3. **Prettier 除外**: vendor ディレクトリを `.prettierignore` に個別列挙（整形すると lockfile の computedHash と実体が乖離するため）。自作スキル（dads-design-system / test-gates）は整形対象に残す。

### 却下した選択肢

- **プラグイン運用の継続（hook 改善で対応）**: install 経路が Claude Code 本体の実装変更に左右され続け、silent skip の再発を repo 側で制御できない。vendor ならセッション種別に依存せず常にスキルが存在する。
- **`.agents/skills/` 一括 Prettier 除外**: 自作スキルまで整形チェック対象から外れるため、vendor ディレクトリの個別列挙とした。

### 結果・トレードオフ

- ✅ web / CLI / Desktop すべてのセッションでスキルが即座に利用可能（プラグイン install 状態に依存しない）。
- ✅ lockfile + hash により supply chain 検証（upstream 突き合わせ・ローカル改変検知）が可能。
- ⚠️ upstream 更新への追従は手動（`npx skills update`）。SKILL.md はエージェントが実行する指示書のため、**bump 時は hash 差分だけでなく本文 diff のレビューを必須とする**。
- ⚠️ リポジトリサイズ増（約 8.6k 行）。frontend-design は後日同方式で vendor（[113]）、context7 は MCP server 同梱のためプラグイン運用を継続（[106] の hook は引き続き有効）。

## [109] clipboard-inspector: DOMPurify 不採用＝自作許可リストサニタイザ＋sandbox iframe 二重防御

**2026-06-13 | ステータス: 採用**

### 背景

クリップボードインスペクタ（`clipboard-inspector`）は `text/html` フレーバーを受け取り、プレビュー表示する。XSS リスクを排除するため HTML サニタイズが必要であり、DOMPurify（業界標準）の採用を検討した。

### 決断

- **決定**: text/html フレーバーのプレビューは、自作の許可リスト方式サニタイザ（`src/utils/sanitizeHtml.ts`）で除去したうえで `sandbox=""`（allow-scripts なし）iframe の srcdoc に描画する。DOMPurify は導入しない。
- **理由**: sandbox iframe が第二防壁として存在するため、サニタイザの見落としが直ちにスクリプト実行に繋がらない。依存追加（約 20KB gzip）よりも依存ゼロの二重防御を選択。
- **補足**: style 属性 / style 要素もサニタイズ対象。srcdoc iframe は親ドキュメントの CSP（style-src strict）を継承するため、残しても CSP 違反ノイズになるだけで描画されない。サニタイザは検知・ガード機構として test-gates ルールに従い陽性対照テストを同梱（`src/utils/__tests__/sanitizeHtml.test.ts`、深いネスト・mXSS 経路含む）。走査は明示スタックの反復実装（攻撃者制御入力での再帰スタックオーバーフロー回避）。PR #635 のレビュー指摘を受け、img の src 許可を当初の http / https / data:image/\* から data:image の raster 形式（png/jpeg/gif/webp/avif/bmp）のみに制限した — remote 画像は本番 CSP（img-src 'self' data: blob:）下では srcdoc iframe 内でも描画されず違反ノイズになるだけで、CSP のない dev 環境では外部フェッチ（tracking pixel）が発生し「外部に送信されません」の建付けと齟齬するため（svg+xml は script を内包し得るため除外）。
- 関連: spec `docs/superpowers/specs/2026-06-12-clipboard-inspector-design.md`

### 却下した選択肢

- **DOMPurify 採用**: 実績ある外部ライブラリだが、約 20KB（gzip）の依存追加になる。sandbox iframe が第二防壁として機能するため、依存追加のコスト・リスクが利益を上回らないと判断。

### 結果・トレードオフ

- ✅ 追加依存ゼロ。クリップボード内容は 100% ブラウザ内処理。
- ✅ サニタイザ＋sandbox iframe の二重防御により、サニタイザの見落とし単独では XSS に至らない。
- ✅ 陽性対照テストにより「ガードが実際に機能している」ことを CI で継続検証。
- ⚠️ 自作サニタイザのため、未知の mXSS 手法への対応は手動メンテナンスが必要。プレビュー用途（開発者向け）に限定することで許容リスクと判断。

## [110] dsn-builder: `URL` API 不採用＝自前パーサで mongodb 複数ホスト対応

**2026-06-13 | ステータス: 採用**

### 背景

DSN/接続文字列ビルダは複数スキームの URI を分解・再構成する必要がある。ブラウザ組み込みの `URL` API 利用が最初に検討された。

### 決断

- **決定**: `URL` API ではなく自前パーサ（`src/utils/dsn-builder/parse.ts`）を採用する。
- **理由**: `URL` API は mongodb のカンマ区切り複数ホスト（`host1:27017,host2:27018`）を解釈できず `Invalid URL` を throw する（Node 実測）。また userinfo・パスを percent-decode 済みの生値として編集し再エンコードする本ツールの双方向編集には、構成要素を生値で保持する自前モデルの方が適合する。
- **補足**: パース・シリアライズ・バリデーションを `src/utils/dsn-builder/` の純関数に分離し、フォーム/URI 双方の編集が単一の `validateModel` を通る設計とした。新規ライブラリ追加なし。バリデータを含むため陽性対照テストを同梱（test-gates 準拠）。

### 却下した選択肢

- **`URL` API 採用**: mongodb のカンマ区切り複数ホストを解釈できず、非特殊スキームの挙動もブラウザ間で不安定なため採用不可。

### 結果・トレードオフ

- ✅ 追加ライブラリなし（純粋な文字列処理のみ）。
- ✅ mongodb 複数ホスト・IPv6 ブラケット・SRV 制約等すべての方言に対応。
- ✅ 陽性対照テストにより「不正入力が必ずエラーになる」ことを CI で継続検証。
- ⚠️ 自前パーサのため URI 仕様（RFC 3986）の edge case への対応は手動メンテナンスが必要。対応スキームを 9 種に限定することで許容リスクと判断。

## [111] cert-decoder: 証明書パースに `pkijs` + `asn1js` を採用＋スコープを「読む側」に限定

**2026-06-13 | ステータス: 採用**

### 背景

SSL/TLS証明書デコーダ（候補 S-2）は社内 CA・本番証明書を外部送信せずに解析する需要に応えるツール。X.509 / PKCS#7 のパースと署名検証をブラウザ内で行う必要があり、ライブラリ選定と初版スコープが論点となった。

### 決断

- **ライブラリ**: `pkijs` + `asn1js` を採用する。
  - **理由**: 署名検証を Web Crypto（`crypto.subtle`）経由で実行でき、既存の JWT デコーダ・QRチケットと同じ暗号基盤に揃う。必要クラス（`Certificate` / `ContentInfo` / `SignedData`）のみ import でき tree-shaking に向く。拡張領域（SCT 等）の生バイトを `asn1js` で辿れる。
  - **却下**: `node-forge` は高レベル API で実装は速いが独自 JS 暗号実装で Web Crypto と二重になり、バンドルも分割が粗い。
- **スコープ**: 初版は「読む側」（PEM/DER/PKCS#7 の解析・表示＋チェーン署名検証）に限定する。
  - **PKCS#12（.pfx/.p12）対応**・**鍵フォーマット変換（PEM/DER/JWK）** は別 issue / 別ツールへ分離。秘密鍵・パスワード処理は責務が異なり、鍵変換は B2-7（csr-generator）等と共通基盤化する余地があるため。（※ PKCS#12 は #644 で対応済み、PBES2/AES 限定。詳細は decision [114]）
- **失効確認（CRL/OCSP）非対応**: ブラウザ単体・外部送信不可の方針と矛盾する（OCSP/CRL は外部問い合わせが必須）ため初版から除外。署名検証はチェーン内隣接ペアに限定し、信頼ストア照合も行わない。

### 結果・トレードオフ

- ✅ 既存の Web Crypto 基盤に揃い、署名検証・フィンガープリント計算をブラウザ内で完結。
- ✅ チェーン署名検証は改ざん・issuer 不一致・期限切れを検出する陽性＋陰性対照テストを同梱（test-gates 準拠）。
- ⚠️ `pkijs` / `asn1js` の API は ASN.1 構造を直接辿るため込み入っており、拡張パースは個別実装が必要。
- ⚠️ SCT は表示のみ（署名の暗号検証なし）、失効確認なしのため「証明書が現在も有効か」の最終判断には別手段が必要。

## [112] key-converter: Web Crypto 主体 + asn1js OID 判定、pkijs 不採用

**2026-06-13 | ステータス: 採用**

### 背景

cert-decoder（issue #643）で「鍵フォーマット変換（PEM/DER/JWK）は別ツールへ分離」とした方針（decision [111]）に基づき、issue #645 として独立実装する。鍵種別（RSA / ECDSA）・鍵形式（SPKI / PKCS#8）の判定ライブラリ選定と、v1 スコープが論点となった。

### 決断

- **変換エンジン**: `crypto.subtle`（Web Crypto API）を主体とし、OID 判定のみ既存依存の `asn1js` を使用する。
  - **理由**: 変換そのものは `importKey` / `exportKey` のみで完結する。pkijs の高機能（証明書パース・署名検証）は不要でオーバーキル。`asn1js` は cert-decoder で既に依存しており、追加依存なしで SEQUENCE/OID 解析ができる。
  - **pkijs 不採用**: pkijs の `PrivateKeyInfo` / `PublicKeyInfo` クラスを使う案も検討したが、EC 曲線 OID の取得パスが不明瞭で結局 `asn1js` レイヤーに降りる必要がある。直接 `asn1js` を使う方がシンプル。
  - **node-forge 不採用**: 独自 JS 暗号実装で Web Crypto と二重管理になる。バンドルサイズも大きい（decision [111] と同じ理由）。
- **v1 スコープの限定**:
  - **対応**: RSA / ECDSA（P-256/P-384/P-521）の公開鍵（SPKI）・秘密鍵（PKCS#8）、入力形式 PEM / DER / JWK。
  - **非対応**: PKCS#1（RSA PUBLIC KEY / RSA PRIVATE KEY）・SEC1（EC PRIVATE KEY）レガシー PEM、暗号化秘密鍵（ENCRYPTED PRIVATE KEY）、Ed25519/Ed448（kty: OKP）、秘密鍵からの公開鍵抽出、鍵ペア生成（csr-generator 予定）。
  - **理由**: PKCS#1/SEC1 は `openssl pkcs8 -topk8` で PKCS#8 に変換できるため、v1 では変換ガイドの表示で対応。暗号化秘密鍵はパスフレーズ入力 UI が別途必要で責務が異なる。Ed25519 は Web Crypto の `subtle.importKey` が対応するが、JWK の `kty: OKP` は RSA/EC と異なるパスを要し、利用頻度比でコスト高と判断。
- **test-gates 準拠**: `detectKeyInput` は入力バリデーター（不正入力を検知して `error` を返す機構）を含むため、陽性対照テスト（不正入力が throw せず `error` を返すこと）を陰性対照（round-trip 正常系）と別 describe に分離して同梱。

### 結果・トレードオフ

- ✅ 追加ライブラリなし（`asn1js` は cert-decoder で既依存）。
- ✅ 変換は Web Crypto のみで完結し、外部送信コードが混入する余地がない。
- ✅ 陽性対照テストにより「不正入力が必ず error になる」ことを CI で継続検証（test-gates 準拠）。
- ⚠️ `asn1js` の valueBlock API は未型付けで直接辿るため脆弱性がある。Web Crypto の `importKey` 失敗で catch → error 返却でカバー。
- ⚠️ PKCS#1/SEC1 のレガシー PEM を直接変換したい場合は別途 openssl が必要（v1 の既知制限として UI で案内）。

## [113] 2026-06-13 — frontend-design もプラグイン運用から `npx skills add` vendor 方式へ移行

**2026-06-13 | ステータス: 採用**

### 背景

decisions [108] で superpowers を vendor 化したが、`frontend-design@claude-plugins-official` はプラグイン運用のまま残していた（[108] 結果欄に「frontend-design / context7 はプラグイン運用を継続」と記載）。しかし superpowers と同じく Claude Code on the web でプラグイン install が silent skip される制約（[106] / upstream #23737）の影響を受け、web セッションで frontend-design スキルが使えない。frontend-design は単一の `SKILL.md` のみで構成され MCP server を同梱しないため、superpowers と同方式で vendor 可能。

### 決断

`npx skills add anthropics/claude-plugins-official -s frontend-design` で `.agents/skills/frontend-design/` にリポジトリ内 vendor し、`.claude/settings.json` の `enabledPlugins` から `frontend-design@claude-plugins-official` を削除した。

1. **vendor + lockfile 管理**: [108] と同じく `skills-lock.json` で出典（`anthropics/claude-plugins-official` / `plugins/frontend-design/skills/frontend-design/SKILL.md`）と computedHash を管理。
2. **Apache-2.0 ライセンス対応**: upstream（anthropics/claude-plugins-official）の LICENSE が Apache-2.0 のため、`LICENSE-frontend-design` を同梱し `.agents/skills/README.md` の対応表に追記。superpowers / grill-me（MIT）とライセンス系統が異なる点に留意。
3. **context7 は対象外**: context7 は MCP server を同梱するプラグインであり skill 単体に vendor できないため、プラグイン運用＋[106] の SessionStart hook 自動 install を継続（marketplace 宣言 `extraKnownMarketplaces` も残す）。

### 結果・トレードオフ

- ✅ web / CLI / Desktop すべてのセッションで frontend-design スキルが即座に利用可能（プラグイン install 状態に依存しない）。
- ✅ enabledPlugins が context7 のみになり、web の plugin silent-skip 制約の影響を受ける対象が MCP 型 1 つに縮小。
- ⚠️ `npx skills add -a '*'` は多数の未使用エージェント dir（`.roo` / `.windsurf` 等）を生成するため、`.agents/skills/` 以外は手動削除した。次回 vendor 時も同様の後始末が必要。
- ⚠️ upstream 更新への追従は手動（`npx skills update`）。bump 時は hash 差分だけでなく SKILL.md 本文 diff のレビューを必須とする（[108] と同じ運用）。

## [114] cert-decoder: PKCS#12 対応 — PBES2/AES 限定・秘密鍵トグル開示・node-forge 不採用継続

**2026-06-13 | ステータス: 採用**

### 背景

cert-decoder v1（decision [111]）では PKCS#12 をスコープ外としていたが、`.pfx/.p12` ファイルから証明書チェーンを確認したい需要が確認され、#644 で対応する。秘密鍵を含むため、UI・セキュリティ・暗号方式制限の設計判断が必要となった。

### 決断

- **暗号方式**: PBES2（PBKDF2 + AES-CBC）のみ対応する。
  - Web Crypto API がブラウザネイティブで PBES2 を復号できる。
  - レガシー RC2-40/3DES（OpenSSL 1.x 既定）は Web Crypto 非対応のため復号不可とし、`unsupported-encryption` エラーで案内する（`openssl pkcs12 -keypbe AES-256-CBC -certpbe AES-256-CBC ...` での再エクスポートを促す）。
- **秘密鍵の扱い**:
  - アルゴリズム・鍵長・曲線名などのメタ情報は常時表示。
  - PKCS#8 PEM は `<details>` トグルで開示（誤操作・画面共有時の漏洩リスクを軽減）。
  - ダウンロードボタンを提供し、コピー・保存は明示的な操作のみ。
  - browser-only バナー（NotificationBanner）で「外部送信なし」を明示。
- **node-forge 不採用継続**: decision [111] と同じ理由（独自 JS 暗号、バンドル肥大）。pkijs の既存依存のみで PKCS#12 パースが完結する。
- **入力方式**: ファイル選択（.p12/.pfx）＋ Base64 貼り付け（`looksLikePkcs12` で自動検出）の両方をサポート。
- **test-gates 準拠**: `parsePkcs12` は不正入力検知機構（誤パスワード・非 p12・レガシー暗号）を含むため、陽性対照テスト 3 件を陰性対照（正常系）と別 describe に分離して同梱。

### 結果・トレードオフ

- ✅ 追加ライブラリなし（pkijs / asn1js は cert-decoder で既依存）。
- ✅ 全処理ブラウザ内完結。秘密鍵が外部送信される経路がない。
- ✅ 陽性対照テストにより誤パスワード・非 p12・レガシー暗号の検知能力を CI で継続検証。
- ⚠️ RC2/3DES 保護の既存 .pfx は再エクスポートが必要（既知制限として UI で案内済み）。
