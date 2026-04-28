# プラン: リンクスタイルのレビュー指摘対応 (#116)

PR #116 に対するレビュー指摘に基づき、回帰の修正、テストの厳密化、およびドキュメントの更新を行います。

## 1. 現状の課題

- `global.css` で `.text-link` に `underline` を追加したことにより、`index.astro` のツールカード内の「開く ›」に意図しない下線が表示されている（回帰）。
- E2E テストがスタイルの「存在」のみを確認しており、値（色）を確認していない。
- テスト内で UI 規約（ロケーター選択）に沿っていない箇所がある。
- PR 概要と実際の変更範囲（下線設計の刷新）に乖離がある。
- WCAG 1.4.1 関連の判断がドキュメントに残っていない。

## 2. 修正方針

### 2.1 スタイルの修正 (`src/styles/global.css`)

- `.text-link-color` クラスを新設し、色・遷移・`:hover`・`:visited` の定義を持たせる。
- `.text-link` は `.text-link-color` の特性に加えて下線の定義を持つように整理する。

### 2.2 トップページの修正 (`src/pages/index.astro`)

- ツールカード内の `span.text-link` を `span.text-link-color` に変更し、下線が表示されないようにする。

### 2.3 テストの修正・追加 (`tests/e2e/link-styles.spec.ts`)

- `page.locator('#test-link')` を `page.getByRole('link', { name: 'Test Link' })` に変更。
- `:visited` の検証において、`CSSStyleRule` から `style.color` の値を取得して検証するように改善。
- `page.evaluate` による要素注入の理由をコメントで明記。
- `.text-link` のベース（`underline`）およびホバー時（`2px`）の検証を追加。
- `index.astro` のツールカード内のリンクに下線がないことを確認するテストを追加。

### 2.4 ドキュメントの更新

- `docs/decisions.md` に今回のリンクスタイル刷新と WCAG 1.4.1 に関する意思決定を追記する。
- `gh pr edit 116` で PR 概要を実態に合わせて更新する。

## 3. 実行ステップ

1. `src/styles/global.css` の修正（`.text-link-color` の追加と `.text-link` の整理）
2. `src/pages/index.astro` の修正
3. `tests/e2e/link-styles.spec.ts` の修正とテストの追加
4. テストの実行確認 (`npx playwright test tests/e2e/link-styles.spec.ts`)
5. `docs/decisions.md` への追記
6. PR 概要の更新
7. コミットとプッシュ

## 4. 検証項目

- [ ] `index.astro` の「開く ›」に下線がないこと
- [ ] `tests/e2e/link-styles.spec.ts` がすべてパスすること
- [ ] `:visited` の色が `CSSStyleRule` 経由で正しく検証されていること
- [ ] ドキュメントに意思決定が記録されていること
