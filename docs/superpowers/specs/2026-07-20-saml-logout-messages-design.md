# SAML デコーダ LogoutRequest / LogoutResponse 対応 設計

- 日付: 2026-07-20
- 対象 issue: [#745](https://github.com/fumtas1k/devtools/issues/745)（第2版候補「LogoutRequest / LogoutResponse 等の他メッセージ型」）
- 初版設計: `docs/superpowers/specs/2026-07-17-saml-decoder-design.md`

## 目的

SAML デコーダ（`/tools/saml-decoder`）を LogoutRequest / LogoutResponse（シングルログアウト）に対応させ、SLO のトラブルシュート（期限切れリクエスト・Status 失敗レスポンス）をブラウザ内で完結できるようにする。

## スコープ

- 対応追加: `samlp:LogoutRequest` / `samlp:LogoutResponse` の 2 型のみ
- アプローチ: 既存パターン踏襲の最小拡張（union 型追加・ルート分岐追加・型別サマリ・チェックリスト拡張）

## 設計

### 1. データモデル（`src/utils/saml/types.ts`）

判別可能 union `SamlMessage` に 2 型を追加する。

```ts
interface SamlLogoutRequestData {
  type: 'logoutRequest';
  issuer?: string; // saml:Issuer（SP または IdP）
  destination?: string; // ルート属性
  issueInstant?: string;
  notOnOrAfter?: string; // ルート属性（リクエスト自体の期限）
  reason?: string; // Reason 属性（URI）
  nameId?: string; // saml:NameID テキスト
  nameIdFormat?: string;
  encryptedNameId: boolean; // saml:EncryptedID の場合 true（内容は表示不可）
  sessionIndexes: string[]; // samlp:SessionIndex（複数可）
  signed: boolean;
}

interface SamlLogoutResponseData {
  type: 'logoutResponse';
  issuer?: string;
  statusCode?: string;
  statusSubCode?: string; // Response と同じ二段階ステータス対応
  statusMessage?: string;
  destination?: string;
  inResponseTo?: string;
  issueInstant?: string;
  signed: boolean;
}
```

### 2. パーサ（`src/utils/saml/parse.ts`）

- ルート分岐に `LogoutRequest` / `LogoutResponse` を追加。非対応時のエラーメッセージの対応型列挙も更新する
- Status 抽出（外側/内側 StatusCode + StatusMessage）は Response と LogoutResponse で共通のため `parseStatus(root)` ヘルパーに抽出して両者で再利用する
- `EncryptedID` は `NS_A` 名前空間の直下子要素の存在で判定（復号はしない。復号は issue #745 の別項目）
- `SessionIndex` は `NS_P` 名前空間（protocol 側の要素であることに注意）

### 3. チェックリスト（`src/utils/saml/checks.ts`）

- **LogoutResponse**: Status チェックのみ。既存 `runResponseChecks` の Status 判定ブロックを `statusCheckItem()` に関数抽出して共有（Success → success / それ以外 → error、内側コード連結表示も同じ挙動）
- **LogoutRequest**: 2 項目
  - **NotOnOrAfter**: 属性なし → info「期限指定なし」/ パース不能 → warning / 期限切れ → error / 有効 → success。既存の `hasTimezone` / `isDateOnly` によるタイムゾーン注記ロジックを関数抽出して再利用する
  - **NameID**: NameID あり → success / EncryptedID → warning「暗号化されており内容を確認できません（復号は非対応）」/ どちらもなし → error（SAML 2.0 Core 仕様上 LogoutRequest には BaseID / NameID / EncryptedID のいずれかが必須）
- 公開 API は `runLogoutRequestChecks` / `runLogoutResponseChecks` を追加。`CheckOptions.now` の注入でテスト決定性を担保する（既存と同様）

### 4. UI（`src/components/tools/SamlDecoder.tsx`)

- 既存パターン踏襲で型別サマリ `<dl>` を 2 つ追加（見出し「LogoutRequest サマリ」「LogoutResponse サマリ」）
- LogoutRequest で EncryptedID の場合は NameID 行に「（暗号化・表示不可）」を表示する
- SP entityID 入力欄は Response のときだけ表示（現状維持。Logout 型には Audience がないため不要）
- 入力ラベル・placeholder は現状のまま（既に「SAMLResponse / SAMLRequest」と汎用的）
- サンプルボタンは現状の Response サンプルのまま変更しない（YAGNI）

### 5. テスト

- **ユニット**（`src/utils/saml/__tests__/`）:
  - パース: LogoutRequest / LogoutResponse を prefix あり・default xmlns の両方で。EncryptedID 判定・SessionIndex 複数も対象
  - チェック: `now` 注入で決定的に。期限切れ / 有効 / 指定なし、Status 成功 / 失敗、NameID なし
- **E2E**（`tests/e2e/saml-decoder.spec.ts` に追記）: LogoutRequest の base64 貼り付け → サマリ + チェックリスト表示、LogoutResponse の Status 失敗表示。`waitForReactHydration` 必須
- チェックリストは検知機構のため **test-gates skill に従い陽性対照必須**（期限切れ → error、Status 失敗 → error を必ず含める）

### 6. ドキュメント

- `docs/tools.md` の SAML デコーダ節に対応メッセージ型（LogoutRequest / LogoutResponse）と制限を追記
- `README.md` / `SPEC.md` はツール追加ではないため基本影響なし（説明文が変わる場合のみ更新）
- issue #745 のチェックボックス更新は PR マージ後に行う

## エラーハンドリング

- 非対応メッセージ型のエラーメッセージは対応型の列挙を「Response / AuthnRequest / LogoutRequest / LogoutResponse」に更新
- XML 構文エラー・デコード失敗の扱いは既存のまま（変更なし）

## スコープ外（issue #745 に残置）

- XMLDSig 署名検証
- EncryptedAssertion / EncryptedID の復号
- 共有用マスク出力（secret-scrubber 連携）
- ArtifactResolve 等のさらなるメッセージ型追加
- VRT ページ追加（既存ページの表示バリエーションのため新規ページなし）
