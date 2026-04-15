# DevTools — プロジェクト仕様書 v1.5

## 1. プロジェクト概要

### 1.1 プロダクトビジョン

開発者・デザイナー・ディレクター向けの**完全ブラウザ完結型**無料オンライン開発者ツール集。
入力データは一切サーバーに送信せず、すべてクライアントサイド（JavaScript / WebAssembly）で処理する。

### 1.2 サイト名

**DevTools**

- ドメイン: 未確定
- ロゴテキスト: 「DevTools」

### 1.3 コアバリュー

- **プライバシーファースト**: データはブラウザ内で完結。サーバー送信ゼロ。
- **ゼロコスト・ゼロ登録**: 完全無料、ユーザー登録不要。
- **日本語ファースト**: UI・説明文すべて日本語。
- **即時利用**: インストール不要、ブラウザを開いた瞬間に使える。

### 1.4 ターゲットユーザー

- Web開発者（フロントエンド / バックエンド）
- デザイナー・コーダー
- ディレクター・PM
- フリーランス / 副業エンジニア

---

## 2. 技術仕様

### 2.1 技術スタック

| レイヤー         | 技術                         | 理由                                       |
| ---------------- | ---------------------------- | ------------------------------------------ |
| フレームワーク   | **Astro 6.1.3**              | 静的生成 + Islands Architecture でJS最小化 |
| UIコンポーネント | **React 19** (Astro Islands) | ツール部分のみインタラクティブ             |
| スタイリング     | **Tailwind CSS 4**           | ユーティリティファーストで高速開発         |
| ビルド           | Astro built-in (Vite 7)      | 高速ビルド                                 |
| テスト（ユニット）| **Vitest**                   | Vite 設定共有でゼロコンフィグ              |
| テスト（E2E）    | **Playwright**               | ブラウザ上の実動作を検証するリグレッション  |
| パッケージ管理   | **npm**                      | 標準・安定                                 |
| 言語             | **TypeScript**               | 型安全性                                   |

### 2.2 ホスティング・デプロイ

| 項目         | 選定                                                    |
| ------------ | ------------------------------------------------------- |
| ホスティング | **Cloudflare Pages**（無料プラン）                      |
| CDN          | Cloudflare（自動・日本エッジあり）                      |
| 独自ドメイン | 任意（Cloudflare で無料SSL自動付与）                    |
| CI/CD        | GitHub Actions（テスト）→ Cloudflare Pages 自動デプロイ |
| リポジトリ   | GitHub                                                  |

### 2.3 主要ライブラリ（MVP で使用）

| ライブラリ                 | 用途                                         | ツール          |
| -------------------------- | -------------------------------------------- | --------------- |
| `ulidx`                    | ULID生成                                     | ULID生成        |
| 手動デコード（Base64URL）  | JWTデコード・署名検証                        | JWTデコーダー   |
| `qrcode-generator`         | QRコード生成                                 | QRコード生成    |
| `JsBarcode`                | バーコード描画                               | JANコード生成   |
| `bwip-js`                  | GS1バーコード描画（SVG）                     | GS1 DataBar生成 |
| `jszip`                    | 複数バーコードのZIPパッケージング            | GS1 DataBar生成 |
| `fast-xml-parser`          | JSON⇔XML 相互変換                            | JSON/XML変換    |
| `papaparse`                | JSON⇔CSV 相互変換・パース                    | JSON/CSV変換    |
| `@fontsource/noto-sans-jp` | フォントセルフホスト                         | 全ページ共通    |
| `@astrojs/check`           | Astro/TypeScript 型チェック（devDependency） | 開発ツール共通  |
| `typescript`               | TypeScript コンパイラ（devDependency）       | 開発ツール共通  |
| `@playwright/test`         | E2Eリグレッションテスト（devDependency）     | 開発ツール共通  |

※ すべて Tree-shakable で軽量なものを選定。バンドルサイズ最小化を優先。

### 2.4 ディレクトリ構成

