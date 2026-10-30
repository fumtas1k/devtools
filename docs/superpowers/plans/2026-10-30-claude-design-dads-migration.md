# Claude Design の DADS デザインシステムへの段階移行計画

**Goal:** Claude Design 上のデザインシステム「デジタル庁デザインシステム DADS」（以下 DS）を正本にして、サイト全体の見た目を PR 単位で段階的に DADS v2 の実値へ寄せる。

**正本:** <https://claude.ai/artifact/EtVbTVMBx7yd6FJ1SAwrAh>（`project/tokens/*.css` / `project/components/components.css` / `project/README.md`）。DS 自体は DADS 公式リポジトリ（`digital-go-jp/design-tokens` / `design-system-example-components-react`）から転記したもので、値の最終確認は公式 `figma/tokens.json` で行う。

**進め方:** 1 フェーズ = 1 PR（大きいフェーズは複数 PR）。各 PR で VRT baseline の再生成が必要になる。

---

## 1. 現状とのギャップ

現行の「DADS ベース」実装は、色の値が Tailwind のパレットで、DADS の実値ではない。

| 項目              | 現行（`src/styles/global.css`）              | DS（DADS v2）                                                                                 |
| :---------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| primary           | `#1a56db`（Tailwind 系）                     | `blue-900` `#0017c1`、hover `blue-1000`、active `blue-1200`                                   |
| Blue プリミティブ | Tailwind blue 50〜950（11 段）               | DADS blue 50〜1200（13 段）。同名 `--color-blue-*` で値が衝突する                             |
| ニュートラル      | Tailwind gray（`neutral-50`〜`900`）         | Solid Gray（`50`〜`900`、`420` / `536` を含む）。`536` が白地 AA の下限                       |
| セマンティック色  | success / error / warning / info の独自値    | `success-1/2`・`error-1/2`・`warning-yellow-1/2`・`warning-orange-1/2` の 2 段ペア            |
| リンク            | `#2563eb` / visited `#7c3aed`                | `blue-1000` / visited `magenta-900`（DS 内で 800 と 900 が混在、要確認）                      |
| フォーカスリング  | 青 2px outline                               | 黒 4px outline + offset 2px + 黄 `yellow-300` 2px ring（DADS の象徴）                         |
| 角丸              | 4 / 8 / 16                                   | 4 / 6 / 8（コントロール）/ 12（カード）/ 16 / 24 / 32 / full                                  |
| エレベーション    | Tailwind 風 5 段                             | ambient + key の 2 枚重ね 8 段                                                                |
| タイポグラフィ    | `.caption` / `.body-emphasis` 等の独自クラス | `text-{std,dns,oln,dsp,mono}-{size}{N,B}-{lh}` 体系。本文 line-height 170〜175%               |
| 等幅フォント      | JetBrains Mono（`@fontsource` で自前配信）   | Noto Sans Mono                                                                                |
| フォント配信      | `@fontsource` で自前配信                     | Google Fonts を `@import`（**採用しない**。外部送信禁止と CSP `default-src 'self'` に反する） |
| ボタン            | `ActionButton` の `.btn-action--{variant}`   | solid-fill（4px double border）/ outline / text、lg〜xs、hover で下線                         |
| 入力欄            | `--color-border-input`（gray-300）           | `solid-gray-600` 枠、hover で黒、read-only は破線、エラーは `error-1`                         |

DS 側のコンポーネント: Button / Input / Select / Checkbox / Radio / Textarea / Label / NotificationBanner / StatusBadge / ChipLabel / Table / Accordion / Breadcrumbs。

## 2. スキルの整理（Phase 0）

| スキル                       | 判断             | 理由                                                                                                                                                                                       |
| :--------------------------- | :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`（vendor）  | **削除**         | 「大胆で個性的な美学」を求める汎用スキルで、DADS の「静かで予測可能」と方向が逆。UI 作業で発動すると独自の配色・書体を持ち込む                                                             |
| `dads-design-system`（自作） | **全面書き換え** | 名前は DADS だが値は Tailwind パレット（`#1a56db` 等）で、DS と矛盾する。消すと Codex（`AGENTS.md` が参照）が DADS 規約を読めなくなるため、DS の実値と本リポジトリの実装ルールに差し替える |

