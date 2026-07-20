# SAMLデコーダ 共有用マスク出力（saml-mask-output）設計

- 日付: 2026-07-20
- 出典: issue #745「SAMLデコーダ第2版」の機能候補「共有用マスク出力（secret-scrubber との連携）」
- 状態: 設計承認済み（ブレインストーミングで確定）
- 関連: `docs/superpowers/specs/2026-07-17-saml-decoder-design.md`（初版設計・スコープ外セクション）

## 目的

SAML デコーダのデコード結果 XML から、社員 PII（NameID・属性値）と機密文字列を除去した
「共有用マスク XML」を生成し、コピーして安全に共有できるようにする。

本ツールの存在意義は「Assertion は社員の PII の塊であり samltool.com 等の外部サービスに貼れない現場向け」
（初版設計より）。マスク出力はこの目的を出力面から完成させる機能で、
「PII を伏せた状態なら同僚・チケットに共有したい」というトラブルシュート実務のニーズに応える。

## スコープ

### この PR に含める

- デコード済み XML の PII / 機密文字列マスク（構造ベース＋secret-scrubber 併用）
- 「整形済み XML」表示ブロック内での 生 XML / マスク XML トグル切替
- 全メッセージ型（Response / AuthnRequest / LogoutRequest / LogoutResponse）に一律適用

### スコープ外（別 PR）

- XMLDSig 署名検証（issue #745 の機能候補③）
- EncryptedAssertion 復号（同②）
- マスク対象フィールドのカスタマイズ UI（フィールド選択トグル等）。初版は固定ルールとし YAGNI で見送る

## マスク戦略（構造ベース＋スクラバ併用）

### フェーズ1: 構造ベースマスク（DOM 操作）

`decodeSamlInput` 済みの XML を `DOMParser` で再パースし、以下の要素の**テキスト内容**を
一貫トークンで置換する。要素は名前空間 URI で解決し prefix 非依存とする（parse.ts と同方針）。

- `saml:NameID`（`urn:oasis:names:tc:SAML:2.0:assertion` の `NameID`）
  — Subject 内・LogoutRequest 直下いずれも対象
- `saml:AttributeValue`（全 Attribute の値）

**一貫トークン化**: 値ベースで採番する（同一文字列 → 同一トークン）。
トークン形式は secret-scrubber に揃えて `[REDACTED:PII_<n>]`。
カテゴリは NameID / AttributeValue をまたいで単一の `PII` とし、値をキーに採番する。
これにより NameID のメールと `mail` 属性値が同一値なら同じトークンになり、
「同一ユーザか」の相関がマスク後も追える（トラブルシュートで有益）。

構造ベースの要点は、パターンマッチでは拾えない値（日本語氏名 `山田 太郎`・社員番号 `E12345` 等）も
「意味的役割が PII の要素」として確実にマスクできること。

### フェーズ2: secret-scrubber 併用（残余救済）

フェーズ1 で再シリアライズした XML 文字列に対し `scrubText`（`src/utils/secret-scrubber`）を実行し、
構造では拾えない箇所（Recipient URL 等に埋め込まれたメール、埋め込み JWT、IP、認証情報）を救済する。

- **`HIGH_ENTROPY` カテゴリは除外する**。X509Certificate / SignatureValue / DigestValue の
  base64（非 PII・公開情報）を over-mask しないため。これが「secret-scrubber をそのまま XML に
  かける」案を採らない理由でもある（HIGH_ENTROPY が署名・証明書を巻き込む）。
- 有効カテゴリ: EMAIL / JWT / CREDENTIAL / API_KEY / PRIVATE_KEY / IP / PHONE_JP / CREDIT_CARD。
- フェーズ1 の `PII` カテゴリと scrubText が採番するカテゴリ（EMAIL 等）は別空間のため、
  トークン番号は衝突しない。scrubText は入力中の既存 `[REDACTED:CAT_n]` を走査して番号を予約する
  （`reservedMax` ロジック）ため、`PII` トークンを挿入済みでも整合する。
- プレースホルダ `[REDACTED:PII_n]` はコロン・角括弧を含み、有効カテゴリの正規表現
  （EMAIL は `@` 必須等）にはマッチしないため、フェーズ2 で二重マスクされない。

### マスクしない（構造情報として保持）

- 要素名・属性名（`Name` / `FriendlyName` / `Format`）
- タイムスタンプ（`IssueInstant` / `NotBefore` / `NotOnOrAfter` / `AuthnInstant` 等）
- ID 系（Response / Assertion の `ID`・`InResponseTo`・`SessionIndex`）
  — 相関用のセッション毎ランダム値。PII ではなくトラブルシュートに必要
- エンドポイント URL（`Issuer` / `Destination` / `AssertionConsumerServiceURL` / `Recipient`）
  — 議論対象そのものが多い。ただし URL 内に埋まったメール・認証情報はフェーズ2 が部分マスクする
- 署名関連（`X509Certificate` / `SignatureValue` / `DigestValue`）— 公開情報・非 PII

## UI

「整形済み XML（簡易整形）」の `details` ブロック内に `ToggleGroup` を追加する。