```
devtools/
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── vitest.config.ts
├── playwright.config.ts
├── .github/
│   └── workflows/
│       └── test.yml
├── docs/
│   └── decisions.md        # 設計・実装の決断ログ
├── tests/
│   └── e2e/                # Playwright E2E テスト
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   ├── robots.txt
│   ├── manifest.webmanifest   # PWA マニフェスト
│   ├── sw.js                  # Service Worker
│   └── icons/
│       ├── icon-192.png       # PWAアイコン 192×192
│       └── icon-512.png       # PWAアイコン 512×512
└── src/
    ├── components/
    │   ├── layout/
    │   │   ├── Header.astro
    │   │   ├── Footer.astro
    │   │   └── Sidebar.astro
    │   ├── ui/
    │   │   ├── CopyButton.tsx
    │   │   ├── ToolIcon.astro   # slug → SVG アイコンマッピング
    │   │   └── DownloadButton.tsx
    │   └── tools/
    │       ├── UlidGenerator.tsx
    │       ├── JwtDecoder.tsx
    │       ├── DummyText.tsx
    │       ├── UrlEncoder.tsx
    │       ├── QrCode.tsx
    │       ├── JanCode.tsx
    │       └── Gs1Databar.tsx
    ├── layouts/
    │   ├── BaseLayout.astro
    │   └── ToolLayout.astro
    ├── pages/
    │   ├── index.astro
    │   ├── about.astro
    │   ├── privacy.astro
    │   └── tools/
    │       ├── ulid-generator.astro
    │       ├── jwt-decoder.astro
    │       ├── dummy-text.astro
    │       ├── url-encode.astro
    │       ├── qr-code.astro
    │       ├── jan-code.astro
    │       └── gs1-databar.astro
    ├── data/
    │   └── tools.ts
    ├── styles/
    │   └── global.css
    └── utils/
        ├── clipboard.ts
        ├── jwt.ts              # JWT パース・フォーマット関数
        ├── url-encode.ts       # URLエンコード/デコード関数
        ├── jan-code.ts         # JANコード チェックディジット計算
        ├── gs1-databar.ts      # GTIN-14計算・GS1 AIビルダー
        ├── styles.ts           # 共通タイポグラフィ定数
        └── __tests__/
            ├── jwt.test.ts
            ├── url-encode.test.ts
            ├── jan-code.test.ts
            └── gs1-databar.test.ts
```

---

## 3. ページ構成

### 3.1 共通レイアウト

```
┌─────────────────────────────────────┐
│  Header（ロゴ）                       │
├─────────┬───────────────────────────┤
│         │                           │
│  Side   │   メインコンテンツ          │
│  bar    │   （ツール本体 or 一覧）     │
│         │                           │
├─────────┴───────────────────────────┤
│  Footer（About / Privacy / ©）       │
└─────────────────────────────────────┘
```

- **レスポンシブ**: モバイルではサイドバーは非表示
- **ダークモード**: 廃止（Phase 2 で DADS 準拠の設計を行う予定。→ [docs/decisions.md](docs/decisions.md) #003）
- **サイドバー**: ツール一覧をカテゴリ別に表示。現在のツールをハイライト

### 3.2 トップページ（`/`）

- ヒーローセクション（キャッチコピー）
- カテゴリタブ（すべて / 生成 / 変換・解析）で絞り込み
- ツールカードグリッド（SVGアイコン・ツール名・1行説明・カテゴリバッジ）

### 3.3 ツールページ（`/tools/[slug]`）

- パンくずリスト（ホーム > カテゴリ > ツール名）
- ツール名 + 1行説明
- **ツール本体**（React Island。ファーストビューは `client:load`、スクロール外は `client:visible`）
- 「このツールについて」セクション（使い方・ユースケース）
- 関連ツールリンク

### 3.4 固定ページ

- `/about` — サイト説明・運営者情報
- `/privacy` — プライバシーポリシー

---

