# `#176` B 案 PR 8 — `style-src 'unsafe-inline'` 最終 flip + cleanup design

**作成日**: 2026-05-08
**スコープ**: `#176` B 案 (style-src 削減) の最終 PR。PR 1〜7b で全 inline style (React `style={{` / Astro `style="..."` / SVG inline `style` 属性) を撲滅した上で、CSP `style-src 'unsafe-inline'` を header / meta 両 side で削除し、暫定 strip integration と test 群を strict 化、`docs/decisions.md [067]` で完了を記録する。
**前提**: PR 7a (#294) + PR 7b (#299) merged で React `style={{` / Astro `style="..."` 全 0 件確認済 (2026-05-08)。SoT は `docs/projects/issue-176-b-plan-progress.md`。

---

## 1. Why

`#176` B 案 = `style-src 'unsafe-inline'` 削減 (`docs/decisions.md` [064] のフォローアップ)。CSP3 仕様で `style="..."` HTML 属性は hash 適用対象外のため、strict 化には全 inline style の CSS class / Tailwind utility 化が必要 (部分削減ではセキュリティ goal 不達)。PR 1〜7b で 200+ 箇所の React + 65 箇所の Astro inline style を全廃した。本 PR で flip を完了させ、暫定 infra (`stripMetaStyleSrc`) を撤去し、永続的な検出網 (Astro 側) を整備する。

## 2. Scope (PR 6 必須チェックリスト未消化項目)

PR 6 (#290) で scope 縮小により持ち越された PR 6 必須チェックリスト 13 項目のうち、PR 7a / 7b で消化されなかった 11 項目を本 PR で全消化する:

| #   | 項目                                                                                 | 消化 commit                                |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | `public/_headers` の CSP から `style-src 'unsafe-inline'` 削除                       | commit 2                                   |
| 2   | `astro.config.mjs` から `stripMetaStyleSrc()` integration 削除                       | commit 3                                   |
| 3   | `src/utils/__tests__/headers.test.ts` strict 化 (`'unsafe-inline'` 不在 陽性 assert) | commit 4                                   |
| 4   | `meta-csp.test.ts` の "style-src 不在" を "strict 形式" に変更                       | commit 4                                   |
| 5   | `astro-config-csp.test.ts` から `stripMetaStyleSrc` 関連 assert 削除                 | commit 4                                   |
| 6   | `docs/decisions.md` に [067] エントリ追加                                            | commit 6                                   |
| 7   | VRT baseline が flip 後の CSP で再撮影されている (CI Linux runner)                   | CI 実行で確認、必要なら別 dispatch         |
| 8   | `grep -c "style={{" src/` = 0 最終確認                                               | brainstorming で確認済 (本 PR 作業前 0 件) |
| 9   | 全 E2E + 全 unit + astro check pass                                                  | 親 E2E + CI                                |
| 10  | `.text-primary` 命名衝突リスクの再評価                                               | 現状維持を [067] に記録 (commit 6)         |
| 11  | Tailwind `border` + `@layer components` 優先度確認                                   | VRT diff で観察、出れば [067] に追記       |

**追加項目** (PR 6 チェックリストには明記なし、本 PR で同梱):

| #   | 項目                                                                        | 消化 commit |
| --- | --------------------------------------------------------------------------- | ----------- |
| 12  | Gs1Databar SVG `<text style="fill:var(--color-text)">` を `currentColor` 化 | commit 1    |
| 13  | `inline-style-migration.test.ts` に `.astro` 検出網追加                     | commit 5    |
| 14  | `src/utils/csp.ts` の `PRODUCTION_CSP` 同期更新                             | commit 2    |
| 15  | SoT `docs/projects/issue-176-b-plan-progress.md` 更新                       | commit 7    |

## 3. Architecture / Files Changed (commit 別)

| commit | ファイル                                             | 変更内容                                                                                                                             |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `src/utils/gs1-databar.ts`                           | SVG `<text style="fill:var(--color-text)">` を `fill="currentColor"` 化 (前段の `fill="#000000"` も削除)                             |
| 1      | `src/components/tools/Gs1Databar.tsx`                | `dangerouslySetInnerHTML` 親要素の className に `gs1-svg-container` 追加                                                             |
| 1      | `src/styles/global.css`                              | `@layer components` に `.gs1-svg-container { color: var(--color-text); }` 1 件追加                                                   |
| 2      | `public/_headers`                                    | `style-src 'self' 'unsafe-inline'` → `style-src 'self'`                                                                              |
| 2      | `src/utils/csp.ts`                                   | `PRODUCTION_CSP` 文字列を同期更新 (`'unsafe-inline'` 削除)                                                                           |
| 3      | `astro.config.mjs`                                   | `stripMetaStyleSrc()` 関数定義 + `integrations` 配列 entry を両方削除、関連コメント整理                                              |
| 4      | `src/utils/__tests__/headers.test.ts`                | line 89-94 を反転 (`'self'` 含有 + `'unsafe-inline'` 不在 を陽性 assert)                                                             |
| 4      | `src/utils/__tests__/meta-csp.test.ts`               | line 79-86 (style-src 不在) を strict 形式 (`style-src 'self'` 含有 + `'unsafe-inline'` 不在) に変更                                 |
| 4      | `src/utils/__tests__/astro-config-csp.test.ts`       | line 37-43 (`stripMetaStyleSrc` integration assert) と line 49-56 (`replace callback` 形式 assert) を削除、コメント [067] 参照に置換 |
| 5      | `src/utils/__tests__/inline-style-migration.test.ts` | `.astro` glob (`src/{components,layouts,pages}/**/*.astro`) 並列追加 + 陽性対照 1 件                                                 |
| 6      | `docs/decisions.md`                                  | [067] エントリ追加 (B 案完了 / PR 1〜8 series 図 / `.text-primary` 衝突 KEEP 判断 / Tailwind `border` + layer 優先度メモ)            |
| 7      | `docs/projects/issue-176-b-plan-progress.md`         | 進捗 table の PR 7b 状態を merged、PR 8 状態を merged に更新 (本 PR merge 後) + 「PR 8 完了」セクション追加                          |

## 4. 各 commit の実装詳細

### commit 1: Gs1Databar SVG `currentColor` 化

**before** (`src/utils/gs1-databar.ts:227-229`):

```javascript
`<text x="..." y="..." text-anchor="middle" font-family="..." ` +
  `font-size="${fontSize}" fill="#000000" style="fill:var(--color-text)">${escapedText}</text>`;
```

**after**:

```javascript
`<text x="..." y="..." text-anchor="middle" font-family="..." ` +
  `font-size="${fontSize}" fill="currentColor">${escapedText}</text>`;
```

**親要素 (Gs1Databar.tsx:308-318)**:

- `<div ... dangerouslySetInnerHTML={{ __html: svgContent }} />` の className に `gs1-svg-container` を追加 (clsx / 配列形式は既存パターンに合わせる)。

**`global.css` `@layer components` 追加**:

```css
.gs1-svg-container {
  color: var(--color-text);
}
```

**判断**: `--color-text` の値は変わらず → 描画結果同一が期待される。VRT で diff が出たら親要素の `color` 継承経路 (CSS specificity / `@layer` 順序) を疑う。SVG `<text>` の `fill="currentColor"` は SVG2 で標準サポート、IE 系は対象外なのでブラウザ互換性問題なし。

### commit 2: CSP flip (`_headers` + `csp.ts`)

**`public/_headers`** の CSP 行内 `style-src 'self' 'unsafe-inline'` を `style-src 'self'` に置換。同時に冒頭コメント (`# script-src の 'unsafe-inline' は意図的に維持` ブロック) は維持 (script-src 設計 = `[064]` は不変)。

**`src/utils/csp.ts`**:

```typescript
export const PRODUCTION_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self'; " +  // <-- 'unsafe-inline' 削除
  "script-src 'self' 'unsafe-inline'; " +
  // ...残りは不変
```

JSDoc は `// #176 A-1 以降、script-src の 'unsafe-inline' は意図的に維持` ブロックを維持し、style-src 関連の暫定運用記述は削除。`[067]` 参照に置換。

### commit 3: `stripMetaStyleSrc` 撤去

`astro.config.mjs` から:

- `stripMetaStyleSrc()` 関数定義 (line 21-85) 全削除
- `integrations: [react(), sitemap(), stripMetaStyleSrc()]` → `integrations: [react(), sitemap()]`
- 冒頭の `// #176 A-1 / [064]: <meta> CSP の style-src ディレクティブを除去するインライン統合。` コメントブロック削除
- `import { readFileSync, writeFileSync } from 'node:fs'` と `import { fileURLToPath } from 'node:url'` と `import { glob } from 'node:fs/promises'` の 3 import を削除 (他で未使用)

### commit 4: test 群 strict 化

#### `headers.test.ts:89-94`

**置換**:

```typescript
it("style-src は 'self' のみで 'unsafe-inline' を含まない (#176 B 案完了 / [067])", () => {
  // PR 1〜7b で React `style={{` / Astro `style="..."` 全廃 (2026-05-08 時点で 0 件) +
  // 本 PR (#176 B 案 PR 8) commit 1 で SVG inline style も `currentColor` 化。
  // 残る暗黙 inline style 経路がないため style-src を strict に flip。
  // CSP3 仕様で hash と 'unsafe-inline' 共存時に unsafe-inline は無効化されるため、
  // hash 化は不要 (本 strict 化で `<style>` block の auto-hash も活用される)。
  // 詳細: docs/decisions.md [067]
  expect(csp).toMatch(/style-src[^;]*'self'/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

#### `meta-csp.test.ts:79-86`

**置換**:

```typescript
it("style-src は 'self' のみ (B 案完了で hash 不要 / strict 化)", () => {
  // [067] B 案完了。React style={{ / Astro style="" / SVG inline style 全廃済のため
  // <meta> CSP も style-src 'self' で安全に運用可能。本 PR commit 3 で
  // stripMetaStyleSrc integration を削除した結果、Astro security.csp 由来の
  // <meta> に style-src がそのまま出力される。
  expect(cspContent).toMatch(/style-src[^;]*'self'/);
  expect(cspContent).not.toMatch(/style-src[^;]*'unsafe-inline'/);
});
```

冒頭 JSDoc 内の `astro.config.mjs の stripMetaStyleSrc() integration で <meta> から style-src は除去している` の段落を削除し `[067]` 参照に置換。

#### `astro-config-csp.test.ts`

- line 37-43 (`stripMetaStyleSrc` integration assert) 削除
- line 49-56 (`replace callback` 形式 assert) 削除
- 冒頭 JSDoc 内の `stripMetaStyleSrc` 言及部分を `[067]` 参照に置換
- 残す test: `security` ブロック存在 / `security.csp` ブロック存在 / `algorithm: 'SHA-256'` / `assetsInlineLimit: 0`

### commit 5: Astro 検出網追加

`src/utils/__tests__/inline-style-migration.test.ts` に並列の describe block を追加:

```typescript
const ASTRO_TARGET_FILES: string[] = [];
for await (const f of glob('src/{components,layouts,pages}/**/*.astro', { cwd: process.cwd() })) {
  ASTRO_TARGET_FILES.push(f);
}
ASTRO_TARGET_FILES.sort();

describe.skipIf(ASTRO_TARGET_FILES.length === 0)(
  '#176 B 案 Astro inline style 完全撲滅 (回帰防止)',
  () => {
    it(`src/{components,layouts,pages}/**/*.astro を ${ASTRO_TARGET_FILES.length} 件カバー`, () => {
      expect(ASTRO_TARGET_FILES.length).toBeGreaterThan(0);
    });

    describe.each(ASTRO_TARGET_FILES)('%s', (file) => {
      const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');

      it('HTML inline style 属性 (style="...") が残っていない', () => {
        // 注意: 前置スペース必須。`<style>` block (Astro scoped) は別経路 (auto-hash)。
        expect(content).not.toMatch(/\sstyle\s*=\s*"[^"]*"/);
      });
    });
  }
);

// 陽性対照に 1 件追加:
describe('migration detector の陽性対照 (Astro)', () => {
  it('意図的に style="..." を含む文字列が違反として検出される', () => {
    const malicious = `<div style="color: red" />`;
    expect(malicious).toMatch(/\sstyle\s*=\s*"[^"]*"/);
  });
});
```

**判断**:

- regex `\sstyle\s*=\s*"[^"]*"` で前置スペース必須 → `<style>` (Astro scoped block) と区別。
- 対象 glob は `src/{components,layouts,pages}/**/*.astro` (frontmatter 内の string literal 検出は false positive リスクだが現状コードに該当なし)。

### commit 6: `decisions.md [067]` 追加

エントリ概略:

```markdown
## [067] 2026-05-08 — `style-src 'unsafe-inline'` 削除 + B 案完了

### 背景

`#176` A-1 ([064]) で script-src を strict 化した時点では、style="..." HTML 属性は CSP3 で hash 適用対象外のため `style-src 'unsafe-inline'` は維持していた。React `style={{` (200+ 箇所) と Astro `style="..."` (65 箇所) を CSS class / Tailwind utility 化することで初めて strict 化が可能になる、という長期計画 (B 案) を採用。

### 完了経緯

PR 1 (#256) 〜 PR 7b (#299) で全 inline style を撲滅:

- PR 0 (#254): VRT 独立導入
- PR 1 (#256): ui/\* simple 11 ファイル + 基礎工事
- PR 1.5 (#261): ResultTable + InputField
- PR 2 (#272): qr-ticket
- PR 3 (#275): JwtDecoder + UuidV7Generator
- PR 4 (#277): Gs1Databar + EncodingConverter + DummyText
- PR #278 (infra): `withProductionCsp` ラッパ
- PR 5a (#283): ConfigConverter + QrReader + JanCode
- PR 5b (#286): 残ツール (Base64Codec / JsonCsv / JsonXml / QrCode / UlidGenerator + zero-style 登録)
- PR 6 (#290): `styles.ts` 削除 + migration tracker glob 化 (scope 縮小、Astro 移行を #289 へ)
- PR 7a (#294): Astro layout/ui 23 件
- PR 7b (#299): Astro pages 42 件
- PR 8 (本 PR): 最終 flip + Gs1Databar SVG `currentColor` 化 + Astro 検出網 + 暫定 infra 撤去

### 設計判断 KEEP

- **`.text-primary` 命名衝突は現状維持**: `--color-primary` を `@theme` 登録済のため Tailwind v4 は `text-primary` utility を自動生成するが、`@layer components` で定義した `.text-primary` クラスとは layer 順序により共存可能 (PR 1〜7b で visual diff 未発生)。rename には全 callsite 影響があるため、必要が顕在化するまで保留。
- **Tailwind `border` + `@layer components` の `border-color` 優先度**: PR 2 で導入した `.alert-success` / `.alert-error` は VRT pass で実害顕在せず。現状維持。

### 削除した暫定 infra

- `astro.config.mjs` の `stripMetaStyleSrc()` integration: A-1 で `<meta>` CSP から style-src を除去するために導入した暫定 strip。本 PR で全 inline style 撲滅により不要化。

### 検出網

- `src/utils/__tests__/inline-style-migration.test.ts`: PR 6 で `.tsx` glob 化、本 PR で `.astro` glob を並列追加。新規 .tsx / .astro が追加されると自動で検出網に含まれる。
```

### commit 7: SoT 更新

`docs/projects/issue-176-b-plan-progress.md`:

- line 33 の PR 7b 行を `(merged 87d705a)` リンク + PR 番号 `#299` に修正、状態を ✅ merged に。
- line 34 の PR 8 行を `(merged <hash>)` リンク + PR 番号 (PR 作成後追記) に修正、状態を ✅ merged に。
- 「進捗 SoT 完了」セクションを末尾に追加 ([067] 参照、`#176` close 案内、検出網運用ノート)。

## 5. Implementation style

- **branch**: 親 Opus が develop から `feature/issue-176-b8-final-flip` を `git checkout -b` で切る。
- **worktree**: 不要 (直列実装、並列 isolation 不要)。
- **subagent**: sonnet を 1 体起動し commit 1〜7 を直列で実装させる。`model: "sonnet"` 明示 (memory `feedback_subagent_model.md`)。
- **subagent 内 commit OK** (memory `feedback_worktree_*` の race 制約は worktree 利用時のみ、本 PR は同一 cwd で直列なので race なし)。
- **親 Opus 役割**: brainstorming → writing-plans → 計画提示 → subagent dispatch → diff 確認 → 親 E2E (`npm run test:e2e`) → push → PR 作成 (日本語 / `--base develop` / `--body-file`)。

## 6. Testing strategy

### subagent 内 (各 commit 後 / 全 commit 完了時に最終確認)

- `npm run test` (vitest unit) — commit 4-5 で追加 test の green 確認
- `npm run lint` (eslint) — commit 7 完了時 1 回
- `astro check` (型) — commit 7 完了時 1 回

### 親 Opus (subagent 全 commit 完了後)

- `git log --oneline` で 7 commit 順序確認
- `git diff develop..feature/issue-176-b8-final-flip` 全差分横串確認 (特に `_headers` / `csp.ts` / `astro.config.mjs` の改行・空白)
- `npm run test:e2e` を親が直接実行 (memory `feedback_e2e_before_pr.md`、shared-agent-rules)
- 必要なら local で `npm run dev` → ブラウザで Gs1Databar SVG 表示目視確認

### CI (PR open 後)

- `test.yml` (unit + build + astro check) green
- `visual-regression.yml` (VRT) で diff 報告 (required check 外、reviewer 判断)
- VRT diff が出た場合は **実装ミスを疑う** (Q4b 方針: baseline 更新は最終手段)

## 7. Risk & Rollback

| Risk                                                                  | 検知                                                                        | Rollback unit                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| Gs1Databar SVG が color token に追従せず固定色化                      | VRT diff / 目視                                                             | commit 1 単独 revert              |
| CSP strict 化で他経路の inline style 違反                             | E2E (preview) console violation / 既存 spec の `applyProductionCsp` で fail | commit 2 単独 revert              |
| `stripMetaStyleSrc` 撤去で `<meta>` 側 style-src と header の整合崩れ | meta-csp.test.ts (commit 4) で fail                                         | commit 3+4 を pair で revert      |
| `.astro` 検出網が false positive で fail                              | commit 5 dry-run                                                            | commit 5 単独 revert (regex 調整) |
| `decisions.md [067]` 記述ミス                                         | reviewer review                                                             | commit 6 単独 revert (docs only)  |

最大 risk = commit 1 + commit 2 の組合せで visual regression。VRT で検知 → 実装ミス疑い → fix。

## 8. Out of scope

- VRT baseline 自動更新 (CI workflow_dispatch は手動運用、本 PR では trigger しない)
- review 由来 follow-up issue (#284, #285, #281, #273 etc.) — すべて別 PR で処理
- `.text-primary` rename ([067] で記録のみ、コード変更なし)
- `inline-style-migration.test.ts` を ESLint plugin 化 (Q4 で却下)
- SVG path 経路の `applyProductionCsp` E2E gate 追加 (現状 unit + VRT で担保、追加は YAGNI)

## 9. PR 作成規約 (再掲)

- **base**: `gh pr create --base develop` 明示
- **body**: `--body-file /tmp/claude/pr_body.md` 経由 (バックティック化け事故防止)
- **言語**: タイトル + 本文必ず日本語
- **pre-create check**: develop ベース一致 / scope 確認 (`git diff origin/develop --name-only`) / aria-\* 削除なし
- **link**: PR description に `#176` B 案完了の旨明記、関連 PR (#249/#254/#256/#261/#272/#275/#277/#278/#283/#286/#290/#294/#299) を全 link
- **検出網運用ノート**: B 案完了後、新規 .tsx / .astro 追加時に `inline-style-migration.test.ts` が自動検出する旨を README or 開発者向け文書に記載 (本 PR の docs commit 6 の [067] エントリで言及)

## 10. 完了基準

- 全 7 commit が `feature/issue-176-b8-final-flip` 上に存在
- 親 E2E (`npm run test:e2e`) green
- PR 作成 (日本語 / develop base / `--body-file`)
- CI required check (test.yml) green
- review approve 受領 (memory `feedback_review_required_before_merge.md`: required CI green でも human review 前は merge 可能と語らない)
- 本 PR commit 7 で SoT (`docs/projects/issue-176-b-plan-progress.md`) を「PR 8 ✅ merged」状態に書き換え + 自身の merge hash を `(merged <hash>)` placeholder で残す。merge 後に別 chore PR で placeholder を実 hash に置換する (本 PR 内で自身の merge hash は確定しないため)
- `#176` issue を close (merge 後の chore PR か手動操作のいずれでも可)
