# Setup: Claude Code プラグインガイド

**いつ読むか**: 新環境のセットアップ時、またはプラグインが使えない時。公式資料の確認日: 2026-11-08。

`.claude/settings.json` の `enabledPlugins` は次の 2 件を宣言している。

| プラグイン                                     | 用途                                      |
| :--------------------------------------------- | :---------------------------------------- |
| `context7@claude-plugins-official`             | 公式ドキュメント参照（Context7 MCP 同梱） |
| `claude-md-management@claude-plugins-official` | Claude のプロジェクト指示の管理           |

superpowers は `.agents/skills/` に vendor している（出典・ライセンスは `.agents/skills/README.md`）。frontend-design は DADS 準拠の方針と衝突するため外した（decisions [134]）。

## 環境ごとの扱い

- **ローカル**: ターミナル、VS Code / JetBrains 拡張、Desktop のローカルセッションは同じマシンの設定を読む。project の `enabledPlugins` は有効化の宣言であり、各マシンへのダウンロードは別途必要。セットアップは [公式手順](https://code.claude.com/docs/en/discover-plugins) を参照。
- **cloud（claude.ai/code を含む）**: 別マシンで動き、ローカルまたは repo の宣言によるプラグインをロードせず、プラグインブラウザもない。repo の `extraKnownMarketplaces` も trust dialog がないため自動追加されない（[cloud 環境](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup)、[ロード仕様](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)）。
- **cloud の repo 設定**: project の thread 外で単一 repo の場合、repo の hooks 等が適用される。複数 repo の Anthropic 管理セッションや project の cloud thread では repo の hooks / permissions / env は適用されない（[設定の適用範囲](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions)）。

## SessionStart hook の試行と確認

`.claude/scripts/session-install.sh` は `package-lock.json` が存在し、`CLAUDE_CODE_REMOTE=true`、`.claude/settings.json` が存在、かつ `claude` コマンドが利用可能な場合、`enabledPlugins` の truthy かつ名前形式が妥当な各項目に `claude plugin install` を試行する。設定 JSON の解析失敗や不正な名前は警告してスキップし、install 失敗も警告して続行する。CLI の既定 install scope は user（[CLI リファレンス](https://code.claude.com/docs/en/plugins/cli-reference#plugin-install)）。hook が適用されないセッションや条件不成立時には試行されない。

**install の試行は、登録・Skill ロード・MCP 接続や疎通の成功を意味しない。** `tests/meta/session-install.test.ts` の fake `claude` はフックの分岐を検証するもので、実機の成功を証明しない。2026-06 の Claude Code 2.1.173 での成功記録（decisions [106]）後にも反映されないケースがあった（[108]）。現在の fresh / resume セッションでの登録、reload、MCP 疎通は未検証で、#206 で追跡する。hook の install timeout は #627 で追跡する。

cloud で使えない場合は、まずセッション種別と上記の実行条件、hook の警告、marketplace 解決と install の結果を確認する。成功を仮定せず、実際の登録・ロード状態と MCP の疎通をそれぞれ確認する。過去の context7 の 403 は [059] にある 2026-05 の環境での egress 遮断の観測であり、全 cloud 環境の現在の状態とは限らない。再検証は #205 で追跡する。

関連 upstream issue のクローズはいずれも修正の証拠ではない。[#23737](https://github.com/anthropics/claude-code/issues/23737#issuecomment-3876406138) は #19275 の duplicate、[#17832](https://github.com/anthropics/claude-code/issues/17832#issuecomment-4158510041) と [#19275](https://github.com/anthropics/claude-code/issues/19275#issuecomment-3972035074) は stale による not planned で閉じられた。

## ローカルでの手動 install と reload

ローカルの対話ターミナルでは `/plugin install` で各プラグインの詳細を開き、内容と scope を確認して install できる。Desktop / VS Code のプラグイン画面も利用でき、JetBrains ではターミナルを使う（[公式手順](https://code.claude.com/docs/en/discover-plugins)）。

```text
/plugin install context7@claude-plugins-official
/plugin install claude-md-management@claude-plugins-official
```

また、ローカルのシェルでは `claude plugin install <name>@<marketplace> --scope project` を各プラグインに実行できる。marketplace が未登録なら先に追加する必要がある。登録は `claude plugin list`、Skill はセッション内の一覧で確認し、context7 は MCP の実際の呼び出しでも疎通を確認する。

公式の [`/reload-plugins`](https://code.claude.com/docs/en/plugins/cli-reference#reload-plugins) は実行中セッションの plugin の Skill、agents、hooks 等への変更を反映できる。Desktop、Agent SDK、`-p` など対話ターミナルのないセッションでは v2.1.260 以降、ユーザーが直接入力した場合に限り利用でき、Remote Control 等からの入力では使えない。これら非対話セッションでの plugin MCP 接続の追加・削除は次のセッションに反映される。MCP の変更に伴う prompt cache 無効化の警告が出た場合は、必要に応じて公式仕様を確認する。この reload 機能は cloud で repo 宣言のプラグインがロードされることを意味しない。

Context7 の API キーや `researchMode` の現在の要件は今回確認していない。必要な場合は Context7 の現行資料を参照する。
