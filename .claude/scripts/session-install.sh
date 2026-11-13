#!/bin/bash
# SessionStart 依存インストール: package-lock.json のハッシュが変わったときだけ npm ci を実行する。
#
# なぜハッシュガードか:
#   Claude Code on the web はフック完了後にコンテナ状態（node_modules 含む）をキャッシュする。
#   「node_modules の有無」でガードすると初回スナップショット以降 node_modules が常在し、
#   npm ci が二度と再実行されず、依存が変わったブランチに切り替えても古い依存のまま作業してしまう。
#   lock のハッシュを node_modules/.lockhash に記録し、差分があるときだけ再インストールする。
#
# なぜ npm install ではなく npm ci か:
#   npm ci は lock を唯一の真実源として厳密にインストールし lock を書き換えない（不整合なら fail）。
#   npm install は lock 改変・semver 範囲で別バージョン解決の余地がありサプライチェーンリスクを負う。
#
# 詳細・却下案・トレードオフ: docs/decisions.md [090]
set -u

# 相対パスで cwd（フック発火時はプロジェクトルート）を対象にする。
[ -f package-lock.json ] || exit 0

# sha256sum（GNU coreutils / CI の Linux runner にある）を優先し、
# 無い環境（macOS は既定で sha256sum を持たず shasum のみ）では shasum -a 256 に fallback。
# 2>/dev/null で command not found の stderr ノイズも抑制する。
hash=$({ sha256sum package-lock.json 2>/dev/null || shasum -a 256 package-lock.json; } | cut -d' ' -f1)

if [ ! -d node_modules ] || [ "$(cat node_modules/.lockhash 2>/dev/null)" != "$hash" ]; then
  # npm ci は node_modules を全消去してから再構築するため、スタンプは clean install 後に書き直す。
  # 途中失敗時は && で echo がスキップされ、スタンプ未更新 → 次回リトライという self-healing になる。
  npm ci && echo "$hash" >node_modules/.lockhash
fi

# 条件を満たす remote セッションでは、enabledPlugins の有効かつ妥当な名前に install を試行する。
# 失敗時は警告し、後続の処理を続行する。install の試行は登録やロードの成功を意味しない。
# 実行条件と環境ごとの扱い: docs/setup/plugins.md
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -f .claude/settings.json ] && command -v claude >/dev/null 2>&1; then
  node -e '
    let s;
    try {
      s = JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8"));
    } catch (e) {
      // install 失敗が warn を出すのと対称に、settings 破損も silent skip にせず気づけるようにする
      console.error("warn: .claude/settings.json の parse に失敗したため plugin install をスキップします: " + e.message);
      process.exit(0);
    }
    for (const [name, enabled] of Object.entries(s.enabledPlugins ?? {})) {
      if (!enabled) continue;
      // `-` 始まり等が CLI フラグとして解釈されないよう name@marketplace 形式のみ通す
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
        console.error("warn: 不正な形式のプラグイン名をスキップします: " + name);
        continue;
      }
      console.log(name);
    }
  ' | while IFS= read -r plugin; do
    claude plugin install "$plugin" </dev/null || echo "warn: plugin install failed: $plugin（後続の処理を続行します）" >&2
  done
fi

# Claude Code on the web 限定: E2E / スクリーンショット用の Playwright Chromium を確保する。
#
# なぜ環境セットアップスクリプトでなく hook 側か:
#   環境セットアップスクリプト（コンテナ作成時実行）は npm ci 前に走るため、
#   `npx -y playwright install chromium` が playwright パッケージ自体の registry 取得から
#   始まり、ネットワーク許可構成によってはブラウザ取得前に失敗する事象を確認済み。
#   hook は npm ci 後に走るため lock 固定版の playwright（node_modules 内）が使われ、
#   ダウンロードは cdn.playwright.dev のみで完結する。
#
# なぜ web 限定ガードか:
#   CLAUDE_CODE_REMOTE=true は Claude Code on the web のセッションのみで設定される。
#   ローカル（mac 等）は開発者自身の playwright cache 管理に委ね、hook では触らない。
#
# コスト: install 済みなら即 no-op。web はフック完了後のコンテナ状態キャッシュにより
# ダウンロード（約 280MB）は環境ごとに実質 1 回。
# install がネットワーク等で失敗した場合に hook が非ゼロ終了するのは意図的
# （ブラウザ欠落のまま静かに進ませず、次セッションの再試行で self-healing させる）。
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -d node_modules ]; then
  npx playwright install chromium
fi
