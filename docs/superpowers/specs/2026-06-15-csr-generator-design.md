# csr-generator（CSR・鍵ペアジェネレータ）設計

- 候補リスト ID: **B2-7**（`docs/tool-candidates.md` 第2回ブレインストーミング B tier）
- slug: `csr-generator`
- 作成日: 2026-06-15

## 目的・背景

第1回 S-2 の SSL/TLS 証明書デコーダ（`cert-decoder`、証明書を「読む側」）の対になる「作る側」ツール。ブラウザ内で RSA/ECDSA 鍵ペアを生成し PKCS#10 CSR（証明書署名要求）を出力する。秘密鍵は一切外部送信せずローカル保存のみ。加えて既存 CSR の貼り付け解析にも対応する。

CSR 生成は通常 `openssl` CLI か CA のフォームで行うが、後者は秘密鍵がサーバ側生成になりがちで、社内 CA・本番系では秘密鍵をブラウザ外に出せない要件がある。全処理ブラウザ内完結である点が差別化になる。

## スコープ

### 含むもの

- **生成モード**: フォーム入力 → 鍵ペア生成（Web Crypto）→ PKCS#10 CSR 構築（pkijs）→ CSR PEM ＋ 秘密鍵 PKCS#8 PEM 出力
- **解析モード**: 既存 CSR（PEM/DER）を貼り付け/ファイル選択 → Subject / SAN / 公開鍵情報 / 署名アルゴリズム / 署名自己検証結果を表示
- 対応アルゴリズム: **RSA**（2048/3072/4096 bit）/ **ECDSA**（P-256 / P-384 / P-521）
- 秘密鍵エクスポート: **平文 PKCS#8 PEM のみ**

### 含まないもの（v1 スコープ外）

- Ed25519 / Ed448（Web Crypto のブラウザサポート差・pkijs 署名生成の追加検証が必要で High 化するため）
- 暗号化 PKCS#8（PBES2）でのエクスポート（WebCrypto 単体では困難で pkijs 追加実装が必要）
- challengePassword 属性、カスタム拡張（KeyUsage / ExtendedKeyUsage 等）の編集 UI
- CSR への署名（CSR は自己署名で完結。CA 機能は持たない）

スコープ外項目で要望が出た場合は GitHub issue 化して別 PR で対応する（common.md 6.4）。

## アーキテクチャ

`cert-decoder` / `key-converter` と同一の「ロジックを `src/utils/<domain>/` に分離、UI を `src/components/tools/` に置く」パターンを踏襲する。pkijs の Web Crypto エンジン初期化は既存 `src/utils/cert/engine.ts` の `ensureCryptoEngine()` を再利用する（重複初期化を避ける）。

```
src/utils/csr/
  types.ts      … KeyAlgorithm, SubjectDn, SanEntry, GenerateParams, GenerateResult, ParseResult 型
  generate.ts   … Web Crypto で鍵生成 → CertificationRequest 構築 → CSR PEM / 秘密鍵 PKCS#8 PEM 出力
  parse.ts      … 既存 CSR(PEM/DER) を fromBER → Subject/SAN/公開鍵情報/署名アルゴリズム抽出 + verify()
  index.ts      … re-export
src/components/tools/CsrGenerator.tsx   … ToggleGroup で「生成」「解析」モード切替
src/components/tools/csrGeneratorSample.ts … 解析モード用サンプル CSR
src/pages/tools/csr-generator.astro
```

### データフロー（生成）

1. ユーザがアルゴリズム・鍵長/曲線・Subject DN・SAN を入力
2. `generate(params)` を呼ぶ:
   - `ensureCryptoEngine()` → `crypto.subtle.generateKey()` で鍵ペア生成
   - `new CertificationRequest()` に `subject.typesAndValues`（DN を OID + 値で push）
   - `subjectPublicKeyInfo.importKey(publicKey)`
   - SAN があれば `pkcs-9-at-extensionRequest` 属性に `id-ce-subjectAltName`（2.5.29.17）拡張を GeneralNames で追加
   - `await pkcs10.sign(privateKey, hashAlg)`（RSA: SHA-256、ECDSA: 曲線に応じ SHA-256/384/512）
   - `pkcs10.toSchema(true).toBER()` → DER → PEM 化（`-----BEGIN CERTIFICATE REQUEST-----`）
   - `crypto.subtle.exportKey('pkcs8', privateKey)` → PEM 化（`-----BEGIN PRIVATE KEY-----`）
3. UI が CSR PEM / 秘密鍵 PEM を `OutputField` + `DownloadButton` で表示。秘密鍵側に非送信 `NotificationBanner`

### データフロー（解析）

1. CSR テキスト/ファイル入力 → PEM/DER 判定して DER 取得
2. `CertificationRequest.fromBER(der)` → Subject DN（OID→ラベル変換）、SAN（extensionRequest から抽出）、公開鍵アルゴリズム/鍵長、署名アルゴリズムを抽出
3. `await pkcs10.verify()` で署名自己整合性を検証し結果を表示