## 4. MVP ツール一覧（Phase 1: 7ツール）

### カテゴリ A: 生成ツール

| #   | ツール名           | slug             | 概要                                                                              |
| --- | ------------------ | ---------------- | --------------------------------------------------------------------------------- |
| 1   | ULID生成           | `ulid-generator` | 生成数を指定（1〜100）して一括生成。タイムスタンプ表示付き                        |
| 2   | ダミーテキスト生成 | `dummy-text`     | 文字種（全角ひらがな/カタカナ/漢字混じり/半角英数）と文字数を指定して生成         |
| 3   | QRコード生成       | `qr-code`        | テキスト/URL入力 → QRコード画像生成。PNG/SVGダウンロード                          |
| 4   | JANコード生成      | `jan-code`       | 12桁入力 → チェックディジット自動計算 → バーコード画像生成                        |
| 5   | GS1 DataBar 生成   | `gs1-databar`    | GTIN-14入力 → GS1 DataBar Limited合成シンボル生成。CC-A対応（AI: 17/10/11/15/21） |

### カテゴリ B: 変換・解析ツール

| #   | ツール名               | slug          | 概要                                                                      |
| --- | ---------------------- | ------------- | ------------------------------------------------------------------------- |
| 6   | JWTデコーダー          | `jwt-decoder` | JWTトークン貼り付け → Header/Payload/署名を分解表示。HS/RS/ES署名検証対応 |
| 7   | URLエンコード/デコード | `url-encode`  | テキスト⇔URLエンコード相互変換                                            |
| 8   | JSON / XML 変換        | `json-xml`    | JSON⇔XML 相互変換。ルートタグ名指定対応、XML属性は `@_` プレフィックス形式 |
| 9   | JSON / CSV 変換        | `json-csv`    | JSON⇔CSV 相互変換。ネストオブジェクトはドット記法でフラット化              |

---

## 5. 各ツール個別仕様

### 5.1 ULID生成（`ulid-generator`）

**入力:**

- 生成数: 数値入力（1〜100、デフォルト: 1）
- [生成] ボタン

**処理:**

- `ulidx` ライブラリで ULID を生成
- 各ULIDに対応するタイムスタンプ（ISO 8601）も算出

**出力:**

- ULIDリスト（テーブル形式: No. / ULID / タイムスタンプ）
- [すべてコピー] ボタン（ULIDのみ改行区切り）
- 個別行の [コピー] ボタン

**UI:**

```
┌───────────────────────────────────────┐
│  ULID生成                              │
├───────────────────────────────────────┤
│  生成数: [  5  ] [▼]         [生成]    │
├───────────────────────────────────────┤
│  #  │ ULID                │ タイムスタンプ     │ 操作  │
│  1  │ 01HY5Z3K...         │ 2026-04-11T...    │ [コピー]  │
│  2  │ 01HY5Z3K...         │ 2026-04-11T...    │ [コピー]  │
│  ...                                          │
├───────────────────────────────────────┤
│                    [すべてコピー] [クリア] │
└───────────────────────────────────────┘
```

---

### 5.2 JWTデコーダー（`jwt-decoder`）

**入力:**

- テキストエリア: JWTトークン貼り付け（リアルタイムデコード）
- シークレットキー / 公開鍵 PEM（任意、署名検証用）

**処理:**

- `.` 区切りで3パートに分割
- 各パートを Base64URL デコード → JSON パース（`src/utils/jwt.ts`）
- `exp` / `iat` / `nbf` フィールドがあれば人間可読な日時に変換
- `exp` の有効期限判定（期限切れ / 有効 / 期限なし）
- 署名検証: HS256/384/512（HMAC）、RS256/384/512（RSA）、ES256/384/512（ECDSA）対応

**出力:**

- 3セクションに色分け表示:
  - **Header** (赤系): アルゴリズム、トークンタイプ
  - **Payload** (紫系): クレーム一覧。日時フィールドは変換値も併記
  - **Signature** (青系): Base64表示
