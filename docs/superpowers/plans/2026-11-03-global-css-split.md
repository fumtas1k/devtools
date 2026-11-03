# global.css の分割リファクタ（DADS の層ごとにファイルを分ける）

## 目的

1,926 行ある `src/styles/global.css` を、DADS の層（トークン → レイヤー外の一括ルール → コンポーネント → ツール固有）ごとのファイルに分け、どこに何を書けばよいかをファイル名で判断できるようにする。**見た目は一切変えない**（computed style が一致することを機械的に確認する）。

## スコープ外

- 見た目・値の変更（トークン置換は computed style が同一になるものに限る）
- Astro の scoped `<style>`（`Sidebar.astro` 等。コンポーネントの隣に置いてあり管理上の問題はない）
- `@layer` の付け替え（レイヤー外 ↔ `@layer components` の移動は cascade が変わるため行わない）
- `docs/superpowers/plans|specs/` の過去の記録（当時の記録なので書き換えない）
- `.githooks/pre-commit` の `global.css` 監視パターンの拡張（`.githooks` はユーザー承認が必要。common.md 9.1。#886 で扱う）

## 構成

```
src/styles/
  global.css              エントリ。@import の順番、@source not、@variant だけを置く
  tokens.css              @theme と :root（DADS のトークン。値の正本）
  base.css                レイヤー外の一括ルール（cursor / フォーカスリング / [hidden] / skip-link / テキストリンク / .tool-info-*）
  components/             @layer components: DADS コンポーネントと共通 UI の意味クラス
    color.css             text-* / bg-* / border-* / divide-subtle / alert-* / accent-link / footer-bar / drawer-backdrop 等の色の意味クラス
    typography.css        body-emphasis / caption / caption-wide / hint-xs / section-heading / text-body / hero-heading / page-heading / error-code / link-text
    form.css              field-control / input-flash
    button.css            btn-clear / btn-copy / btn-action / toggle-grid / btn-toggle / btn-link-plain / btn-remove / btn-file-input
    toggle-chip.css       toggle-chip
    table.css             result-table
    feedback.css          notification-banner / status-badge / chip-label / badge-category / progress-*
    disclosure.css        summary-no-marker / hover-bg-subtle / cert-chevron（details / summary の開閉）
    layout.css            scroll-snap-x
    hit-area.css          タップ領域 44px（他のコンポーネントの後に置く）
  tools/                  @layer components: 1 つのツールでしか使わないクラス
    jwt-decoder.css / uuid-v7.css / gs1-databar.css / qr.css / regex-visualizer.css /
    json-formatter.css / har-viewer.css / contrast-matrix.css / markdown-editor.css
  print.css               レイヤー外: GS1 DataBar の A4 印刷
  motion.css              レイヤー外: prefers-reduced-motion の一括 reset
```

- `global.css` の import 順: `tailwindcss` → フォント → `tokens` → `base` → `components/*`（上の順） → `tools/*` → `print` → `motion`。`@source not` と `@variant dark` は import の後
- 各ファイルの先頭に 1〜3 行で「何を置くファイルか」を書く。`@layer components` のファイルは中身を `@layer components { }` で包む
- `global.css` 冒頭のコメントに「新しいクラスをどこに置くか」の判断基準を書く。**`src/styles/README.md` は作らない**（`src/` は Tailwind の scan 対象で、md に書いた class 名が本番 CSS に混入する）
- 「PR 2: qr-ticket migration helpers」のような経緯ベースの見出しは、用途ベースの見出しに書き換える。値の理由・制約を説明するコメントは残す

## cascade を壊さないための制約

- ファイルをまたいで順序が入れ替わるルール同士が同じ要素に当たり、同じプロパティを持つと見た目が変わる。既知の依存:
  - `.uuid-field-key` は `.caption` より後（tools は components より後なので満たす）
  - `.json-toggle::after` / `.json-row-actions .btn-copy::after` は `hit-area.css` より後（json-formatter.css は tools なので満たす）
  - `.rr-box-hot` は `.rr-box` より後、`.btn-copy` 系・`.btn-action` 系・`.toggle-chip` 系はファイル内の順序をそのまま保つ
- レイヤー外のルールは `base.css` → `print.css` → `motion.css` の順で元の相対順を保つ
- `@theme` に同名トークンがある `text-error` / `text-success` / `text-warning` 等は utilities 層の自動 utility が勝つので、components 内の順序変更の影響を受けない

## 手順

### コミット 1: 純粋な分割（宣言は 1 文字も変えない）

1. 上の構成でファイルを分け、`global.css` をエントリにする
2. 検証（下の「検証」1〜3）

