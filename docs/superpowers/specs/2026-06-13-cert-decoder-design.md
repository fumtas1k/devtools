# SSL/TLS証明書デコーダ（cert-decoder）設計

- 日付: 2026-06-13
- 候補: `docs/tool-candidates.md` S-2
- ステータス: 設計確定（実装前）

## 1. 目的・背景

社内CA・本番証明書を外部送信できない現場向けに、PEM/DER/PKCS#7 の証明書を貼り付け（またはファイル選択）して、Subject/SAN/有効期限/署名アルゴリズム等を**ブラウザ内で完結**して解析・表示する「読む側」ツール。複数証明書のチェーン並べ替えと署名検証にも対応する。

全処理はブラウザ内で完結し、入力を外部送信しない。

## 2. スコープ

### v1 に含む

- **対応形式**: PEM（複数ブロック可）/ DER（バイナリ・Base64）/ PKCS#7（`.p7b`、証明書抽出のみ）
- **入力手段**: テキスト貼り付け + ファイル選択（`FileInputButton`）
- **証明書フィールド表示**: Subject/Issuer DN、SAN、有効期限（NotBefore/NotAfter）、シリアル番号、署名アルゴリズム、公開鍵情報（種別・鍵長・curve）、KeyUsage/ExtendedKeyUsage/BasicConstraints、SubjectKeyIdentifier/AuthorityKeyIdentifier、フィンガープリント（SHA-256）、SCT 一覧（best-effort）
- **チェーン解析**: 複数証明書を issuer→subject 順に並べ替え、隣接ペアの署名を Web Crypto で検証。各証明書の現在時刻に対する有効/期限切れ判定

### v1 スコープ外（別issue化）

- **PKCS#12（.pfx/.p12）対応** — 秘密鍵+パスワード処理は別途。実装着手時に GitHub issue を起票し、PR にひも付ける
- **鍵フォーマット変換（PEM/DER/JWK）** — 統合メモの「作る/変換する側」機能。別ツール/別PRへ分離（B2-7 csr-generator 等と共通基盤化を検討）

## 3. ツール定義・配置

| 項目        | 値                                                                                                                                                |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| slug        | `cert-decoder`                                                                                                                                    |
| name        | `SSL/TLS証明書デコーダ`                                                                                                                           |
| description | `PEM/DER/PKCS#7 の証明書を解析し、Subject/SAN/有効期限/署名アルゴリズム/SCT を表示。チェーンの署名検証にも対応。データはブラウザ外に送信しません` |
| category    | `encode`（エンコード・デコード。既存 `JwtDecoder` と同じ「解析・閲覧専用」の位置づけ）                                                            |
| yomi        | `えすえすえるてぃーえるえすしょうめいしょでこーだ`                                                                                                |

- `src/components/tools/CertDecoder.tsx`
- `src/pages/tools/cert-decoder.astro`（`client:load` でマウント）
- パースロジックは `src/utils/cert/` に分離

## 4. ライブラリ選定

**pkijs (3.4.0) + asn1js (3.0.10)** を採用。