- 有効期限ステータスバッジ（有効 / 期限切れ / exp なし）
- 署名検証ステータスバッジ（有効 / 無効 / 検証中 / 未対応）
- 各セクション [コピー] ボタン

**エラー処理:**

- 不正なJWT形式 → 「有効なJWTトークンではありません」
- Base64デコード失敗 → 該当パートにエラー表示

---

### 5.3 ダミーテキスト生成（`dummy-text`）

**入力:**

- 文字種: セレクトボックス
  - `全角ひらがな` — ランダムなひらがな文字列
  - `全角カタカナ` — ランダムなカタカナ文字列
  - `全角漢字混じり` — 漢字+ひらがな混合の自然文風（助詞・句読点あり）
  - `半角英数` — Lorem ipsum 風の英文
  - `半角数字のみ` — 0-9のランダム列
  - `全角半角混合` — 日本語+英数字混合
- 文字数: 数値入力（1〜5000、デフォルト: 100）
- [生成] ボタン

**処理:**

- 文字種ごとに対応する文字プールからランダム生成
- 「漢字混じり」は自然な日本語文に見えるよう、助詞・句読点を適度に挿入
- 正確に指定文字数ちょうどの出力を保証

**出力:**

- テキストエリア（生成結果）
- 文字数カウント表示（「生成文字数: 100文字」）
- [コピー] ボタン

---

### 5.4 URLエンコード/デコード（`url-encode`）

**入力:**

- テキストエリア
- モード切替: [エンコード] / [デコード] タブ

**処理:**（`src/utils/url-encode.ts`）

- エンコード: `encodeURIComponent()`
- デコード: `decodeURIComponent()`
- デコード失敗 → 「不正なURLエンコード文字列です」

**出力:**

- テキストエリア（リアルタイム変換）
- [コピー] ボタン

---

### 5.5 QRコード生成（`qr-code`）

**入力:**

- テキストエリア: URL or 任意テキスト
- オプション:
  - サイズ: セレクト（200 / 300 / 400 / 500 px）
  - 誤り訂正レベル: セレクト（L / M / Q / H、デフォルト: M）
  - 前景色: カラーピッカー（デフォルト: #000000）
  - 背景色: カラーピッカー（デフォルト: #FFFFFF）

**処理:**

- `qrcode-generator` でQRコード生成 → Canvas/SVG描画
- リアルタイムプレビュー（デバウンス 500ms）

**出力:**

- QRコードプレビュー
- [PNGダウンロード] / [SVGダウンロード] ボタン

---

### 5.6 JANコード生成（`jan-code`）

**入力:**

- モード切替: [JAN-13] / [JAN-8] タブ
- テキスト入力: 12桁（JAN-13）or 7桁（JAN-8）
- [生成] ボタン

**処理:**

- バリデーション（数字のみ、桁数チェック）
- チェックディジット算出（モジュラス10 ウェイト3-1）
- `JsBarcode` でバーコード描画（EAN-13 / EAN-8）

**出力:**

- 完成JANコード表示 + [コピー]
- バーコードプレビュー（SVG）
- チェックディジット計算過程（教育的表示）
- [PNGダウンロード] / [SVGダウンロード]

**バリデーション:**

- 非数字 → 「数字のみ入力してください」
- 桁数不正 → 「JAN-13は12桁、JAN-8は7桁を入力してください」

---

### 5.7 JSON / XML 変換（`json-xml`）

**入力:**

- テキストエリア（JSON または XML テキスト）
- モード切替: [JSON → XML] / [XML → JSON]

**処理:**（`src/utils/json-xml.ts`、`fast-xml-parser` 使用）

- **JSON → XML**:
  - `XMLBuilder` でシリアライズ
  - ルートタグ名は `root` 固定
  - 出力冒頭に `<?xml version="1.0" encoding="UTF-8"?>` を付与
  - JSON配列は同名タグの繰り返しに変換（例: `items: [{...}, {...}]` → `<item>...</item><item>...</item>`）
  - `@_` プレフィックスを持つキーは XML 属性として出力（例: `{"@_id": "1", "#text": "foo"}` → `<tag id="1">foo</tag>`）
