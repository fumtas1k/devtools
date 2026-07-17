# SAMLデコーダ（saml-decoder）設計

- 日付: 2026-07-17
- 出典: `docs/tool-candidates.md` S2-2（SAML レスポンスデコーダ）
- 状態: 設計承認済み（ブレインストーミングで確定）

## 目的

SSO トラブルシューティングの定番作業「SAMLResponse の中身確認」をブラウザ完結で行う。
Assertion は社員の PII（NameID・メール・氏名属性等）の塊であり、samltool.com 等の外部サービスに貼れない現場向け。

## スコープ

### 対応する入力（すべて自動判定）

対象メッセージ型は **Response と AuthnRequest** の 2 種。入力形式は以下を自動判定する:

1. URL 全体（`SAMLResponse=` / `SAMLRequest=` クエリパラメータを抽出）
2. URL エンコードされた base64
3. base64（HTTP-POST binding）
4. base64 + raw deflate（HTTP-Redirect binding、`fflate` で展開）
5. 生 XML

適用した変換ステップ（URL抽出 → URLデコード → base64 → inflate → XML）を UI に表示し、
POST / Redirect どちらのバインディング由来かが分かるようにする。

### 表示内容

**Response の場合:**

- サマリ: メッセージ型 / Issuer / Status（Success 以外は StatusMessage も）/ Destination / InResponseTo / IssueInstant
- Assertion ごと:
  - NameID（+ Format）
  - 属性テーブル（Name / 値の一覧）
  - Conditions（NotBefore / NotOnOrAfter / AudienceRestriction）
  - AuthnStatement（AuthnInstant / SessionIndex / AuthnContextClassRef）
  - SubjectConfirmationData（Recipient / NotOnOrAfter / InResponseTo）
- 署名: 存在の有無と位置（Response レベル / Assertion レベル）のみ表示。「署名検証は未対応」と明記
- `EncryptedAssertion`: 検出して「暗号化されており復号は非対応」と案内
- 整形済み生 XML の折りたたみ表示 + `CopyButton`

**AuthnRequest の場合:**

- サマリ: Issuer / Destination / AssertionConsumerServiceURL / ProtocolBinding / IssueInstant / NameIDPolicy（Format / AllowCreate）/ RequestedAuthnContext
- 定番チェックリストは適用しない（Response のみ）

### 定番チェックリスト（Response のみ、現在時刻基準）

1. Status が Success か（Responder / Requester 等はエラー表示 + StatusMessage）
2. Conditions の NotBefore / NotOnOrAfter が有効期間内か（クロックスキューの注意書き付き）
3. Audience / Recipient の値表示。任意入力欄に SP entityID を入れた場合は照合結果を表示（未入力なら表示のみ）
4. NameID の有無

各項目を成功 / 警告 / エラーで色分け表示（`StatusBadge` / `NotificationBanner` を使用）。

## 実装構成

| 項目       | 内容                                                                                      |
| :--------- | :---------------------------------------------------------------------------------------- |
| ロジック   | `src/utils/saml.ts` — デコードチェーン（形式自動判定）+ パーサ                            |
| UI         | `src/components/tools/SamlDecoder.tsx`                                                    |
| ページ     | `src/pages/tools/saml-decoder.astro`（`client:load`）                                     |
| カテゴリ   | `encode`（jwt-decoder / cert-decoder と同列）                                             |
| yomi       | `さむるでこーだ`                                                                          |
| 新規依存   | `fflate` のみ（raw deflate 展開用。pako より小さく TypeScript 型定義同梱）                |
| XML パース | `DOMParser`。名前空間 URI ベース（`getElementsByTagNameNS` 等）で要素解決し prefix 非依存 |

### セキュリティ上の注意

- ブラウザの `DOMParser` は外部エンティティを解決しないため XXE は発生しない
- `dangerouslySetInnerHTML` は使用しない（属性値・XML 表示はすべて React 要素として組み立てる）
- 入力データはブラウザ外に送信しない

## テスト

- ユニットテスト（Vitest）: `saml.ts` の入力形式自動判定（5 形式）・Response / AuthnRequest パース・異常系
- **陽性対照（test-gates skill 準拠、必須）**: チェックリストは検知機構のため fail 側を実証する
  - 期限切れ Assertion（NotOnOrAfter 過去）→ エラー表示になること
  - Status = Responder → エラー表示になること
  - Audience 不一致（entityID 入力時）→ 不一致表示になること
- E2E（Playwright）: 貼り付け → 構造表示・チェックリスト表示、陽性対照ケース含む
- VRT: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/saml-decoder` を追加（baseline は CI の workflow_dispatch で生成・手動トリガー）

## ドキュメント更新

- `README.md`（ツール一覧）/ `SPEC.md`（2.3, 2.4, 4, 5, 9 章）/ `docs/decisions.md`（fflate 採用理由等）
- `docs/tools.md`（仕組み・準拠仕様・制限）
- `docs/tool-candidates.md` S2-2 の状態列に ✅ + PR 番号（マージ時）

## スコープ外（第2版候補として issue 化する）

- XMLDSig 署名検証（C14N が山場、難度 High）
- EncryptedAssertion の復号
- LogoutRequest / LogoutResponse 等の他メッセージ型
- 共有用マスク出力（secret-scrubber との連携）
