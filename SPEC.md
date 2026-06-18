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

| レイヤー           | 技術                         | 理由                                       |
| ------------------ | ---------------------------- | ------------------------------------------ |
| フレームワーク     | **Astro 6.1.3**              | 静的生成 + Islands Architecture でJS最小化 |
| UIコンポーネント   | **React 19** (Astro Islands) | ツール部分のみインタラクティブ             |
| スタイリング       | **Tailwind CSS 4**           | ユーティリティファーストで高速開発         |
| ビルド             | Astro built-in (Vite 7)      | 高速ビルド                                 |
| テスト（ユニット） | **Vitest**                   | Vite 設定共有でゼロコンフィグ              |
| テスト（E2E）      | **Playwright**               | ブラウザ上の実動作を検証するリグレッション |
| パッケージ管理     | **npm**                      | 標準・安定                                 |
| 言語               | **TypeScript**               | 型安全性                                   |

### 2.2 ホスティング・デプロイ

| 項目         | 選定                                                    |
| ------------ | ------------------------------------------------------- |
| ホスティング | **Cloudflare Pages**（無料プラン）                      |
| CDN          | Cloudflare（自動・日本エッジあり）                      |
| 独自ドメイン | 任意（Cloudflare で無料SSL自動付与）                    |
| CI/CD        | GitHub Actions（テスト）→ Cloudflare Pages 自動デプロイ |
| リポジトリ   | GitHub                                                  |

### 2.3 主要ライブラリ（MVP で使用）

| ライブラリ                  | 用途                                                                                                               | ツール                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `ulidx`                     | ULID生成                                                                                                           | ULID生成                    |
| `uuid`                      | UUID v7 生成（`v7()` 関数）                                                                                        | UUID v7 生成                |
| 手動デコード（Base64URL）   | JWTデコード・署名検証                                                                                              | JWTデコーダー               |
| `qrcode-generator`          | QRコード生成                                                                                                       | QRコード生成                |
| `JsBarcode`                 | バーコード描画                                                                                                     | JANコード生成               |
| `bwip-js`                   | GS1バーコード描画（SVG）                                                                                           | GS1 DataBar生成             |
| `jszip`                     | 複数バーコードのZIPパッケージング                                                                                  | GS1 DataBar生成             |
| `fast-xml-parser`           | JSON⇔XML 相互変換                                                                                                  | JSON/XML変換                |
| `papaparse`                 | JSON⇔CSV 相互変換・パース                                                                                          | JSON/CSV変換                |
| `jsqr`                      | QRコードデコード（カメラ・画像）                                                                                   | QRチケット                  |
| `@fontsource/noto-sans-jp`  | フォントセルフホスト                                                                                               | 全ページ共通                |
| `@astrojs/check`            | Astro/TypeScript 型チェック（devDependency）                                                                       | 開発ツール共通              |
| `typescript`                | TypeScript コンパイラ（devDependency）                                                                             | 開発ツール共通              |
| `@playwright/test`          | E2Eリグレッションテスト（devDependency）                                                                           | 開発ツール共通              |
| `@vitest/coverage-v8`       | テストカバレッジ測定（devDependency）                                                                              | 開発ツール共通              |
| `lint-staged`               | コミット時の自動フォーマット (devDependency)                                                                       | 開発ツール共通              |
| `eslint`                    | button type 漏れ検出の lint 本体（devDependency / #569）                                                           | 開発ツール共通              |
| `eslint-plugin-react`       | `react/button-has-type` ルール提供（devDependency / #569）                                                         | 開発ツール共通              |
| `@typescript-eslint/parser` | `.tsx` を ESLint でパースする parser（devDependency / #569）                                                       | 開発ツール共通              |
| `encoding-japanese`         | 文字コード判定・相互変換（UTF-8/SJIS/EUC-JP/JIS/UTF-16）                                                           | 文字コード判定・変換        |
| `yaml`                      | YAML パース/シリアライズ。コメント保持（Document API）                                                             | 設定ファイル相互変換        |
| `smol-toml`                 | TOML パース/シリアライズ（軽量、コメント保持なし）                                                                 | 設定ファイル相互変換        |
| `ajv`                       | JSON Schema 検証（draft-04/07対応）。dynamic import で遅延ロード                                                   | 設定ファイル相互変換        |
| `ajv-formats`               | ajv の format キーワード拡張（date-time 等）                                                                       | 設定ファイル相互変換        |
| `sql-formatter`             | SQL 整形（インデント・キーワード大文字化）。MIT ライセンス v15.8.0                                                 | SQL整形・パラメータ埋め込み |
| `regexp-tree`               | 正規表現を位置情報付き AST へパース（CJS・純 JS・型同梱）                                                          | 正規表現ビジュアライザ      |
| `recheck`                   | ReDoS 脆弱性検出。browser エントリ（`lib/browser.js`）を使用し `checkSync` で同期判定。型同梱・install script なし | 正規表現ビジュアライザ      |
| `jsonc-parser`              | JSON を位置情報付き AST へパース（strict オプションで構文エラー検知）。依存ゼロ・型同梱                            | JSON整形・ビューア          |
| `jmespath`                  | JMESPath クエリ評価（eval 非使用・CSP 安全）。フィルタ・射影に対応                                                 | JSON整形・ビューア          |
| `pkijs`                     | X.509 証明書・PKCS#7 のパースと署名検証（Web Crypto エンジン経由）                                                 | SSL/TLS証明書デコーダ       |
| `asn1js`                    | ASN.1 DER のデコード（pkijs の基盤。拡張領域の生バイト取得にも使用）                                               | SSL/TLS証明書デコーダ       |
| `marked`                    | Markdown パース・HTML 変換（GFM 対応。`gfm: true`, `breaks: true`）。出力は既存 `sanitizeHtml` でサニタイズ        | markdownエディタ            |

※ すべて Tree-shakable で軽量なものを選定。バンドルサイズ最小化を優先。

### 2.4 ディレクトリ構成