### コミット 2: トークンへの置き換え（computed style が変わらないものだけ）

- `border-radius: 9999px` → `var(--radius-full)`（progress-track / badge-category / har-track / har-mini-track）
- `border-radius: 0.25rem` → `var(--radius-sm)`（json-line / json-toggle:focus-visible）
- `.skip-link` の `color: #ffffff` → `var(--color-text-on-primary)`
- `.json-string` / `.json-number` / `.json-boolean` の hex 直書き → `tokens.css` の `:root` に `--color-syntax-string`（`#197a4b` green-800）/ `--color-syntax-number`（`#ac3e00` orange-900）/ `--color-syntax-boolean`（`#6f23d0` purple-700）を追加して参照（コメントのコントラスト比は移す）
- 置き換えないもの: `.qr-video-preview` / 印刷の `#000`（意図的な固定色）、`--shadow-md` / `--shadow-xl`（Tailwind が shadow 値を解析して色を差し替えるため var 参照にしない）、`.toggle-chip__token` / `__count` の rgba（揃えると見た目が変わる）、`0.375rem` の角丸（ボタンではないので `--radius-button-sm` の意味に合わない）

### コミット 3: テスト・ドキュメント

- `tests/meta/tailwind-source-exclusions.test.ts`: fixture が `global.css` だけを書き出しており、import 先が無くて build が落ちる。`src/styles/` 全体を fixture にコピーしてから `global.css` を差し替える
- `tests/meta/min-font-size-dads.test.ts`: 許可リストのセレクタ実在チェックを `src/styles/**/*.css` 全体に対して行う
- **新規 meta テスト** `tests/meta/styles-imports.test.ts`: `src/styles/**/*.css`（`global.css` 以外）がすべて `global.css` から import されていること、import 先がすべて実在することを検証する（作ったのに import し忘れたファイルは黙って効かないため）。`test-gates` skill に従い陽性対照（import 漏れ・存在しない import を含む fixture で fail すること）を併設する
- コメントの参照先更新: `src/components/ui/*.tsx` の JSDoc の「global.css `@layer components` の `.btn-action`」等は具体的なファイル（`src/styles/components/button.css`）に、`src/utils/gs1-databar.ts` / `src/pages/index.astro` / tests の e2e コメントも同様
- ドキュメント: `.agents/rules/common.md` 7 章・7.1・7.2、`.agents/rules/ui-conventions.md` 2.1・2.6、`.agents/skills/dads-design-system/SKILL.md`（値の正本 → `tokens.css`、フォーカスリング → `base.css`）と `references/components.md`、`SPEC.md` 2.4 のディレクトリツリーと 1513 行付近、`AGENTS.md`、`docs/tools.md` 777 行付近、`docs/decisions.md` に `[163]` を追加（分割の理由・構成・cascade 順の制約・README を置かない理由）

## 検証

ツール一式: `/tmp/claude-0/-home-user-devtools/e433fee6-76b5-580a-9e5a-38760a231c39/scratchpad/tools/`（`serve.mjs` / `snapshot.mjs` / `diff.mjs` / `pages.mjs`）。ベースライン: 同じ scratchpad の `before.json`（computed style）と `before/*.css`（ビルド CSS）。

1. **ビルド CSS のルール集合**: `npm run build` 後の `dist/_astro/BaseLayout.*.css` を postcss で parse し、各ルールを「祖先 at-rule の連鎖 | セレクタ | 宣言」に平坦化して、ベースラインと多重集合として比較する。コミット 1 では完全一致、コミット 2 では置き換えた宣言だけが差分になること
2. **順序が入れ替わったルール対の確認**: 1 の平坦化リストで、ベースラインと相対順序が入れ替わった `@layer components` 内のルール対のうち、同じプロパティを持ち、同じ要素に同時に付く可能性があるもの（両方のクラスを持つ要素が `src/` にあるか grep する）を列挙し、0 件か、あっても値が同じことを確かめる
3. **computed style**: `node serve.mjs dist 4400` で配信（`astro preview` は手動起動しない。`.claude/rules/git-and-fs.md`）し、`node snapshot.mjs http://127.0.0.1:4400 after.json pages.mjs` → `node diff.mjs before.json after.json`。既知のノイズ（`jan-code#sample` の `rect`、`totp-hotp#initial` の `.progress-fill`。同じビルドの 2 回の取得でも差が出る）以外の差分が 0 件であること
4. `npm run format:check` / `npm run lint` / `npm run test` / `node_modules/.bin/astro check`（errors / warnings / hints 0 件） / `npm run test:e2e`
