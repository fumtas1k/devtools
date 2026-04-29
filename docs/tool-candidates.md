# ツール候補リスト

Agent Teams によるブレインストーミング（2026-04-29）の結果を記録する。
優先度は「ブラウザ完結である必然性（機密データを外部送信しないメリット）」「実装難度」「既存サービスとの差別化」の3軸で評価。

## S tier ― ブラウザ完結である必然性が最も高い

| #   | ツール名                           | slug（案）         | 概要                                                                                                  | 技術メモ                                                                                                     |
| --- | ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| S-1 | **DSN / 接続文字列ビルダ＆パーサ** | `dsn-builder`      | `postgres://` `mysql://` `mongodb+srv://` `redis://` `amqp://` をフォーム⇄URIで双方向編集             | 接続文字列にはパスワードが必ず含まれる → 外部送信不可が必然。`URL` API＋ドライバ別パラメータ辞書             |
| S-2 | **SSL/TLS 証明書解析**             | `cert-decoder`     | PEM/DER/PKCS#7/PKCS#12 を貼り付け → Subject/SAN/有効期限/署名アルゴリズム/SCTを表示。チェーン検証対応 | 社内CA・本番証明書を外部送信不可の現場向け。`pkijs` / `node-forge` + Web Crypto API                          |
| S-3 | **Protobuf バイナリデコーダ**      | `protobuf-decoder` | `.proto` をアップロードして hex/base64 ペイロードをデコード。ワイヤレベル可視化も可能                 | `.proto` 自体が社外秘のことが多い。`protobufjs` で動的コンパイル（import解決はユーザの一括アップロード前提） |

## A tier ― 高頻度・差別化明確

| #   | ツール名                              | slug（案）         | 概要                                                                         | 技術メモ                                                                                  |
| --- | ------------------------------------- | ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A-1 | **正規表現ビジュアライザ＆ReDoS検出** | `regex-visualizer` | Railroad図表示・複数テストケース実行・catastrophic backtracking検出を一体化  | `regexp-tree` で AST→SVG、ReDoS 静的解析。PII含む文字列でも安全                           |
| A-2 | **設定ファイル相互変換**              | `config-converter` | YAML⇄JSON⇄TOML⇄.env⇄HCL を相互変換。コメント保持・`$schema` 検証対応         | IaC時代の必需品。本番設定・Terraform変数を外部送信不可の現場向け                          |
| A-3 | **Cron式プレイグラウンド**            | `cron-playground`  | Cron式を日本語翻訳、自然言語から生成、N回分の発火時刻を任意TZで一覧表示      | `cron-parser` + `cronstrue`（i18n）。5/6/7フィールド・Quartz/AWS EventBridge方言・JST対応 |
| A-4 | **コントラスト比マトリクス**          | `contrast-matrix`  | 任意のN色の全組合せ（N×N）コントラスト比を表示。WCAG 2.2 AA/AAA と APCA 併記 | 純粋計算（CIE Luminance, APCA公式アルゴリズム）。ブランドカラー外部送信不要               |
| A-5 | **TOTP/HOTP ジェネレータ＆検証**      | `totp-hotp`        | TOTP/HOTPコードの生成・検証。2FA実装のデバッグ補助                           | Web Crypto API（HMAC-SHA1/SHA-256/SHA-512）。TOTP seedを外部送信しない必然性が高い        |

## B tier ― 独自性・実用性あり