```
devtools/
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── GEMINI.md               # Gemini CLI 用プロジェクト指示書
├── vitest.config.ts
├── playwright.config.ts
├── .agents/
│   └── rules/
│       └── common.md       # AIエージェント用プロジェクト共通開発規約
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
│       ├── icon-192.png           # PWAアイコン 192×192（purpose: any）
│       ├── icon-512.png           # PWAアイコン 512×512（purpose: any）
│       ├── icon-maskable-192.png  # PWAアイコン 192×192（purpose: maskable）
│       └── icon-maskable-512.png  # PWAアイコン 512×512（purpose: maskable）
└── src/
    ├── components/
    │   ├── layout/
    │   │   ├── Header.astro
    │   │   ├── Footer.astro
    │   │   └── Sidebar.astro
    │   ├── ui/
    │   │   ├── CopyButton.tsx
    │   │   ├── DownloadButtonGroup.tsx
    │   │   ├── ErrorMessage.tsx
    │   │   ├── InputField.tsx
    │   │   ├── OutputField.tsx          # 出力カード共通UI（ラベル＋CopyButton＋readOnly textarea）
    │   │   ├── Select.tsx               # ジェネリックセレクトボックス
    │   │   ├── ToggleGroup.tsx
    │   │   └── ToolIcon.astro           # slug → SVG アイコンマッピング
    │   └── tools/
    │       ├── UlidGenerator.tsx
    │       ├── UuidV7Generator.tsx
    │       ├── JwtDecoder.tsx
    │       ├── Base64Codec.tsx
    │       ├── DummyText.tsx
    │       ├── UrlEncoder.tsx
    │       ├── QrCode.tsx
    │       ├── QrReader.tsx
    │       ├── JanCode.tsx
    │       ├── Gs1Databar.tsx
    │       ├── EncodingConverter.tsx
    │       ├── SqlFormatter.tsx
    │       ├── RegexVisualizer.tsx
    │       ├── RegexAstTree.tsx
    │       └── RegexRailroad.tsx          # 鉄道図 SVG レンダラ（RailNode → React svg 要素・CJS 非依存）
    ├── layouts/
    │   ├── BaseLayout.astro
    │   └── ToolLayout.astro
    ├── pages/
    │   ├── index.astro
    │   ├── about.astro
    │   ├── privacy.astro
    │   └── tools/
    │       ├── ulid-generator.astro
    │       ├── uuid-v7.astro
    │       ├── jwt-decoder.astro
    │       ├── base64.astro
    │       ├── dummy-text.astro
    │       ├── url-encode.astro
    │       ├── qr-code.astro
    │       ├── qr-reader.astro
    │       ├── jan-code.astro
    │       ├── gs1-databar.astro
    │       ├── encoding-converter.astro
    │       ├── config-converter.astro
    │       ├── sql-formatter.astro
    │       ├── regex-visualizer.astro
    │       ├── json-formatter.astro
    │       ├── cidr-calculator.astro
    │       ├── secret-scrubber.astro
    │       ├── clipboard-inspector.astro
    │       ├── dsn-builder.astro
    │       ├── cert-decoder.astro
    │       ├── key-converter.astro
    │       ├── har-viewer.astro
    │       ├── csr-generator.astro
    │       └── markdown-editor.astro
    ├── data/
    │   └── tools.ts
    ├── hooks/
    │   ├── useClampedInput.ts  # 数値入力の min/max クランプ
    │   ├── useCodec.ts         # 入力→デバウンス→変換→出力＋エラーの共通フック
    │   └── useQrCamera.ts
    ├── styles/
    │   └── global.css
    └── utils/
        ├── base64.ts           # Base64 ツール用 UTF-8 ⇄ 文字列変換
        ├── base64url.ts        # base64url 共通ヘルパー（jwt/qr-ticket が利用）
        ├── clipboard.ts
        ├── jwt.ts              # JWT パース・フォーマット関数
        ├── url-encode.ts       # URLエンコード/デコード関数
        ├── jan-code.ts         # JANコード チェックディジット計算
        ├── gs1-databar.ts      # GTIN-14計算・GS1 AIビルダー
        ├── encoding.ts         # 文字コード判定・変換ラッパー（encoding-japanese）
        ├── config-converter/   # 設定ファイル相互変換（json.ts / yaml.ts / toml.ts / dotenv.ts / schema-validator.ts）
        ├── sql/                # SQL 整形・埋め込みユーティリティ（format.ts / embedParams.ts / index.ts）
        ├── regex-visualizer/   # 正規表現 AST 変換・ReDoS 判定・鉄道図レイアウト・マッチ実行（parse.ts / redos.ts / railroad-layout.ts / railroad.ts / match.ts / index.ts）
        ├── json-formatter/     # JSON 整形・最小化・検証・ツリー構築（parse.ts / format.ts / tree.ts / errors.ts / index.ts、__tests__ colocated）
        ├── cidr-calculator/    # CIDR/サブネット計算機（types.ts / ipv4.ts / ipv6.ts / parse.ts / index.ts、__tests__ colocated）
        ├── secret-scrubber/    # シークレットスクラバー（rules.ts / entropy.ts / scrub.ts / index.ts）
        ├── dsn-builder/        # DSN/接続文字列ビルダ（types.ts / dialects.ts / parse.ts / serialize.ts / validate.ts / index.ts）
        ├── cert/               # SSL/TLS証明書デコーダ（types.ts / detect.ts / parse.ts / sct.ts / chain.ts / index.ts）
        ├── key/                # 鍵フォーマット変換（types.ts / detect.ts / convert.ts / index.ts）
        ├── har/                # HARビューア＆サニタイザ（types.ts / rules.ts / parse.ts / sanitize.ts / index.ts、__tests__ colocated）
        ├── csr/                # CSR・鍵ペアジェネレータ（types.ts / generate.ts / parse.ts / index.ts）
        ├── dataTransferSnapshot.ts  # DataTransfer 捕捉・フレーバー列挙（clipboard-inspector が利用）
        ├── sanitizeHtml.ts          # 許可リスト方式 HTML サニタイザ（clipboard-inspector が利用）
        ├── download.ts         # バイナリファイルダウンロードユーティリティ
        ├── qr-reader.ts
        ├── qr-ticket.ts
        ├── qrcode.ts
        ├── uuid-v7.ts
        ├── styles.ts           # 共通タイポグラフィ定数
        └── __tests__/
            ├── base64.test.ts
            ├── base64url.test.ts
            ├── encoding.test.ts
            ├── gs1-databar.test.ts
            ├── jan-code.test.ts
            ├── json-csv.test.ts
            ├── json-xml.test.ts
            ├── config-converter/   # json/yaml/toml/dotenv/schema-validator/convert テスト
            ├── sql/                # SQL 整形・埋め込みテスト（format.test.ts / embedParams.test.ts）
            ├── jwt.test.ts
            ├── qr-reader.test.ts
            ├── qr-ticket.test.ts
            ├── url-encode.test.ts
            ├── uuid-v7.test.ts
            └── secret-scrubber.test.ts
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
- カテゴリタブ（すべて / 生成 / コード・バーコード / エンコード・デコード / 変換・解析）で絞り込み
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

## 4. ツール一覧（全22ツール）

### カテゴリ A: 生成ツール（`generate`）

| #   | ツール名                | slug             | 概要                                                                                                                                                                        |
| --- | ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ULID生成                | `ulid-generator` | 生成数を指定（1〜100）して一括生成。タイムスタンプ表示付き                                                                                                                  |
| 2   | UUID v7 生成            | `uuid-v7`        | 生成数を指定（1〜100）して一括生成。タイムスタンプ・フィールド分解表示付き                                                                                                  |
| 3   | ダミーテキスト生成      | `dummy-text`     | 文字種（全角ひらがな/カタカナ/漢字混じり/半角英数）と文字数を指定して生成                                                                                                   |
| 4   | TOTP/HOTP ジェネレータ  | `totp-hotp`      | TOTP（RFC 6238）・HOTP（RFC 4226）のワンタイムコードを生成・検証。シークレット鍵はブラウザ外に送信しない                                                                    |
| 28  | CSR・鍵ペアジェネレータ | `csr-generator`  | RSA（2048/3072/4096 bit）/ ECDSA（P-256/P-384/P-521）の鍵ペアを生成し PKCS#10 CSR を出力。Subject DN・SAN 設定対応。既存 CSR の解析・署名検証にも対応。全処理ブラウザ内完結 |

### カテゴリ B: コード・バーコードツール（`code`）

| #   | ツール名         | slug          | 概要                                                                              |
| --- | ---------------- | ------------- | --------------------------------------------------------------------------------- |
| 5   | QRコード生成     | `qr-code`     | テキスト/URL入力 → QRコード画像生成。PNG/SVGダウンロード                          |
| 6   | JANコード生成    | `jan-code`    | 12桁入力 → チェックディジット自動計算 → バーコード画像生成                        |
| 7   | GS1 DataBar 生成 | `gs1-databar` | GTIN-14入力 → GS1 DataBar Limited合成シンボル生成。CC-A対応（AI: 17/10/11/15/21） |
| 8   | QRチケット       | `qr-ticket`   | ECDSA署名付きQRチケットを生成し、公開鍵でオフライン検証                           |
| 9   | QRリーダー       | `qr-reader`   | カメラまたは画像ファイルからQRコードを読み取り、テキスト・URLを表示               |

### カテゴリ C: エンコード・デコードツール（`encode`）

| #   | ツール名                  | slug           | 概要                                                                                                                                                                                                                                                                    |
| --- | ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | URLエンコード/デコード    | `url-encode`   | テキスト⇔URLエンコード相互変換                                                                                                                                                                                                                                          |
| 11  | Base64エンコード/デコード | `base64`       | テキスト⇔Base64 相互変換。通常の Base64 と URL-safe Base64 に対応                                                                                                                                                                                                       |
| 12  | JWTデコーダー             | `jwt-decoder`  | JWTトークン貼り付け → Header/Payload/署名を分解表示。HS/RS/ES署名検証対応                                                                                                                                                                                               |
| 25  | SSL/TLS証明書デコーダ     | `cert-decoder` | PEM/DER/PKCS#7/PKCS#12（.pfx/.p12）証明書を解析し Subject/SAN/有効期限/署名アルゴリズム/SCT を表示。複数証明書のチェーン並べ替え・署名検証（pkijs + Web Crypto）対応。PKCS#12 はパスワード復号・秘密鍵（メタ情報常時／PKCS#8 PEM トグル開示）含む。全処理ブラウザ内完結 |

### カテゴリ D: 変換・解析ツール（`convert`）

| #   | ツール名                          | slug                  | 概要                                                                                                                                                                                                                                                    |
| --- | --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | JSON / XML 変換                   | `json-xml`            | JSON⇔XML 相互変換。ルートタグは `root` 固定、XML属性は `@_` プレフィックス形式                                                                                                                                                                          |
| 14  | JSON / CSV 変換                   | `json-csv`            | JSON⇔CSV 相互変換。ネストオブジェクトはドット記法でフラット化                                                                                                                                                                                           |
| 15  | 文字コード判定・変換              | `encoding-converter`  | ファイル/テキストの文字コードを自動判定し、UTF-8・Shift_JIS (CP932)・EUC-JP 等へ変換                                                                                                                                                                    |
| 16  | 設定ファイル相互変換              | `config-converter`    | YAML・JSON・TOML・.env を相互変換。同形式整形時は YAML のコメントを保持。JSON Schema 検証（draft-04/07、動的インポート）                                                                                                                                |
| 17  | 文字カウント                      | `char-count`          | 文字数・エンコーディング互換性・行数・SNS文字数制限・原稿枚数を集計。絵文字のDB投入エラー予測対応                                                                                                                                                       |
| 18  | SQL整形・パラメータ埋め込み       | `sql-formatter`       | 汚れた SQL をインデント・キーワード大文字化で整形し、プレースホルダ（? / $n / :name）にJSONパラメータを埋め込む。MySQL / PostgreSQL / SQLite / SQL Server 方言対応                                                                                      |
| 19  | 正規表現ビジュアライザ＆ReDoS検出 | `regex-visualizer`    | 正規表現を AST ツリー・鉄道図で可視化し、ReDoS 脆弱性を検出。テスト文字列に対するマッチハイライトとキャプチャグループ表示に対応。JavaScript（ECMAScript）正規表現対応                                                                                   |
| 20  | JSON整形・ビューア                | `json-formatter`      | JSON を整形（2/4/タブ）・最小化し、折りたたみツリーで閲覧。構文エラーは行・列付きで表示。数値リテラル・大きな整数の精度を保持し、全処理をブラウザ内で完結。JMESPath クエリで値を抽出可能。PII/シークレットを検出してマスク。TypeScript 型を生成         |
| 21  | CIDR/サブネット計算機             | `cidr-calculator`     | CIDR 記法でアドレスを入力しネットワーク情報を計算。IPv4/IPv6 対応。ネットワーク・ブロードキャスト・ホスト範囲・サブネットマスク・利用可能ホスト数を表示。BigInt による 128bit 統一処理。外部ライブラリなし                                              |
| 22  | シークレットスクラバー            | `secret-scrubber`     | ログ・コード・設定からAPIキー・トークン・メール・IP等の機密情報を検出して一括マスク。同一値は同一プレースホルダに置換。全処理ブラウザ内完結・外部ライブラリなし                                                                                         |
| 23  | クリップボードインスペクタ        | `clipboard-inspector` | 貼り付け・ドラッグ&ドロップの DataTransfer を捕捉し、全 MIME フレーバー（text/plain・text/html・カスタム型・画像・ファイル）の種別と中身を可視化。HTML はサニタイズ後 sandbox iframe プレビュー付き。追加依存なし（DOMParser・Web API のみ）            |
| 24  | DSN/接続文字列ビルダ              | `dsn-builder`         | 接続文字列（DSN）をフォームと URI で双方向編集。パスワードをマスクした共有用 URI も生成。PostgreSQL / MySQL / MongoDB / Redis / AMQP 対応（PostgreSQL・MySQL は JDBC URL も対応）。自前パーサで percent-encode を自動処理。外部ライブラリなし           |
| 26  | 鍵フォーマット変換                | `key-converter`       | RSA / ECDSA（P-256/P-384/P-521）の公開鍵・秘密鍵を PEM / DER（Base64）/ JWK で相互変換。入力形式と鍵種別を自動判定。Web Crypto API 主体で asn1js による OID 判定。全処理ブラウザ内完結                                                                  |
| 27  | HARビューア＆サニタイザ           | `har-viewer`          | HAR ファイルをリクエスト/レスポンス一覧・詳細表示し、Cookie・認証ヘッダ・機密クエリ・POST ボディを構造的に redact。scrubText で本文の取りこぼしを追加検出。一貫トークン化（同一値=同一プレースホルダ）。全処理ブラウザ内完結・新規ライブラリなし        |
| 28  | CSR・鍵ペアジェネレータ           | `csr-generator`       | RSA / ECDSA の鍵ペアを生成し PKCS#10 CSR（証明書署名要求）を出力。Subject DN（CN/O/OU/C/ST/L/email）と SAN（DNS/IP/email）を設定可能。既存 CSR の Subject/SAN/公開鍵/署名アルゴリズム抽出と自己署名検証に対応。pkijs + Web Crypto。全処理ブラウザ内完結 |
| 29  | markdownエディタ                  | `markdown-editor`     | markdown を 2 ペインでリアルタイム HTML プレビュー。GFM（表・取り消し線・コードブロック）対応。`marked` で HTML 変換後に既存 `sanitizeHtml` でサニタイズ。HTML クリップボードコピー・.md ダウンロード。全処理ブラウザ内完結                             |

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

### 5.2 UUID v7 生成（`uuid-v7`）

**入力:**

- 生成数: 数値入力（1〜100、デフォルト: 1）
- [生成] ボタン

**処理:**

- `uuid` ライブラリの `v7()` 関数で UUID v7 を生成
- 各 UUID から埋め込みタイムスタンプ（ミリ秒精度）を抽出し ISO 8601 形式に変換
- UUID v7 のフィールド構成を分解表示:
  - `unix_ts_ms` (48bit): ミリ秒 UNIX タイムスタンプ
  - `ver` (4bit): バージョン (`7`)
  - `rand_a` (12bit): ランダムビット
  - `var` (2bit): バリアント (`10`)
  - `rand_b` (62bit): ランダムビット

**出力:**

- UUIDリスト（テーブル形式: No. / UUID / タイムスタンプ）
- フィールド分解パネル（選択行の UUID を 5フィールドに色分け表示）
- [すべてコピー] ボタン（UUID のみ改行区切り）
- 個別行の [コピー] ボタン

**UI:**

```
┌───────────────────────────────────────────────────────┐
│  UUID v7 生成                                          │
├───────────────────────────────────────────────────────┤
│  生成数: [  5  ] [▼]                         [生成]   │
├───────────────────────────────────────────────────────┤
│  #  │ UUID                                 │ タイムスタンプ      │ 操作     │
│  1  │ 019687a2-1234-7abc-8def-0123456789ab │ 2026-04-15T... │ [コピー] │
│  2  │ ...                                  │ ...            │ [コピー] │
├───────────────────────────────────────────────────────┤
│  フィールド分解（選択中の UUID）                        │
│  unix_ts_ms      ver  rand_a  var  rand_b             │
│  [019687a2-1234] [7] [abc]   [8]  [def-0123456789ab] │
├───────────────────────────────────────────────────────┤
│                            [すべてコピー] [クリア]     │
└───────────────────────────────────────────────────────┘
```

**バリデーション・エラー処理:**

- 生成数が範囲外（1〜100 以外）→ 入力を境界値にクランプ

---

### 5.3 JWTデコーダー（`jwt-decoder`）

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

### 5.4 ダミーテキスト生成（`dummy-text`）

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

### 5.5 Base64エンコード/デコード（`base64`）

**入力:**

- テキストエリア: 任意のテキスト（UTF-8）
- モード切替: [エンコード] / [デコード] タブ
- 形式切替: [標準 Base64] / [URL-safe Base64] トグル

**処理:**（ブラウザ組み込み API のみ使用。外部ライブラリ不要）

- **エンコード:**
  - UTF-8 文字列を `TextEncoder` でバイト列に変換
  - 標準: `btoa()` + 必要に応じて改行なし出力
  - URL-safe: `+` → `-`、`/` → `_`、末尾 `=` パディングを除去
- **デコード:**
  - URL-safe 入力を標準形式に正規化（`-` → `+`、`_` → `/`、パディング補完）
  - `atob()` → `TextDecoder` で UTF-8 文字列に復元
  - デコード失敗時はエラー表示

**出力:**

- テキストエリア（変換結果、リアルタイム変換・デバウンス 300ms）
- [コピー] ボタン

**エラー処理:**

- 不正な Base64 文字列 → 「有効なBase64文字列ではありません」
- デコード結果がバイナリ（非UTF-8）→ 「テキストとして表示できないデータです」
- 空入力 → 出力欄は空（エラー非表示）

**UI:**

```
┌───────────────────────────────────────┐
│  Base64 エンコード/デコード            │
├───────────────────────────────────────┤
│  [エンコード]  [デコード]              │
│  形式: [標準 Base64]  [URL-safe]       │
├───────────────────────────────────────┤
│  入力:                    出力: [コピー]│
│  ┌──────────────┐  ┌──────────────┐   │
│  │              │  │              │   │
│  └──────────────┘  └──────────────┘   │
│  [サンプル]                   [クリア] │
└───────────────────────────────────────┘
```

---

### 5.6 URLエンコード/デコード（`url-encode`）

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

### 5.7 QRコード生成（`qr-code`）

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

### 5.8 JANコード生成（`jan-code`）

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

### 5.9 JSON / XML 変換（`json-xml`）

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
>
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

### 5.10 JSON / CSV 変換（`json-csv`）

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

### 5.11 QRチケット（`qr-ticket`）

**入力（生成タブ）:**

- 鍵ペア: 「新規生成」ボタン or 既存秘密鍵JWKのインポート
- イベントID: テキスト（QRコードに埋め込まれる識別子）
- 有効期限: datetime-local（ISO 8601形式で保存）
- チケットリスト（最大20件）: チケットID / 参加者名（任意）/ 料金区分（任意）

**入力（検証タブ）:**

- 公開鍵JWK: テキストエリア（生成タブで作成すると自動入力）
- QR読取方法: カメラ（リアルタイムスキャン）or 画像アップロード

**処理（生成）:**

- `crypto.subtle.generateKey` でECDSA P-256 鍵ペア生成
- ペイロード（e, t, x, n?, p?）をキー昇順ソートしたJSONに署名
- 署名をBase64URLエンコードしてSignedTicket JSONを構築
- `qrcode-generator` でSVG生成（誤り訂正レベルM固定）

**処理（検証）:**

- `jsqr` でカメラフレームまたは画像からQRデータをデコード（同期）
- `crypto.subtle.verify` でECDSA署名を検証
- 有効期限（`x` フィールド）を現在時刻と比較

**出力（生成）:**

- 鍵ペア（秘密鍵・公開鍵）JWK表示 + コピーボタン
- QRコードグリッド（SVG 160×160）+ 個別SVGダウンロード
- 一括ZIPダウンロード（jszip使用、2件以上で表示）

**出力（検証）:**

- 有効 / 無効 / 期限切れの判定結果
- デコードされたチケット情報（イベントID・チケットID・有効期限・参加者名・料金区分）

**QRデータ形式:**

```text
eventId|ticketId|timestamp|name|category|signature
```

| フィールド | 説明       | 備考                               |
| :--------- | :--------- | :--------------------------------- |
| eventId    | イベントID |                                    |
| ticketId   | チケットID |                                    |
| timestamp  | 有効期限   | Unixタイムスタンプ（秒）           |
| name       | 参加者名   | 任意。パイプ `\|` はスペースに置換 |
| category   | 料金区分   | 任意。パイプ `\|` はスペースに置換 |
| signature  | 署名       | Base64URLエンコード                |

※ 160pxの表示サイズでの読取精度を確保するため、全データ（署名・時間含む）の合計を **250バイト以内**（UTF-8）に制限。

---

### 5.12 文字コード判定・変換（`encoding-converter`）

**入力:**

- 入力方式トグル: [テキスト] / [ファイル]
- テキスト: テキストエリア（貼り付け。ブラウザ内では UTF-8 として扱われる）
- ファイル: ファイルアップロード（上限 10 MB）

**モード:**

- [判定]: 入力バイト列の文字コードを自動判定し、結果カードに表示
- [変換]: 元エンコーディングを指定（または自動判定）して、指定エンコーディングに変換

**処理:**（`src/utils/encoding.ts`、`encoding-japanese` 使用）

- BOM 先頭バイトを自前で検出（UTF-8: `EF BB BF` / UTF-16LE: `FF FE` / UTF-16BE: `FE FF`）
- `encoding-japanese` の `Encoding.detect()` で文字コードを判定し、内部の `EncodingName` 型に正規化
- デコード: `Encoding.convert({ to: 'UNICODE', from })` → `String.fromCharCode` チャンク処理（8192 刻み、スタック溢れ防止）
- 変換: `Encoding.convert({ to, from, type: 'array' })` でバイト列変換
- BOM 付与: UTF-8 BOM は手動プリペンド `[0xef, 0xbb, 0xbf]`、UTF-16 は `to:'UTF16'` + `bom:'LE'/'BE'` オプションで付与
- 改行コード正規化: 変換後バイト列に対してバイト単位で適用（UTF-8/SJIS/EUC-JP/JIS/ASCII が対象。UTF-16 は対象外）
  - LF: `0x0D 0x0A` → `0x0A`（単独 CR は保持）
  - CRLF: 単独 `0x0A` → `0x0D 0x0A`（既存 CRLF の LF は重複変換しない）

**対応文字コード:**

| 内部名    | 表示名            |
| --------- | ----------------- |
| `UTF8`    | UTF-8             |
| `SJIS`    | Shift_JIS (CP932) |
| `EUCJP`   | EUC-JP            |
| `JIS`     | ISO-2022-JP       |
| `UTF16LE` | UTF-16 LE         |
| `UTF16BE` | UTF-16 BE         |
| `ASCII`   | ASCII             |

**出力（判定モード）:**

- 検出エンコーディング名
- BOM 有無
- バイトサイズ
- デコードプレビュー（先頭 500 文字）

**出力（変換モード）:**

- 変換後テキストプレビュー（先頭 500 文字）+ [コピー] ボタン
- 変換後バイト列の先頭 16 バイト hex プレビュー
- [ダウンロード] ボタン（`application/octet-stream` で保存）

**エラー処理:**

- 10 MB 超過: 「ファイルが大きすぎます（上限 10 MB）」
- 文字コード判定不能（非テキストバイナリ等）: `UNKNOWN` として表示
- 変換失敗: 「変換に失敗しました」

**UI:**

```
┌──────────────────────────────────────────────────────┐
│  [判定]  [変換]                                        │
│  入力: [テキスト]  [ファイル]                           │
├──────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐    │
│  │  テキスト入力エリア（multiline）  [サンプル]   │    │
│  └──────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────┤
│  判定結果: UTF-8  BOM: なし  サイズ: 123 B             │
│  ┌────────────────────────────────────────────┐      │
│  │  プレビュー（デコード済みテキスト）            │      │
│  └────────────────────────────────────────────┘      │
├──────────────────────────────────────────────────────┤
│  （変換モード時のみ）                                   │
│  元の文字コード: [自動判定] [UTF-8] [SJIS] [EUC-JP]    │
│                [JIS] [UTF-16LE] [UTF-16BE]            │
│  変換後:        [UTF-8] [SJIS] [EUC-JP]               │
│                [JIS] [UTF-16LE] [UTF-16BE]            │
│  改行コード:   [そのまま] [LF] [CRLF]                  │
│  □ BOM を付与する                                      │
├──────────────────────────────────────────────────────┤
│  変換結果プレビュー:            [コピー] [ダウンロード] │
│  ┌────────────────────────────────────────────┐      │
│  │                                              │      │
│  └────────────────────────────────────────────┘      │
│  123 B  先頭: EF BB BF ...                            │
│                                              [クリア]  │
└──────────────────────────────────────────────────────┘
```

---

### 5.13 QRリーダー（`qr-reader`）

**入力:**

- 読取方法トグル: [カメラ] / [画像アップロード]
- カメラ: [カメラを起動] ボタン → ライブプレビュー → QR検出で自動停止
- 画像アップロード: 「画像を選択」ラベル経由のファイル選択（PNG・JPG 等）

**処理:**

- カメラ: `useQrCamera` フックによる `getUserMedia` + rAF スキャンループ（`jsqr` 使用）
- 画像: `createObjectURL` → `<img>` → `<canvas>` に描画 → `jsqr` でデコード
- URL判定: `detectQrContent()` 関数（`src/utils/qr-reader.ts`）で `http:`/`https:` のみ `kind: 'url'`、その他は `kind: 'text'`

**出力:**

- 読取テキスト（`<pre>` 表示、改行・空白を保持）
- [コピー] ボタン
- URL の場合: 警告枠（ホスト名強調 + 「URLをよく確認してください」メッセージ）+ [URLを開く] リンク（`target="_blank" rel="noopener noreferrer"`）
- [再スキャン] ボタン

**セキュリティ方針:**

- `javascript:` / `data:` / `file:` 等の危険スキームは `kind: 'text'` として扱い、リンク化しない
- HTTP/HTTPS URL でも自動ではリンクを開かない（ユーザーの明示的操作が必要）
- カメラ: `facingMode: 'environment'`（背面カメラ優先）

**制約:**

- カメラ読取は HTTPS 環境または localhost でのみ動作
- QRコード（2次元）のみ対応。バーコード（JAN・EAN 等）は非対応

**UI:**

```
┌─────────────────────────────────────┐
│  [カメラ]  [画像アップロード]           │
├─────────────────────────────────────┤
│  [カメラを起動]                        │
│  ┌──────────────────────────────┐   │
│  │  カメラプレビュー（起動後に表示）  │   │
│  └──────────────────────────────┘   │
├─────────────────────────────────────┤
│  読取結果                             │
│  ┌──────────────────────────────┐   │
│  │  https://example.com          │   │
│  └──────────────────────────────┘   │
│  [コピー]                             │
│  ┌──────────────────────────────┐   │
│  │ ⚠ example.com への外部リンク  │   │
│  │  URLをよく確認してください      │   │
│  │  [URLを開く]                   │   │
│  └──────────────────────────────┘   │
│  [再スキャン]                         │
└─────────────────────────────────────┘
```

---

### 5.14 TOTP/HOTP ジェネレータ（`totp-hotp`）

**入力:**

- モード: [TOTP] / [HOTP] / [検証] トグル
- Base32 シークレット（password 型、表示/非表示トグル付き）
- アルゴリズム: [SHA-1] / [SHA-256] / [SHA-512]
- 桁数: [6桁] / [7桁] / [8桁]
- （TOTPのみ）周期: [30秒] / [60秒]
- （HOTPのみ）カウンタ値
- 発行者名 / アカウント（otpauth URI 生成用）

**処理:**

- `base32Decode` → `crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: algorithm }, false, ['sign'])` → `crypto.subtle.sign`
- TOTP: `counter = floor(timestamp / (period * 1000))` → `hotp()` を 250ms 間隔でポーリング
- HOTP: ボタン押下時に単発生成
- RFC 4226 dynamic truncation: `offset = mac[mac.length-1] & 0x0f` → `(mac[offset]&0x7f)<<24 | ... % 10^digits`
- 検証: 現在カウンタ ± `window=1` 範囲で総当たり比較

**出力:**

- 現在コード（`role="status"`、`aria-label="現在のコード: XXXXXX"`）
- 次コード（TOTP のみ）
- 残り秒数プログレスバー（TOTP のみ、countdown 方向）
- otpauth:// URI（`role="textbox"`、コピーボタン付き）
- 検証結果（`aria-live="assertive"`、有効 / 無効）

**セキュリティ方針:**

- シークレット鍵はサーバーへ一切送信しない（すべてクライアント計算）
- シークレット入力は `type="password"` 規定、ページ離脱で State 消去
- otpauth URI 内の QR コードは本ツール内で描画しない（`/tools/qr-code` へ誘導）。secret を含む QR を自動表示すると画面録画等での意図せず露出リスクがあるため

**制約:**

- `crypto.subtle` が利用可能な HTTPS または localhost 環境必須
- Base32 アルファベット外の文字（`!` 等）は入力時点でエラー表示

### 5.15 SQL整形・パラメータ埋め込み（`sql-formatter`）

ツールは **整形** タブと **パラメータ埋め込み** タブの 2 タブ構成。

#### 5.15.1 整形タブ

**入力:**

- SQL テキスト（複数行対応テキストエリア）
- 方言セレクト: [MySQL] / [PostgreSQL] / [SQLite] / [SQL Server]（デフォルト: MySQL）
- [サンプル] ボタン

**処理:**

- `sql-formatter`（v15.8.0）の `format()` を使用
- キーワードを大文字化（`keywordCase: "upper"`）
- インデント 2 スペース（`tabWidth: 2`）
- 入力変更・方言変更をトリガーにデバウンス整形（300ms）

**出力:**

- 整形済み SQL テキストエリア（読み取り専用）
- [コピー] ボタン

**UI:**

```
┌───────────────────────────────────────┐
│  SQL整形・パラメータ埋め込み           │
│  [整形] [パラメータ埋め込み]           │
├───────────────────────────────────────┤
│  SQL入力                               │
│  [  テキストエリア（複数行）           ]│
│  [サンプル]                            │
├───────────────────────────────────────┤
│  方言: [MySQL ▼]                       │
├───────────────────────────────────────┤
│  整形済み SQL                          │
│  [  テキストエリア（読み取り専用）     ]│
│                              [コピー]  │
└───────────────────────────────────────┘
```

#### 5.15.2 パラメータ埋め込みタブ

SQL のプレースホルダにJSON形式のパラメータを埋め込み、人間が読みやすい形で表示する。**実行用SQLではなくデバッグ表示専用。**

**入力:**

- SQL テキスト（プレースホルダを含む複数行対応テキストエリア）
- パラメータ（JSON）テキストエリア
  - `?` / `$n` 形式: JSON 配列（例: `["value1", 42, null]`）
  - `:name` 形式: JSON オブジェクト（例: `{"id": 1, "name": "山田"}`）
- 方言セレクト: [MySQL] / [PostgreSQL] / [SQLite] / [SQL Server]（デフォルト: MySQL）

**処理（プレースホルダスキャナ）:**

- 軽量スキャナにより、文字列リテラル（シングル/ダブルクォート）・ラインコメント（`--`）・ブロックコメント（`/* */`）・クォート済み識別子（`` ` `` / `"..."` / `[...]`）内の `?` / `$n` / `:name` を誤検出しない
  - 例: `WHERE note = 'why?'` の `?` はプレースホルダとして扱わない
