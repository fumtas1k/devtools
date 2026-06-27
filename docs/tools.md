# ツール技術リファレンス

各ツールが内部でどう動くかを開発者向けに解説する。README のツール一覧は「何ができるか」、本ドキュメントは「どう動くか」を扱う。ライブラリの採用理由や設計判断の経緯は [docs/decisions.md](decisions.md) を参照。

各ツールは原則 3 小節（仕組み・アルゴリズム / 準拠仕様・RFC / 制限・エッジケース）で構成する。該当しない小節は省略する。`src/data/tools.ts` に登録された全ツールを網羅することを原則とし、新規ツール追加時は本ドキュメントに節を追加する（`.agents/rules/common.md` 4 章のドキュメント更新ルール参照）。

## 目次

- [生成](#生成)
  - [ULID生成](#ulid生成)
  - [UUID v7 生成](#uuid-v7-生成)
  - [ダミーテキスト生成](#ダミーテキスト生成)
  - [TOTP/HOTP ジェネレータ](#totphotp-ジェネレータ)
  - [日本語ダミー個人データ生成](#日本語ダミー個人データ生成)
- [コード・バーコード](#コードバーコード)
  - [QRコード生成](#qrコード生成)
  - [JANコード生成](#janコード生成)
  - [GS1 DataBar 生成](#gs1-databar-生成)
  - [QRチケット](#qrチケット)
  - [QRリーダー](#qrリーダー)
- [エンコード・デコード](#エンコードデコード)
  - [URLエンコード/デコード](#urlエンコードデコード)
  - [Base64 エンコード/デコード](#base64-エンコードデコード)
  - [JWTデコーダー](#jwtデコーダー)
  - [SSL/TLS証明書デコーダ](#ssltls証明書デコーダ)
- [変換・解析](#変換解析)
  - [JSON / XML 変換](#json--xml-変換)
  - [JSON / CSV 変換](#json--csv-変換)
  - [文字コード判定・変換](#文字コード判定変換)
  - [設定ファイル相互変換](#設定ファイル相互変換)
  - [文字カウント](#文字カウント)
  - [SQL整形・パラメータ埋め込み](#sql整形パラメータ埋め込み)
  - [正規表現ビジュアライザ＆ReDoS検出](#正規表現ビジュアライザredos検出)
  - [JSON整形・ビューア](#json整形ビューア)
  - [CIDR/サブネット計算機](#cidrサブネット計算機)
  - [シークレットスクラバー](#シークレットスクラバー)
  - [クリップボードインスペクタ](#クリップボードインスペクタ)
  - [DSN/接続文字列ビルダ](#dsn接続文字列ビルダ)
  - [鍵フォーマット変換](#鍵フォーマット変換)
  - [HARビューア＆サニタイザ](#harビューアサニタイザ)
  - [CSR・鍵ペアジェネレータ](#csr鍵ペアジェネレータ)
  - [markdownエディタ](#markdownエディタ)

## 生成

### ULID生成

#### 仕組み・アルゴリズム

ULID の生成は [ulidx](https://github.com/perry-mitchell/ulidx) パッケージの `ulid()` に委譲する。ULID は 26 文字の Crockford Base32 文字列で、前半 10 文字（48 bit）がミリ秒タイムスタンプ、後半 16 文字（80 bit）がランダム成分。先頭にタイムスタンプを持つため辞書順ソートで生成時刻順に並ぶ。表示では先頭 10 文字（タイムスタンプ部）を色分けする。

各行の「タイムスタンプ」列は、ULID をデコードした値ではなく、生成時に `new Date().toISOString()` で取得した発行時刻を ISO 8601 で表示している（タイムスタンプ部と同一ミリ秒）。

#### 準拠仕様・RFC

- [ULID 仕様](https://github.com/ulid/spec)（48 bit タイムスタンプ + 80 bit ランダム、Crockford Base32、大文字小文字を区別しない、辞書順ソート可能）。
- RFC で定義された仕様ではない。

#### 制限・エッジケース

- 生成には素の `ulid()` を使うため、同一ミリ秒内に複数生成した場合の単調増加（monotonicity）は保証しない（ulidx の `monotonicFactory` は使用していない）。同一ミリ秒内ではランダム成分のみで区別される。

### UUID v7 生成

#### 仕組み・アルゴリズム

UUID v7 の生成は `uuid` パッケージの `v7()` に委譲する。生成した UUID は 128 bit を以下の 5 フィールドに分解して色分け表示する。

| フィールド   | ビット数 | 内容                                             |
| ------------ | -------- | ------------------------------------------------ |
| `unix_ts_ms` | 48 bit   | ミリ秒単位の Unix タイムスタンプ                 |
| `ver`        | 4 bit    | バージョン番号（常に `7`）                       |
| `rand_a`     | 12 bit   | ランダムビット                                   |
| `var`        | 2 bit    | バリアント（RFC 4122 = `8`〜`b` の nibble 上位） |
| `rand_b`     | 62 bit   | ランダムビット                                   |

タイムスタンプ表示は、UUID 先頭 12 桁の 16 進（= 48 bit の `unix_ts_ms`）を数値に変換し、ISO 8601 形式に整形して得る。先頭にタイムスタンプを持つため、UUID v7 は文字列としてソートするとおおむね生成時刻順に並ぶ。

#### 準拠仕様・RFC

- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)（UUID v7 を定義。RFC 4122 を更新）。
- ランダムビットは `uuid` パッケージ経由で `crypto.getRandomValues`（CSPRNG）から供給される。

#### 制限・エッジケース

- 同一ミリ秒内に複数生成した場合の単調増加（monotonicity）の保証は `uuid` パッケージの `v7()` 実装に依存する。
- タイムスタンプはミリ秒精度のため、1 ミリ秒未満の生成順序はランダムビットの差で区別される。

### ダミーテキスト生成

#### 仕組み・アルゴリズム

文字種・文字数を指定してダミーテキストを生成する。文字種は 5 種類。

- **ひらがな / カタカナ / 英数字**: それぞれの文字集合から 1 文字ずつ `Math.random` で等確率に選ぶ。
- **漢字混じり日本語**: 1 文字ごとに重み付き抽選する（漢字 55% / ひらがな 25% / 助詞 20%）。文字集合は固定の代表的な漢字・助詞セット。
- **Lorem Ipsum**: 固定の Lorem Ipsum 文字列を必要長まで繰り返し、指定文字数に切り詰めて末尾空白を除去する（ランダム化はしない）。

改行を「あり」にすると、指定した間隔（文字数）ごとに改行を挿入する。

#### 制限・エッジケース

- 文字数は 1〜5000、改行間隔は 1〜1000 に丸められる（範囲外入力は自動でクランプ）。
- 乱数は `Math.random` を使用する（ダミーテキスト用途のため暗号学的乱数は不要）。
- Lorem Ipsum は固定文の繰り返しであり、語順はランダムにならない。

### TOTP/HOTP ジェネレータ

#### 仕組み・アルゴリズム

ワンタイムパスワードの生成・検証を Web Crypto API（`crypto.subtle` の HMAC）で行う。シークレット鍵はブラウザ外に送信しない。

1. **シークレット**: Base32 文字列として扱う。ランダム生成時は `crypto.getRandomValues` で 160 bit（20 バイト）を生成し、Base32（32 文字・パディングなし）で表現する。
2. **HOTP**: シークレットを HMAC 鍵としてインポートし、8 バイトのビッグエンディアンのカウンタに対して HMAC を計算する。MAC の末尾 nibble をオフセットとして 4 バイトを動的に切り出し（dynamic truncation）、最上位ビットをマスクした 31 bit 値を `10^digits` で剰余して指定桁数のコードにする。
3. **TOTP**: カウンタを `floor(現在時刻ms / (period × 1000))` として算出し、あとは HOTP と同じ。
4. **検証**: 現在カウンタの前後 ±window（既定 ±1）を走査して一致を探す。比較は定数時間（`timingSafeEqual`）で行い、早期 return せず window 全件を走査する（タイミング攻撃耐性）。
5. **`otpauth://` URI**: 認証アプリ取り込み用の URI を組み立てる（issuer に `:` を含むと throw、secret は defensive に URL エンコード）。

#### 準拠仕様・RFC

- [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226)（HOTP）/ [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)（TOTP）。
- Base32 は [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648) §6。padding 除去後の長さ `mod 8` が 0/2/4/5/7 のみ有効（1/3/6 は末尾ビットが中途半端で無効）。
- ハッシュは SHA-1 / SHA-256 / SHA-512、桁数は 6 / 7 / 8、周期は 30 / 60 秒から選択。

#### 制限・エッジケース

- 検証の時刻ずれ許容は前後 ±1 ステップ（既定）。大きな時計ずれは検証に失敗する。
- 不正な Base32 文字・長さはデコード時に throw する。
- HMAC・乱数生成は Web Crypto API に依存するため、`crypto.subtle` が利用可能なセキュアコンテキスト（HTTPS / localhost）が前提。

### 日本語ダミー個人データ生成

#### 仕組み・アルゴリズム

日本人向け架空個人データを自前辞書＋`Math.random()` で生成する（`faker` の ja ロケールはバンドル過大のため不採用）。

- **氏名↔フリガナ整合**: 姓・名それぞれの辞書（`{ kanji, yomi, romaji }`）から 1 件ずつランダム選択し、漢字と読みが同一辞書エントリの組み合わせになることを保証する。辞書には姓 30 件・男名 20 件・女名 20 件を収録（`src/utils/dummy-personal-data/dictionaries.ts`）。辞書の読み（`yomi`）はひらがなで保持し、「フリガナ」列はカタカナに変換して出力する（ラベルとの整合）。
- **生年月日↔年齢整合**: 指定年齢範囲 `[ageMin, ageMax]` から乱数で年齢を決定 → 基準日（生成時の現在日付）から `age 年前` の日付を基点に 0〜364 日さかのぼって生年月日を生成 → `computeAge(date, today)` で満年齢を再計算して age カラムに格納（端数日による 1 歳ずれを防ぐ往復確認）。
- **住所↔郵便番号↔固定電話整合**: 住所辞書（`{ zip, pref, city, areaCode }`）から 1 件選択すると郵便番号・都道府県・市区町村・市外局番が同時確定。固定電話は `areaCode-middle-last` 形式で全 10 桁（先頭 `0` 含む）に整形。
- **携帯電話番号の実在回避**: 先頭 `090` / `070` + 第 4 桁を `0` に固定した 11 桁を生成する。総務省「電気通信番号の種別」では音声携帯番号 `0X0CDEFGHJK` の C は「0 を除く」と規定されているため、第 4 桁 C=0 の帯域は音声携帯の割当対象外であり実在しない確度が高い。`0800`（フリーダイヤル）・`0600`（FMC 電話番号）は割当済みのため除外している。
- **メールアドレス**: ローマ字姓名ベースのローカル部 + RFC 2606 予約ドメイン（`example.com` / `example.jp` / `example.net` / `example.org`）でランダム生成。実在ドメインは使わない。
- **一意性オプション**: 「メール・電話番号を一意化」を有効にすると、メール（ローカル部への連番付与 `sato1@...`）・固定電話（市外局番を保持し加入者番号のみ再生成 → 住所整合を維持）・携帯（`pickMobile()` 再生成で非実在帯を維持）が生成件数内で重複しないよう後処理される。氏名・フリガナは辞書規模の制約（姓 30 × 名 40 ≒ 1,200 通り・最大 3,000 件）から一意化対象外。
- **連番ID列**: 「連番ID列 (No.)」を有効にすると、出力（CSV/JSON）の先頭列/キーに 1 始まりの連番が付与される（JSON では数値型で出力）。主キー用途に使いやすいよう設計。

**シリアライズ:** CSV は既存 `papaparse` で生成し先頭に UTF-8 BOM（U+FEFF）を付加することで Excel の文字化けを防ぐ。各セルに `escapeCsvFormula`（既存 `@/utils/json-csv`）で CSV 数式インジェクション（CWE-1236）対策を適用。JSON は選択フィールドを日本語ラベルキーに変換して `JSON.stringify` で出力。

#### 準拠仕様

- **携帯番号帯域方針**: 総務省「電話番号に関する情報」の「電気通信番号の種別」表（音声携帯は `0X0CDEFGHJK`、C は 0 を除く）を根拠とする。
- **CSV 数式インジェクション対策**: OWASP CSVX CWE-1236 の先頭文字エスケープ方式（`=`, `+`, `-`, `@`, `\t`, `\r` の前にシングルクォートを付加）。
- **予約ドメイン**: RFC 2606 §2「Reserved Example Second Level Domain Names」（`example.com` / `example.net` / `example.org`）および [IANA](https://www.iana.org/domains/reserved) に登録された `example.jp`。

#### 制限・エッジケース

- 辞書はサンプルセットのため多件数生成では同一データが繰り返し出やすい
- 郵便番号の実在性・住所の正確性は保証しない（ダミー辞書）
- クレジットカード番号・マイナンバー・血液型・会社名は対象外
- Excel（.xlsx）出力は非対応（`xlsx` / `exceljs` のバンドル増を避けるため。CSV の BOM 付き出力で Excel 互換を確保）
- **全処理はブラウザ内で完結し、生成データを外部サーバーに送信しない**

## コード・バーコード

### QRコード生成

#### 仕組み・アルゴリズム

テキスト / URL から QR コードを生成する。生成は `qrcode-generator` を使うが、直接 import せず `@/utils/qrcode` のパッチ済みモジュールを介す。このパッチは `qrcode.stringToBytes` を `TextEncoder`（UTF-8）で上書きし、ライブラリ既定の ISO-8859-1 相当では壊れる日本語（マルチバイト文字）を正しくエンコードできるようにしている。型番（version）は `0` を渡してデータ量から自動決定する。

出力は SVG。アクセシビリティのため `role="img"` と `<title>QRコード: …</title>` を SVG 先頭に注入する（`aria-label` は付けない。付けると ARIA の名前計算で `<title>` が除外され URL 等の本文が読まれなくなるため）。`<title>` に入れる本文は `escapeXml` で実体参照化し、XSS の二次防衛線も兼ねる。

#### 準拠仕様・RFC

- QR Code（ISO/IEC 18004 / JIS X 0510）。
- 誤り訂正レベルは L（約 7%）/ M（15%）/ Q（25%）/ H（30%）から選択。

#### 制限・エッジケース

- データが長すぎて QR の容量上限を超えると生成に失敗し、「テキストが長すぎる可能性があります」と表示する。
- 誤り訂正レベルを上げるほど 1 シンボルに格納できるデータ量は減る。

### JANコード生成

#### 仕組み・アルゴリズム

入力桁からチェックディジットを計算し、バーコードを描画する。チェックディジットは **モジュラス 10 ウェイト 3-1**（`calcJan`）で算出する。

- **JAN-13**: 12 桁入力。奇数位（1,3,5…）× 1、偶数位（2,4,6…）× 3 を合計し、`(10 − 合計 mod 10) mod 10` がチェックディジット。
- **JAN-8**: 7 桁入力。奇数位 × 3、偶数位 × 1。

計算過程（重み別の桁・小計・合計・剰余）を表示する。バーコード描画は `jsbarcode`（EAN-13 / EAN-8）。サンプル値は先頭 2 桁を日本の国コード「49」固定で生成する。

#### 準拠仕様・RFC

- JAN（= EAN-13 / EAN-8、JIS X 0501）。チェックディジットは GS1 のモジュラス 10 方式。

#### 制限・エッジケース

- 入力は数字のみ。桁数は JAN-13 が 12 桁、JAN-8 が 7 桁（チェックディジットを除いた桁数）に固定。範囲外は入力時にエラー表示する。

### GS1 DataBar 生成

#### 仕組み・アルゴリズム

GTIN-14 と任意のアプリケーション識別子（AI）から GS1 DataBar Limited 合成シンボルを生成する。

1. **チェックディジット**: 13 桁から GTIN-14 のチェックディジットを計算する（`calcGtin14CheckDigit`、モジュラス 10 ウェイト 3-1。左端が奇数位 × 3）。
2. **シンボル生成**: `bwip-js` の `databarlimitedcomposite`（合成シンボル）で描画する。対応 AI は 17（賞味/消費期限）/ 10（ロット番号）/ 11（製造日）/ 15（best-before）/ 21（シリアル）。可変長 AI に後続 AI が続く場合の FNC1 区切りは bwip-js の `gs1process()` が自動挿入する。
3. **AI テキスト注入**: bwip-js の `includetext` はリニア部 `(01)GTIN` しか描画しないため、AI 値（`(17)YYMMDD` 等）は SVG の `<text>` として合成シンボル上に手動で 1 行注入する（`injectCompositeText`）。注入文字列は `escapeHtml` でエスケープする。

#### 準拠仕様・RFC

- GS1 General Specifications（GS1 DataBar Limited / GS1 Composite Component、アプリケーション識別子）。
- GTIN-14。

#### A4 印刷機能

有効なバーコード（`svg` と `gtin` が揃ったカード）を A4 用紙に印刷する。

1. **実寸変換**: bwip-js は `scale: 3`（1 モジュール = 3px）で SVG を生成する。印刷時は `setSvgPrintSize(svg, xdimMm)` が `factor = xdimMm / 3` を計算し、SVG ルート要素の `width`/`height` 属性を mm 値に置換する。これにより **X-dimension（モジュール幅）が xdimMm に一致した mm 実寸**で印刷される（プリンタ DPI 非依存）。
2. **CSP 両立**: `style-src 'unsafe-inline'` を撤去済みのため、SVG の presentation attribute（`width="52.14mm"`）で実寸を指定する。CSS inline style や `el.style.setProperty` は使用しない。詳細は `docs/decisions.md` [098] を参照。
3. **レイアウト**: 列数（1/2/3、デフォルト 2）と X-dimension プリセット（小=0.330mm / 中=0.495mm / 大=0.660mm、デフォルト 中）を ToggleGroup で切替。`@page { size: A4; margin: 12mm }` + `.print-cell { border: 1px dashed #000 }` で破線カット線付きグリッドを構成する。
4. **印刷起動**: in-page `window.print()` を呼ぶ。ブラウザ印刷ダイアログから「PDF に保存」も利用可能。
5. **複数ページ対応**: 印刷コンテナは `createPortal` で `document.body` 直下へ出し、通常フロー配置で複数ページ印刷に対応する（`position: absolute` 配置は Chrome 等で 2 ページ目以降がクリップされる既知挙動があるため）。10 件 × 大サイズ等で A4 高さを超えてもページ送りされる。詳細は `docs/decisions.md` [098] を参照。

#### 制限・エッジケース

- GS1 DataBar Limited の入力は 13 桁、**先頭桁は 0 または 1 のみ**（仕様上の制約）。
- PNG ダウンロード時は白背景での描画が必須（透明背景だと一部リーダーでデコードできない）。合成シンボル上の AI テキスト描画の経緯・トレードオフは `docs/decisions.md` [067] / [082] / [083] を参照。
- **大サイズ × 3 列は A4 印刷可能幅（約 186mm）を超過し得る**。UI にヒント注記を表示するが、ハードな組合せ制限は設けていない。印刷プレビューで確認すること。
- 印刷用 SVG（`setSvgPrintSize` 出力）は mm 値の width/height を持つため、`svgContentToPngBlob` に渡すと canvas サイズ抽出が失敗する。両者は別経路で使用すること。

### QRチケット

#### 仕組み・アルゴリズム

ECDSA 署名付きチケットを生成し、公開鍵でオフライン検証する。暗号処理はすべてブラウザ組み込みの Web Crypto API（`crypto.subtle`）で行う。

1. **鍵ペア生成**: `crypto.subtle.generateKey` で ECDSA P-256 の鍵ペアを生成し、JWK 形式でエクスポートする。既存の秘密鍵 JWK（`d` フィールドを含む）をインポートして再利用することもできる。
2. **署名**: チケットデータをパイプ区切り文字列 `eventId|ticketId|timestamp|name|category` にシリアライズし、これを署名対象として `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' })` で署名する。署名（P-256 で 64 バイト）は Base64URL（パディングなし 86 文字）にエンコードする。
3. **QR 文字列**: `payload|signature` の形式で連結し、`qrcode-generator`（誤り訂正レベル M）で SVG を生成する。
4. **検証**: 読み取った文字列を `lastIndexOf('|')` で payload と signature に分離する（signature は Base64URL のため文字集合に `|` を含まず境界が一意に定まる）。同じ payload 文字列を再構築して `crypto.subtle.verify` で署名を照合し、さらに `timestamp` を現在時刻と比較して有効期限切れを判定する。公開鍵 JWK さえあればサーバー無しで検証できる。

#### 準拠仕様・RFC

- **署名方式**: ECDSA（曲線 P-256 / secp256r1）+ SHA-256。
- **鍵フォーマット**: JWK（JSON Web Key）。
- **エンコード**: 署名は Base64URL（`A-Za-z0-9_-`）。

#### 制限・エッジケース

- **QR 容量**: 署名込みの全データを最大 250 バイトに制限している。署名は約 86 バイト固定のため、ペイロード（イベント ID・チケット ID・名前・料金区分等）がこれを圧迫する。
- **一括生成上限**: 一度に生成できるチケットは最大 20 枚。
- **フィールド制約**: 区切り文字のため、各フィールド値に `|` を含めることはできない（含む場合は生成時に throw）。
- **オフライン検証の前提**: 検証側は発行者の公開鍵 JWK を別途入手している必要がある（公開鍵の配布手段はツールのスコープ外）。
- **失効の仕組みは無い**: 検証は署名の正当性と `timestamp` による有効期限のみ。発行済みチケットの個別失効（revocation）はできない。

### QRリーダー

#### 仕組み・アルゴリズム

カメラまたは画像ファイルから QR コードを読み取る。デコードは `jsQR`。

- **画像ファイル**: `URL.createObjectURL` → `Image` → `<canvas>` に描画 → `getImageData` → `jsQR` でデコードする（`decodeQrFromFile`）。長辺が `maxDim`（既定 1600px）を超える画像はアスペクト比を保ってダウンスケールしてから処理する。各 `await` ポイントで `AbortSignal` を確認し、処理中のキャンセルに対応する。
- **ファイル検証**: アップロード前に `validateFile`（`@/utils/file-validation`）で検証する。画像判定は `file.type`（OS / browser 由来の advisory 値で拡張子偽装を検知できない）に依存せず、先頭バイトの magic number（PNG / JPEG / GIF / WebP）で行う。SVG はバイナリ magic を持たないため先頭テキストを sniff（`<svg>` 始まり、または `<?xml>` 始まり かつ `<svg>` 出現）する。拡張子だけ画像に偽装した非画像ファイルは canvas 到達前に拒否される。
- **カメラ**: `useQrCamera` フックでライブ映像から読み取る。
- **結果判定**: デコード文字列を `detectQrContent` で解析し、`http:` / `https:` の URL ならホスト名付きの URL として、それ以外はテキストとして表示する。

#### 準拠仕様・RFC

- QR Code（ISO/IEC 18004）の読み取り。

#### 制限・エッジケース

- `jsQR` は QR コード専用。JAN/EAN などの 1 次元バーコードや他の 2 次元コードは読み取れない。
- 画像・映像はすべてブラウザ内で処理し、サーバーへアップロードしない。
- カメラ利用はセキュアコンテキスト（HTTPS / localhost）とユーザーのカメラ許可が前提。

## エンコード・デコード

### URLエンコード/デコード

#### 仕組み・アルゴリズム

JavaScript 標準の `encodeURIComponent` / `decodeURIComponent` でテキストとパーセントエンコード形式を相互変換する。デコードは不正なエスケープシーケンスで例外になるため、デコードモードでは事前に `decodeURIComponent` を試行してバリデーション（不正なら「不正なURLエンコード文字列です」）する。

#### 準拠仕様・RFC

- パーセントエンコーディング（RFC 3986）。`encodeURIComponent` は英数字と `- _ . ! ~ * ' ( )` 以外をエスケープする（JavaScript の仕様に準拠）。

#### 制限・エッジケース

- 不正な `%` シーケンス（例: `%ZZ`、孤立した `%`）はデコードに失敗する。
- 文字列の相互変換のみで、URL 全体の構造（スキーム・クエリ等）の解析はしない。

### Base64 エンコード/デコード

#### 仕組み・アルゴリズム

ブラウザ組み込みの `btoa` / `atob` を使う。これらはバイナリ文字列しか扱えないため、UTF-8 のマルチバイト文字を正しく往復させるよう `TextEncoder` / `TextDecoder` を挟む。

- **エンコード**: テキスト → `TextEncoder`（UTF-8 バイト列）→ バイナリ文字列 → `btoa`。URL-safe 指定時は `+`→`-`、`/`→`_` に置換し末尾パディング `=` を除去する。
- **デコード**: URL-safe 入力は標準 Base64 に正規化（`-`→`+`、`_`→`/`、パディング補完）してから `atob` → `Uint8Array` → `TextDecoder('utf-8', { fatal: true })`。`fatal` により UTF-8 として不正なバイト列を検出する。

#### 準拠仕様・RFC

- Base64 / base64url（RFC 4648 §4・§5）。

#### 制限・エッジケース

- Base64 として不正な文字列は「有効なBase64文字列ではありません」、デコード結果が UTF-8 テキストにならない場合は「テキストとして表示できないデータです」とエラーになる（テキスト変換が前提でバイナリファイルは扱わない）。

### JWTデコーダー

#### 仕組み・アルゴリズム

JWT を `.` で 3 分割し、Header・Payload を base64url デコードして JSON パースする（`parseJwt`）。Payload に `exp`（数値）があれば現在時刻と比較し、有効 / 期限切れ / exp なし を判定し、有効な場合は残り時間を表示する。

署名検証は任意で、Web Crypto API（`crypto.subtle.verify`）で行う。署名入力は `rawHeader.rawPayload`。対応アルゴリズム:

- **HS256 / HS384 / HS512**: HMAC。共有シークレット文字列を鍵としてインポート。
- **RS256 / RS384 / RS512**: RSASSA-PKCS1-v1_5。公開鍵 PEM（SPKI）を使用。
- **ES256 / ES384 / ES512**: ECDSA（P-256 / P-384 / P-521）。公開鍵 PEM（SPKI）を使用。

#### 準拠仕様・RFC

- JWT（[RFC 7519](https://www.rfc-editor.org/rfc/rfc7519)）/ JWS（[RFC 7515](https://www.rfc-editor.org/rfc/rfc7515)）/ JWA（[RFC 7518](https://www.rfc-editor.org/rfc/rfc7518)、`alg` の定義）。

#### 制限・エッジケース

- 上記マップにないアルゴリズム（`none` / EdDSA / PS\* 等）は「unsupported」となり検証できない。
- デコード（Header/Payload の表示）は署名検証なしでも行える。**改竄の検出には署名検証が必要**で、検証せずに Payload を信用してはならない。
- RS\* / ES\* の検証には対応する公開鍵 PEM（`-----BEGIN PUBLIC KEY-----`）が必要。

### SSL/TLS証明書デコーダ

#### 仕組み・アルゴリズム

- 入力種別を `detect.ts` で判定する。PEM は `-----BEGIN CERTIFICATE-----` / `-----BEGIN PKCS7-----` ブロックを正規表現で全抽出し Base64 を DER 化、生 DER（先頭 `0x30`）・Base64 単体も受け付ける。`PKCS12` / `PFX` / 証明書を含まない `ENCRYPTED PRIVATE KEY` は PKCS#12 として識別し、パスワード入力 UI へ誘導する
- 各 DER を `asn1js.fromBER` でデコードし `pkijs` の `Certificate` に変換、`parse.ts` で表示用フィールドへ正規化する。DN は OID を短縮名（CN/O/OU/C/L/ST 等）へマップ、SAN・KeyUsage・ExtKeyUsage・BasicConstraints・SKI/AKI は拡張 OID から取得する。フィンガープリントは `crypto.subtle.digest('SHA-256', der)`
- PKCS#7 は `ContentInfo` → `SignedData` から証明書を展開する
- SCT 拡張（OID `1.3.6.1.4.1.11129.2.4.2`）は ASN.1 ではなく RFC 6962 の TLS シリアライズ構造のため、OCTET STRING 内のバイト列を `sct.ts` で手動デコードする（version / logId / timestamp、best-effort）
- チェーンは `chain.ts` が subject/issuer DN（必要に応じて AKI/SKI）で親子関係を構築し issuer→subject 順に並べ替える。各リンクの署名は DER から再構築した `Certificate.verify`（Web Crypto）で検証し、改ざん・issuer 不一致を検出する。有効期限は現在時刻と NotBefore/NotAfter の比較で判定する
- 1 枚のパース失敗は `error` 付きで保持し、他証明書の表示を継続する
- **PKCS#12（.pfx/.p12）**: pkijs の `PFX → AuthenticatedSafe → SafeContents → SafeBag` を辿って証明書 DER と PKCS#8 秘密鍵を抽出する（`src/utils/cert/pkcs12.ts`）
  - **パスワード**: UI で入力 → `TextEncoder().encode(password).buffer`（UTF-8 ArrayBuffer）を pkijs に渡す。pkijs が内部で BMPString 変換する（`makePKCS12B2Key`）
  - **証明書抽出**: `CertBag`（OID `1.2.840.113549.1.12.10.1.3`）から DER を取り出し、既存の `parseDerCertificates → buildChain` パイプラインに流す
  - **秘密鍵抽出**: `PKCS8ShroudedKeyBag`（OID `1.2.840.113549.1.12.10.1.2`）を `parseInternalValues` で復号し `PrivateKeyInfo` から PKCS#8 PEM を生成。アルゴリズム・鍵長・曲線名は常時表示、PEM 本体は `<details>` トグル開示
  - **暗号方式制限**: PBES2（PBKDF2 + AES-CBC）のみ復号可能。レガシー RC2-40/3DES は Web Crypto 非対応のため `unsupported-encryption` エラーで案内する
  - **誤パスワード検出**: `pfx.parseInternalValues({ checkIntegrity: true })` が "Integrity for the PKCS#12 data is broken!" を throw → `wrong-password` として UI に表示

#### 準拠仕様・RFC

- X.509（[RFC 5280](https://www.rfc-editor.org/rfc/rfc5280)）/ PKCS#7・CMS（[RFC 5652](https://www.rfc-editor.org/rfc/rfc5652)）/ Certificate Transparency SCT（[RFC 6962](https://www.rfc-editor.org/rfc/rfc6962)）/ PKCS#12（[RFC 7292](https://www.rfc-editor.org/rfc/rfc7292)）

#### 制限・エッジケース

- PKCS#12 は PBES2/AES のみ対応。レガシー暗号（RC2-40/3DES）保護の .pfx は `openssl pkcs12 -keypbe AES-256-CBC -certpbe AES-256-CBC` で再エクスポートが必要
- 鍵フォーマット変換（PEM/DER/JWK）は key-converter ツールで対応
- 失効確認（CRL / OCSP）は行わない。署名検証はチェーン内の隣接ペアに対してのみで、信頼ストアとの照合（ルート CA の信頼性確認）は行わない
- SCT はタイムスタンプ・ログ ID の表示のみで、署名の暗号検証はしない（best-effort）
- 全処理はブラウザ内で完結し、入力（社内 CA・本番証明書・秘密鍵を含む）は外部に送信しない

## 変換・解析

### JSON / XML 変換

#### 仕組み・アルゴリズム

`fast-xml-parser` の `XMLParser` / `XMLBuilder` で相互変換する。

- **JSON → XML**: `JSON.parse` 後、`XMLBuilder` で構築する。ルート要素は `root` 固定（`{ root: parsed }` でラップ）。出力に XML 宣言 `<?xml version="1.0" encoding="UTF-8"?>` を付与し、2 スペースインデントで整形する。
- **XML → JSON**: `XMLParser` でパースし、`JSON.stringify(_, null, 2)` で整形出力する。

属性は `@_` プレフィックス、テキストノードは `#text` というキーで表現する（`parseAttributeValue` で属性値を型変換）。

#### 制限・エッジケース

- JSON → XML のルートタグは `root` 固定で変更できない。
- 属性・テキストの表現は `@_` / `#text` 規約に従うため、これらを含む元データは往復で表現が変わりうる。
- 不正な JSON / XML はそれぞれ「有効なJSONではありません」「有効なXMLではありません」とエラーになる。

### JSON / CSV 変換

#### 仕組み・アルゴリズム

`papaparse` で相互変換する。

- **JSON → CSV**: オブジェクト（またはオブジェクト配列）を受け取り、ネストはドット記法でフラット化（`flattenObject`）してから `Papa.unparse`。配列値は `JSON.stringify` で文字列化する。
- **CSV → JSON**: `Papa.parse`（`header: true` / `dynamicTyping: true` / `skipEmptyLines: true`）。列数不一致（FieldMismatch）は警告として無視し、それ以外の致命的エラーのみ例外にする。

#### セキュリティ

- **CSV フォーミュラインジェクション（CWE-1236）対策**: セルの先頭が `= + - @ \t \r` の場合にシングルクォートを前置し、Excel 等で数式として解釈されないようにする（既定 ON）。
- **プロトタイプ汚染（CWE-1321）対策**: フラット化の結果は `Object.create(null)` で構築し、`__proto__` / `constructor` / `prototype` キーを明示的にスキップする。

#### 制限・エッジケース

- 入力はオブジェクトまたはオブジェクトの配列のみ（スカラーやスカラー配列は不可）。
- ネストは出力時にドット記法へフラット化されるため、CSV → JSON で元のネスト構造には戻らない。

### 文字コード判定・変換

#### 仕組み・アルゴリズム

`encoding-japanese` でファイル / テキストの文字コードを判定・変換する。

- **判定**: 先頭バイトの BOM（UTF-8 / UTF-16 LE / UTF-16 BE）を検出しつつ、`Encoding.detect` の結果を正規化する。対応エンコーディングは UTF-8 / Shift_JIS (CP932) / EUC-JP / ISO-2022-JP / UTF-16 LE/BE / ASCII。
- **変換**: `Encoding.convert` でバイト列を変換する。BOM 付与オプション（UTF-8 は手動プリペンド、UTF-16 は `bom: 'LE'/'BE'`）と、改行コード正規化（そのまま / LF / CRLF）に対応する。改行正規化は UTF-16 を除きバイト単位で行う。

#### 制限・エッジケース

- ファイルサイズ上限は 10 MB。
- 自動判定が確定できない場合は「不明（UNKNOWN）」となる。
- 改行正規化のバイト単位処理は UTF-16 を対象外とする（呼び出し側で除外）。

### 設定ファイル相互変換

#### 仕組み・アルゴリズム

YAML・JSON・TOML・.env を相互変換する。各フォーマットを中間表現（JS の値）にパースし、目的フォーマットへ直列化する（`parseFrom` → `stringifyTo`）。ライブラリは YAML = `yaml`、TOML = `smol-toml`、JSON = ネイティブ `JSON.parse` / `JSON.stringify`。

- **同一フォーマットの整形**: YAML は `parseDocument` ベースの整形でコメントを保持する。
- **フォーマット検出**: 入力テキストからヒューリスティックに判定する（`[section]` → TOML、`{`/`[` → JSON、`---` や `key:` → YAML、`KEY=VALUE` → dotenv）。
- **JSON Schema 検証**: スキーマを与えて入力を検証できる（`schema-validator`）。

#### 制限・エッジケース

- コメントは **YAML の同一フォーマット整形でのみ保持**される。異フォーマット変換や TOML の整形ではコメントが失われる（警告表示）。
- .env への変換は値がすべて文字列になり、.env からの読み込みも値はすべて文字列として扱われる（警告表示）。

### 文字カウント

#### 仕組み・アルゴリズム

入力テキストを多角的に集計する（`count`）。

- **文字数**: UTF-16 コード単位長・コードポイント数・書記素（grapheme）数（改行除外 / 空白除外の variant も）・全角を 2 とする加重幅。
- **エンコーディング互換性**: UTF-8 / UTF-8 BMP のみ / UTF-16 / Shift_JIS / EUC-JP で表現可能かを判定する。UTF-8 BMP 判定は、4 バイト文字（絵文字等）が BMP 外であることを検出し、`utf8`（≠ `utf8mb4`）列への DB 投入エラーを予測する用途。
- **行数**: `analyzeLines` で集計。
- **SNS 文字数制限**: Twitter の加重カウント・Bluesky のカウント。
- **原稿換算**: 原稿用紙枚数・段落数・推定読了時間・英単語数。

#### 制限・エッジケース

- 入力長が 100 万文字を超えると `meta.large` フラグが立つ（大入力ガード）。
- 書記素分割・加重幅は Intl/実装依存の規則に従うため、特殊な結合文字列では見た目の字数と一致しない場合がある。

### SQL整形・パラメータ埋め込み

#### 仕組み・アルゴリズム

- **整形**: `sql-formatter` で方言別に整形する。方言は MySQL / PostgreSQL / SQLite / SQL Server（`transactsql`）。キーワードは大文字・2 スペースインデント固定。
- **カンマ位置**: 行末（既定）/ 先頭を切り替えられる。`sql-formatter` v15 で `commaPosition` オプションが廃止された（指定すると例外）ため、先頭カンマは整形結果に対する後処理で実現する。後処理は文字列リテラル（`'...'` / `"..."` / `` `...` ``、同記号 2 連はエスケープ）・行コメント（`--` / `#`）・区間コメント（`/* */`、複数行文字列とともに行をまたいで状態を持ち越す）の内側を読み飛ばし、**コード上の列区切りカンマだけ**を次行の先頭へ移動する（インデントは保持）。これにより行末コメント（`-- memo,`）や複数行文字列内のカンマを誤って動かして SQL を壊すことがない。移動先が無い最終行のカンマは欠落を防ぐため保持する。先頭カンマ時は縦の区切りを揃えるため文末セミコロンも単独行にする（`newlineBeforeSemicolon: true`）。
- **パラメータ埋め込み**: プレースホルダ付き SQL に JSON パラメータを埋め込む（デバッグ用途）。SQL を走査し、文字列リテラル（`'...'`）・識別子クォート（`"..."` / `` `...` ``）・コメント（`--` 行 / `/* */`）の内側を読み飛ばして「外側」のプレースホルダのみ収集する（`'why?'` の `?` を誤検出しない）。記法は位置（`?`）・番号（`$n`）・名前（`:name`）の 3 種で、混在はエラー。値は方言に応じて SQL リテラル化する（文字列は `'` を `''` にエスケープ、真偽値は PostgreSQL では `TRUE`/`FALSE`・他は `1`/`0`）。

#### 制限・エッジケース（`docs/decisions.md` [087]）

- 文字列内エスケープは標準 SQL の `''`（クォート二重化）のみ対応。MySQL 既定のバックスラッシュエスケープ（`'can\'t'`）は未解釈。
- PostgreSQL の dollar-quoted string（`$tag$...$tag$`）は未対応（`$` + 数字は番号プレースホルダ扱い）。識別子内の `$`（`col$1` 等）を番号プレースホルダと誤検出しうる。
- 配列・オブジェクトの値は埋め込めない。プレースホルダ数とパラメータ数の不一致はエラー。

### 正規表現ビジュアライザ＆ReDoS検出

#### 仕組み・アルゴリズム

入力された正規表現パターンとフラグを 3 系統で処理する。

1. **構文解析（AST）**: まず native `new RegExp(pattern, flags)` で構文・フラグを検証し（不正なら `SyntaxError`）、[regexp-tree](https://github.com/DmitrySoshnikov/regexp-tree) で位置情報付き AST を得る。各ノードを日本語ラベル（「キャプチャグループ #1」「1 回以上の繰り返し」「選択肢 (\|)」等）に変換して構造ツリーとして描画する。regexp-tree は `/pattern/` リテラル基準で位置を返すため、先頭 `/` の分だけオフセットを −1 補正して pattern 文字列基準に揃える。不正な正規表現のエラーは、JS エンジンの英語メッセージをそのまま出さず「正規表現が不正です: 〈英語の詳細〉」という日本語見出し付きに整形して表示する（V8 系の重複する `Invalid regular expression: ` 接頭辞は除去し、不正箇所・理由の詳細は残す）。
2. **鉄道図（railroad diagram）**: 同じ AST から `buildRailroad` でレイアウトを構築し、SVG の鉄道図として可視化する。ノードは種別ごとに色/形で区別する: 文字（リテラル）は白ボックス、文字クラス・メタ文字（`[..]` `\s` `\d` `.` 等）は青ボックス、アンカー（`^ $ \b \B`）は紫の円/pill。量指定子はループ弧（上・反復方向の矢印付き）とスキップ弧（下・バイパス）で表し、ラベルは「0回以上」「1回以上」「2〜5回」等の日本語で表示する（lazy は「（最短）」を付す）。図の下部に種別の凡例を表示する。
3. **ReDoS 検出**: [recheck](https://github.com/makenowjust-labs/recheck) の `checkSync(pattern, flags, { timeout: 1000 })` で壊滅的バックトラッキングを静的解析する。結果は **安全 / 脆弱 / 不明** の 3 状態に正規化する。脆弱と判定された場合は攻撃文字列・複雑度（指数時間 / 多項式時間の次数）・パターン内の危険箇所（hotspot のオフセット範囲）を提示する。

テスト文字列に対するマッチ機能は `runMatch` が担い、マッチ範囲のハイライトとキャプチャグループを表示する。

#### 準拠仕様・RFC

- 解析対象は JavaScript の `RegExp` 構文（native `new RegExp` での検証を前提とするため、JS エンジンが受理するパターン・フラグに準拠）。
- 特定の RFC に準拠する仕様ではない。

#### 制限・エッジケース

- **ReDoS 検出は静的解析であり完全ではない**。1000ms の timeout を超えると判定は「不明（unknown）」になり、recheck が想定外に throw した場合も「不明」に倒す。**「不明」は「安全」ではない**ため UI 上も区別して表示する。
- ReDoS 解析はメインスレッドを占有するため timeout の上限を 1000ms に設定している。
- 実装上の制約として、ReDoS / AST 解析モジュール（`regexp-tree` / `recheck`）は CommonJS 依存のため、マッチ機能 `runMatch` を barrel 経由で値として import すると兄弟モジュールの CJS が SSR グラフに巻き込まれ dev SSR が落ちる。クライアントコンポーネントからは `match.ts` を直接 import している。

### JSON整形・ビューア

#### 仕組み・アルゴリズム

`jsonc-parser` の `parseTree` で **strict JSON**（コメント・末尾カンマ・空入力を不許可）としてパースし、AST と構文エラー（行・列付き）を得る。

- **整形 / 最小化**: AST を走査して直列化するが、プリミティブは **元ソースのテキスト span をそのまま出力**するため、大きな数値の精度・数値表記（`1.0`, `1e3`）・文字列エスケープを失わない（lossless）。インデントは 2 / 4 / タブ、最小化は空白除去。
- **ツリービュー**: 折りたたみツリーを遅延構築（`makeTree`）。全展開換算 2,000 行超は仮想スクロールに自動切替（後述）。
- **JMESPath クエリ**: `jmespath` の `search` で抽出。
- **マスク**: 機密データを 6 カテゴリで伏字化する。SECRET（`password`/`token`/`secret` 等のキー名部分一致で値全体）・EMAIL・JWT・IP（IPv4 妥当性チェック）・CREDIT_CARD（Luhn チェック）・PHONE_JP。カテゴリごとに ON/OFF と検出件数を表示。
- **TypeScript 型生成**: JSON から型定義を生成する。

#### ツリー仮想化

全展開換算 2,000 行超のツリーは可視範囲のみを DOM 化する仮想スクロールに自動で切り替わる（自前 windowing・依存なし）。仮想表示では入れ子の罫線（インデントガイド）は省略され、深さはインデント幅で表現される。画面外の行はブラウザのページ内検索にヒットしない。また、フラット構造のためリストのネスト（深さ）情報はスクリーンリーダーに伝わらず、フォーカス中の行が画面外へスクロールアウトするとフォーカスが外れる。2,000 行以下は従来どおり全行を描画する。

#### 制限・エッジケース

- strict JSON のみ受け付ける（コメント・末尾カンマは構文エラー）。
- 整形・ツリー構築は再帰実装のため、極端に深いネストは `RangeError` になり「ネストが深すぎて処理できません」と表示する（大入力ガード）。
- マスクのクレジットカード/電話番号等はパターン + チェックディジットによる推定であり、誤検出・検出漏れの可能性がある。

### CIDR/サブネット計算機

#### 機能

- **計算モード**: CIDR 文字列を入力すると、ネットワークアドレス・ブロードキャスト・ホスト範囲・サブネットマスク等を一覧表示。
- **分割モード**: 元の CIDR と分割先 prefix 長を指定すると、等分割されたサブネット一覧をテーブル表示。IPv4/IPv6 両対応、最大 1024 分割。
- **重複検出モード**: 複数の CIDR を 1 行 1 つ形式で入力すると、重複するペアを検出してテーブル表示。関係は「完全一致」「A が B を包含」「B が A を包含」「部分重複」の 4 種で表示。IPv4/IPv6 混在入力可（バージョンが異なるペアは重複なしとして扱う）。

#### 仕組み・アルゴリズム

外部ライブラリを使用せず、`BigInt` で IPv4（32bit）と IPv6（128bit）を統一的に扱う純関数群で実装している。

- **IPv4 パース**: 4 オクテット・各 0–255 を厳密検証。先頭ゼロ（`01.0.0.0` 等の octal 表記）・空オクテット・非数字を拒否。
- **IPv6 パース**: `::` 展開（1 回のみ許可）、hextet 0–ffff 検証、8 グループ整合チェック、IPv4-mapped 末尾記法（`::ffff:192.168.1.1`）に対応。
- **ネットワーク計算**: `network = addr & mask`、`broadcast (IPv4) = network | ~mask`。BigInt の bit 演算で 128bit 幅でも精度を損わない。
- **特殊ケース**: /32 はホスト自身（usableHostCount=1）、/31 は RFC 3021 P2P（network/broadcast 控除なし、usableHostCount=2）、/30 以下は total-2。
- **IPv6 フォーマット**: RFC 5952 準拠（小文字・最長連続ゼロを `::` 圧縮・先頭ゼロ省略）。圧縮対象は 2 グループ以上の連続ゼロのみ（1 グループは `::` 化しない）。
- **サブネット分割**: `parseCidr` を再利用して分割元を検証し、`step = 2^(maxBits - newPrefix)` 単位で BigInt 加算して各サブネットを生成。分割数 `2^(newPrefix - basePrefixLength)` が 1024 超の場合はエラーを返す。
- **重複検出**: 各 CIDR をネットワークアドレスと末尾アドレス（`start + totalCount - 1`）に変換し、全ペアを `O(n²)` で比較。`[aStart,aEnd]` と `[bStart,bEnd]` の包含・一致・交差を BigInt 比較で判定。バージョン混在ペアはスキップ。解析失敗行は行単位でエラー収集し、有効行の重複判定は継続する。有効 CIDR が 256 件を超える場合は `O(n²)` ループを実行せずエラーを返す（自己 DoS 防止）。検出ペアは先頭 1000 件で打ち切る（描画 DoS 防止）。

#### 準拠仕様・RFC

- **RFC 4632**: CIDR（Classless Inter-Domain Routing）記法の定義。
- **RFC 3021**: /31 サブネットの P2P リンク向け利用（network/broadcast アドレス控除なし）。
- **RFC 5952**: IPv6 アドレスの文字列表現推奨（:: 圧縮・小文字・先頭ゼロ省略）。

#### 制限・エッジケース

- IPv4-mapped IPv6（`::ffff:x.x.x.x`）はパースして BigInt に変換するが、結果は純 IPv6 アドレスとして表示される（IPv4 形式には戻さない）。
- IPv6 の 2 進表記は prefix 部のビット列のみ表示（128bit 全体を表示すると冗長なため）。
- /0 は全アドレス空間を表し、総アドレス数が `2^32`（IPv4）または `2^128`（IPv6）となる。
- 分割モードで分割数が 1024 を超える場合（例: /8 を /24 へ = 65536 件）はエラーメッセージを表示する。
- 重複検出モードで有効 CIDR が 256 件を超える場合はエラーメッセージを表示し、重複判定をスキップする。検出ペアが 1000 件を超える場合は先頭 1000 件のみ表示し、打ち切り旨を通知する。

### シークレットスクラバー

#### 仕組み・アルゴリズム

`src/utils/secret-scrubber/` に独立モジュールとして実装した純関数エンジン（外部ライブラリなし）。

- **ルールベース検出**: カテゴリ別の正規表現ルール群（`rules.ts`）でテキストを走査し、マッチした範囲を収集する。API キーはプロバイダ別パターン（AWS `AKIA/ASIA/ABIA/ACCA`・GitHub `ghp_/ghs_`・Anthropic `sk-ant-`・OpenAI `sk-`・Stripe・Google API・SendGrid・npm・GitLab・Slack）で高精度に検出する。
- **maskGroup**: `CREDENTIAL_ASSIGN`（代入式。`password` 等の英語キーに加え `パスワード`・`トークン` 等の日本語キー名・全角コロンに対応）・`CREDENTIAL_URL`（URL 認証）・`CREDENTIAL_AUTH_HEADER`（Authorization ヘッダ）はキャプチャグループを使い、キー名や URL のホスト部を残して値部分のみをマスクする。
- **バリデーション**: IPv4 は各オクテット 0〜255 検証、クレジットカードは Luhn アルゴリズム、HIGH_ENTROPY は Shannon エントロピー閾値チェックで誤検出を抑制する。
- **重複解決**: マッチを start 昇順でソートし、重なる場合は `priority` 高い方（同値なら長い方）を勝者とする。負けた側が勝者のフルマッチ範囲（maskGroup ルールが意図的に残すキー名・ホスト等を含む「考慮済み領域」）に完全に含まれる場合は破棄する（例: Authorization ヘッダ内 JWT は 1 つのプレースホルダになる）。はみ出す場合は範囲を union にマージし、負けたマッチの断片（例: 高エントロピー文字列の内側だけが AWS キーにマッチしたときの前後）が素通しになる漏えいを防ぐ（over-masking 側に倒す。PR #631 レビュー指摘）。
- **一貫トークン化**: `Map<カテゴリ:値, プレースホルダ>` を持ち、同一値に対して常に同一プレースホルダ（`[REDACTED:EMAIL_1]` 等）を割り当てる。カテゴリごとに初出順で連番を振る。
- **後ろから順に置換**: オフセット保護のため、解決済みマッチを末尾から処理して前方の位置が変化しないようにする。
- **Shannon エントロピー**: `entropy.ts` で実装。文字ごとの出現頻度から `- Σ p * log2(p)` を計算する（bits/char）。base64 風文字列は ≥ 4.0、hex 文字列は ≥ 3.0 を閾値とする。

#### 準拠仕様・参考

- Shannon エントロピー（Claude E. Shannon, 1948）による情報エントロピー計算
- Luhn アルゴリズム（ISO/IEC 7812）によるクレジットカード番号検証
- 各プロバイダ公式ドキュメントのシークレット形式仕様

#### 制限・エッジケース

- **IPv6 未対応**: IPv6 アドレスは検出しない（今後の拡張候補）。
- **UUID は HIGH_ENTROPY から除外**: `8-4-4-4-12` の hex 形式は識別子の可能性が高いため HIGH_ENTROPY 検出対象外。ただし UUID がプロバイダ特有パターンに合致する場合は別ルールで検出される。
- **代入式の値は 6 文字以上のみ検出**: `password=abc12` のような 6 文字未満の値は誤検出抑制のため検出しない。
- **既知の誤検出（over-masking 側）**: `06-11-2026` のようなハイフン区切り日付が電話番号として、`10.2.3.4` のようなバージョン表記が IP アドレスとして検出されることがある。不要ならカテゴリのトグルを OFF にする。
- **検出は完全ではない**: 未知の形式のシークレット・プロバイダ固有の非標準形式は検出されない場合がある。共有前に必ず目視確認すること。
- **高エントロピー検出は誤検出が発生しうる**: 長いランダムに見える文字列（Base64 エンコードされた非機密データ等）も HIGH_ENTROPY で検出される場合がある。不要なカテゴリはトグルで OFF にすることを推奨する。
- **json-formatter/mask.ts との関係**: JSON 構造の値を走査するマスク機能（`json-formatter`）とは独立したモジュール。テキスト全文を正規表現で走査するため、JSON 以外のログ・設定ファイルにも対応する。将来的な共通基盤化（S2-3）は別 PR で判断する。

### クリップボードインスペクタ

#### 仕組み・アルゴリズム

`src/utils/dataTransferSnapshot.ts` と `src/utils/sanitizeHtml.ts` を組み合わせて実装。

- **DataTransfer 取得**: `paste` イベント（`document` 全体で捕捉）と `drop` イベントの `DataTransfer` を受け取り、`DataTransferItemList` を同期パスで列挙する。`getAsString` の呼び出しはイベントハンドラの同期スコープ内で行う必要があり（ハンドラ終了後は `DataTransferItemList` が無効化される）、Promise で非同期解決する設計を採っている。
- **受付領域は contenteditable（モバイル対応）**: モバイルの OS ペーストメニューは編集可能要素の長押しでしか出ないため、受付領域を `contenteditable` 化している（issue #636）。`inputMode="none"` でフォーカス時のソフトキーボード表示を抑制する。paste 自体は従来どおり `document` レベルの listener が捕捉するため、ページ内のどこでも Ctrl+V / Cmd+V で貼り付けできる。
- **contenteditable の編集阻止（二段ガード）**: ① `beforeinput` の `preventDefault`（React の `onBeforeInput` は native beforeinput ではなく textInput / keypress 等から合成されるため、native と React 合成の両系統に登録して全編集経路を阻止）。② IME の `insertCompositionText` は W3C Input Events 仕様で non-cancelable のため beforeinput では阻止できず、貫通した編集は `input` イベント時にマウント時に保存した deep clone から案内文言を復元する（実 IME は既存テキストノード内部を直接変異させるため同一ノード参照の保存では復元が no-op になる。復元のたびに再クローンして装着し、master の clone 汚染も防止する）。
- **フレーバー分類**: `DataTransferItem.kind === 'string'` のものを `StringFlavor`（type・content・byteSize）、`kind === 'file'` のものを `FileFlavor`（type・name・size・lastModified・File オブジェクト）として分離して収集する。
- **HTML サニタイズ + sandbox**: `text/html` フレーバーのプレビュー表示時は、`sanitizeHtml`（許可リスト方式のサニタイザ。`script`・`iframe`・`on*` イベント属性・`javascript:` URL・`style`・remote 画像 URL（img の src は data:image の raster 形式 png/jpeg/gif/webp/avif/bmp のみ許可。svg+xml は script を内包し得るため除外）を除去。a の href は http/https/mailto のみ許可）でスクリプト・危険属性を除去したうえで `sandbox=""` 属性付き `<iframe>`（スクリプト実行・フォーム送信・同一オリジン不許可）に `srcdoc` として渡す二重防御を実施する。
- **画像プレビュー**: `image/*` 型のファイルフレーバーは `URL.createObjectURL` でブラウザ内 blob URL を生成して `<img>` に渡す。コンポーネントアンマウント時に `URL.revokeObjectURL` でメモリを解放する。

#### 準拠仕様・参考

- W3C Clipboard API および `DataTransfer` インターフェース仕様
- W3C HTML Living Standard `<iframe sandbox>` 属性仕様

#### 制限・エッジケース

- **ブラウザ非公開フレーバーは表示不可**: OS のクリップボードに存在しても、ブラウザが Web ページへ公開しないフレーバー（独自アプリ形式等）は列挙されない。
- **プレビューにインラインスタイルが反映されない**: `srcdoc` の iframe は親ドキュメントの CSP（`style-src` strict）を継承するため、サニタイズ後プレビューは構造・テキスト中心の表示になる。
- **Async Clipboard API 非対応**: ボタンクリックでの読み取り（`navigator.clipboard.read()`）には対応しない。権限プロンプトが必要で取得できる型も限定的なため、初版のスコープ外とした。
- **サニタイズで除去された要素・属性はプレビューに現れない**: 除去内容を確認したい場合は「生ソース」表示に切り替えれば原文をそのまま確認できる。
- **style 属性付き HTML 貼り付け時の CSP 違反ログ**: style 属性を含む HTML を貼り付けると、Chromium のクリップボード内部処理（`getAsString` の HTML サニタイズ）が inline style を評価するため、本番 CSP 環境（`style-src` strict）のコンソールに style-src 違反ログが数件記録されることがある。アプリの実装・表示には影響しない（E2E `tests/e2e/clipboard-inspector.spec.ts` の本番 CSP テスト参照）。
- **プレビューでは remote 画像は表示されない**: http/https の img src は外部リクエスト防止（tracking pixel 対策）と CSP 違反ノイズ回避のためサニタイズで src を除去する（alt テキストは保持）。img の src として表示されるのは data:image の raster 形式（png/jpeg/gif/webp/avif/bmp）のみ。
- **ハイドレーション完了前は貼り付けを捕捉できない**: `paste` listener は React コンポーネントのマウント時に `document` へ登録されるため、ページ表示直後の数百 ms（ハイドレーション完了前）の貼り付けは捕捉されない。

### DSN/接続文字列ビルダ

#### 仕組み・アルゴリズム

- `scheme://[userinfo@]authority[/path][?query]` を自前パーサで分解する。`URL` API は
  mongodb のカンマ区切り複数ホスト（`host1:27017,host2:27018`）を解釈できないため使用しない
- userinfo・パス・クエリは percent-decode してフォームに表示し、URI 生成時に
  `encodeURIComponent` で再エンコードする（パスワード中の `@ : /` 等の手動エンコード不要）
- スキーム方言辞書（`src/utils/dsn-builder/dialects.ts`）が既定ポート・複数ホスト可否・
  パス部の意味（DB 名 / DB 番号 / vhost）・SRV 制約・JDBC 形式可否を定義する
- パスワードを `****` に置換した共有用 URI を常時導出する（同期不要の純粋関数）
- JDBC（`jdbc:postgresql` / `jdbc:mysql`）は credential を userinfo でなく
  `?user=&password=` クエリプロパティに置く JDBC 標準の流儀に従う。パース時はプロパティを
  ユーザー名・パスワードのフォーム欄へ移し、シリアライズ時にプロパティ列の先頭へ戻す
- JDBC URL に userinfo（`jdbc:postgresql://user:pass@host/db`）を含めて貼り付けた場合は、
  userinfo を専用フィールドへ取り込み、再シリアライズ時に `?user=&password=` プロパティ形式へ
  正規化する（JDBC ドライバは userinfo を解釈しないため。専用フィールドが空のときのみ
  プロパティ側から引き取る）

#### 準拠仕様・RFC

- RFC 3986（URI 構文・percent-encoding）
- libpq 接続 URI（PostgreSQL 複数ホスト）・MongoDB Connection String・RabbitMQ URI Specification
- JDBC URL（PostgreSQL / MySQL ドライバの `jdbc:postgresql` / `jdbc:mysql` 形式）

#### 制限・エッジケース

- 実接続テストは不可（ブラウザの制約）
- クエリパラメータの意味的妥当性（sslmode の値等）は検証しない
- 過剰エンコードされた入力（例: `%41` = `A`）は decode → 再 encode で正規化される
- JDBC は PostgreSQL / MySQL のみ対応。SQL Server（`;` 区切り）・Oracle（`@host:port:SID`）・
  ADO.NET（`Server=...;`）形式は文法が大きく異なるため対象外

### 鍵フォーマット変換

#### 仕組み・アルゴリズム

- 入力種別を `key/detect.ts` で判定する。テキストが `{` 始まりで JSON parse 可能かつ `kty` を持つ → JWK、`-----BEGIN ... -----` マッチ → PEM、Uint8Array または base64-only テキスト（先頭 `0x30` DER SEQUENCE）→ DER の優先順で判別する
- DER / PEM の場合は `asn1js.fromBER` でトップレベル SEQUENCE を解析し、第1要素が INTEGER（version=0）→ PKCS#8 秘密鍵、第1要素が SEQUENCE（AlgorithmIdentifier）→ SPKI 公開鍵と判定する。AlgorithmIdentifier の OID で RSA（`1.2.840.113549.1.1.1`）/ EC（`1.2.840.10045.2.1`）を識別し、EC の場合は params の named curve OID（P-256=`1.2.840.10045.3.1.7` / P-384=`1.3.132.0.34` / P-521=`1.3.132.0.35`）から曲線名を取得する
- JWK の場合は `kty` / `crv` フィールドとプライベートキーフィールド（`d` の有無）で鍵種別を判定する
- JWK の import は鍵素材（RSA: `n`/`e`/`d`…、EC: `x`/`y`/`d`）のみを取り込み、入力 JWK の `alg` / `key_ops` / `use` / `ext` は import 前に除去する。これにより `RS384` / `RS512` / `PS256` を宣言した署名鍵や用途宣言付きの鍵も鍵素材の形式変換として扱える（hash・用途は変換結果に影響しないため）
- 出力 JWK は Web Crypto が付与する `ext` / `key_ops` / `alg` を除去したうえで、入力が JWK の場合のみ元の `kid` / `use` / `alg` / `key_ops` を復元する。PEM / DER 入力では鍵素材から導けない `alg` を付与せず、アルゴリズムを詐称しない
- 変換は `crypto.subtle.importKey`（`extractable: true`）→ `exportKey` の流れで全形式を生成する。RSA は `RSASSA-PKCS1-v1_5 / SHA-256`、EC は `ECDSA / namedCurve` をアルゴリズムパラメータとして使用する（hash は変換用の便宜値で実際の署名/検証には使用しない）
- PEM は DER を base64 化し 64 文字折返しで構築する。JWK は `JSON.stringify(jwk, null, 2)` でインデント付き出力する
- PKCS#1（RSA PUBLIC KEY / RSA PRIVATE KEY）/ SEC1（EC PRIVATE KEY）/ ENCRYPTED PRIVATE KEY などの未対応形式は `detectKeyInput` が `unsupported` を返し、UI で openssl 変換コマンドを案内する
- `importKey` 失敗（壊れた DER/JWK）は catch して `error` フィールド付きの結果を返す（throw しない設計）

#### 準拠仕様・RFC

- RFC 5958（非対称鍵パッケージ、PKCS#8 Private-Key Information Syntax）
- RFC 5480（楕円曲線暗号 SubjectPublicKeyInfo）
- RFC 7517（JSON Web Key）/ RFC 7518（JSON Web Algorithms、鍵パラメータ定義）
- Web Cryptography API（W3C）

#### 制限・エッジケース

- PKCS#1 形式（RSA PUBLIC KEY / RSA PRIVATE KEY）・SEC1 形式（EC PRIVATE KEY）のレガシー PEM は非対応。`openssl pkcs8 -topk8 -nocrypt` で PKCS#8 に変換してから使用する
- 暗号化秘密鍵（ENCRYPTED PRIVATE KEY・パスフレーズ付き PEM）は非対応。`openssl pkcs8 -in key.pem -nocrypt -out key_plain.pem` で復号してから変換する
- Ed25519 / Ed448（EdDSA、`kty: OKP`）は非対応
- 秘密鍵からの公開鍵抽出は非対応
- JWK 出力で復元する入力メタデータは allowlist 限定（`kid` / `use` / `alg` / `key_ops`）。`x5c` / `x5t` / `x5t#S256` / `x5u` などの X.509 連携フィールドは v1 スコープ外で、JWK→JWK の往復では脱落する。`kty` が RSA / EC 以外（`OKP` 等）は引き続き非対応
- 全処理はブラウザ内で完結し、秘密鍵データは外部に送信しない

### HARビューア＆サニタイザ

#### 仕組み・アルゴリズム

- HAR（HTTP Archive）は JSON 形式のため `JSON.parse` でパースし、`log.entries` が配列であることを最小スキーマ検証する（`src/utils/har/parse.ts`）
- サニタイズは二段階。①構造的 redact（`src/utils/har/sanitize.ts`）: フィールド名辞書で確実に処理。②`scrubText`（`src/utils/secret-scrubber/scrub.ts`）: 本文の取りこぼしを自由テキスト走査で補完
- 構造的 redact の対象: `request.cookies[].value` / `response.cookies[].value` / Cookie・Set-Cookie ヘッダ値（COOKIE カテゴリ）/ Authorization 等の認証ヘッダ値（AUTH_HEADER）/ `request.queryString[]` の機密名エントリ（QUERY）/ `request.url` のクエリパラメータと basic-auth パスワード（QUERY）/ URL を運ぶヘッダ `Referer`・`Origin`・`Location`・`Content-Location` への URL redact 適用（QUERY。URL から消した値が他ヘッダに残る漏洩を防ぐ）/ `postData.params[]` の機密名エントリと `postData.text` への scrubText（BODY）/ `response.content.text` への scrubText（BODY_SCAN）
- カバレッジ拡張（#687/#689/#690/#694/#695）:
  - **辞書外ヘッダ値**にも `scrubText` フォールバックを適用（**HEADER_SCAN** カテゴリ）。`x-amz-security-token` 等の認証ヘッダ辞書も拡充。**認証ヘッダ（AUTH_HEADER）は辞書ベースの確実な redact、ヘッダ走査（HEADER_SCAN）は辞書外ヘッダへの自由テキスト走査**と役割が分離されており、それぞれ独立トグルで制御できる（#694）
  - **URL のパス以降**（path?query#fragment）に `scrubText` を適用（**PATH_SCAN** カテゴリ）。`scheme://authority`（host・port・basic-auth）は保持し、パス内トークン（`/reset/<jwt>`）や辞書外クエリ名の JWT/API キーを redact する。クエリ/フラグメントは `&` 越えの飲み込みを防ぐため param value 単位で走査する。**機密クエリ（QUERY）は辞書一致クエリ/POST param + basic-auth の構造的 redact、URL走査（PATH_SCAN）はパス以降への自由テキスト走査**と役割が分離されている（#694）
  - **`response.redirectURL`** にも URL redact を適用（QUERY / PATH_SCAN）
  - **`data:` URL は scrubText を適用しない**（#695）。`data:image/png;base64,...` のようなペイロードに `HIGH_ENTROPY_BASE64` が誤マッチして base64 を `[REDACTED]` に置換しデコード不能にする破壊を防ぐ
  - over-masking 方針: パス/ヘッダ内の IP・メール・高エントロピー文字列も redact されうるが、host は保持され漏えい方向ではなく安全側。詳細は `docs/decisions.md`
  - **本文スキャンのスキップ拡張**: `encoding === 'base64'` に加え、`content.mimeType` がバイナリ系（`image/*`・`audio/*`・`video/*`・`font/*`・`application/octet-stream`・`pdf`・`zip` 等）なら encoding 欄が無くてもスキップし、`HIGH_ENTROPY_BASE64` による本文破壊を防ぐ
- 防御的処理: JSON として妥当でも `request`/`response` を欠く壊れた entry は例外を投げずスキップする（`sanitizeHar` はレンダリング中の `useMemo` で走るため、throw すると画面が落ちる）。一覧（`HarEntryList`）では壊れた行を「（壊れたエントリ）」プレースホルダのクリック可能 button として描画し、クリックすると詳細パネルにプレースホルダを表示する（正常 entry 選択後に壊れた行を再クリックしても詳細が切り替わる、issue #701）
- 一貫トークン化: `makeTokenizer` がカテゴリ × 値 → `[REDACTED:COOKIE_1]` 等のプレースホルダを発行する。同一値には同一プレースホルダを割り当て、HAR 全体で値の同一性が保たれる。**ただしこの HAR 全体一貫性は構造的 redact（tokenize 由来）に限る**。`scrubText` 由来の redaction（本文・辞書外ヘッダ・URLパス等）は呼び出しごとに採番されるため、異なるフィールドに跨る同一秘密値の一貫トークン化は保証されない（安全側であり漏えいはしない）
- 純関数・入力非破壊: `structuredClone` でディープコピーしてから処理するため元オブジェクトを mutate しない
- parse + sanitize は **Web Worker**（`src/workers/harSanitizer.worker.ts`）で実行する。`sanitizeHar` は `structuredClone` + 全 response body の正規表現スキャンで中規模 HAR でも数秒かかり、メインスレッド同期実行だと「ページが応答しません」になる（issue #677）。worker に逃がしメインスレッドを固めない。worker は parse 済み HAR を保持し、redact トグル時は再 parse せず sanitize のみ再実行する
- フック `useHarSanitizer`（`src/hooks/useHarSanitizer.ts`）が worker のライフサイクルとメッセージングを担う。各 load / sanitize に `requestId` を振り、最新リクエストの結果のみ反映（トグル連打時の stale result を破棄）。`sanitizeHar` の `onProgress` コールバックで処理済みエントリ数を逐次受け取り、`ProgressBar` で進捗表示する
- カテゴリ別の redact 件数は worker が返す `counts` を `ToggleChips` のバッジに表示する
- エントリ一覧（`HarEntryList`）は全件描画する。フリーズの主因は描画ではなく sanitize であり Worker 化で解消したため、ページングは導入しない（実 HAR の検証でエントリ数は数百件程度で、その規模の `<tr>` 描画は問題にならないことを確認。`loadSeq` は新規読込時の選択リセット判定にのみ使い、トグル時は選択を保持する）
- 出力 HAR の `JSON.stringify(.., null, 2)` はコピー/ダウンロード押下時のみ遅延生成する（`CopyButton` の `text` prop は `string | (() => string)` を受け付け、関数はクリック時に評価される）。毎レンダリングでの数 MB 直列化を避ける
- `sanitize.ts` は worker の依存グラフに含まれるため `@/` ではなく相対 import を使う（Vite の worker Rollup サブビルドに tsconfig paths が伝播しないため。詳細はファイル冒頭コメント参照）
- **ウォーターフォール（タイミング可視化）**: `computeWaterfall`（`src/utils/har/waterfall.ts`）が `HarEntry[]` から全体タイムライン基準の配置モデルを計算する。各エントリの `startedDateTime`（ISO 文字列）を epoch ms に変換して起点を求め、`timings`（blocked / dns / connect / ssl / send / wait / receive）をフェーズ別セグメントに分解する。**HAR 1.2 仕様に従い `ssl` は `connect` の部分時間**として扱うため、`connect` セグメント ms = `connect - ssl`（下限 0）に補正し、ssl を別セグメントとして並べる（二重計上防止）。値が `-1`・未定義・`0` のフェーズはセグメント化しない。`WaterfallRow.offsetRatio` は `(start - t0) / totalMs`、`widthRatio` は `durationMs / totalMs` で全体タイムライン基準の相対配置を表す。一覧テーブルの「タイミング」列（スマホでは `hidden md:table-cell` で非表示）に `HarWaterfallBar` が横棒を描画し、詳細パネル（`HarEntryDetail` 内 `TimingBreakdown`）にフェーズ別内訳テーブルとミニバーを表示する。動的な幅・オフセットは `useDynamicStyleSheet`（Constructable Stylesheets）で CSS カスタムプロパティ（`--bar-left` / `--bar-width` / `--seg-width` / `--mini-width`）として注入する（CSP `style-src` 制約により inline style は使用しない、decisions [067]）。`computeWaterfall` は `HarViewer` で `useMemo` 化して `entries` 変化時のみ再計算する

#### 準拠仕様

- HAR 1.2 仕様（http://www.softwareishard.com/blog/har-12-spec/）の必要サブセットを型定義（完全検証は不要なため `log.entries` 配列の存在のみを確認）
- ウォーターフォールの `ssl` / `connect` 処理は HAR 1.2 spec の「ssl timings are included in the connect timings」に準拠

#### 制限・エッジケース

- ウォーターフォール: `timings` を持たないエントリはバーを非表示にして degrade する（`—` を表示）。`startedDateTime` の欠落時も同様。スマホ（390px）では一覧のタイミング列を非表示にし、詳細パネルで内訳を確認できる
- ファイルサイズ上限 25MB（メモリ防御ガード）。読み込み時のフリーズは sanitize の Web Worker 化で解消済みのため、バイト数は処理能力の指標ではなくメモリ確保の上限として残す。大きな HAR は worker 上で時間がかかる（実測 ~6MB/5000 エントリで約 2.6 秒、~18MB/10000 エントリで約 17 秒）が、メインスレッドは固まらず進捗バーを表示する。redact トグルのたびに全エントリを再 sanitize する（worker 上のため非ブロッキング。差分 sanitize は将来課題）
- 辞書に無い独自ヘッダ名・独自名のクエリ/フォームパラメータは `scrubText` が拾える範囲のみ redact される（任意名のセッショントークン等は残りうる。完全な網羅は保証せず、出力は共有前の目視確認が前提）
- レスポンスボディが base64 エンコード（`content.encoding: "base64"`）の場合は `scrubText` をスキップする。`HIGH_ENTROPY_BASE64` ルールが base64 ブロック自体にマッチして本文を破壊し、デコード不能な HAR を出力するのを防ぐため（その代わり base64 本文内の秘密は検出されない）
- 全処理はブラウザ内で完結し、HAR データは外部に送信しない

### CSR・鍵ペアジェネレータ

#### 仕組み・アルゴリズム

- **生成モード**: `crypto.subtle.generateKey` で RSA（RSASSA-PKCS1-v1_5）または ECDSA（P-256 / P-384 / P-521）の鍵ペアを生成し、pkijs の `CertificationRequest` に Subject DN と SAN 拡張を設定して PKCS#10 CSR を構築する
  - Subject DN フィールドの文字種は OID ごとに制御: countryName は `PrintableString`、emailAddress は `IA5String`、その他は `UTF8String`
  - SAN（Subject Alternative Name）は `pkcs-9-at-extensionRequest`（OID `1.2.840.113549.1.9.14`）属性内の `id-ce-subjectAltName`（OID `2.5.29.17`）拡張として設定する
  - `pkcs10.sign(privateKey, hashAlg)` で自己署名。RSA は SHA-256 固定、ECDSA は P-256=SHA-256 / P-384=SHA-384 / P-521=SHA-512
  - CSR は `pkcs10.toSchema(true).toBER()` → DER → 64 文字折返し PEM 化（`-----BEGIN CERTIFICATE REQUEST-----`）
  - 秘密鍵は `crypto.subtle.exportKey('pkcs8', ...)` でエクスポートし PEM 化（`-----BEGIN PRIVATE KEY-----`）。平文 PKCS#8 のみ対応
- **解析モード**: PEM（`-----BEGIN CERTIFICATE REQUEST-----` ヘッダを抽出）または Base64（DER 直接）を受け取り、`asn1js.fromBER` + `pkijs.CertificationRequest` でパース。Subject の `typesAndValues` から OID→ラベル変換し、`extensionRequest` 属性から SAN を抽出する。`pkcs10.verify()` で署名自己整合性を検証する（改竄検出）
- pkijs の Web Crypto エンジン初期化には既存 `src/utils/cert/engine.ts` の `ensureCryptoEngine()` を再利用する

#### 準拠仕様

- RFC 2986（PKCS#10 Certification Request Syntax Specification）
- RFC 5280（X.509 SAN 拡張 id-ce-subjectAltName = 2.5.29.17）
- PKCS#8（秘密鍵のエクスポート形式）

#### 制限・エッジケース

- Ed25519 / Ed448（EdDSA）は非対応（Web Crypto のブラウザサポート差・pkijs の追加検証が必要）
- 暗号化 PKCS#8（PBES2 / パスフレーズ付き秘密鍵）でのエクスポートは非対応
- SAN の IP アドレスは IPv4（4 オクテット）のみ対応。IPv6 は DNS SAN での代替を推奨
- challengePassword 属性・KeyUsage / ExtendedKeyUsage 等のカスタム拡張編集は非対応
- 全処理はブラウザ内で完結し、秘密鍵は外部サーバーに送信しない

---

### markdownエディタ

#### 仕組み・アルゴリズム

- **markdown パース**: `marked` ライブラリの `marked.parse(md, { gfm: true, breaks: true, async: false })` で GFM 準拠の HTML 文字列を生成する。`gfm: true` で表・取り消し線・コードブロックを有効化、`breaks: true` で改行を `<br>` に変換する（一般的なエディタ体験に合わせる）。
- **XSS 対策**: 生成 HTML は必ず既存の `sanitizeHtml(html)` に通してから返す（`src/utils/sanitizeHtml.ts`）。許可リスト方式（`<script>` / style / 危険属性 / `javascript:` URL を除去）でガード。新規サニタイザは導入せず既存資産を再利用。
- **描画**: `sanitizeHtml` 済みの HTML 文字列を `<div className="markdown-preview" dangerouslySetInnerHTML={{ __html: sanitized }}>` でインライン描画する。`sanitizeHtml` が許可外要素・属性を全除去した後の文字列のみを渡すため XSS リスクはない。
- **パフォーマンス**: `useMemo(() => renderMarkdown(input), [input])` で入力単位に memo 化し、毎レンダーでのパース再実行を回避する。
- **スタイリング**: `sanitizeHtml` は `class` 属性を除去するため、生成要素にクラスを付けられない。`global.css` の `@layer components` に `.markdown-preview` を定義し、子孫要素セレクタ（`.markdown-preview h1`、`.markdown-preview table` 等）で整形する。

#### 準拠仕様・RFC

- **CommonMark**: `marked`（本プロジェクトでは v18 を使用）は CommonMark に準拠する基盤を持つ
- **GitHub Flavored Markdown (GFM)**: `gfm: true` で GFM 拡張（表・取り消し線・コードブロックの言語記法）を有効化。GFM は CommonMark のスーパーセット仕様（[https://github.github.com/gfm/](https://github.github.com/gfm/)）

#### 制限・エッジケース

- **GFM タスクリストの `<input type=checkbox>`**: `sanitizeHtml` の `DROP_WITH_CHILDREN` リストに `input` が含まれるため、チェックボックス要素が除去される。テキスト部分（`[ ] TODO` 等）は `<li>` のテキストとして残る。
- **コードブロックの `class="language-xxx"`**: `sanitizeHtml` が `class` 属性を許可しないため除去される。シンタックスハイライトはスコープ外のため影響なし。
- **見出しの `id` アンカー**: `id` 属性は許可リストに含まれないため除去される。見出しリンクは機能しない。
- **`img` の外部 URL**: `sanitizeHtml` は `img src` に `data:image/` の raster 形式のみを許可し、`https://` 等の外部 URL は除去する（本番 CSP `img-src 'self' data: blob:` との整合、および「外部送信なし」建前の維持）。
- **全処理はブラウザ内で完結し、入力 markdown を外部サーバーに送信しない**

### コントラスト比マトリクス

#### 仕組み・アルゴリズム

- **色パース（`parseColor`）**: HEX `#rgb`（展開）/ `#rrggbb` および `rgb(r, g, b)` 形式の文字列を `{ r, g, b }` オブジェクトに変換する。大文字小文字・前後空白を許容。アルファ付き形式（`#rrggbbaa` / `rgba()`）は v1 非対応で `null` を返す。
- **WCAG 相対輝度（`relativeLuminance`）**: IEC 61966-2-1（sRGB）のガンマ展開 `c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4` で各チャネルを線形化し、`L = 0.2126*R + 0.7152*G + 0.0722*B` で輝度を算出する。
- **WCAG コントラスト比（`contrastRatio`）**: `(max(L1,L2)+0.05) / (min(L1,L2)+0.05)`。1:1（同色）〜 21:1（黒×白）の範囲を取る対称指標。
- **合否判定（`wcagLevels`）**: AA 通常テキスト ≥ 4.5 / AA 大きいテキスト ≥ 3.0 / AAA 通常テキスト ≥ 7.0 / AAA 大きいテキスト ≥ 4.5。
- **APCA Lc（`apcaLc`）**: APCA-W3 0.1.9 の公式アルゴリズムを自前実装。W3C ベータライセンスのライブラリ採用を避け依存追加なしで実現（`docs/decisions.md` 参照）。前景・背景それぞれの `Y = 0.2126729*R^2.4 + 0.7151522*G^2.4 + 0.0721750*B^2.4` を算出後、ソフトクランプ（閾値 0.022、指数 1.414）を適用。bgY > txtY（明背景）なら `(bgY^0.56 - txtY^0.57) * 1.14`、逆（暗背景）なら `(bgY^0.65 - txtY^0.62) * 1.14` で SAPC を計算し、lo-clip（0.1）と offset（0.027）を適用して Lc = SAPC × 100 を返す。符号は極性（明背景＝正、暗背景＝負）を表す非対称指標。
- **マトリクス生成（`buildMatrix`）**: `ColorEntry[]` の全ペアに対して `contrastRatio` / `wcagLevels` / `apcaLc` を一括計算し N×N の `MatrixCell[][]` を返す。行＝前景色、列＝背景色。対角（`fg.id === bg.id`）は `sameColor: true` フラグでグレーアウト対象とする。

#### 準拠仕様

- **WCAG 2.x コントラスト比**: W3C WCAG 2.1/2.2 の Success Criterion 1.4.3（AA）/ 1.4.6（AAA）の算出式に準拠
- **APCA-W3 0.1.9**: W3C WCAG 3 のコントラスト研究プロジェクトの公開アルゴリズム（https://www.w3.org/community/apca/）を実装。ベータ仕様のため将来的に定数が変更される可能性がある

#### 制限・エッジケース

- **不透明色のみ対応**: アルファ付き（半透明）色は v1 で非対応。背景色との合成計算が必要なため意図的に除外
- **入力形式**: HEX（`#rgb` / `#rrggbb`）と `rgb()` のみ。HSL・OKLCH・名前付き色（`red` 等）は非対応
- **最低 2 色**: マトリクス描画には有効な色が 2 つ以上必要。2 色未満の場合は案内文を表示
- **全処理はブラウザ内で完結し、入力した色を外部サーバーに送信しない**