### Subject DN の OID 対応表

| フィールド                  | OID                  |
| --------------------------- | -------------------- |
| CN (commonName)             | 2.5.4.3              |
| O (organizationName)        | 2.5.4.10             |
| OU (organizationalUnitName) | 2.5.4.11             |
| C (countryName)             | 2.5.4.6              |
| ST (stateOrProvinceName)    | 2.5.4.8              |
| L (localityName)            | 2.5.4.7              |
| emailAddress                | 1.2.840.113549.1.9.1 |

文字種: countryName は PrintableString、emailAddress は IA5String、その他は UTF8String。

## UI 設計

- 最上部に `ToggleGroup`「生成」/「解析」。モード切替時は入力をリセットする（操作の種類が変わるため。ui-conventions.md 2.4）。
- **生成モード**:
  - アルゴリズム `ToggleGroup`（RSA / ECDSA）＋ 鍵長/曲線の `ToggleGroup`
  - Subject DN: `InputField` 群（CN/O/OU/C/ST/L/email）。CN にプレースホルダ例
  - SAN: 追加/削除カード型リスト UI（種別 DNS/IP/email の選択 + 値）。`.btn-remove-card` 既存パターン流用
  - 生成ボタン（`ActionButton` primary）。CN または SAN 1件以上が無ければ無効化 + ヒント表示
  - 出力: CSR PEM / 秘密鍵 PEM の `OutputField` 2 つ + 各 `DownloadButton`。秘密鍵に非送信 `NotificationBanner`（KeyConverter と同文言）
- **解析モード**:
  - `InputField`（multiline, mono）＋ `FileInputButton`（.csr/.pem/.der）＋ サンプル投入ボタン
  - 結果: `ChipLabel`（公開鍵アルゴリズム・鍵長・署名アルゴリズム・署名検証 OK/NG）＋ Subject/SAN の表示

スタイルは common.md 7章・ui-conventions.md に従い、primitive Tailwind カラー直書き禁止・semantic class / `@theme` token のみ使用。DADS デザイン規約準拠。

## エラーハンドリング

- 生成: 鍵生成失敗・入力不正（DN 値が空で SAN も無い）はインラインエラー / ボタン無効化
- 解析: PEM/DER パース失敗・CSR でない ASN.1 は `ErrorMessage` block 表示。`verify()` が false の場合はエラーではなく「署名検証 NG」として StatusBadge/ChipLabel（tone=error）で表示（改竄検出を可視化）

## テスト戦略

- **ユニット（Vitest, colocation `__tests__`）**:
  - 生成: RSA・ECDSA 各 1 ケースで CSR を生成 → `CertificationRequest.fromBER` で再パースでき Subject/SAN がラウンドトリップする
  - 生成: 秘密鍵 PEM が `crypto.subtle.importKey('pkcs8', ...)` で読み込める
  - 解析: 既知 CSR から Subject/SAN/アルゴリズムを正しく抽出
  - 解析: 正常 CSR は `verify()` が true
- **test-gates 陽性対照（必須）**: 解析モードの署名検証は validator のため、**署名値を改竄した CSR は `verify()` が false を返す**ことを検証する陽性対照テストを併設する（common.md 3章 / tool-candidates.md 138行の検知器規約）。陰性対照のみでは「常に true を返す空回り検証」と区別できない。
- **E2E（Playwright）**: 生成フロー（入力→生成→CSR/鍵が出力される）と解析フロー（サンプル投入→フィールド表示）の最小ケース。
- **VRT**: `tests/e2e/visual-regression-pages.ts` の PAGES に `/tools/csr-generator` を追加（`tests/meta/vrt-pages-coverage.test.ts` が登録漏れを fail させる）。baseline は CI の `Update Visual Regression Baseline` workflow を `workflow_dispatch` で手動トリガーして生成（web セッションのトークンでは起動不可のため手順を案内）。

## ドキュメント更新（common.md 4章・5章）

- `README.md`: ツール一覧に追加
- `SPEC.md`: 2.3（ライブラリ — pkijs は既存）/ 2.4（ディレクトリ）/ 4 / 5 / 9 章
- `docs/decisions.md`: 選定理由（cert-decoder の対・全処理ブラウザ内完結の必然性）
- `docs/tools.md`: csr-generator の仕組み・準拠仕様（RFC 2986 PKCS#10）・制限
- `docs/tool-candidates.md`: B2-7 行の状態列に ✅ + PR 番号（マージ時）
- `src/data/tools.ts`: toolEntries にエントリ追加（slug / name / description / category=`generate`（生成。主作用が鍵ペア＋CSR の生成のため）/ yomi=`しーえすあーるじぇねれーた`）

## 準拠仕様

- RFC 2986（PKCS#10 Certification Request Syntax）
- RFC 5280（X.509 / SAN 拡張 id-ce-subjectAltName = 2.5.29.17）
- PKCS#8（秘密鍵エクスポート）