- 既知制約: PostgreSQL ドル引用符文字列（`$tag$...$tag$`）はスキャナ未対応

**値レンダリング（方言別）:**

| 値の型             | MySQL / SQLite / SQL Server                | PostgreSQL       |
| ------------------ | ------------------------------------------ | ---------------- |
| 文字列             | シングルクォートで囲み `'`→`''` エスケープ | 同左             |
| 数値               | そのまま                                   | 同左             |
| null               | `NULL`                                     | `NULL`           |
| boolean            | `1` / `0`                                  | `TRUE` / `FALSE` |
| 配列・オブジェクト | エラー（未対応）                           | 同左             |

**出力:**

- プレースホルダを値に置換した SQL テキスト（読み取り専用テキストエリア）
- [コピー] ボタン
- 常時表示の警告バナー「⚠ この出力は実行禁止・デバッグ表示用です」
- 失敗時は日本語エラーメッセージ

**UI（パラメータ埋め込みタブ）:**

```
┌───────────────────────────────────────┐
│  SQL整形・パラメータ埋め込み           │
│  [整形] [パラメータ埋め込み ●]        │
├───────────────────────────────────────┤
│  ⚠ この出力は実行禁止・デバッグ表示用です │
├───────────────────────────────────────┤
│  SQL入力                               │
│  [  テキストエリア（複数行）           ]│
├───────────────────────────────────────┤
│  パラメータ (JSON)                     │
│  [  テキストエリア                     ]│
├───────────────────────────────────────┤
│  方言: [MySQL ▼]                       │
├───────────────────────────────────────┤
│  埋め込み済み SQL                      │
│  [  テキストエリア（読み取り専用）     ]│
│                              [コピー]  │
└───────────────────────────────────────┘
```