| #   | ツール名                                      | slug（案）               | 概要                                                                                        | 技術メモ                                                                               |
| --- | --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| B-1 | **i18n メッセージカタログ整合性チェッカー**   | `i18n-checker`           | `*.json`/`*.yaml`/`*.po`/`*.arb` をD&D → キー欠落・ICUプレースホルダ不一致・翻訳率を可視化  | `@formatjs/icu-messageformat-parser`。VS Code拡張なしで使えるWebツールがほぼ存在しない |
| B-2 | **MessagePack/CBOR/BSON ビューア**            | `binary-codec-viewer`    | バイナリシリアライゼーション形式を JSON と相互変換し、バイト単位で構造を可視化              | `@msgpack/msgpack` / `cbor-x` / `bson`。3形式統合UIは希少                              |
| B-3 | **CIDR/サブネット計算機**                     | `cidr-calculator`        | IPv4+IPv6+VLSM対応。複数CIDR重複検出・サブネット分割テーブル生成                            | BigInt でIPv6完全対応。社内ネットワーク構成を外部計算機に貼れない現場向け              |
| B-4 | **ハッシュ計算＆HMAC**                        | `hash-calculator`        | MD5/SHA-256/SHA-512/BLAKE3、ファイルハッシュ、HMAC（任意キー）を計算                        | Web Crypto API。ファイル・文字列両対応                                                 |
| B-5 | **JSONPath/JMESPath/jq 並列プレイグラウンド** | `json-query`             | 同じ JSON 入力に対し3種クエリ言語の結果を並列比較                                           | JSONPath/JMESPath は純JS。jq は WASM ビルドで実現可能                                  |
| B-6 | **デザイントークン抽出ツール**                | `design-token-extractor` | CSS/SCSS/Tailwind config → W3C Design Tokens（JSON）＋ Style Dictionary 互換形式で出力      | `postcss` + `csstree`。社内デザインシステムの未公開トークンを外部送信しない            |
| B-7 | **SVG 最適化＆コンポーネント一括生成**        | `svg-optimizer`          | SVG を D&D → SVGO最適化 → React/Vue/Astroコンポーネント、SVGスプライト、data URLを一括出力  | `svgo/dist/svgo.browser.js` で動作                                                     |
| B-8 | **パスワードエントロピー＆強度チェッカー**    | `password-checker`       | パスワード強度・エントロピー計算。辞書攻撃耐性も可視化                                      | zxcvbn相当をブラウザ完結で。実パスワードを外部送信しない必然性が高い                   |
| B-9 | **Kubernetes Manifest 解析＆Lint**            | `k8s-lint`               | ツリー表示＋kube-score風ベストプラクティス検査（resource limits不足、runAsNonRoot未設定等） | Manifestに含まれる内部レジストリ情報を外部送信しない点が差別化                         |

## C tier ― 実用的だが既存サービスで代替可

| #   | ツール名                        | 概要                                                      | 備考                                          |
| --- | ------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| C-1 | UNIXタイムスタンプ&マルチTZ変換 | epoch⇄ISO8601、ナノ秒精度対応、バッチ変換                 | ナノ秒精度・JST対応で差別化可能               |
| C-2 | 画像一括最適化（WebP/AVIF変換） | 複数画像を一括変換。EXIF削除・`<picture>`タグ生成         | Squooshの多ファイル版。顧客素材の外部送信不要 |
| C-3 | JSON Diff / JSON Patch生成      | 2つのJSONを比較しRFC 6902/7396 Patchを生成・適用          | `fast-json-patch`。RFC準拠Patch生成で差別化可 |
| C-4 | CSP バリデータ＆ビジュアライザ  | Content Security Policyのディレクティブを視覚化・違反検出 | 純粋パーサーで実現可                          |
| C-5 | 型スキーマ相互変換              | TypeScript⇄Zod⇄JSON Schema⇄OpenAPIを双方向変換            | 技術難度Medium。`quicktype-core`等要調整      |

## 重複・統合メモ

- **Cron**: A-3 で DevOps/Backend の両視点を統合（7フィールド・複数方言・JST・夏時間対応を全部入れ）
- **SSL/TLS証明書**: S-2 に証明書解析＋鍵フォーマット変換（PEM/DER/JWK）を統合
- **型スキーマ変換**: C-5 に統合（JSON Schema⇄TS⇄Zodに絞ると難度High化）