- 選択肢: `生 XML` / `マスク XML（共有用）`
- 選択に応じて表示 XML と `CopyButton` のコピー対象を切替
- マスクモード時:
  - 件数バッジ（例「PII 3 件・機密 1 件をマスク」）を表示
  - 注記「共有前に必ず目視確認してください。完全な匿名化を保証するものではありません」
- 全メッセージ型に一律適用。マスク対象が 0 件の場合（AuthnRequest 等）は「マスク対象なし」を明示

`details` は初期状態で折りたたみのため、トグル追加による初期表示の見た目変化はない見込み。

## 実装構成

| 項目           | 内容                                                                                 |
| :------------- | :----------------------------------------------------------------------------------- |
| 名前空間定数   | `src/utils/saml/ns.ts`（新規）— `NS_P` / `NS_A` / `NS_DS` を切り出し parse.ts と共有 |
| マスクロジック | `src/utils/saml/mask.ts`（新規）— `maskSamlXml(xml): { xml; piiCount; secretCount }` |
| re-export      | `src/utils/saml/index.ts` に `maskSamlXml` を追加                                    |
| UI             | `src/components/tools/SamlDecoder.tsx` に ToggleGroup・マスク結果 useMemo・表示切替  |
| スタイル       | 既存 semantic class（`bg-subtle` 等）のみ使用。Tailwind primitive scale 直書きは禁止 |

### `maskSamlXml` の返り値

```ts
interface SamlMaskResult {
  /** マスク済み XML（シリアライズ後の文字列。表示側で formatXml して整形表示する） */
  xml: string;
  /** 構造ベース（フェーズ1）でマスクした occurrence 数 */
  piiCount: number;
  /** secret-scrubber（フェーズ2）でマスクした occurrence 数 */
  secretCount: number;
}
```

処理順: `decoded.xml` を DOM パース → フェーズ1（対象要素のテキスト置換）→ シリアライズ →
フェーズ2（`scrubText`）→ 返却。表示側は返却 XML を既存 `formatXml` で整形して表示する。

## エラーハンドリング

- マスクはパース成功後（トグル表示時）のみ実行するため、DOM 再パースは通常成功する。
  念のため try/catch し、失敗時は件数 0・元 XML 返却またはエラー表示にフォールバックする。
- `scrubText` は純関数で例外を投げない。

## テスト

test-gates skill 準拠。マスクは「PII / 機密を検出して除去する機構」であり、
陰性対照のみでは「検出能力ゼロで green」と区別不能なため**陽性対照を必須**とする。

### ユニット（Vitest）: `src/utils/saml/__tests__/saml-mask.test.ts`

**陽性対照（必須・除去できることの実証）:**

- NameID のメールがマスクされる
- 日本語氏名（`displayName` 属性値 `山田 太郎`）がマスクされる（パターンでは拾えない値）
- 複数 AttributeValue がすべてマスクされる
- 同一値（NameID メール = `mail` 属性値）が同一トークンになる（相関）
- Recipient URL 等に埋め込んだメールがフェーズ2（scrubber）でマスクされる
- LogoutRequest の NameID もマスクされる

**陰性対照（over-mask していないことの確認）:**

- X509Certificate / SignatureValue の base64 が残る（HIGH_ENTROPY 除外の実証）
- タイムスタンプ・要素名・属性名・ID 系が保持される

**不変条件:**

- マスク後の出力が valid XML のまま（再パースできる）

### E2E（Playwright）: `tests/e2e/saml-decoder.spec.ts` に追記

- サンプル入力 → トグルを「マスク XML」に切替 → NameID / 属性値がトークン化されて表示される
- 件数バッジが表示される
- `CopyButton` のコピー対象がマスク XML に切替わる
- `beforeEach` で `waitForReactHydration(page)` を必ず呼ぶ（React island 入力の hydration race 対策）

### VRT

`/tools/saml-decoder` は既存 PAGES に登録済み。`details` は初期折りたたみのため baseline への影響は
無い見込み。実装時に `npm run build` 後の描画で影響有無を確認し、影響があれば
`Update Visual Regression Baseline` workflow を対象ブランチで手動トリガーする
（web セッションは `actions: write` 権限が無く自動起動不可 → `.claude/rules/github-web-session.md`）。

## ドキュメント更新

- `docs/tools.md`（SAML デコーダの節にマスク機能の仕組み・制限を追記）
- `docs/decisions.md`（構造ベース＋secret-scrubber 併用・HIGH_ENTROPY 除外の判断理由）
- `SPEC.md`（挙動変更のため該当箇所のみ。ツール追加ではないので 9 章チェックリストは対象外）
- issue #745 のチェックボックス「共有用マスク出力」を PR マージ時に ✅ 更新

## セキュリティ上の注意

- 入力データ・マスク処理はすべてブラウザ内で完結し外部送信しない（初版方針を踏襲）
- `dangerouslySetInnerHTML` は使用せず、表示はすべて React 要素として組み立てる
- マスクは「完全な匿名化」を保証しない（構造的 PII フィールド＋既知パターンの除去であり、
  自由記述の属性値に第三者の氏名が含まれる等のケースは残りうる）。UI に目視確認を促す注記を置く