書き換え後の `dads-design-system` は「DS の URL」「用途ごとの DADS トークン」「本リポジトリ固有の制約（CSP・自前フォント・`@layer components` の variant 非対応）」を持つ。Codex は DS を読めないため、プリミティブの目標値は `references/tokens.md` に転記し、Phase 1 / 4 で `global.css` に反映した後に削除する（Phase 7）。

`frontend-design` 削除で触るファイル: `.agents/skills/frontend-design/`、`.claude/skills/frontend-design`（symlink）、`.agents/skills/LICENSE-frontend-design`、`.agents/skills/README.md`、`skills-lock.json`、`CLAUDE.md`（vendor 済みスキルの記述）、`docs/setup/plugins.md`、`docs/decisions.md`（新規エントリ）。`tests/meta/session-install.test.ts:204` の `frontend-design@claude-plugins-official` は hook の陰性対照に使う任意のプラグイン ID で、vendor スキルとは無関係なので残す。

## 3. フェーズ

各フェーズは前のフェーズの完了を前提にする。

### Phase 0: スキル整理

- [x] `frontend-design` を削除（2 章のファイル一式）
- [x] `dads-design-system` を DS 準拠に書き換え（`references/components.md` / `references/tokens.md`）
- [x] `docs/decisions.md [134]` に「Claude Design の DS を正本にする」「frontend-design を外す」を記録

見た目の変更なし（VRT 不要）。

### Phase 1: カラートークン