### 5.22 シークレットスクラバー（`secret-scrubber`）

**入力:**

- テキスト: 複数行テキストエリア（ログ・設定ファイル・コードを貼り付け）
- マスク対象: カテゴリごとのトグルチップ（APIキー / 秘密鍵 / 認証情報 / JWT / メール / IPアドレス / 電話番号 / カード番号 / 高エントロピー）、全カテゴリ既定 ON
- [サンプルを入力] ボタン（AWS 例示キー・メール・IP・JWT を含む架空ログ）

**出力:**

- マスク済みテキスト: readonly テキストエリア
- [コピー] ボタン
- [クリア] ボタン

**検出ルール:**

- API キー: AWS（`AKIA`/`ASIA`/`ABIA`/`ACCA` + 16 文字）・GitHub・GitLab・Slack・Stripe・Google API・SendGrid・Anthropic・OpenAI・npm
- 秘密鍵: PEM `-----BEGIN ... PRIVATE KEY-----` 〜 `-----END ... PRIVATE KEY-----` ブロック全体
- 認証情報（値のみマスク）: `password=` / `token:` / `パスワード：` 等の代入式（日本語キー名・全角コロン対応）・URL 認証情報のパスワード部・Authorization / x-api-key ヘッダのトークン部
- JWT: `eyJ` で始まる 3 セグメント形式
- メール: `ユーザー名@ドメイン` 形式
- IP: IPv4（オクテット 0〜255 検証付き）
- 電話番号: ハイフン区切り日本形式・+81 国際形式
- クレジットカード: Luhn チェック付き
- 高エントロピー: Shannon エントロピー ≥ 4.0（base64 風）または ≥ 3.0（hex 32 文字以上）。UUID は除外

