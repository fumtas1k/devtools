# HARサニタイザ サニタイズ堅牢化 設計

- 日付: 2026-06-14
- 対象ツール: HARビューア＆サニタイザ（`src/components/tools/HarViewer.tsx` ほか）
- 起点: サニタイズ監査（サブエージェント2系統 + 実機裏取り）で発見した6件の issue
  - #685 [Critical] JSONボディの `"password":"value"` 等が一切 redact されない
  - #686 [Critical] `redactUrl` の basic-auth 正規表現が URL を破壊しパスワード断片を漏らす
  - #687 [High] 辞書外ヘッダ・URLパス・`response.redirectURL` に scrubText が未適用
  - #688 [High] `scrubText` が O(n²)（ReDoS）で大きな body により Worker がフリーズ
  - #689 [High] 機密クエリ名辞書の取りこぼし（`?next=`/`?redirect=` 等）
  - #690 [Medium/Low] 検出ルール取りこぼし・dフラグ fail-open・base64本文の扱い

## 背景・目的

HARビューア＆サニタイザの根幹は「HAR から機密情報を確実に除去して安全に共有できる形にする」こと。監査の結果、最頻出の JSON ボディ・辞書外ヘッダ・URLパス・redirectURL など広範な漏れと、URL 破壊バグ、ReDoS による実質 DoS が判明した。本設計はこれらを段階的に修正し、漏れ・破壊・性能の3観点でサニタイズを堅牢化する。

UI 層（表示・コピー・ダウンロードは全てサニタイズ済みクローン経由、原本は Worker 内に留まる）には問題が無いことを監査で確認済み。よって本設計はサニタイズ・ロジック（`src/utils/har/` と `src/utils/secret-scrubber/`）に限定する。

## スコープと PR 分割

テーマ別に3 PR へ分割する（レビュー容易性・squash 履歴の明確さのため）。

| PR   | テーマ                | 含む issue                                                   | 主な変更ファイル                                                                            |
| ---- | --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| PR-A | 検出エンジン強化      | #685, #686, #690(M-1 fail-open / L-1 ルール追加 / L-2 全角=) | `secret-scrubber/rules.ts`, `secret-scrubber/scrub.ts`, `har/sanitize.ts`(URL regex 共通化) |
| PR-B | HAR走査カバレッジ拡張 | #687, #689, #690(M-2 base64)                                 | `har/sanitize.ts`, `har/rules.ts`, `har/types.ts`                                           |
| PR-C | 性能・ReDoS対策       | #688                                                         | `secret-scrubber/scrub.ts`, `secret-scrubber/rules.ts`                                      |

スコープ外（issue に残置）:

- #690 L-3（入力中の既存 `[REDACTED:...]` リテラルとのトークン衝突）。漏えいではなく安全側で可逆性も無いため、今回は対応しない。

## 実装順序（重要）

当初の推奨順（#685→#686→#687/#689→#688→#690）から **順序を見直す**。

PR-B（カバレッジ拡張）は scrubText の適用箇所をヘッダ・URLパス・クエリへ広げる＝ #688 の ReDoS 攻撃面を拡大する。したがってカバレッジ拡張が必ず ReDoS 対策済みエンジンの上に乗るよう、次の順で実装する:

1. **PR-A**（検出エンジン強化）
2. **PR-C**（性能・ReDoS堅牢化）
3. **PR-B**（カバレッジ拡張）

各 PR は spec（本書）→ plan（writing-plans）→ 実装（sonnet サブエージェント）→ レビュー → PR 作成のサイクルで進める。

## 各 PR の技術方針

### PR-A 検出エンジン強化

- **#685（JSON password）**: `secret-scrubber/rules.ts` の `CREDENTIAL_ASSIGN` をキー名前後に引用符 `"`/`'` をオプション許容する形に拡張する。
  - 例: `/(?:["'])?\s*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|credential|パスワード|シークレット|トークン|秘密鍵|認証キー)(?:["'])?\s*[:=：]\s*['"]?([^\s'",;]{6,})/dgi`
  - JSON `"password":"hunter2"` / form `password=...` / 生テキスト `password: ...` を一括で捕捉する。
  - 誤検出が微増しうるため、退行テスト（正常な英文・非機密 key=value が過剰マスクされない）を併設する。
- **#686（URL 破壊）**: `har/sanitize.ts:83` の独自 basic-auth regex を撤去し、`secret-scrubber` 側の `CREDENTIAL_URL`（`[^@/\s]+`、`/` 除外）と共通化する。
  - 共通ヘルパー（例: `secret-scrubber` 配下に `redactUrlCredentials(url, tokenize)` 相当）を切り出し、`har/sanitize.ts` の `redactUrl` と `scrub.ts` の両方から使う。二重メンテを解消する。
  - protocol-relative URL（`//user:pass@host`）にも対応するため scheme 部を optional 化する。
  - パスワード中の `@`・`host:port/...@...`・正常 basic-auth の各退行/陽性ケースをテストする。
