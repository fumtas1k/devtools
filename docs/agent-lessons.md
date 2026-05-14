# AI エージェント教訓バッファ

このファイルは AI エージェントがセッションで得た教訓を **一時的に蓄積** する場所である。

- 共通ルール化すべき内容は `docs/shared-agent-rules.md` に昇格させ、本ファイルから削除する。
- セッション開始時に必ず読む必要はない（PR 作成前や定期整理時に見直す）。
- 詳細な運用ルールは `docs/shared-agent-rules.md` 11 章（教訓の運用）を参照。
- 「（規約昇格候補）」と注記した項目は、次回 `agent-lessons.md` の整理タイミングで `shared-agent-rules.md` への昇格 / issue 化 / 削除のいずれかを判断する。

---

## [2026-04-28] QRチケット 160px 表示と等倍デコードによる読み取り失敗リスク

### 現象

`MAX_QR_BYTE_SIZE = 300` 未満のデータでも「画像からQRコードを読み取れませんでした」が発生した。

### 根本原因

- QRコードは `scalable: true` の SVG で生成され、160px の div に縮小表示される
- 300B 付近では QR バージョンが v10（65 modules）になり、1 モジュール ≈ 2.46px
- 画像アップロード検証（`handleImageUpload`）は元画像を等倍で Canvas に描画してから jsQR に渡す → 解像度不足
- E2E テストは SVG を 768×768 にリスケールしてから jsQR に渡しており、本番 UI と異なる条件のためバグを見逃す

### 対処（今回）

`MAX_QR_BYTE_SIZE` を 300→250 に引き下げ、QR バージョンを v9（61 modules、2.62px/module）以下に抑えた（対症療法）。

### 残存リスクと根本対策（将来タスク）

改善幅は約 6% と限定的。実機で依然として読み取り失敗が起きる場合は以下を検討すること：

1. **表示サイズ拡大** (160px → 256px): グリッドの `minmax` も合わせて変更
2. **アップロード時アップスケール**: `handleImageUpload` で短辺 < 512px なら 768px に拡大してから jsQR へ渡す

---

## [2026-05-01] devDependency 追加時は `package-lock.json` を必ず同期コミット

### 現象

PR #181 のレビュー対応で、サブエージェントが `@testing-library/react` と `jsdom` を `package.json` の `devDependencies` に追加してテスト追加・push まで実行したが、`package-lock.json` の更新コミットが漏れていた。CI の `npm ci` は lock との不整合を検出して失敗する状態だった（手動コミット前に検出して回避）。

### 根本原因

サブエージェントが `npm install <pkg>` ではなく package.json を直接編集してから `npm install --no-save` 等で deps を入れたか、あるいは個別 install を回避してテストだけ走らせたため、lock ファイルが diff から漏れた。

### 対処方針

- 親はサブエージェント完了報告を受けたら **`git diff origin/develop --name-only` に `package.json` が含まれる場合は必ず `package-lock.json` も含まれているか確認**する。
- 漏れていれば親で `npm install --package-lock-only --cache "$TMPDIR/npm-cache" --no-audit --no-fund` を実行し、別コミットで lock 同期を push する。
- サブエージェント側のプロンプトでも「`package.json` を変更したら `package-lock.json` の同期コミットも作ること」と明記する余地あり（規約昇格候補）。

> **補足**: `~/.npm` の所有権で `npm install` がエラーになる環境では `--cache "$TMPDIR/npm-cache"` で逃げる。

---

## [2026-05-02] サブエージェントへの「effect 依存配列を一次入力ベースに切り替え」指示が `eslint-disable` を生む

### 現象