- **XML → JSON**:
  - `XMLParser` でパース（`attributeNamePrefix: "@_"`, `ignoreAttributes: false`）
  - テキストノードと属性が混在する場合は `#text` キーにテキストを格納

**出力:**

- テキストエリア（変換結果、リアルタイム変換・デバウンス 300ms）
- [コピー] ボタン

> **MVP 対象外・将来対応候補:**
> - ルートタグ名のユーザー指定（現在は `root` 固定）
> - XML / JSON ファイルのダウンロード（`.xml` / `.json`）

**エラー処理:**

- 不正な JSON → 「有効なJSONではありません」
- 不正な XML → 「有効なXMLではありません」
- 空入力 → 出力欄は空（エラー非表示）

**UI:**

```
┌───────────────────────────────────────┐
│  JSON / XML 変換                       │
├───────────────────────────────────────┤
│  [JSON → XML]  [XML → JSON]            │
├───────────────────────────────────────┤
│  入力:                    出力: [コピー]│
│  ┌──────────────┐  ┌──────────────┐   │
│  │              │  │              │   │
│  └──────────────┘  └──────────────┘   │
│  [サンプル]                   [クリア] │
└───────────────────────────────────────┘
```

---

### 5.8 JSON / CSV 変換（`json-csv`）

**入力:**

- テキストエリア（JSON または CSV テキスト）
- モード切替: [JSON → CSV] / [CSV → JSON]

**処理:**（`src/utils/json-csv.ts`、`papaparse` 使用）

- **JSON → CSV**:
  - 入力は **オブジェクトの配列** `[{...}, {...}]` を想定
  - ネストされたオブジェクトはドット記法でフラット化（例: `{ "address": { "city": "Tokyo" } }` → `address.city` 列）
  - 配列値はJSON文字列としてシリアライズ（例: `[1,2,3]` → `"[1,2,3]"`）
  - 1行目はキー名をヘッダーとして出力
  - オブジェクト単体 `{...}` が入力された場合は 1行データとして変換
  - 区切り文字: カンマ固定（将来的にオプション化予定）
- **CSV → JSON**:
  - `papaparse` の `header: true` でパース（1行目をキー名として使用）
  - 数値・真偽値は自動型変換（`dynamicTyping: true`）
  - 出力は整形済みJSON（`JSON.stringify(..., null, 2)`）

**出力:**

- テキストエリア（変換結果、リアルタイム変換・デバウンス 300ms）
- [コピー] ボタン
- [CSVダウンロード] ボタン（JSON → CSV モード時のみ表示）

**エラー処理:**

- 不正な JSON → 「有効なJSONではありません」
- JSON が配列でもオブジェクトでもない → 「オブジェクトまたはオブジェクトの配列を入力してください」
- CSV のパースエラー → 「CSVの解析に失敗しました」
- 空入力 → 出力欄は空（エラー非表示）

**UI:**

```
┌───────────────────────────────────────┐
│  JSON / CSV 変換                       │
├───────────────────────────────────────┤
│  [JSON → CSV]  [CSV → JSON]            │
├───────────────────────────────────────┤
│  入力:                                 │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│  [サンプル] [クリア]                   │
├───────────────────────────────────────┤
│  出力:                                 │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│         [コピー] [CSVダウンロード]     │
│         ※ CSVダウンロードはJSON→CSVのみ│
└───────────────────────────────────────┘
```

---

## 6. 各ツール共通仕様

### 6.1 共通UIパターン

- **コピーボタン**: クリップボードコピー。成功時「コピーしました」表示（2秒消滅）
- **クリアボタン**: 入力・出力リセット
- **サンプル入力**: 各ツールに適切なサンプルデータセットボタン
- **エラー表示**: 赤枠 + 枠直下にメッセージ
- **レスポンシブ**: モバイルでは縦並び

