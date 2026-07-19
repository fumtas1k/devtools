# E2E hydration 待ち漏れ修正 + 漏れ防止 meta テスト 設計 (issue #750)

日付: 2026-07-19
対象 issue: [#750](https://github.com/fumtas1k/devtools/issues/750)
関連: #279（waitForReactHydration の拡張余地）

## 背景 / 問題

ローカルの `npm run test:e2e`（並列 worker）で `dsn-builder.spec.ts` を中心に flaky な失敗が発生する。原因は **hydration race**: Playwright の `fill` / `click` / `setInputFiles` が React island の hydration 完了前に実行されると、DOM の value だけ書き換わり React の onChange が発火しない。CI は `workers: 1`（直列）のため顕在化しない。

既存ヘルパー `tests/e2e/helpers.ts` の `waitForReactHydration` がこのための対策で、大半の spec は `beforeEach` またはラッパ `withProductionCsp`（内部で hydration 待ちを実施）経由で使用している。

## 棚卸し結果（全 51 spec）

`waitForReactHydration` / `withProductionCsp` を参照しない spec は 7 件:

| spec | React 操作 | 対応 |
| --- | --- | --- |
| `dsn-builder.spec.ts` | `fill` → onChange パース | **修正**（issue 対象） |
| `dummy-personal-data.spec.ts` | `click` → React handler | **修正**（issue 対象） |
| `har-viewer.spec.ts` | `setInputFiles` → onChange | **修正**（同一リスククラス） |
| `custom-404.spec.ts` | なし（`/tools/*` 外・表示検証のみ） | 不要（検知対象外） |
| `hydration-check.gate.spec.ts` | `/test-fixtures/*`・hydration 破壊を検証 | 不要（検知対象外） |
| `hydration-check-dev.gate.spec.ts` | 同上 | 不要（検知対象外） |
| `prefers-reduced-motion.spec.ts` | なし（computed style 読取のみ） | 不要（**allowlist 登録**） |

## 設計

### 1. hydration 待ちの追加（3 spec）

- `dsn-builder.spec.ts` / `dummy-personal-data.spec.ts`: 既存 `beforeEach` の `page.goto(...)` 直後に `await waitForReactHydration(page);` を追加（`saml-decoder.spec.ts` 等の既存パターン踏襲）。
- `har-viewer.spec.ts`: `beforeEach` が無く各 test 冒頭で同一 URL へ `page.goto('/tools/har-viewer')`（8 箇所）している。`test.describe` 内に `beforeEach`（goto + hydration 待ち）を新設し、各 test の重複 goto を削除して集約する。

### 2. 漏れ防止 meta テスト（`tests/meta/e2e-hydration-wait-coverage.test.ts`）

Vitest の meta テスト（`vrt-pages-coverage.test.ts` の allowlist + 純粋関数パターン踏襲）。

**検知ルール**: `tests/e2e/*.spec.ts` のうち、ソースに `goto('/tools/...')` を含むファイルは、`waitForReactHydration` または `withProductionCsp` への参照を必須とする。違反ファイルを列挙して fail。

- 判定は純粋関数 `findSpecsMissingHydrationWait(specs: { name, content }[], allowlist)` に切り出し、実ファイル走査（`fs.readdirSync` + `readFileSync`）と分離する（陽性対照で fixture 注入可能にするため）。
- **allowlist**: `prefers-reduced-motion.spec.ts`（computed style 読取のみで React イベント発火に依存しない）。除外理由コメントを併記。
- **allowlist の腐敗防止**: allowlist 記載ファイルが (a) 実在しない、または (b) 既にヘルパーを使用している場合も fail（orphan 検出。`findOrphanPages` パターン踏襲）。
- `/test-fixtures/*` や `/`, `/about` 等 `/tools/` 以外への goto のみの spec は検知対象外（gate spec を自然に除外）。

**陽性対照**（test-gates skill 準拠・別 describe に分離）:

- hydration 待ちなしで `goto('/tools/xxx')` する fixture 文字列を注入 → 検出されることを assert
- ヘルパー使用済み fixture / `/tools/` 外 goto の fixture → 過検知しないことを assert
- allowlist orphan（実在しない名前 / ヘルパー使用済みなのに allowlist 記載）→ 検出されることを assert
- 実装前の旧状態（今回の 3 spec 修正を戻した状態）で本体テストが fail することを実機確認する

### 3. スコープ外

- `waitForReactHydration` 自体の拡張（#279 で別管理）
- 既存 spec の `withProductionCsp` への移行・リファクタ
- CI の worker 数変更

## テスト計画

- `npm run test`（meta テスト含む unit）
- `node_modules/.bin/astro check`
- `npm run test:e2e`（修正 3 spec を含む全件、リモート環境の並列 worker で実行）
- 陽性対照の実機確認: 3 spec の修正を一時的に戻し、meta テストが fail することを確認してから復元

## ドキュメント影響

ツール追加・ライブラリ変更・構成変更に該当しないため `README.md` / `SPEC.md` / `docs/decisions.md` の更新は不要。meta テスト自体がルールのドキュメントを兼ねる（ファイル冒頭コメントに背景 issue と除外基準を記載）。