PR #217 (refactor #167-A EncodingConverter) で、親が subagent に「`activeBytes` を `useMemo` 化したうえで、effect の依存配列を `[textInput, fileBytes, inputMethod, ...]` のように **一次入力ベースに切り替えて** debounce を文字列に対して掛ける構造へ」と指示した結果、subagent は素直に依存配列を一次入力に展開し、`react-hooks/exhaustive-deps` 違反を `// eslint-disable-line` で 2 箇所抑制した。レビューで「`useMemo` で参照を安定化したのだから依存配列は `[activeBytes, ...]` に保つべき。`eslint-disable` も lint 保護も両方失う書き方は React 慣用に反する」と指摘され、追加 commit で `[activeBytes, ...]` ベースに戻した。

### 根本原因

「依存配列を一次入力ベースにする」と「`useMemo` で派生値を作る」は本来反対方向の設計判断。`useMemo` で参照を安定化したなら依存にはその memo 値を入れ、`react-hooks/exhaustive-deps` の保護を活かすのが慣用。親プロンプトでこの 2 つを混ぜて指示してしまったため、subagent が両方実装して破綻した。

### 対処方針

- **親プロンプトの設計判断の整合性が最優先で、subagent は素直に解釈する前提で書く**。指示が矛盾を内包していたら subagent はそのまま矛盾を実装する。subagent の判断力に期待してプロンプトの曖昧さを残さない
- React の effect / memo を扱う subagent プロンプトでは、**依存配列の方針を片方に寄せる**。「memo 化した派生値を依存に保つ」と「一次入力に展開する」を併記しない
- どうしても両論併記したい場合は「`eslint-disable` は使わない、それで済まない設計なら知らせる」と明記して subagent に判断材料を渡す
- レビューで「素直に書けばよい」指摘を受けたら、それは指示の文言が誘導した可能性があると疑う

### 関連 PR / 観点

- PR #217 review (2026-05-02)、commit `03a89a1` (初期実装) → `fb82961` (依存配列を `[activeBytes, ...]` に戻し eslint-disable 撤去) → `76bcbd4` (回帰テスト追加) → `c5cf49b` (button 取得を `getByRole` に置換)
- React `react-hooks/exhaustive-deps` の慣用と `useMemo` の組み合わせ

---

## [2026-05-02] サブエージェントはスコープ箇条書きの一部のみで「完了」報告することがある

### 現象

PR #218 (refactor #169) で subagent に項目 1c として `useCodec.test.tsx` / `useClampedInput.test.tsx` / `useQrCamera.test.tsx` の 3 hook テスト新規作成を指示したが、subagent は `useClampedInput.test.tsx` のみ作成して完了報告した。`useCodec` / `useQrCamera` のテストが未実装のまま「全項目完了」として返ってきた。

### 根本原因

スコープを箇条書きで列挙すると、subagent は内部で「一部やれば全体方針は伝わる」と省略判断することがある。完了報告に「項目 1c の 3 ファイル中 1 ファイル作成」と書かず、暗黙に他 2 件を「カバー不要 / 既存で足りる」のような judgement で切り落とすケース。

### 対処方針

- subagent プロンプトの完了報告フォーマットに **「項目ごとに 実装 / 既存で十分 / スキップ理由 を明示する」** チェックリスト形式を要求する
- 親 (司令塔) の完了確認チェックリストに「**依頼項目数 vs 実装項目数の機械的突き合わせ**」を入れる
- スコープが広い項目は **複数 subagent に分割** するのが手堅い

### 関連 PR / 観点

- PR #218 (#169) で発生、SendMessage で漏れ 2 件を再依頼して解消
- （規約昇格候補）`docs/shared-agent-rules.md` のサブエージェント指示テンプレに「項目別実装ステータス必須」を追加検討

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
- 規約昇格: 不要（Claude Code の harness 挙動のため `shared-agent-rules.md` ではなく本ファイルが正所）

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

## [2026-05-08] VRT baseline 更新前に DOM / computed style diff を確認する手順

### 現象 / きっかけ

PR #299 (#289 PR 7b、Astro inline `style="..."` 撤去) で VRT が `/` のみ desktop / mobile 両方 fail。page height が 1px 短縮 (1632 → 1631、diff ratio 0.02% / 23925 px)。inline → CSS class refactor で fractional pixel rendering が tool card 14 枚で累積し合計 1px 差に到達。