### 6.2 アクセシビリティ

- セマンティックHTML
- キーボード操作対応
- `aria-label` / `aria-describedby`
- WCAG 2.1 AA コントラスト比（DADS 基準: テキスト 4.5:1 以上）

### 6.3 パフォーマンス要件

- Lighthouse: Performance 90+ / Accessibility 90+ / SEO 90+
- LCP < 2.5s / FID < 100ms / CLS < 0.1

---

## 7. SEO 仕様

### 7.1 メタデータ

```html
<title>{ツール名} - 無料オンラインツール | DevTools</title>
<meta name="description" content="{100〜150文字の説明}" />
<meta property="og:title" content="{ツール名} | DevTools" />
<meta property="og:description" content="{説明文}" />
<meta property="og:image" content="/og-image.png" />
<link rel="canonical" href="https://{domain}/tools/{slug}" />
```

### 7.2 構造化データ（JSON-LD）

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "{ツール名}",
  "url": "https://{domain}/tools/{slug}",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "All",
  "offers": { "@type": "Offer", "price": "0" }
}
```

### 7.3 その他

- `sitemap.xml` 自動生成（`@astrojs/sitemap`）
- `robots.txt`
- 関連ツール内部リンク

---

## 8. デザイン方針

### 8.1 デザインシステム

デジタル庁デザインシステム（DADS v2.12.0）準拠。
設計の決断は [docs/decisions.md](docs/decisions.md) を参照。

### 8.2 カラーパレット

DADS 青基調カラーシステムを使用（`src/styles/global.css` の `@theme` で定義）。

| 役割             | 値                       |
| ---------------- | ------------------------ |
| プライマリ       | `#1A56DB`                |
| リンク           | `#2563EB`                |
| 背景             | `#EFF6FF`（blue-50）     |
| ニュートラル本文 | `#111827`（neutral-900） |
| ミュートテキスト | `#6B7280`（neutral-500） |

### 8.3 タイポグラフィ

- 日本語: Noto Sans JP（`@fontsource/noto-sans-jp` でセルフホスト）
- コード: JetBrains Mono（`@fontsource/jetbrains-mono` でセルフホスト）
- 最小フォントサイズ: 14px（DADS 規定。本文は 16px 以上推奨）
- letter-spacing: `0.02em`（正値）

### 8.4 ダークモード

現フェーズでは廃止。DADS のダークモード仕様が未定義のため、
Phase 2 でアクセシビリティ要件（コントラスト比 4.5:1）を満たす形で設計予定。

---

## 9. 開発フェーズ

### Phase 1a: パイロット（2ツール）✅ 完了

- [x] プロジェクト初期化（Astro + React + Tailwind CSS 4 + TypeScript）
- [x] 共通レイアウト（Header / Footer / Sidebar / ToolLayout）
- [x] 共通UIコンポーネント（CopyButton / ToolIcon）
- [x] パイロットツール実装
  - [x] URLエンコード/デコード
  - [x] JWTデコーダー（HS/RS/ES署名検証対応）
- [x] トップページ（カテゴリタブ + ツールカードグリッド）

### Phase 1b: MVP 完成（残り3ツール）✅ 完了

- [x] ULID生成
- [x] ダミーテキスト生成
- [x] QRコード生成
- [x] JANコード生成
- [x] GS1 DataBar Limited 合成シンボル生成
- [x] SEO基盤（sitemap / robots.txt / JSON-LD）
- [x] about / privacy ページ
- [x] Cloudflare Pages デプロイ

### Phase 2: 拡充

- [x] JSON / XML 変換（`json-xml`）
- [x] JSON / CSV 変換（`json-csv`）
- [x] Playwright E2E リグレッションテスト導入（`tests/e2e/`）
- [x] **PWA対応**（→ 詳細仕様は §12 を参照）
  - [x] Web App Manifest（`public/manifest.webmanifest`）
  - [x] Service Worker（`public/sw.js`）
  - [x] PWAアイコン生成（`public/icons/icon-192.png`, `icon-512.png`）
  - [x] `BaseLayout.astro` に manifest・theme-color・SW登録を追加