**プレースホルダ形式:**

`[REDACTED:<カテゴリ>_<連番>]`（例: `[REDACTED:EMAIL_1]`）。同一値は常に同一プレースホルダ。

### 5.23 クリップボードインスペクタ（`clipboard-inspector`）

**入力:**

- `paste` イベント（ページ全体で捕捉）またはドラッグ&ドロップによる DataTransfer
- [クリア] ボタン

**出力:**

- フレーバーごとのカード一覧: 種別（string / file）・MIME タイプ・バイトサイズ
- テキストフレーバー（text/plain 等）: 中身の展開表示
- text/html フレーバー: サニタイズ後プレビュー（sandbox iframe）＋生ソース表示切替
- ファイルフレーバー: ファイル名・サイズ・最終更新日時。image/\* は画像プレビュー

**処理フロー:**

1. `paste` / `drop` イベントハンドラの **同期スコープ内** で `DataTransferItemList` を列挙（ハンドラ終了後は無効化されるため）
2. `kind === 'string'` は `getAsString` を呼び出し Promise で非同期解決
3. `kind === 'file'` は `getAsFile()` で `File` オブジェクトを取得
4. text/html は `sanitizeHtml`（許可リスト方式: script / iframe / on\* / javascript: URL / style 除去）→ `sandbox=""` iframe の srcdoc で描画

