# AI エージェント教訓バッファ

このファイルは AI エージェントがセッションで得た教訓を **一時的に蓄積** する場所である。

- 共通ルール化すべき内容は `.agents/rules/common.md` に昇格させ、本ファイルから削除する。
- セッション開始時に必ず読む必要はない（PR 作成前や定期整理時に見直す）。
- 詳細な運用ルールは `.agents/rules/common.md` 11 章（教訓の運用）を参照。
- 「（規約昇格候補）」と注記した項目は、次回 `agent-lessons.md` の整理タイミングで `.agents/rules/common.md` への昇格 / issue 化 / 削除のいずれかを判断する。

---

## [2026-05-04] Claude memory dir は Bash `rm` で削除できない（Claude Code 既知 bug、回避不能）

### 現象

`Write` ツールで `~/.claude/projects/<sanitized-cwd>/memory/<name>.md` に memory ファイルを書けるが、Bash ツール経由の `rm` で削除しようとすると `Operation not permitted`。auto-memory システムが「作る・上書きする」しかできず「消す」が物理的に不能。

### 根本原因

Claude Code の sandbox bug。issue tracker で確認済み:

- [#46871](https://github.com/anthropics/claude-code/issues/46871) (closed as duplicate, 2026-04): まさに「memory delete できない」の専用報告
- [#31121](https://github.com/anthropics/claude-code/issues/31121) (closed as duplicate, 2026-03): `sandbox.filesystem.allowWrite` は Write / Edit ツールには効くが **Bash ツールには適用されない**
- [#17727](https://github.com/anthropics/claude-code/issues/17727) (**OPEN**, 最新 comment 2026-04-25 / v2.1.120): Linux/bwrap 中心の上位バグだが root cause 共通

macOS sandbox-exec でも同症状を再現確認 (2026-05-04)。

### 試して効かなかったこと（次回繰り返さない）

- `sandbox.write.allowOnly` 追加（system prompt 内部表現の field 名、user 上書き silent ignore）
- `sandbox.filesystem.allowWrite` 追加（user-facing 正式 field 名でも Bash ツールには不適用）
- `~/.claude/projects/*/memory/**` glob と `/Users/<user>/.claude/projects/<sanitized-cwd>/memory` 絶対パス両方
- session restart 後の再試行（profile 再構築されても挙動同じ）

### 対処方針

- memory 削除が必要になったら **ユーザに 別ターミナル or `Ctrl+Z` で Claude Code を suspend** して親シェルから `rm` を実行してもらう
- `!` プレフィックス（in-Claude bash mode）は同じ sandbox 層を通るので **workaround にならない**（過去に何度か誤提案）
- そもそも頻繁な memory 削除を前提にしない設計が筋。記録する前に「本当に共通ルール化に値するか」「既存 memory の更新で済まないか」を吟味する
- 本件 bug fix を待つ場合は #17727 watch（ただし 2026-04 時点で複数バージョン跨いで未修正、近期解消は期待しない）

### 関連

- 関連個人メモ: `~/.claude/projects/*/memory/feedback_bang_prefix_not_sandbox_bypass.md`（本リポジトリには未収録、開発者個人の Claude Code memory）
- 規約昇格: 不要（Claude Code の harness 挙動のため `.agents/rules/common.md` ではなく本ファイルが正所）

---

## [2026-05-04] macOS sandbox profile が user `permissions.allow` を mirror している可能性（未確認仮説）

### 観察

PR #267 の S1 修正（`/tmp/claude-*/**` → `/tmp/claude-[0-9a-f]*/**`）後、`/tmp/claude-501/probe.txt` Read を probe した際、**副次的に `mkdir /tmp/claude-zzz` が OS sandbox 層で `Operation not permitted` で block される**ことを観測。`zzz` は hex 範囲外で、user 設定の `[0-9a-f]*` パターンと一致する挙動。

### 仮説

Claude Code が起動時に user の `permissions.allow` のパス系パターン（`Read` / `Write` / `Edit`）を macOS の sandbox profile (sandbox-exec) に mirror して、shell レベルでも同等の write 制限を強制している可能性。

これが正しければ:

- user 設定 (permissions.allow) ＝ tool layer の gate
- sandbox profile = OS layer の gate
- 両者が同一パターンから派生し、defense-in-depth として機能している

### 検証状態

**未確認**。本仮説の確定には以下の比較実験が必要:

1. `permissions.allow` を `/tmp/claude-*/**` (broad) に戻して session restart
2. `mkdir /tmp/claude-zzz` を再試行
3. block されれば仮説は **棄却**（sandbox は user 設定と独立）/ 通れば仮説 **支持**

PR #267 内では実施しない（settings 巻き戻しが必要 + 検証のための tmp dir 作成は実害低いが副作用あり）。

### 対処方針

- 当面は仮説のまま記録。次回 sandbox 挙動の不可解な現象に遭遇したらこの仮説を最初に当てる
- 仮説支持の場合、**user 設定の path pattern が tool gate と OS gate の両方に効く**前提で運用すれば、settings.json 設計時の安全性が透過的になる（特に `claude-*` のような session id glob）
- 仮説棄却の場合、Claude Code 内部で別途 hex-like enforcement が baked in されているはずで、その出所を探す価値あり

### 関連

- PR #267 (#267 review コメントで reviewer から提示された観察)
- 上記前エントリ「Claude memory dir は Bash `rm` で削除できない（Claude Code 既知 bug）」と関連 — sandbox.filesystem.allowWrite が Bash に効かない bug と「sandbox profile mirror」仮説は **両立する**（mirror があっても Bash には適用されない実装、というシナリオ）
- 規約昇格: 不要（仮説段階、harness 挙動のため本ファイルが正所）

---

## 2026-05-10 — Playwright attachment は windowsFilesystemFriendlyLength=60 で truncate される

`scripts/generate-vrt-slider.mjs` (issue #362) で attachment 名と baseline 名の不一致による slider 生成失敗を修正。

- Playwright 1.59 の attachment ファイル名は `node_modules/playwright/lib/util.js:208-217` の `trimLongString` で 60 文字 + 中央 SHA1 5 桁 (`-XXXXX-`) に truncate される (定数名 `windowsFilesystemFriendlyLength`、`kMaxAttachmentNameLength` という名前は存在しない)
- baseline 名を文字列復元する前に、Playwright が同 test-results dir に置いている関連ファイル (`-expected.png` / `-diff.png` / `error-context.md`) を確認する。物理コピー経路の方が format 依存が少なく堅牢
- issue 起票時の調査が「未確認」で見送った経路でも、node_modules source / 実 CI log で実証可能なら採用候補に戻す
- **Playwright メジャー upgrade 時の回帰確認**: `-expected.png` を生成する Playwright 内識別子は `legacyExpectedPath` (`node_modules/playwright/lib/matchers/toMatchSnapshot.js:67`) で `legacy` prefix 付き = 将来 deprecation の兆候。upgrade 時は `-expected` suffix 生成経路が残っているか必ず grep 確認する。生成器自体が消えたら `scripts/generate-vrt-slider.mjs` の `-expected.png` 直参照経路も影響を受ける

---

## 2026-05-11 — gh CLI の TLS verification が macOS で intermittent / method 依存で失敗する。curl にフォールバックする

### 現象

19 件の issue 一括ラベル付与・タイトル変更で `gh issue edit` および `gh api repos/.../issues/N --method PATCH` が **全件** 次のエラーで失敗:

```
tls: failed to verify certificate: x509: OSStatus -26276
```

OSStatus -26276 (`errSecHostNameMismatch` 付近の cert validation エラー) は macOS Security framework の証明書検証拒否。

### 計測した再現条件

| 操作                                       | 件数       | 結果                     |
| ------------------------------------------ | ---------- | ------------------------ |
| `gh issue create` (POST)                   | 19 件連続  | **全件 OK**              |
| `gh api repos/.../labels --method POST`    | 8 件連続   | **全件 OK**              |
| `gh api user` (GET)                        | 1 件       | OK                       |
| `gh label list` (GraphQL GET)              | 1 件       | FAIL (TLS) — 再実行で OK |
| `gh issue edit` (GraphQL PATCH)            | 19 件 bulk | **全件 FAIL**            |
| `gh api repos/.../issues/N --method PATCH` | 19 件 bulk | **全件 FAIL**            |
| 同上 standalone 1 回呼び                   | 1 件       | OK                       |
| `curl -X PATCH` + `gh auth token`          | 19 件 bulk | **全件 OK**              |

POST / GET は安定、PATCH (REST PATCH も GraphQL も) が著しく不安定。standalone では通る場合があるため flake 性もある。

### 推測される原因

- gh CLI が使う Go `net/http` クライアントが macOS の SecTrustEvaluate を経由する際、PATCH のような pre-flight CONNECT 後の追加 round-trip で certificate chain の検証に失敗するケースがある
- POST/GET が連続成功する一方 PATCH だけ落ちる理由は未特定だが、`net/http` の `Transport` 内部 state（keep-alive / TLS session resumption）と SecTrust のキャッシュ整合性のずれが疑わしい

### 回復手順 (今後 PATCH が固まったら即適用)

```bash
TOKEN=$(gh auth token)
# title + labels の例 (jq で JSON body を組む)
body=$(jq -n -c --arg t "[P1] foo" --argjson l '["P1","refactor"]' '{title:$t,labels:$l}')
curl -s -X PATCH "https://api.github.com/repos/<owner>/<repo>/issues/<n>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "$body" -o /dev/null -w "%{http_code}\n"
```

### 注意点

- `gh auth token` の取り出しは `.claude/settings.json` で許可済み経路。token 自体を memory / log に書かない
- curl 直接叩き経路は `permissions.ask` 相当になる可能性がある。`gh` で失敗を 1 度は確認してから curl にフォールバックする運用が無難
- 単発呼び出しでは通ることが多いので、最初に PATCH 1 件で疎通確認 → 全件 bulk に進む手順がコスト的に最良

### 関連

- 本セッション (2026-05-11) のリファクタ監査 issue 化（#382–#400）でタイトル + ラベル一括変更時に発生
- 個人 memory: `feedback_settings_allow_first.md` (gh コマンドは permissions.allow に乗せる) — 今回は curl fallback も同じ精神で `gh` 経路を優先しつつ failover を持つ運用が妥当

---

## [2026-05-14] Cloudflare Pages の content-hash upload dedup trap

### 現象

`develop.devtools-d9w.pages.dev` で特定 URL だけが下記レスポンスで返り、他は正常という不均一な障害が発生した。

- `/tools/gs1-databar/`
- `/tools/config-converter/`
- `/tools/json-csv/`
- `/_astro/download.<hash>.js`（動的 import される共有 chunk）

```
HTTP/2 500
content-length: 0
server: cloudflare
(etag / cf-cache-status / content-type 欠落)
```

`/tools/qr-code/` 自体は 200 だったが、上記 `download` chunk の取得失敗で hydration が破綻し、ToggleGroup が制御されずに 2x2 グリッドで描画 + サンプル入力ボタン無反応（実機 console で `[astro-island] Error hydrating ... Failed to fetch dynamically imported module` 確認）。ローカル `npm run build` の `dist/` には当該 HTML / chunk すべて正常生成されていた。

### 根本原因

Cloudflare Pages の upload pipeline は **コンテンツハッシュベースで dedup** している。過去 deploy で何らかの原因（CF 側 transient bug）で edge 上の特定 asset hash が壊れた状態のまま「アップロード済み」として記録されると、次回以降の deploy で同じバイト列の artifact が来ても "already uploaded" としてスキップされ、edge の壊れた状態がそのまま温存される。

deploy log 上の確定ログ:

```
Uploading... (599/599)
✨ Success! Uploaded 1 files (598 already uploaded) (1.06 sec)
```

598/599 がスキップされた状態で 500 が直らない時点で dedup trap 確定。

### 効かない対策（試して確認済み）

| 対策                                              | 結果     | 理由                                                                |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Cloudflare ダッシュボード「再デプロイ」           | 改善なし | 同じバイト列で同じ dedup 判定                                       |
| 「ビルドキャッシュをクリア」                      | 改善なし | build 工程キャッシュのみ。upload pipeline は touch しない           |
| 「ビルドキャッシュを無効にする」                  | 改善なし | 同上                                                                |
| feature branch から空コミットを PR → merge (#437) | 改善なし | Astro/Vite は決定論的 build。chunk hash と HTML 全て byte-identical |

### 効く対策

**落ちている artifact のソースを実体変更して bundle のバイト列を変える。**

PR [#438](https://github.com/fumtas1k/devtools/pull/438) で `src/utils/download.ts` の `const scale = 2` を `RETINA_SCALE` 定数に集約する軽微 refactor を入れた結果:

- `download.<hash>.js` の hash が `COE_M25P` → `DJxhgQSF` に変化
- それを import する 6 ページの bundle chunk と HTML 内 `<script src=...>` も連動して変化
- Cloudflare 上で「新規 upload」扱いとなり edge の壊れた dedup キャッシュをバイパス → 全 200 復帰

### 切り分け手順（次回類似障害向け）

1. 失敗 URL のレスポンスヘッダで `content-length: 0` + `etag` 欠落 + `cf-cache-status` 欠落を確認 → Cloudflare 側 edge ファイル不整合の徴候
2. ローカル `npm run build` で `dist/` 配下に当該 artifact が正常生成されるか確認 → ビルド側の問題切り分け
3. Cloudflare Pages deploy log の `Uploaded N files (M already uploaded)` を確認 → `M` が大きく `N` が極小で 500 が残るなら dedup trap 確定
4. 該当 artifact のソースに微小な real change を入れて PR → byte 変化で edge をバイパス

### 副次的発見（別件、対応済み）

deploy log で `public/_redirects` の `/test-fixtures/* /404 404` ルールに対する invalid redirect warning を観測したが、その後 issue #409（test-fixtures の本番 404 化）/ issue #411（カスタム 404 ページ `src/pages/404.astro` 追加、PR #534）で対応済み。`tests/meta/redirects-404-fallback.test.ts` が `_redirects` の 404 fallback 整合性をガードしている。

### 関連

- PR #437（空コミットによる fresh build 試行、結果として原因切り分けに寄与）
- PR #438（実体変更による解消）

---

## [2026-05-19] bwip-js upgrade 時は実機 scanner decode 検証 mandatory

### 現象

PR #450 で `databarlimitedcomposite` (GS1 DataBar Limited Composite) が以下 2 原因で scanner decode 不能だったことが判明。両方とも DOM / CSP / 描画レベルの E2E では検出不能で、実機の Dynamsoft Barcode Reader 等で初めて発覚した。

1. `bwip-js v4.9.0` の `databarlimitedcomposite` は `height` パラメータを linear 部だけでなく composite component (CC-A/CC-B) のモジュール縦サイズにも適用する。`scale: 3 + height: 6` で CC module が `3×12` (1X × 4X) に縦長化し、GS1 spec 要求の ~1X × 1X 正方形から大きく外れる
2. composite 上端への AI テキスト SVG injection (`injectCompositeText`) が、テキストのディセンダー (paren `( )` の下端カーブ ~4px) を composite quiet zone (GS1 spec 1X 最小) に侵入させる

### 教訓

`bwip-js` (および barcode 生成 library 一般) の upgrade を行う場合は **CI の DOM / VRT pass だけでは回帰検出不十分**。以下のいずれかが mandatory:

- Dynamsoft Barcode Reader online demo (https://demo.dynamsoft.com/barcode-reader-js/) に各バーコード種別の PNG を upload し `formatString` / `confidence` が一致することを確認
- ZXing / QuaggaJS / @zxing/library 等のブラウザ side decoder を E2E に組み込み、CI で実 decode 検証

現状 CI で実 scanner decode を保証する仕組みは無いため、`bwip-js` を `package.json` で更新する PR では **手動 decode 検証ログ (Dynamsoft `format` + `confidence` 値、対象バーコード種別) を PR 本文に必須記載** とする (mandatory)。

### スコープ

- 対象 library: `bwip-js` (現行 `v4.9.0`)
- 対象ツール: `src/components/tools/Gs1Databar.tsx` (今後追加されうる他の barcode tool も同様)
- トリガー: `package.json` で `bwip-js` の version 文字列が変わる PR

### 関連

- PR #450（本件、`height` + `injectCompositeText` の 2 段修正）
- `src/components/tools/Gs1Databar.tsx:113-117` （`bwip-js v4.9.0` の挙動依存をコメントで明示）

---

## [2026-07-19] 重量フィクスチャの陽性対照テストは CI ランナーで vitest デフォルト 5s を超過する

### 現象

PR #749 の deflate 展開上限（zip bomb 対策）の陽性対照テスト（ゼロ埋め 40MB を `zlibSync` 圧縮 → 展開で上限超過を検証）が、ローカルでは pass するのに CI runner で vitest デフォルトタイムアウト 5000ms を超過して fail した。

### 対処（PR #749 の 4186b81 で実施した組み合わせ）

1. **フィクスチャを上限超過の最小限に縮小**: 40MB → 34MB（上限 32MB を確実に超える最小級）
2. **圧縮レベルを最小化**: `zlibSync(huge, { level: 1 })`（生成時間を短縮、圧縮率は検証に無関係）
3. **明示タイムアウトを設定**: `it('...', { timeout: 30_000 }, () => ...)`（CI 実測に基づく余裕値）

### 教訓

- test-gates 系の陽性対照で MB 級データの生成・変換を伴う場合、ローカル pass だけで CI の時間予算を判断しない。**明示 timeout + フィクスチャ最小化**を最初から入れる
- 検証したい境界（上限 32MB）に対しフィクスチャは「確実に超える最小」を選ぶ。余裕を盛るほど CI 時間を浪費する

### 関連

- PR #749（`src/utils/__tests__/saml-decode.test.ts` の deflate 上限テスト）
