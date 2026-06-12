# Setup: Claude Code プラグイン install ガイド

**いつ読むか**: 新環境セットアップ時 / プラグインが効かない時。

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                | 用途                                                              |
| :---------------------------------------- | :---------------------------------------------------------------- |
| `frontend-design@claude-plugins-official` | 高品質なフロントエンド UI 生成                                    |
| `context7@claude-plugins-official`        | ライブラリ公式ドキュメントの最新参照（Upstash Context7 MCP 同梱） |

> **superpowers について**: 以前は `superpowers@claude-plugins-official` プラグインで運用していたが、Web セッションでプラグイン install が効かない制約（後述 2 章）の回避のため、`npx skills add` で `.agents/skills/` にスキル本体を vendor する方式へ移行した（`skills-lock.json` で出典・hash を管理）。出典・ライセンスは `.agents/skills/README.md` を参照。

---

## 1. Claude Code CLI / Desktop

`.claude/settings.json` の `enabledPlugins` を読み取り、初回オープン時に install を自動 prompt します。`extraKnownMarketplaces` で `claude-plugins-official` も明示宣言済み。

通常はこの自動 prompt に従えば OK。

---

## 2. Claude Code Web (claude.ai/code) / IDE 拡張

公式ドキュメントは「クラウドセッションでも `enabledPlugins` 宣言のプラグインはセッション開始時に install される」と謳っていますが、**実装上は trust dialog イベントに紐づいており、Web / headless / CI ではこのイベントが発火しないため silent に install がスキップされる** Claude Code 本体側の既知制約があります。

**現在は SessionStart hook（`.claude/scripts/session-install.sh`）が web セッションで `enabledPlugins` を自動 install します**（decisions [106]）。注意点:

- スキルはセッション開始時にロードされるため、**新規コンテナの初回セッションでは反映されない**。コンテナ状態キャッシュにより同一環境の次セッション以降で有効になる。
- install 失敗時は warn のみで継続し、次セッションで自動再試行される（冪等）。

### 関連 upstream issue

- [#23737](https://github.com/anthropics/claude-code/issues/23737)
- `autoInstallEnabledPlugins` 提案（duplicate でクローズ・未実装）
- 関連 #17832 / #19275

### 自動化の経緯

PR #204 で SessionStart hook 経由の自動 install を試みた際は、`claude plugin install` が `Plugin "<name>" not found in marketplace` を返して 3 プラグインとも失敗（`marketplace update` 前置でも同症状）し、手動 install 運用に確定していた。その後 Claude Code 本体（2.1.173 で確認）が**セッション開始時に `extraKnownMarketplaces` を `~/.claude/plugins/marketplaces` へ自動 clone する**ようになり、hook 実行時点で marketplace が解決できるため install が成功するようになった（2026-06 再検証）。これを受けて hook による自動 install を再導入した。

### 手動 install コマンド（フォールバック）

hook が失敗する場合や初回セッションで即座に使いたい場合は手動で install する:

```
/plugin install frontend-design@claude-plugins-official
/plugin install context7@claude-plugins-official
```

upstream 側で `autoInstallEnabledPlugins` 等が ship されたら本ドキュメント・`CLAUDE.md` の記述を見直す。

---

## 3. context7 と Web セッションでの 403

> ⚠️ **Claude Code Web セッション（claude.ai/code）では context7 が 403 を返します**（issue #191 / decisions [059]）。
>
> 真因は Anthropic クラウドコンテナの egress プロキシで `context7.com` / `mcp.context7.com` が host allowlist に未登録のため（レスポンスヘッダ `x-deny-reason: host_not_allowed` / ボディ `Host not in allowlist`）。**リポジトリ側の設定では解消不可**で、Anthropic harness 側対応待ち。CLI / Desktop セッションは影響を受けません。

---

## 4. context7 API キー（optional）

- CLI / Desktop は無認証で疎通する
- API キーを設定すると `researchMode: true`（深い検索）が利用可能
- Web の 403 は API キーで解消しない（egress 段で遮断されるため）

設定したい場合は `~/.claude/settings.json`（user-scoped、commit されない）の `env` セクションに追加すれば、プラグイン MCP が起動時に env を参照します:

```json
{
  "env": {
    "CONTEXT7_API_KEY": "ctx7sk-xxxxxxxxxxxxxxxx"
  }
}
```