**追加依存:** なし（DOMParser・Web API のみ）

---

### 5.24 DSN/接続文字列ビルダ（`dsn-builder`）

**概要:** データベース・ミドルウェアの接続文字列（DSN）をフォーム ⇄ URI で双方向編集し、パスワードをマスクした共有用 URI を生成するツール。

**対応スキーム:** postgresql / postgres / mysql / mongodb / mongodb+srv / redis / rediss / amqp / amqps / jdbc:postgresql / jdbc:mysql（11スキーム）

**JDBC URL:** PostgreSQL / MySQL のみ `jdbc:` プレフィックス形式に対応。credential（user / password）は userinfo（`user:pass@host`）ではなく `?user=&password=` クエリプロパティとして入出力する（JDBC 標準の流儀）。パース時はプロパティから専用フィールドへ移し、シリアライズ時にプロパティ先頭へ戻す。SQL Server（`;` 区切り）・Oracle（`@host:port:SID`）は文法が大きく異なるため対象外。

**双方向同期:**

- URI テキストエリア編集 → `parseDsn` → 成功時フォーム反映 / 失敗時エラー表示（フォームは直前の有効状態を保持）
- フォーム編集 → `serializeDsn` → URI テキストエリアを上書き

**バリデーション（日本語メッセージ）:**

- 未対応スキーム / mongodb+srv でのポート指定・複数ホスト / ポート範囲外 / redis 非整数 DB / 不正 percent-encoding

**追加依存:** なし（純粋な文字列処理・`URL` API 不使用）

---

### 5.25 SSL/TLS証明書デコーダ（`cert-decoder`）

**概要:** PEM / DER / PKCS#7 / PKCS#12（.pfx/.p12）形式の証明書を貼り付け・ファイル選択で解析し、主要フィールドを表示する閲覧専用ツール。複数証明書を issuer→subject 順に並べ替え、隣接ペアの署名を検証する。社内 CA・本番証明書を外部送信せず扱う前提で、全処理をブラウザ内で完結する。

**対応形式:** PEM（複数ブロック可）/ DER（バイナリ・Base64）/ PKCS#7（`.p7b`、証明書抽出のみ）/ PKCS#12（`.p12`/`.pfx`、PBES2/AES 限定）

**表示フィールド:** Subject/Issuer DN・SAN・有効期限（NotBefore/NotAfter）・シリアル番号・署名アルゴリズム・公開鍵情報（種別・鍵長・curve）・KeyUsage/ExtendedKeyUsage/BasicConstraints・SubjectKeyIdentifier/AuthorityKeyIdentifier・SHA-256 フィンガープリント・SCT 一覧（RFC 6962 TLS 構造を best-effort デコード）

**チェーン検証:** subject/issuer DN（必要に応じて AKI/SKI）で親子関係を構築し、`pkijs` の `Certificate.verify`（Web Crypto）で各リンクの署名を検証。各証明書の現在時刻に対する有効/期限切れも判定する。改ざん・issuer 不一致・期限切れを検出する（陽性・陰性対照テスト併設）。

**PKCS#12 対応（#644）:** パスワード入力 UI でパスワードを受け取り、`parsePkcs12`（`src/utils/cert/pkcs12.ts`）で復号。証明書は `parseDerCertificates` → `buildChain` パイプラインに流す。秘密鍵は RSA/EC のアルゴリズム・鍵長・曲線名を常時表示し、PKCS#8 PEM は `<details>` トグルで開示。ダウンロードボタン付き。レガシー暗号（RC2/3DES）は UI でエラー案内（re-export コマンドを提示）。

**モジュール構成:** `src/utils/cert/`（`detect.ts` 入力種別判定 / `parse.ts` 正規化・`parseDerCertificates` / `pkcs12.ts` PKCS#12 復号 / `sct.ts` SCT デコード / `chain.ts` 並べ替え・検証 / `types.ts` / `index.ts`）

**追加依存:** `pkijs` / `asn1js`（PKCS#12 追加も同ライブラリで完結）

**スコープ外:** 鍵フォーマット変換（PEM/DER/JWK）→ key-converter ツール / 失効確認（CRL/OCSP）/ PKCS#12 のレガシー RC2-40/3DES 暗号（Web Crypto 非対応）

---