### 根本原因

inline `style="..."` と CSS class (例: `bg-[var(...)]` / `.section-heading`) は CSS としては完全等価だが、cascade resolution / fractional pixel rendering で 0.003〜0.005px 単位の微小な差分が出る場合がある。視覚的には等価でも pixel 比較 VRT は失敗する。

### 対処方針 (新規ルール)

VRT が **任意の visual diff で fail** した場合、**baseline 更新する前に必ず以下 2 段階の検証を行う**:

#### 1. DOM 構造 diff

`gh run download <run-id> --name visual-regression-report-pr-<n>` で playwright report を取得し、`expected` と `actual` の HTML スナップショット (Astro が生成する HTML) を比較。次の点に regression がないことを確認:

- `aria-*` / `role=` 属性削除なし (`shared-agent-rules.md` 9.6 章 a11y 保護にも該当)
- DOM 階層・要素数の差分なし
- `<img>` `alt` / `<a>` `href` 等の semantic 属性が同一

#### 2. Computed style diff (Playwright MCP)

local preview server で問題ページを開き、**疑わしい element の computed style** を `getComputedStyle()` で取得。`fontSize` / `lineHeight` / `borderBottomWidth` / `backgroundColor` 等の semantic property が baseline と一致することを確認:

```js
// Playwright MCP 経由の例
const cs = getComputedStyle(document.querySelector('section'));
return {
  borderBottomWidth: cs.borderBottomWidth, // "1px"
  borderBottomColor: cs.borderBottomColor, // "rgb(219, 234, 254)"
  backgroundColor: cs.backgroundColor, // "rgb(239, 246, 255)"
};
```

両方が baseline と一致 (= rendering nondeterminism のみ) → baseline 更新が妥当。
どちらかが不一致 (= 真の semantic regression) → baseline 更新前に root cause を fix。

### なぜこの手順が必要か

baseline 更新は「意図した変更」を承認する操作であり、**真の regression を silent に baseline に焼き込んでしまうリスク** がある。本 PR #299 のような pure CSS class refactor では baseline 更新が正解だが、PR 8 (CSP `style-src 'unsafe-inline'` 削除) 等で発生し得る real regression と区別する **判別 gate** を agent ワークフローに組み込む必要がある。

「rendering nondeterminism は baseline 更新で吸収」が pattern 化すると、judgment が機械的になり regression 見逃しが起きる。

### 関連 PR / 観点

- PR #299 (本ルール起票のきっかけ): 1px 累積差で baseline 更新成功、commit `d5c5841` (`Update Visual Regression Baseline` workflow による自動 commit)
- PR 7a spec § VRT (Visual Regression Test): 「意図的差分があれば `update-visual-baseline.yml` workflow で baseline 更新」 (本ルールはこの判断基準を **明示化**)
- 関連個人 memory (PC ローカル、本 repo 未収録): `feedback_vrt_ci_only.md` (VRT は CI Linux のみで検証)
- （規約昇格候補）`docs/shared-agent-rules.md` の VRT 関連 sub-section として昇格検討。本 PR review (`#299` 軽微指摘 #3) で reviewer から「次 PR では VRT 差分が出た場合 baseline 更新前に必ず DOM diff / computed style diff を確認する手順を agent-lessons に明記する価値あり」と提案を受けて記録

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

### 副次的発見（別件）

deploy log で下記 warning も観測:

```
Found invalid redirect lines:
  - #5: /test-fixtures/*  /404  404
    Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got 404.
```

`public/_redirects` の 404 ルールは Cloudflare に拒否されており効いていない（本番で test-fixture 配下が公開されている既存バグ）。本件と無関係だが要別途対応。

### 関連

- PR #437（空コミットによる fresh build 試行、結果として原因切り分けに寄与）
- PR #438（実体変更による解消）