- [ ] ダークモード（DADS 準拠で再設計）
- [ ] ツール追加
  - [ ] JSON整形、Base64、Diff、パスワード生成、ハッシュ、文字数カウント等
- [ ] 全文検索
- [ ] お気に入り（localStorage）
- [ ] OGP画像自動生成

### Phase 3: 成熟

- [ ] 30+ツール
- [ ] i18n（英語版）

---

## 10. 品質基準

### 10.1 テスト

- **Vitest**: ユニットテスト（`src/utils/__tests__/`）
- **Playwright**: E2Eリグレッションテスト（`tests/e2e/`）— 各ツールの入出力動作を検証
- **GitHub Actions**: PR・push・マージ時に自動実行

### 10.2 コード品質

- ESLint + Prettier
- TypeScript strict mode
- Conventional Commits

### 10.3 ブラウザサポート

- Chrome / Edge / Firefox / Safari（最新2版）
- iOS Safari / Android Chrome

---

## 11. セキュリティ・プライバシー

### 11.1 データ処理ポリシー

- 入力データ: ブラウザメモリ上のみ。離脱時破棄。
- サーバー通信: ツール処理で一切なし。
- Cookie: なし。トラッキングなし。
- 外部リソース: **ゼロ**（フォントはすべてセルフホスト）。

### 11.2 CSP

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data: blob:;
connect-src 'none';
```

---

## 12. PWA 仕様

### 12.1 目的

Android / iOS のホーム画面に追加し、ブラウザUIなしでアプリのように起動できるようにする。

### 12.2 実装方針

**手動実装**（`@vite-pwa/astro` は使わない）  
理由: workbox の追加バンドルを避け、必要最小限の SW のみ配置する。  
→ `docs/decisions.md` #006 参照

### 12.3 追加ファイル

| ファイル                     | 役割                                              |
| ---------------------------- | ------------------------------------------------- |
| `public/manifest.webmanifest`| Web App Manifest（名前・アイコン・表示モード等）   |
| `public/sw.js`               | Service Worker（オフライン対応・キャッシュ制御）  |
| `public/icons/icon-192.png`  | PWAアイコン 192×192px（Android 標準）             |
| `public/icons/icon-512.png`  | PWAアイコン 512×512px（スプラッシュ・マスカブル） |

### 12.4 Web App Manifest

```json
{
  "name": "DevTools",
  "short_name": "DevTools",
  "description": "ブラウザで完結する無料の開発者ツール集",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#EFF6FF",
  "theme_color": "#1A56DB",
  "lang": "ja",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### 12.5 Service Worker 戦略

| リクエスト種別                     | 戦略                                |
| ---------------------------------- | ----------------------------------- |
| ナビゲーション（HTML）             | Network-first → オフライン時は `/` を返す |
| 静的アセット（JS/CSS/フォント）    | Cache-first（初回フェッチ後キャッシュ）  |

キャッシュバージョン管理: `CACHE_NAME = 'devtools-v1'`（更新時にインクリメント）

### 12.6 アイコン生成

`favicon.svg`（32×32 の `</>` ロゴ SVG）を元に、`scripts/generate-icons.mjs` で  
`sharp`（Astro の推移的依存として利用可能）を使い PNG を生成する。  
スクリプトは実行後に削除する。

### 12.7 BaseLayout.astro 変更点

```html
<!-- manifest リンク -->
<link rel="manifest" href="/manifest.webmanifest" />
<!-- iOS ホーム画面アイコン -->
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<!-- テーマカラー（Androidアドレスバー） -->
<meta name="theme-color" content="#1A56DB" />
```

Service Worker 登録（`<body>` 末尾にインラインスクリプト）:
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```