### 5.26 鍵フォーマット変換（`key-converter`）

**概要:** RSA / ECDSA（P-256 / P-384 / P-521）の公開鍵・秘密鍵を PEM / DER（Base64）/ JWK 形式で相互変換する。入力形式（PEM テキスト / DER バイナリ・Base64 / JWK JSON）と鍵種別（公開鍵 / 秘密鍵）を自動判定し、3形式を同時出力する。全処理はブラウザ内で完結するため、秘密鍵も外部サーバーに送信されない。

**対応入力形式:** PEM（PUBLIC KEY / PRIVATE KEY ヘッダ、SPKI / PKCS#8 構造）/ DER バイナリ（.der / .cer ファイル選択、または Base64 テキスト貼り付け）/ JWK（JSON Web Key、RFC 7517）

**対応鍵種別:** RSA 公開鍵・秘密鍵（SPKI / PKCS#8）/ ECDSA 公開鍵・秘密鍵（P-256 / P-384 / P-521 曲線）

**出力:** PEM テキスト（CopyButton + DownloadButton）/ DER Base64 テキスト（CopyButton）+ DER バイナリ（DownloadButton）/ JWK JSON テキスト（CopyButton + DownloadButton）の3形式同時出力

**モジュール構成:** `src/utils/key/`（`types.ts` / `detect.ts` 入力種別・アルゴリズム判定 / `convert.ts` Web Crypto 変換 / `index.ts`）

**追加依存:** なし（既存の `asn1js` を OID 判定に利用。pkijs 不使用）

**スコープ外（v1 非対応）:** PKCS#1 形式（RSA PUBLIC KEY / RSA PRIVATE KEY）・SEC1 形式（EC PRIVATE KEY）のレガシー PEM・暗号化秘密鍵（ENCRYPTED PRIVATE KEY）・Ed25519/Ed448・秘密鍵からの公開鍵抽出・cert-decoder 連携・鍵ペア生成

---

### 5.27 HARビューア＆サニタイザ（`har-viewer`）

**概要:** ブラウザ DevTools が出力する HAR（HTTP Archive 1.2）ファイルをブラウザ内で読み込み、リクエスト/レスポンスを一覧・詳細表示する。Cookie・認証ヘッダ・機密クエリパラメータ・POST ボディを構造的に redact し、`scrubText` で本文の取りこぼしを補完した「共有用 HAR」を JSON 出力（ダウンロード/コピー）する。全処理ブラウザ内完結・外部送信なし。

**入力:** HAR ファイル（ドラッグ&ドロップ / ファイル選択、最大 25MB）。`.har` / `.json` 拡張子を許可。

**redact 仕様:** 構造的 redact（フィールド名辞書ベース・確実な処理）と `scrubText`（自由テキスト走査・補完）の二段構え。

- COOKIE: `request.cookies[].value` / `response.cookies[].value` / `Cookie` ヘッダ / `Set-Cookie` ヘッダを一貫トークン化
- AUTH_HEADER: `Authorization` / `Proxy-Authorization` / `x-api-key` / `x-auth-token` / `x-csrf-token` / `x-xsrf-token` ヘッダ値を一貫トークン化
- QUERY: 機密クエリパラメータ（`token` / `access_token` / `password` 等の辞書）の値と URL 内対応箇所を redact。さらに URL を運ぶヘッダ（`Referer` / `Origin` / `Location` / `Content-Location`）も URL と同じ redact に通し、トークンが他ヘッダに残るのを防ぐ
- BODY: `postData.params[].value` の機密名と `postData.text` への `scrubText` 適用
- BODY_SCAN: `response.content.text` への `scrubText` 適用（API キー・JWT 等を追加検出）。`content.encoding === 'base64'` の本文は破壊防止のためスキャン対象外

一貫トークン化: `[REDACTED:COOKIE_1]` 等。同一値は HAR 全体で同一プレースホルダを割り当てる。

**UI:** redact カテゴリを `ToggleChips`（件数バッジ付き・既定すべて ON）で個別 ON/OFF。エントリ一覧テーブル（メソッド / URL / ステータス / サイズ / 時間 / **タイミング**）・行クリックで詳細パネル展開。サマリ（総リクエスト数・redact 件数）。

**ウォーターフォール（タイミング可視化、issue #674）:** `computeWaterfall`（`src/utils/har/waterfall.ts`）が全エントリの `startedDateTime` + `timings` から全体タイムライン基準の配置モデルを計算する。一覧の「タイミング」列（PC のみ、スマホは `hidden md:table-cell` で非表示）に `HarWaterfallBar` でフェーズ別色分け横棒を描画。詳細パネル（`HarEntryDetail` 内 `TimingBreakdown`）でフェーズ別内訳テーブルを表示（スマホでの担保）。HAR 1.2 の `ssl` は `connect` の部分時間のため `connect - ssl` で二重計上を防ぐ。`timings` 欠落エントリはバー非表示で degrade。

**モジュール構成:** `src/utils/har/`（`types.ts` HAR 1.2 サブセット型 + `HarTimings` / `rules.ts` redact カテゴリ定義・辞書 / `parse.ts` JSON パース＋最小スキーマ検証 / `sanitize.ts` 構造的 redact＋scrubText 純関数 / `waterfall.ts` `computeWaterfall` 純関数 / `index.ts`）/ `src/components/tools/HarViewer.tsx`（親）/ `HarEntryList.tsx`（一覧）/ `HarEntryDetail.tsx`（詳細）/ `HarWaterfallBar.tsx`（横棒セル）

**追加依存:** なし（既存の `secret-scrubber` の `scrubText` / `DEFAULT_ENABLED` を再利用）

**スコープ外:** 列ソート・フィルタ（タイミング順並び替え等）・バーのドラッグズーム・超大型 HAR でのバー描画の仮想化（動的 stylesheet のルール数が行数×フェーズ数で増えるため、将来は描画行数の上限/仮想化を検討余地）・`timings` を持たない HAR の補完推定・辞書外の独自名ヘッダ/クエリパラメータの完全 redact・base64 本文内の秘密検出

---

### 5.28 CSR・鍵ペアジェネレータ（`csr-generator`）

**概要:** ブラウザ内で RSA / ECDSA の鍵ペアを生成し、PKCS#10 CSR（証明書署名要求）を出力する。秘密鍵は PKCS#8 PEM で出力し、外部サーバーには一切送信しない。既存 CSR の解析（Subject/SAN/公開鍵/署名検証）にも対応。

**入力（生成モード）:** Subject DN（CN / O / OU / C / ST / L / emailAddress）、SAN（DNS / IP / email）、鍵アルゴリズム（RSA 2048/3072/4096 bit / ECDSA P-256/P-384/P-521）

**入力（解析モード）:** CSR の PEM（`-----BEGIN CERTIFICATE REQUEST-----` ヘッダ）または Base64（DER 直接）。ファイル選択（.csr / .pem / .der）にも対応。

**出力（生成モード）:** CSR（PKCS#10 / PEM）、秘密鍵（PKCS#8 / PEM）。各フィールドに個別ダウンロードボタン付き。

**出力（解析モード）:** Subject 属性一覧・SAN 一覧・公開鍵情報（アルゴリズム・鍵長/曲線）・署名アルゴリズム・署名検証結果（OK / NG / 不能）

**モジュール構成:** `src/utils/csr/`（`types.ts` / `generate.ts` / `parse.ts` / `index.ts`）/ `src/components/tools/CsrGenerator.tsx` / `src/components/tools/csrGeneratorSample.ts`

**追加依存:** なし（既存 `pkijs` / `asn1js` / `src/utils/cert/engine.ts` を再利用）

**スコープ外（v1 非対応）:** Ed25519/Ed448（EdDSA）、暗号化 PKCS#8（PBES2 / パスフレーズ付き秘密鍵）、SAN の IPv6、challengePassword 属性、KeyUsage / ExtendedKeyUsage 等のカスタム拡張編集

---

### 5.29 markdownエディタ（`markdown-editor`）