- Web Crypto 親和性: チェーン署名検証を `crypto.subtle` で実行でき、既存 `JwtDecoder`/`QrTicket` と同じ暗号基盤に揃う
- Tree-shaking: `Certificate` / `ContentInfo`(PKCS#7) など必要クラスのみ import
- 拡張領域の生バイト取得: SCT 等のカスタム拡張を asn1js で辿れる

SCT は ASN.1 ではなく TLS シリアライズ構造のため、ライブラリ非依存で「拡張の生バイト → 手動デコード」とする。

`package.json` に追加した場合は `package-lock.json` の同期を必ず確認する。

## 5. モジュール分割（`src/utils/cert/`）

各ユニットは「入力 → 正規化データ」の純関数で、UI から独立してテスト可能とする。

- `detect.ts` — 入力種別判定（PEMブロック抽出 / DER / PKCS#7 ContentInfo）
- `parse.ts` — `parseCertificates(input) → ParsedCert[]`。各証明書を正規化フィールド型（`ParsedCert`）へ変換
- `chain.ts` — 複数証明書を issuer→subject 順に並べ替え、隣接ペアの署名を Web Crypto で検証（`Certificate.verify`）。有効期限判定も含む
- `sct.ts` — SCT 拡張（OID `1.3.6.1.4.1.11129.2.4.2`）の TLS 構造デコード（version/logID/timestamp、best-effort）
- 型定義（`ParsedCert`, `ChainLink`, `ChainResult` 等）は `types.ts` か各モジュール内に集約

### エラー設計

- パース系関数は throw せず、`{ ok: true, value }` / `{ ok: false, error }` 形式の結果か、`ParsedCert` に `error?` フィールドを持たせ、1枚の失敗が全体を壊さない構造とする
- 未対応形式（PKCS#12等）は専用のエラー種別で識別し、UI で別issue誘導を出す

## 6. UI / データフロー

- 入力 → デバウンス → `parseCertificates` → 証明書カードを縦に列挙
- 各カードは折りたたみセクション（基本情報 / SAN / 拡張 / 公開鍵 / 署名 / SCT）
- チェーン全体のステータスバナー（`NotificationBanner`/`StatusBadge`）: 並び順、各リンクの署名検証結果（✓/✗）、期限切れ警告
- DN・SAN・フィンガープリントに `CopyButton`
- 既存共通UI（`InputField`/`FileInputButton`/`CopyButton`/`NotificationBanner`/`StatusBadge`/`ChipLabel`/`ErrorMessage`）を流用
- DADS 配色準拠（`dads-design-system` skill 参照）。Tailwind primitive scale 直書き禁止、`@layer components` 意味クラス + `@theme` semantic token のみ

## 7. エラーハンドリング

- 空入力 / 不正PEM / 未対応形式 / 部分的に壊れた証明書 → `ErrorMessage` で個別表示。1枚パース失敗でも他証明書の表示は継続
- パスワード付き PKCS#12 検知時は「v1非対応」と明示し別issueへ誘導

## 8. テスト（test-gates 必須）

チェーン署名検証は「検証機構」のため **陽性対照 + 陰性対照** を必須とする。実装時に `test-gates` skill を必ず呼ぶ。

- **陽性**: 正しいルート→中間→リーフのチェーンで全リンク ✓
- **陰性**: issuer不一致 / 改ざんTBS / 期限切れ で必ず ✗ を出す（検知能力ゼロの空回りを排除）
- **パース系**: 既知の実サンプル証明書で各フィールド抽出を検証（PEM複数 / DER / PKCS#7 / SAN / SCT 含む）
- **E2E**: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/cert-decoder` を追加（VRT baseline は CI Linux runner で生成）。基本表示・入力→解析の動作確認

## 9. ドキュメント更新（`.agents/rules/common.md` 4章）

- `README.md`（ツール一覧）
- `SPEC.md`（2.3 ライブラリ追加 / 2.4 / 4 / 5 / 9章）
- `docs/decisions.md`（ライブラリ選定理由・スコープ判断）
- `docs/tools.md`（仕組み・準拠仕様・制限）
- `docs/tool-candidates.md` S-2 行の状態列を PR マージ時に ✅ + PR番号へ更新
- PKCS#12 / 鍵変換の分離 issue を起票し PR に明記

## 10. 受け入れ基準

- PEM（単一・複数）/ DER / PKCS#7 の証明書を解析し、主要フィールドを表示できる
- 複数証明書を正しいチェーン順に並べ、各リンクの署名検証結果を表示できる
- 改ざん/issuer不一致チェーンで検証が ✗ になる（陰性対照テストが green を検知できる）
- `npm run test` / `astro check` / `npm run test:e2e` が通る
- PC(1280x800)・スマホ(390x844)両サイズで目視確認済み