- **#690 M-1（fail-open）**: `scrub.ts:68-69` の `m.indices?.[maskGroup]` 取得不可時を「`continue`（素通し）」から「マッチ全体を over-mask」へ反転し、漏えい方向のフェイルを安全方向にする。
- **#690 L-1（検出ルール追加）**: AWS Secret Access Key（`aws_secret_access_key` 等の代入文脈、40字 base64）、Basic 認証 base64、JWE/多セグメント JWT（JWT を `\beyJ[\w-]+(?:\.[\w-]+){2,}\b` 化して末尾セグメント残存を防ぐ）の検出ルールを追加する。
- **#690 L-2（全角）**: `CREDENTIAL_ASSIGN` の区切りクラス `[:=：]` に全角イコール `＝` を追加する。

### PR-C 性能・ReDoS対策

- `secret-scrubber/scrub.ts` の本文スキャンに、入力長・連続トークン長の上限ガードを設ける。超過時は当該入力（または当該トークン）のスキャンをスキップし、Worker が二次オーダーで固まらないようにする。
- `rules.ts` の `{24,}` / `{32,}` 等の上限なし量化子を、実トークン長を十分カバーする上限付き（例 `{24,512}`）に変更し、バックトラックを抑制する。
- `recheck`（既存依存）で各パターンを静的検証する回帰テストを追加する。
- 大入力が一定時間内に完了する性能 assert（陽性対照）を併設する。

### PR-B カバレッジ拡張

- **#687**:
  - `har/rules.ts` のヘッダ辞書を拡充（`AUTH_HEADER_NAMES` に `x-amz-security-token` / `x-session-token` / `x-access-token` / `x-functions-key` / `www-authenticate` / `proxy-authenticate` 等、`COOKIE_HEADER_NAMES` に `cookie2` / `set-cookie2`）。
  - 辞書外ヘッダ値にも scrubText フォールバックを適用する。
  - URL のパスセグメントに scrubText を適用する（`redactUrl` の戻り値またはパス部分）。
  - `response.redirectURL`（`har/types.ts` の `HarResponse` に型追加）に `redactUrl` を適用する。
- **#689**:
  - `har/rules.ts` の `SENSITIVE_PARAM_NAMES` を拡充（`next` / `redirect` / `continue` / `return_to` / `assertion` / `saml_response` / `jwt` / `auth` / `session_state` 等）。
  - query value にも scrubText を適用し、辞書外名でも JWT/API キー形式を拾えるようにする。
- **#690 M-2（base64）**: `har/sanitize.ts` の本文スキャン条件を、`content.mimeType` がバイナリ系（`image/*` / `application/octet-stream` 等）の場合は `encoding` 欄が無くてもスキップするよう拡張し、base64 本文を HIGH_ENTROPY が破壊するのを防ぐ。

## テスト戦略

全 PR で `test-gates` skill 準拠（陽性対照必須）。陰性対照のみでは「検知能力ゼロで green」と区別不能なため、各修正に「修正前は漏れていた入力が確実に redact される」陽性対照を必ず併設する。

- **PR-A**: `secret-scrubber/__tests__/` と `har/__tests__/sanitize.test.ts`。JSON 各種 / URL 各種 / fail-open / 追加ルール / 全角=。退行: form-urlencoded・正常 basic-auth・非機密 key=value。
- **PR-C**: 性能 assert + `recheck` 静的検証。
- **PR-B**: 辞書外ヘッダ・URLパス・redirectURL・`?next=`・base64バイナリ本文スキップの陽性対照。

push 前必須（各 PR）: `npm run test` / `node_modules/.bin/astro check` / `npm run test:e2e` / `npm run lint`。UI は無変更（ロジックのみ）のため VRT baseline 再生成は不要見込み。

## リスク・留意点

- `CREDENTIAL_ASSIGN` の引用符許容・辞書拡充は誤検出（過剰マスク）を増やしうる。過剰マスクは漏えいより安全側だが、可読性のため退行テストで非機密の過剰マスクを監視する。
- PR-B のカバレッジ拡張は scrubText 呼び出し箇所を増やすため、必ず PR-C（ReDoS 対策）の後に実装する。
- base64 判定は mimeType に依存する。mimeType 欠落かつ base64 本文のケースは完全には防げないため、既知の残存リスクとして記録する。
- `CREDENTIAL_ASSIGN` の値クラス `[^\s'",;]{6,}` 由来で、#685 の JSON 経路でも次は素通しになる（本 PR 導入ではなく既存の境界。PR #691 レビュー指摘）: ①6 文字未満の値（`{"pin":"1234"}` / `{"password":"123"}`）、②空白入り値（`password: "two words"` は空白で停止し `words` が残る）。誤検出（過剰マスク）とのトレードオフがあるため一律緩和はせず、将来 PR で値クラスの文脈別調整を検討する既知残存リスクとして記録する。