**概要:** markdown テキストを入力するとリアルタイムに HTML プレビューを表示する 2 ペインエディタ。GFM（GitHub Flavored Markdown）に対応し、表・取り消し線・コードブロック・引用を記述できる。全処理ブラウザ内完結。

**入力:** `<textarea>` への markdown テキスト直接入力。サンプル投入ボタンで GFM 機能を網羅したサンプルを挿入。

**出力:** リアルタイムの HTML プレビュー（右ペイン）。HTML クリップボードコピー（`CopyButton`）。入力 markdown 原文の `.md` ファイルダウンロード（`DownloadButton`）。

**データフロー:** `textarea` 入力 → `useMemo(renderMarkdown(input))` → `marked.parse(md, { gfm: true, breaks: true })` → `sanitizeHtml(html)` → `<div className="markdown-preview" dangerouslySetInnerHTML>` によるインライン描画。

**モジュール構成:** `src/utils/markdown.ts`（`renderMarkdown` 純関数）/ `src/components/tools/MarkdownEditor.tsx` / `src/pages/tools/markdown-editor.astro`

**追加依存:** `marked`（GFM 対応 Markdown パーサ）。出力は既存 `sanitizeHtml` でサニタイズ（新規サニタイザなし）。

**既知の制限:**

- GFM タスクリストの `<input type=checkbox>`: `sanitizeHtml` の `DROP_WITH_CHILDREN` で除去（チェックボックスは消えるがテキストは残る）
- コードブロックの `class="language-xxx"`: `class` 属性は除去される（シンタックスハイライトはスコープ外）
- 見出しの `id` アンカー: `id` 属性は許可外で除去される

**スコープ外:** 書式ツールバー / シンタックスハイライト / 目次生成 / `.html` ダウンロード / localStorage 自動保存

---

## 6. 各ツール共通仕様

### 6.1 共通UIパターン

- **コピーボタン**: クリップボードコピー。成功時アイコンが緑のチェックマークに切り替わり（2秒後復帰）。ラベル文字は変化させずボタン幅を固定。スクリーンリーダーへは `aria-live` で「コピーしました」を能動通知
- **クリアボタン**: 入力・出力リセット
- **サンプル入力**: 各ツールに適切なサンプルデータセットボタン
- **エラー表示**: 赤枠 + 枠直下にメッセージ
- **レスポンシブ**: モバイルでは縦並び

#### 共通コンポーネント（`src/components/ui/`）

| コンポーネント        | 用途                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `InputField`          | ラベル＋入力欄（任意で multiline）＋エラー＋ヒント＋サンプルボタン                                                 |
| `OutputField`         | ラベル＋（CopyButton／追加要素）＋ readOnly textarea。値が空のときヘッダ部を `visibility: hidden` にして高さを保つ |
| `CopyButton`          | クリップボードコピー（標準／コンパクト 2 形態）                                                                    |
| `ErrorMessage`        | `role="alert"` 付きエラーテキスト                                                                                  |
| `DownloadButtonGroup` | SVG／PNG ダウンロードボタンのペア                                                                                  |
| `ToggleGroup<T>`      | モード切替などの排他選択トグル                                                                                     |
| `Select<T>`           | 選択肢が多い場合（目安7択以上）のジェネリックセレクトボックス                                                      |

#### 共通フック（`src/hooks/`）

| フック                                | 用途                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `useCodec(transform, deps, options?)` | 入力→デバウンス→変換→出力＋エラー状態を一括管理。Base64／JSON-XML／JSON-CSV など同期変換ツールで利用 |
| `useClampedInput(initial, min, max)`  | 数値入力の min/max クランプ                                                                          |
| `useQrCamera()`                       | カメラ起動＋ rAF ベースの QR スキャンループ                                                          |

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

> **ツール候補の詳細は §13 を参照。** Phase 2〜3 でのツール追加はそちらのリストから選定する。

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
  - [x] PWAアイコン生成（`public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`）
  - [x] `BaseLayout.astro` に manifest・theme-color・SW登録を追加
- [ ] ダークモード（DADS 準拠で再設計）
- [ ] ツール追加
  - [x] UUID v7 生成（`uuid-v7`）
  - [x] Base64 エンコード/デコード（`base64`）
  - [x] 文字コード判定・変換（`encoding-converter`）
  - [x] 設定ファイル相互変換（`config-converter`）
  - [x] QRリーダー（`qr-reader`）
  - [x] TOTP/HOTP ジェネレータ（`totp-hotp`）
  - [x] SQL整形・パラメータ埋め込み（`sql-formatter`）
  - [x] 正規表現ビジュアライザ＆ReDoS検出（`regex-visualizer`）
  - [x] JSON整形・ビューア（`json-formatter`）
  - [x] CIDR/サブネット計算機（`cidr-calculator`）
  - [x] シークレットスクラバー（`secret-scrubber`）
  - [x] クリップボードインスペクタ（`clipboard-inspector`）
  - [x] DSN/接続文字列ビルダ（`dsn-builder`）
  - [x] SSL/TLS証明書デコーダ（`cert-decoder`）
  - [x] 鍵フォーマット変換（`key-converter`）
  - [x] HARビューア＆サニタイザ（`har-viewer`）
  - [x] CSR・鍵ペアジェネレータ（`csr-generator`）
  - [x] markdownエディタ（`markdown-editor`）
  - [ ] Diff、パスワード生成、ハッシュ等
- [ ] 全文検索
- [ ] お気に入り（localStorage）
- [ ] OGP画像自動生成

### フロントエンドデザインリファクタリング

- [x] **Phase 1**: 基盤整備（カラートークン統一・focus ring CSS化・skip-link・dead class除去）
- [x] **Phase 2a**: ToggleGroup 統一（QrCode/DummyText/Ulid/UuidV7 の自前セグメント置換）
- [x] **Phase 2b**: Astro パーシャル化（PageContainer / CategoryBadge / ToolInfoSection）
- [x] **Phase 2c**: 共通 React UI（ClearButton / CountInput / ResultTable / ErrorMessage block variant）
- [x] **Phase 3**: ツール一貫性適用（全ツール space-y-6 統一・QrCode サンプルボタン追加）
- [x] **Phase 4**: モバイル UX（ハンバーガーメニュー・タップ領域・focus トラップ）

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

| ファイル                             | 役割                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `public/manifest.webmanifest`        | Web App Manifest（名前・アイコン・表示モード等）                |
| `public/sw.js`                       | Service Worker（オフライン対応・キャッシュ制御）                |
| `public/icons/icon-192.png`          | PWAアイコン 192×192px（purpose: any）                           |
| `public/icons/icon-512.png`          | PWAアイコン 512×512px（purpose: any）                           |
| `public/icons/icon-maskable-192.png` | PWAアイコン 192×192px（purpose: maskable、Android円形マスク用） |
| `public/icons/icon-maskable-512.png` | PWAアイコン 512×512px（purpose: maskable）                      |

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
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    {
      "src": "/icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 12.5 Service Worker 戦略

| リクエスト種別                  | 戦略                                      |
| ------------------------------- | ----------------------------------------- |
| ナビゲーション（HTML）          | Network-first → オフライン時は `/` を返す |
| 静的アセット（JS/CSS/フォント） | Cache-first（初回フェッチ後キャッシュ）   |

キャッシュバージョン管理: `CACHE_NAME = 'devtools-v1'`（更新時にインクリメント）

### 12.6 アイコン生成

`favicon.svg`（32×32 の `>_` ターミナルプロンプト SVG）を元に、`scripts/generate-icons.mjs` で  
`sharp`（Astro の推移的依存として利用可能）を使い PNG 4 枚を生成する。

- `icon-192.png` / `icon-512.png`：`purpose: any` 用（角丸あり）
- `icon-maskable-192.png` / `icon-maskable-512.png`：`purpose: maskable` 用（背景を端まで塗り・セーフゾーン内にマーク）  
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

sw.js');
}

```
erviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## 13. ツール候補リスト（将来実装）

詳細は [docs/tool-candidates.md](docs/tool-candidates.md) を参照。
S/A/B/C の4段階優先度で全17件のツール案を記録している（2026-04-29 Agent Teams ブレインストーミング）。
