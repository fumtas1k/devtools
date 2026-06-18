# TOTP ランダム生成 連打 re-announce のテストギャップ補強 (#538)

## 背景

PR #537（TOTP ランダム生成の視覚 / SR フィードバック, #426）のレビューで指摘されたテストギャップ。

`TotpHotpGenerator` の `handleRegenerateSecret` は、連打時も announce を再発火させるため
`setRegenFlash(false)` → `clearTimeout` → `requestAnimationFrame(() => setRegenFlash(true))`
という dance で sr-only span（`role="status" aria-live="polite"`）を unmount→remount させている。

現状の E2E（`totp-hotp.spec.ts`）は **1 回目の click** で `input-flash` class と announce テキストが
出ることだけを assert している。連打（flash 表示中の 2 回目以降の click）で announce が再発火する
挙動が test で守られていない。誰かが「不要な dance」と判断して `setRegenFlash(true)` 一行に
リファクタすると、現テストは pass したまま「2 回目以降の click で再 announce されない」regression が
silent に入りうる。

## 目的

連打時 re-announce 挙動を component test（RTL）で守る。dance を 1 行 `setRegenFlash(true)` に
退行させたら **fail** させる（test-gates 陽性対照）。

## 方針

ユーザー承認済み: **テスト追加のみ**。実装（dance）は変更しない。`key={nonce}` 化等の
実装リファクタは行わない（動作中の a11y コードに触れず blast radius を最小化する）。

## 対象ファイル

- `src/components/tools/__tests__/TotpHotpGenerator.test.ts` を **`.tsx` にリネーム**し、
  既存の定数テスト（`SAMPLE_SECRET_BASE32` / `DEFAULTS`）はそのまま維持して RTL ブロックを追加。
  - リネーム理由: JSX を含む RTL render を書くため。vitest の `include` は `*.test.{ts,tsx}` 両対応。

## テスト戦略

1. `// @vitest-environment jsdom` ヘッダ + `@testing-library/react` で render
   （既存 `CharCount.test.tsx` / `SecretScrubber.test.tsx` パターン踏襲）。
2. `requestAnimationFrame` を `vi.stubGlobal` で **コールバック蓄積式** に差し替え、`flushRaf()` で
   決定論的に次フレームを発火する（実 rAF の ~16ms 非決定性・jsdom 依存を排除）。
   `afterEach` で `vi.unstubAllGlobals()`。
3. TOTP の `setInterval` tick が async crypto（`crypto.subtle`）を叩いて test を汚すのを避けるため、
   `@/utils/totp-hotp` を部分モックして `totp` / `hotp` のみダミー化する。
   `generateRandomBase32Secret`・`base32Decode` は同期で `crypto.subtle` 非依存（前者は
   `getRandomValues`、後者は純計算）なので実物を維持し、テストの現実性を保つ。

   ```ts
   vi.mock('@/utils/totp-hotp', async (importOriginal) => {
     const actual = await importOriginal<typeof import('@/utils/totp-hotp')>();
     return { ...actual, totp: vi.fn(async () => '000000'), hotp: vi.fn(async () => '000000') };
   });
   ```

## 核となる assertion（陽性対照）

announce テキスト: `'シークレットを再生成しました'`、
regenerate ボタン: `getByRole('button', { name: 'ランダム生成（新しいシークレット）' })`。

1. 1 回目 click → rAF flush **前** は announce span 未 mount（`queryByText` = `null`）。
2. `flushRaf()` → span mount。ノードを `firstSpan` として捕捉。
3. flash 表示中（1200ms setTimeout 前）に **2 回目 click** → この時点で `setRegenFlash(false)` が走り
   span が **一旦消える** ことを assert（`queryByText` = `null`）。
   **← これが退行検知の要。** 1 行 `setRegenFlash(true)` 実装では span が消えず、この assert が fail する。
4. `flushRaf()` → span 再 mount。`secondSpan !== firstSpan`（同一ノードではなく remount = 再 announce 担保）
   を assert。

全 interaction は `act()` でラップする（React state 更新の警告回避）。

## スコープ外

- 実装変更（dance はそのまま）。
- E2E（`totp-hotp.spec.ts`）の変更。
- 1200ms setTimeout の完走検証（再 announce の本質ではなく、flash の寿命管理は別軸）。

## 検証義務（test-gates）

- `npm run test`（ユニット）green。
- `node_modules/.bin/astro check`（型）pass。
- **陽性対照の証跡**: 実装の dance を一時的に `setRegenFlash(true)` 1 行へ退行させ、追加テストが
  **fail** することを確認してから元に戻す。陰性対照のみ（green のまま）では「検知能力ゼロで green」と
  区別不能なため必須（`test-gates` skill / `.agents/rules/common.md` 3 章）。

## 関連

- PR #537 review (Testing — ギャップ 1 件)
- issue #426, #537