- [x] `@theme` の Blue プリミティブを DADS 13 段に置換（`--color-blue-*: initial` で Tailwind 既定の blue を外す）。Solid Gray はプリミティブとしては置かず、semantic token の値として持つ（未使用のテーマ変数はビルドで削られるため）
- [x] semantic token と `:root` のエイリアスの値を DADS に付け替え（クラス名は維持）。セマンティック色は文字にも使うため `-2` 側を採用し、warning のみ tint 上のコントラストのため `yellow-1000` にした（`docs/decisions.md [135]`）
- [x] `--color-secondary` は未使用のため削除。`--color-tertiary` は `blue-1000`、`--color-background` は `blue-50`
- [x] HAR フェーズ色・鉄道図アンカー色を DADS の色相へ付け替え
- [x] `var(--color-neutral-*)` の直接参照を semantic token（`--color-text` / `--color-border-strong` / `--color-overlay` / `--color-footer-*`）へ移した。`var(--color-blue-*)` は D1 に従い DADS 値で上書きしたうえで、`global.css` の意味クラス（`.rr-charclass` / `.match-highlight-*`）と `index.astro` の hero 区切りに直接参照を残す
- [x] `theme-color` / `manifest.webmanifest` の `theme_color`・`background_color` を DADS に合わせた
- [x] visited は公式 Link コンポーネント（`visited:text-magenta-900`）で `magenta-900` に確定
- [x] 文字 4.5:1 / 非テキスト 3:1 を確認。red-50 上で `error-1` は 4.08:1 になるため、`ErrorMessage` の block 表示・VerifyTab の無効見出し・`.regex-ast-node-hot`・danger ボタンと `.btn-remove-card` の hover の文字を `--color-error-text` に変更。JSON ツリーの構文色は hover 行（blue-50）上で不足したため DADS の濃い段へ。直書き色で既存の不足が残る UUID / JWT は [#808](https://github.com/fumtas1k/devtools/issues/808) で扱う

### Phase 2: フォーカスリング

- [x] `:where(...):focus-visible` を黒 4px outline + 黄 2px ring に変更
- [x] outline 用 `--focus-ring`（`4px solid` 黒）と ring 用 `--focus-ring-shadow`（黄 2px の box-shadow）にトークンを分けた。旧 `--color-focus` は削除
- [x] 個別に上書きしていた箇所（`.btn-file-input` の focus-within、`.result-table-row`）を揃え、効いていなかった `.json-toggle` の指定を削除した。自前の box-shadow を持つ選択中トグルは黄リングと影を重ねる
- [x] 一括ルールに `summary` を追加。親の overflow で切れる要素（カテゴリタブ、ToolCard、CertDecoder の summary）とスクロール領域は `.focus-inset` で内側に描く
- [x] テキストリンク（`.text-link` / `.text-link-plain`）は DADS の Link と同じく focus 時に地を yellow-300 にする
- [x] 暗い背景（primary 塗りのボタン、濃色フッター）上での視認性を確認（`docs/decisions.md [136]`）

### Phase 3: タイポグラフィ

- [x] `.tool-info-*` / `.section-heading` / `.text-body` / `.hero-heading` / `.page-heading` / `.body-emphasis` の値を DADS の Std / Dns スケールへ寄せた（クラス名は維持、4 章 D4）。`.caption`（14px・行高 1.7）は DADS に 14px の Std がないため据え置き
- [x] 文字の太さを 400 / 700 にそろえた（`font-semibold` → `font-bold`、`font-medium` → `font-normal`）。再混入は `tests/meta/font-weight-dads.test.ts` で検知
- [ ] 14px 未満の文字（バッジ・図のラベル・JSON の件数等）は部品ごとの判断が要るため Phase 5 で扱う（[#814](https://github.com/fumtas1k/devtools/issues/814)）
- 等幅フォントは JetBrains Mono を維持（4 章 D2）。読み込みは 400 のみなので、等幅の Bold は使わない

### Phase 4: 角丸・エレベーション

- [ ] radius をコントロール 8 / カード 12 に、elevation を DADS の 8 段に置換

### Phase 5: コンポーネント（1 コンポーネント 1 PR 目安）

- [ ] UUID v7 生成・JWT デコーダの直書き色を DADS の色に置き換える（[#808](https://github.com/fumtas1k/devtools/issues/808)）

DS にあるものから着手し、DS にないもの（ToggleGroup / ToggleChips / CopyButton 等）は DS のボタン・チップ規約から派生させる。

- [ ] `ActionButton`（solid-fill / outline / text、サイズ、hover 下線、double border）
- [ ] `InputField` / `BareInput` / `Select` / textarea（枠色、read-only 破線、エラー）
- [ ] `NotificationBanner` / `StatusBadge` / `ChipLabel`
- [ ] `ResultTable`
- [ ] `ToggleGroup` / `ToggleChips` / `FileInputButton` / `DownloadButton` / `CopyButton`

### Phase 6: レイアウト・Astro ページ

- [ ] favicon（`public/favicon.svg`、旧 blue→violet のグラデーション）と PWA アイコン（`public/icons/*.png`）を DADS の配色に合わせる
- [ ] ヘッダー / フッター / `ToolCard` / `PageContainer`（最大幅、余白）
- [ ] Astro の `style="var(--color-*)"` 移行（[#289](https://github.com/fumtas1k/devtools/issues/289)）とまとめて進めるか判断

### Phase 7: 後片付け

- [ ] 使われなくなった旧トークン・旧クラスを削除（`--color-success-strong` は Phase 1 で `--color-success` と同値になったので統合する）
- [ ] `dads-design-system/references/tokens.md` を削除し、`SKILL.md` 0 章の「移行中」の記述と 2 章の「現行の対応先」列を更新
- [ ] `SPEC.md` / `docs/decisions.md` / `.agents/rules/ui-conventions.md` を更新

## 4. 決定事項（2026-10-30 確定、`docs/decisions.md [134]`）

| #   | 論点                     | 決定                                                                                                                                |
| :-- | :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | primitive 名の衝突       | `--color-blue-*` を DADS 値で上書きする（コンポーネントは primitive を直接使わない規約のため影響は限定的）                          |
| D2  | 等幅フォント             | JetBrains Mono を維持（コード表示が主用途で、`0/O` `1/l` の判別性を優先）。DADS に寄せるなら Noto Sans Mono を `@fontsource` で追加 |
| D3  | DS と実装の同期方向      | DS は参照専用とし、実装側の判断（CSP 制約等）は `docs/decisions.md` に残す。DS への書き戻しは必要時のみ                             |
| D4  | タイポグラフィのクラス名 | 既存クラス名は維持して値だけ DADS に寄せる（置換は全ツールに波及するため）                                                          |

## 5. 各 PR 共通の検証

- `npm run format:check` / `npm run lint` / `npm run test` / `node_modules/.bin/astro check` / `npm run test:e2e`
- PC 1280x800 とスマホ 390x844 のスクリーンショット目視
- VRT baseline: Actions → `Update Visual Regression Baseline` → Run workflow（web セッションからは起動できない）。差分の可否はユーザーの目視で判断する（common.md 6.8）
- Google Fonts 等の外部リソースを読み込まない、`style={{}}` を使わない
