# Third-party Skills の出典とライセンス

このディレクトリには自作スキルに加え、外部リポジトリ由来のスキル（`npx skills add` で導入、`skills-lock.json` で管理）が含まれる。出典とライセンスは以下のとおり。

| スキル                                                                                                                                                                                                                                                                                                                                     | 出典                                                                    | ライセンス                                                                                                          |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| brainstorming / dispatching-parallel-agents / executing-plans / finishing-a-development-branch / receiving-code-review / requesting-code-review / subagent-driven-development / systematic-debugging / test-driven-development / using-git-worktrees / using-superpowers / verification-before-completion / writing-plans / writing-skills | [obra/superpowers](https://github.com/obra/superpowers)                 | MIT（[LICENSE-superpowers](./LICENSE-superpowers)）                                                                 |
| grill-me                                                                                                                                                                                                                                                                                                                                   | [mattpocock/skills](https://github.com/mattpocock/skills)               | MIT（[LICENSE-mattpocock-skills](./LICENSE-mattpocock-skills)）                                                     |
| vercel-react-best-practices                                                                                                                                                                                                                                                                                                                | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT（upstream に LICENSE ファイルは無く [README](https://github.com/vercel-labs/agent-skills#license) で MIT 宣言） |
| dads-design-system / test-gates / retro                                                                                                                                                                                                                                                                                                    | 本リポジトリ自作                                                        | 本リポジトリのライセンスに従う                                                                                      |

## brainstorming の固定と更新

`brainstorming` は [superpowers のコミット `3a907d6a0a033eee1f6a3abce27fe97dbc2133e4`](https://github.com/obra/superpowers/commit/3a907d6a0a033eee1f6a3abce27fe97dbc2133e4) に固定している。[認証の導入](https://github.com/obra/superpowers/commit/cb5bb885fd7cf00a1820f20d922df06ec02d4bed)と後続の修正を含む。[v6.0.0](https://github.com/obra/superpowers/releases/tag/v6.0.0) の直前を選んだのは、その後の外部ブランディング・画像に関する変更を含めないため。その後の [v7.0.2](https://github.com/obra/superpowers/releases/tag/v7.0.2) までに追加の認証修正は確認されていないが、ブランディング・バージョン表記、置換処理、相対パスなどの変更がある。ここではレビュー済みの古い snapshot の `brainstorming` のみを固定し、`SKILL.md` とガイドを含むディレクトリ全体を upstream と一致させる。置換処理と相対パスの後続修正は含まれない。

再現時は対象コミットをレビューし、`brainstorming` だけをコピーする。一括 `skills update` や npm 依存更新は行わない。リポジトリルートで新しい一時ディレクトリを使う。archive の一覧と既存ディレクトリを比較して削除を含む差分を確認し、ディレクトリごと置き換える。コピー後はファイル内容・実行権限の一致と Git の差分を確認する。途中で失敗した場合は処理を停止し、一時ディレクトリにバックアップを残す。

```bash
(
set -euo pipefail
mkdir -p /tmp/codex/issue785
scratch=$(mktemp -d /tmp/codex/issue785/vendor-XXXXXX)
export scratch
printf 'Temporary directory: %s\n' "$scratch"
git clone --no-checkout https://github.com/obra/superpowers.git "$scratch/upstream"
git -C "$scratch/upstream" archive 3a907d6a0a033eee1f6a3abce27fe97dbc2133e4 skills/brainstorming | tar -x -C "$scratch"
diff -ru .agents/skills/brainstorming "$scratch/skills/brainstorming" || [ "$?" -eq 1 ]
find .agents/skills/brainstorming -type f | sort
git -C "$scratch/upstream" ls-tree -r 3a907d6a0a033eee1f6a3abce27fe97dbc2133e4 skills/brainstorming
mv .agents/skills/brainstorming "$scratch/previous"
cp -a "$scratch/skills/brainstorming" .agents/skills/brainstorming
diff -ru .agents/skills/brainstorming "$scratch/skills/brainstorming"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const source = path.join(process.env.scratch, 'skills/brainstorming');
const target = '.agents/skills/brainstorming';
function check(dir = '') {
  const names = fs.readdirSync(path.join(source, dir)).sort();
  if (names.join('\n') !== fs.readdirSync(path.join(target, dir)).sort().join('\n')) throw Error('file list differs');
  for (const name of names) {
    const rel = path.join(dir, name), a = path.join(source, rel), b = path.join(target, rel);
    if (fs.statSync(a).isDirectory()) check(rel);
    else if (!fs.readFileSync(a).equals(fs.readFileSync(b)) || (fs.statSync(a).mode & 0o111) !== (fs.statSync(b).mode & 0o111)) throw Error(`file or mode differs: ${rel}`);
  }
}
check();
NODE
git diff --summary -- .agents/skills/brainstorming
bash scripts/rm-tmp.sh -r "$scratch"
)
```

`skills-lock.json` の `brainstorming.ref` を上記の完全な SHA にし、`computedHash` は公式 [skills](https://github.com/vercel-labs/skills) CLI 1.7.5 の配布 bundle で確認した `computeSkillFolderHash` と同じ次の手順で計算する（CLI は実行しない）。他のエントリは変更しない。

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = '.agents/skills/brainstorming';
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['.git', 'node_modules'].includes(entry.name) ? [] : files(file);
    return entry.isFile() ? [path.relative(root, file).split(path.sep).join('/')] : [];
  });
}
const hash = crypto.createHash('sha256');
for (const file of files(root).sort((a, b) => a.localeCompare(b))) {
  hash.update(file);
  hash.update(fs.readFileSync(path.join(root, file)));
}
console.log(hash.digest('hex'));
NODE
```

Visual Companion の完全な URL は秘密のセッションキーを含むため、必要な相手にだけ共有する。初回アクセス後は HttpOnly・SameSite=Strict cookie とタブの sessionStorage にキーが保持される。既定の bind は loopback で、リモートから使う場合は SSH の TCP 転送を利用する。`0.0.0.0` は信頼できるネットワークで明示的に選ぶ場合に限り、HTTP は平文である。Host を書き換える proxy は WebSocket の厳密な `http://` Origin 検査に失敗し、helper は `ws://` 固定のため HTTPS トンネルをサポートしない。

`--project-dir` は絶対パスを指定する（相対パスの修正は後続版）。既定のアイドル終了は 4 時間で、`--idle-timeout-minutes 30` 等で変更できる。同じ project で再起動すると通常はポートとキーを再利用する。キーのファイルとセッションログは機密として扱い、追跡しない。旧版の instance ID がないセッションは新しい stop script が停止を拒否するため、再起動前に旧 PID を自分で確認して停止する。
