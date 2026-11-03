# MCP 設定リスクインスペクタ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 貼り付け／選択した MCP 設定 JSON をブラウザ内だけで読み、起動設定と静的な確認事項を、機密値をマスクして表示する。

**Architecture:** 有界な JSON 解析、対応形式の検証、静的ルール、表示用マスキングを純関数として分離する。React は明示的な「確認する」操作で解析し、表示専用モデルだけを結果 UI に渡す。サーバ接続・コマンド実行・入力の送信／保存を行う処理は作らない。

**Tech Stack:** 既存の Astro 7 / React 19 / TypeScript / `jsonc-parser`（strict JSON 設定）/ Vitest / Playwright。DADS の共有 UI・semantic class を使用し、新しい依存は追加しない。

---

## 作業状態と範囲

- 2026-11-03 の準備段階。候補 S3-1 の仕様・テスト計画であり、実装済みではない。issue 起票は親スレッドで行う。
- 調査基点: `origin/develop` = `e1c4c95d8897b2d9ddf0cc93c349646b5e62f6c0`。実装開始時は再取得し、差分を確認する。
- 今回の準備で変更するのは候補ドキュメントと本計画のみ。実装・コミット・push・PR・issue 作成は行わない。
- 実装時も `public/_headers`、Astro CSP、セキュリティ設定、既存共有 UI の API は変更しない。`eval` / `new Function` / inline style は使わない。
- PR [#902](https://github.com/fumtas1k/devtools/pull/902) は確認時点で open、`tests/e2e/visual-regression.spec.ts` のみ変更。本機能は `visual-regression-pages.ts` に追加し、spec 本体に触らない。将来同ファイルが必要になった場合は最新差分から調整する。

## 入力契約（MVP 固有の部分形式）

MCP プロトコル共通の設定規格とは呼ばない。[Claude Code の設定例](https://code.claude.com/docs/en/mcp) を参考に、次の部分形式だけを受け入れる。

| 場所        | 許可するキーと型                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------- |
| ルート      | `mcpServers` だけを持つオブジェクト。値は1〜100件のサーバ名→設定オブジェクト                      |
| stdio 設定  | `type?: "stdio"`、必須の非空 `command: string`、`args?: string[]`、`env?: Record<string, string>` |
| remote 設定 | 必須 `type: "http"` または `"sse"`、必須の非空 `url: string`、`headers?: Record<string, string>`  |

- 未知キー、両形式の混在、type なしの url、空設定、null／配列の設定、値型の違いはエラーにする。無視したまま「検出なし」にしない。
- JSONC（コメント・末尾カンマ）、YAML、TOML、VS Code の `servers`、単独サーバオブジェクト、WebSocket、oauth／headersHelper／disabled 等の拡張は MVP 対象外として拒否する。正当なクライアント設定でも未対応になることを入力ヒントに書く。
- サーバ名は `[A-Za-z0-9_-]{1,64}`、env キーは `[A-Za-z_][A-Za-z0-9_]{0,127}`、header 名は `[A-Za-z0-9-]{1,128}` の保守的な部分集合。`__proto__` / `constructor` / `prototype` は全階層で拒否する。
- 重複 JSON キーも拒否する。`JSON.parse` だけで後勝ちにしない。Record の参照は own property、採番・集計は `Map` を使い、入力を既定値へ merge しない。
- `${VAR}` / `${VAR:-default}` は参照として表示する。default の実値は隠し、環境から値を取得・展開しない。未知のテンプレート式は「未解決の式」として値全体を隠す。変数が設定済みかは判定しない。
- URL は `http:` / `https:` の絶対 URL、または上記変数参照を含む文字列だけ。`javascript:` / `data:` / `file:`、相対 URL、不正 URL は拒否する。変数参照を含む URL は未解決とし、実接続先を推測しない。
- ファイルは単一の `.json`（`.mcp.json` を含む）を `FileInputButton` で選択し、UTF-8 として厳密に decode する。拡張子・MIME は検証の代わりにせず、内容も同じ parser に渡す。D&D・フォルダアクセス・URL import は対象外。

### 境界と失敗時の扱い

| 対象       | 上限・挙動                                                                                |
| ---------- | ----------------------------------------------------------------------------------------- |
| 入力       | UTF-8 256 KiB。ファイルは `size` を読み込み前に確認し、貼り付けも byte 数を検証           |
| JSON       | 深さ16、非 trivia token 32,768。`createScanner` で先に有界走査し、超過時は AST を作らない |
| 値・キー   | 文字列8,192 UTF-16 code units、キー128（サーバ名は64）。上限値自体は許可、上限+1を拒否    |
| 配列・辞書 | 各サーバの args 128、env 100、headers 100                                                 |
| 出力       | findings 1,000件。超過時は解析全体を未完了エラーとし、切り捨てて検出なしを表示しない      |

scanner は JSON 文字列中の括弧を深さに数えない。`parseTree` は `disallowComments: true` / `allowTrailingComma: false` とし、syntax errors と重複キーを検査してから設定モデルを作る。戻り値は必ず使用する。エラーはコード・行列・固定の修正案だけとし、例外の raw message や入力断片を画面／console に出さない。入力編集・ファイル読込失敗時は前の結果を破棄し、読込競合は最新操作だけを反映する。

## 表示とマスクの契約

- 1カラムの入力→操作→短い結果要約→サーバごとのカード。長い command / args は折り返す。args はインデックス付きの別行とし、shell 用の1行コマンドに再構成しない。
- command / args は表示前に既存 `scrubText` の全カテゴリを通す。さらに機密フラグ `--token` / `--api-key` / `--password` / `--secret` / `--authorization` の `=value` と次引数を、値形式によらず隠す。曖昧な shell 実行文字列は全体を隠して「実行文字列あり」と示す。
- env と headers はキー名・参照先変数名だけを見せ、リテラル値・default 値はすべて隠す。`${VAR}` があっても前後のリテラルは表示しない。既知の env／header リテラル機密値は他の表示フィールドへの再出現もマスクする。
- URL の既定表示は scheme・host・port だけ。userinfo・path・query 値・fragment は出さず、存在のみ示す。URL 自体が変数依存なら変数名と「未解決」だけを表示する。URL をリンク・画像・iframe・リソース参照にしない。
- command・サーバ名・env/header 名・理由・JSON Pointer も表示モデルでスクラブする。未対応キーや入力値を例外文へ埋め込まない。React のテキストとして描画し `dangerouslySetInnerHTML` は使わない。
- 判定は「要確認」「参考」。全体点数・合格・安全認定は作らない。0件時は「対応する静的ルールで確認事項は見つかりませんでした。安全性を保証するものではありません」。
- 実際のプロセス権限、env の有効値、DNS／TLS／認証結果、サーバ実装・提供ツール・実行時挙動は分からない旨を常時表示する。誤検知・見逃しがあり、opaque な任意文字列の秘密検出を保証しない。
- MVP は結果コピー・ダウンロード・設定書換え・秘密値の開示トグルを含めない。入力は React メモリ内だけに置き、clear で入力・結果・ファイル選択を消す。localStorage / sessionStorage / IndexedDB / URL / analytics / console に入力・派生結果を保存しない。

## 静的ルール（固定 ID と受入基準）

各 finding は `ruleId`・サーバ識別子・JSON Pointer・重要度・固定の理由・確認方法を持つ。入力はマスク済みの根拠欄だけに入れる。以下の字面以上の動作は推論しない。

| ruleId                   | 条件                                                                                                                                                      | 表示する理由・見直し方                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `shell-execution`        | command basename が sh / bash / zsh / cmd / powershell / pwsh（Windows の拡張子・区切りも正規化）かつ `-c` / `/c` / `-command` / `-encodedcommand` がある | shell 実行文字列が指定されている。内容と配布元を確認し、可能なら直接の実行ファイル＋配列引数にする。実行はしない           |
| `package-version-review` | 直接の npx / uvx 起動で、単純に識別できるパッケージ指定が完全バージョン固定でない、またはオプション等で指定を判別できない                                 | 取得版・配布元の確認が必要。判別不能はそう明記し、正確な固定版でも信頼済みとはしない。scoped npm の `@` とバージョンを区別 |
| `remote-http`            | 解決可能な remote URL の scheme が http                                                                                                                   | 暗号化されない接続先が記載されている。localhost の用途もあり一律拒否せず、接続経路を確認する                               |
| `url-credentials`        | 解決可能な URL に userinfo がある                                                                                                                         | 認証情報を URL に含める構成を見直す。表示は常にマスクする                                                                  |
| `inline-sensitive-value` | env／headers の名前が区切り正規化後に token / secret / password / api-key / authorization / cookie に該当し、非空リテラル値または変数の default を含む    | 設定内に認証情報が直接含まれる可能性。クライアントの変数参照・認証管理を確認。値が本物の秘密かは確定しない                 |
| `unresolved-reference`   | command / args / env / url / headers に変数参照／未知の式がある                                                                                           | 実値未解決。参照名と場所だけを列挙し、設定の有無・接続先・権限を断定しない                                                 |

`command: "node"` の普通の args にある `&&`、package 名・server 名の `admin`、ローカルパスだけで任意実行／管理者権限を断定しない。パスや `--allow-*` の意味はサーバ固有なので、権限推定ルールは追加しない。

## ファイル構成と境界

| 作成／変更                                                               | 責務                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 作成 `src/utils/mcp-config-inspector/types.ts`                           | 内部設定型、結果型、rule ID、上限値の定義                                            |
| 作成 `src/utils/mcp-config-inspector/bounds.ts` / `parse.ts`             | 有界走査と strict JSON、重複キー、対応部分形式・URL・件数の検証                      |
| 作成 `src/utils/mcp-config-inspector/checks.ts`                          | 内部モデルから固定の静的 findings を生成。通信・環境参照なし                         |
| 作成 `src/utils/mcp-config-inspector/display.ts`                         | 機密値のマスク、URL origin と参照名の表示用投影                                      |
| 作成 `src/utils/mcp-config-inspector/index.ts`                           | `inspectMcpConfig(input: string): InspectionResult` の公開入口。raw モデルを返さない |
| 作成 `src/utils/mcp-config-inspector/__tests__/{bounds,inspect}.test.ts` | 境界・陽性／陰性・非破壊・安全な出力のテスト                                         |
| 作成 `src/components/tools/McpConfigInspector.tsx`                       | 入力・ファイル読込・実行・clear と結果表示。既存共有 UI で構成                       |
| 作成 `src/components/tools/__tests__/McpConfigInspector.test.tsx`        | ファイル読込失敗・競合、古い結果消去、秘密値を結果 DOM に出さないこと                |
| 作成 `src/pages/tools/mcp-config-inspector.astro`                        | ToolLayout、`client:load`、ToolInfoSection の用途・対応形式・限界                    |
| 変更 `src/data/tools.ts` / `src/components/ui/ToolIcon.astro`            | slug・日本語名・説明・読み・アイコン。category は既存 `convert`                      |
| 作成 `tests/e2e/mcp-config-inspector.spec.ts`                            | 本番 CSP、入力・ファイル・clear、画面幅・キーボード・安全な描画・通信／保存の検証    |
| 作成 `tests/e2e/mcp-config-inspector-network.gate.spec.ts`               | 通信監視が実際に捕捉する陽性対照                                                     |
| 変更 `tests/e2e/visual-regression-pages.ts`                              | PAGES に URL を追加。spec 本体には追加しない                                         |
| 変更 `README.md` / `SPEC.md` / `docs/tools.md` / `docs/decisions.md`     | 一覧、2.3 / 2.4 / 4 / 5 / 9章、技術解説、制約・採用理由                              |

専用 CSS が必要になった場合だけ `src/styles/tools/mcp-config-inspector.css` と `src/styles/global.css` の import を追加する。既存の共有 class で足りれば作らない。

公開結果型の契約:

```ts
type InspectionResult =
  | { ok: false; error: { code: string; message: string; line?: number; column?: number } }
  | {
      ok: true;
      servers: DisplayServer[];
      findings: DisplayFinding[];
    };
```

`DisplayServer` は表示用 `id`・`name`・`transport`・`command?`・`args: string[]`・`destination?`・`envKeys: string[]`・`headerKeys: string[]`・`references: string[]` だけを持つ。`DisplayFinding` は `ruleId`・`serverId`・`pointer`・`level: "review" | "info"`・`reason`・`advice`・マスク済み `evidence` だけを持つ。raw 設定・秘密値を返すフィールドは作らない。

## 実装タスク

### Task 1: parser と入力契約

- [ ] `test-gates` を読み、`types.ts` と parser のテストを先に作る。型検証／syntax の不正入力ごとにエラーコードを assert する。
- [ ] `npm run test -- src/utils/mcp-config-inspector/__tests__/bounds.test.ts` を実行し、未実装で失敗することを確認する。
- [ ] 有界 scanner→strict AST→重複検査→形式検証を実装し、同コマンドを成功させる。`${VAR}` と絶対 URL は別経路で扱い、環境値にはアクセスしない。
- [ ] 深さ・token・bytes・args・env・headers・文字列の上限／上限+1、重複キー、proto キー、不正 UTF-8、malformed JSON、未知キー、混合形式を確認する。

### Task 2: 静的ルールとマスク済み投影

- [ ] `checks.test.ts` に各 rule ID の陽性対照と、完全固定 package・普通の node args・HTTPS・非機密 env キー等の陰性対照を別 test で作る。basename の Windows 形式と scoped package も含める。
- [ ] `display.test.ts` に env/header の架空リテラル、URL userinfo／query／fragment、機密フラグ両形式、default 付き参照、他欄への同一値再出現を用意する。実際の秘密は使わず `DUMMY_NOT_A_SECRET` 等だけを使う。
- [ ] `npm run test -- src/utils/mcp-config-inspector` の失敗を確認後、`checks.ts` / `display.ts` / `index.ts` を実装し成功させる。
- [ ] 出力 JSON に架空の秘密リテラルが存在しない、入力を変更しない、同入力で結果が安定、1,000件超過は未完了エラー、0件でも安全認定しないことを assert する。

### Task 3: 共有 UI と操作

- [ ] `InputField`（multiline / mono / autoComplete off）、`FileInputButton`、`ActionButton`、`ClearButton`、`NotificationBanner`、`StatusBadge`、`Section` を使い、結果は semantic な見出し・リスト／dl で構成する。
- [ ] 実装と同時に component test と E2E を作る。成功→不正入力、ファイル読込失敗／過大ファイル／同ファイル再選択、読込中の clear・新しい入力、clear 後の空状態を確認する。
- [ ] `npm run test -- src/components/tools/__tests__/McpConfigInspector.test.tsx` と `npm run test:e2e -- mcp-config-inspector.spec.ts` を成功させる。E2E は `withProductionCsp` または `waitForReactHydration` を使う。
- [ ] HTML／SVG／URL／shell 風の文字列がテキスト表示され、リンク・img・script・iframe・イベントハンドラを作らないことを assert する。入力 textarea と結果領域を区別して秘密値の有無を検査する。
- [ ] ボタンの読み上げ名、エラー関連付け、Tab / Enter、44px タップ領域、フォーカスリング、短い `role="status"` 要約を確認する。結果全体には live region を付けない。

### Task 4: 通信・保存しないことの証拠

- [ ] 本番 CSP の新規 browser context で、hydration 後から paste→解析→file→解析→clear の間の全 request（同一 origin も含む）を監視し0件を assert する。Service Worker はこの検証 context では block し、静的初期読込は監視期間の前に完了させる。
- [ ] CSP で阻止された試行も拾えるよう、初期 script で fetch / XHR / WebSocket / EventSource / sendBeacon の呼び出しを記録し、操作期間の呼び出し0件を assert する。URL テキストからの受動リソース取得は request 監視と DOM 検査で捕捉する。
- [ ] 独立 gate spec では監視期間中に架空の同一 origin fetch を意図的に行い、route で応答を fulfill したうえで、監視の呼び出し／request 件数が増えることを確認する。外部送信せずに陽性対照を成立させる。
- [ ] storage API の write 試行を監視し入力操作で0件、URL に入力なし、clear／reload 後に入力・結果が復元されないことを確認する。静的 app shell のキャッシュと入力保存を混同しない。
- [ ] 対象 utils / component / page の差分を読み、通信・評価・保存の API と raw console 出力がないことを確認する。CSP だけで「送信なし」を証明したと扱わない。

### Task 5: 登録・ドキュメント・受入検証

- [ ] tool 登録・アイコン・VRT PAGES を追加し、一覧／検索に表示されることを確認する。README / SPEC / tools / decisions を更新し、MCP の client 設定部分形式と静的検査の限界を記載する。
- [ ] `npm run format:check`、`npm run lint`、`npm run test`、`node_modules/.bin/astro check`（errors / warnings / hints 全て0）、`npm run test:e2e` を実行する。新規 spec だけの成功を全件成功と呼ばない。
- [ ] キャッシュ・storage を消した PC 1280x800／スマホ390x844で、空状態と代表結果のスクリーンショットを撮り、長い値の折り返し・重なり・フォーカスを目視確認する。touch-targets と hydration-dev の対象ケースも実行する。
- [ ] VRT は既存 PAGES ループを使用する。正式 baseline はリポジトリ手順どおり CI Linux workflow で作成し、権限・結果を確認する。ローカル画像を正式 baseline にしない。差分は DOM／computed style の確認を経てユーザーの目視判断に委ねる。
- [ ] 機能追加・セキュリティ関連変更のため、実装後は `common.md` 6.9 と `requesting-code-review` の適用条件に従うレビューを行う。全 findings・制限・未完了検証を明記する。
- [ ] 候補 S3-1 の ✅ と PR 番号は実装 PR のマージ時にだけ記録する。起票・着手・計画作成の段階では付けない。

## 参照と caveat

- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#local-mcp-server-compromise) を command 可視化の根拠に使う。実 OS 権限・安全性の認定機能は含めない。
- 既存 Schema 検証は `@cfworker/json-schema` の interpreter 方式で外部参照取得なし。MVP は小さい固定設定形式を型検証し、新しいコンパイラ型 validator は導入しない。
- `secret-scrubber` / `json-formatter` の mask / HAR sanitizer は別 API と採番状態を持つ。MVP の表示用投影から、ファイル横断マスキング基盤への大規模な共通化は始めない。
- ユーザーモックは非規範的な参考。準備時は取得できなかったため、内容を確認済みとは扱っていない。仕様・見た目・実装・秘密例を転載しない。
