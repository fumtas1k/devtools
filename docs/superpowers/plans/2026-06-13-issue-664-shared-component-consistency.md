# issue #664 共通コンポーネント整合リファクタリング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QrReader / VerifyTab / GenerateTab / SecretScrubber / Gs1Databar の ad-hoc 実装を既存共通コンポーネント（ActionButton / FileInputButton / InputField）と semantic class に置換し、挙動同等のままデザインシステム整合性を上げる。

**Architecture:** 既存共通コンポーネントへの単純置換が中心。InputField のみ後方互換な optional `busy?: boolean` prop を 1 つ追加し、SecretScrubber の `aria-busy` を温存する。OutputField は使わない（aria-live 強制が PR #631 の修正と衝突するため）。

**Tech Stack:** Astro + React (TSX) + Tailwind v4 (`@layer components` semantic class) / Vitest / Playwright。

---

## 共通の前提・注意

- カラーは primitive 直書き禁止（`bg-black` 等）。semantic class / `@theme` token utility のみ。
- `@layer components` 手書き class に `hover:` 等の variant prefix を付けない（Tailwind v4 で CSS rule 不生成）。本 PR では既存 class をそのまま利用するため新規 variant は追加しない。
- `aria-*` / `role` 属性を勝手に削除しない。
- 型チェックは編集直後に `node_modules/.bin/astro check`。
- コミットは Conventional Commits（日本語）。プレフィックスは `refactor:` 主体。

参照（読むこと）:

- `src/components/ui/ActionButton.tsx`（variant: default/primary/secondary/danger、size: default/compact）
- `src/components/ui/FileInputButton.tsx`（`disabled` で `aria-disabled`）
- `src/components/ui/InputField.tsx`（`multiline`/`readOnly`/`mono`/`headerRight`）
- `src/components/ui/OutputField.tsx`（**使わない**理由の確認用）
- 設計: `docs/superpowers/specs/2026-06-13-issue-664-shared-component-consistency-design.md`

---

## Task 1: InputField に `busy` prop を追加（SecretScrubber の aria-busy 温存準備）

**Files:**

- Modify: `src/components/ui/InputField.tsx`

- [ ] **Step 1: Props 型に `busy` を追加**

`interface Props` に以下を追加（`readOnly?: boolean;` の近くでよい）:

```tsx
  /** multiline（textarea）時に aria-busy を付与する。debounce 中の表明など。既定 false。 */
  busy?: boolean;
```

- [ ] **Step 2: 関数引数で受け取る**

`export function InputField({ ... })` の分割代入に `busy = false,` を追加（`readOnly = false,` の近く）。

- [ ] **Step 3: textarea に aria-busy を渡す**

`multiline` 分岐の `<textarea ...>` に属性を追加（`aria-invalid={!!error}` の直後）:

```tsx
          aria-busy={busy || undefined}
```

`<input>`（非 multiline）側には追加しない。

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（既存利用箇所は `busy` 未指定で後方互換）。

- [ ] **Step 5: コミット**

```bash
git add src/components/ui/InputField.tsx
git commit -m "refactor(ui): InputField に optional busy prop を追加（aria-busy passthrough）"
```

---

## Task 2: QrReader のボタンを ActionButton に集約（項目1）

**Files:**

- Modify: `src/components/tools/QrReader.tsx`

- [ ] **Step 1: import を追加**

先頭の import 群に追加:

```tsx
import { ActionButton } from '@/components/ui/ActionButton';
```

- [ ] **Step 2: 起動ボタンを置換（現 `:124-131`）**

```tsx
{
  !camera.cameraActive && !decoded && (
    <ActionButton onClick={camera.startCamera} variant="primary">
      カメラを起動
    </ActionButton>
  );
}
```

- [ ] **Step 3: 停止ボタンを置換（現 `:143-151`）**

```tsx
{
  camera.cameraActive && (
    <ActionButton onClick={stopCamera} variant="danger">
      カメラを停止
    </ActionButton>
  );
}
```

- [ ] **Step 4: 再スキャンボタンを置換（現 `:188-194`）**

```tsx
<ActionButton onClick={handleRescan} size="compact">
  再スキャン
</ActionButton>
```

- [ ] **Step 5: video の className を確認（変更不要）**

`:137` の `cx('w-full max-w-[400px] rounded-lg qr-video-preview', !camera.cameraActive && 'hidden')` はそのまま。`cx` は video で使用中のため import は残す（除去しないこと）。

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 7: ユニットテスト（QrReader 関連は hooks のみだが回帰確認）**

Run: `npm run test -- qr`
Expected: PASS。

- [ ] **Step 8: コミット**

```bash
git add src/components/tools/QrReader.tsx
git commit -m "refactor(ui): QrReader のカメラ起動/停止/再スキャンを ActionButton に集約"
```

---

## Task 3: VerifyTab の video 背景と FileInputButton 化（項目2・3）

**Files:**

- Modify: `src/components/tools/qr-ticket/VerifyTab.tsx`
- Modify: `src/styles/global.css`（`.qr-file-picker-label` 削除）

- [ ] **Step 1: import を追加**

先頭の import 群に追加:

```tsx
import { FileInputButton } from '@/components/ui/FileInputButton';
```

- [ ] **Step 2: video の bg-black を semantic class へ（現 `:90-97`）**

`className="w-full max-w-[400px] rounded-lg bg-black block"` を以下に変更:

```tsx
className = 'w-full max-w-[400px] rounded-lg qr-video-preview block';
```

（`hidden`/`aria-label`/`ref`/`playsInline`/`muted` は維持）

- [ ] **Step 3: ファイル選択を FileInputButton に置換（現 `:110-123` の `<label>...</label>`）**

```tsx
<FileInputButton accept="image/*" onChange={onImageUpload} disabled={!verifyPubKeyStr.trim()}>
  画像を選択
</FileInputButton>
```

（直前の説明文 `<p>` と直後の `<p className="hint-xs ...">`、および `{!verifyPubKeyStr.trim() && (<p>公開鍵を入力してください</p>)}` は維持）

- [ ] **Step 4: 不要 CSS を削除**

`src/styles/global.css` の `.qr-file-picker-label { ... }` ブロックと `.qr-file-picker-label[data-enabled='true'] { ... }` ブロック（現 `:524-535` 付近）を両方削除する。直前のコメントが該当クラス専用であれば併せて削除。

- [ ] **Step 5: dead CSS / 参照漏れの確認**

Run: `grep -rn "qr-file-picker-label" src tests`
Expected: 0 件（VerifyTab からも CSS からも消えていること）。

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 7: ビルドで CSS 整合を確認**

Run: `npm run build`
Expected: 成功（削除した class 参照によるエラーが出ないこと）。

- [ ] **Step 8: コミット**

```bash
git add src/components/tools/qr-ticket/VerifyTab.tsx src/styles/global.css
git commit -m "refactor(ui): VerifyTab の video を qr-video-preview・ファイル選択を FileInputButton に統一"
```

---

## Task 4: GenerateTab の鍵 textarea を InputField 化 + border-default 置換（項目4・5の一部）

**Files:**

- Modify: `src/components/tools/qr-ticket/GenerateTab.tsx`

- [ ] **Step 1: 秘密鍵ブロックを InputField に置換（現 `:150-163`）**

`InputField` は既に import 済み。秘密鍵の `<div>...<textarea readOnly .../></div>` 全体を以下に置換:

```tsx
<InputField
  id="qr-ticket-private-key"
  label="秘密鍵（主催者が保管）"
  value={privateKeyJwkStr}
  onChange={() => {}}
  multiline
  rows={4}
  mono
  readOnly
  headerRight={<CopyButton text={privateKeyJwkStr} label="コピー" />}
/>
```

- [ ] **Step 2: 公開鍵ブロックを InputField に置換（現 `:164-179`）**

```tsx
<InputField
  id="qr-ticket-public-key"
  label="公開鍵（検証スタッフへ共有）"
  value={publicKeyJwkStr}
  onChange={() => {}}
  multiline
  rows={4}
  mono
  readOnly
  headerRight={<CopyButton text={publicKeyJwkStr} label="コピー" />}
/>
```

注: `readOnly` のため `onChange` は呼ばれないが InputField の必須 prop。no-op を渡す。

- [ ] **Step 3: チケット行の border-(--color-border) を置換（現 `:239`）**

```tsx
                    'flex flex-col md:flex-row gap-2 items-stretch md:items-center mb-6 md:mb-0 pb-4 md:pb-0 border-b border-default md:border-b-0',
```

- [ ] **Step 4: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 5: ユニットテスト（qr-ticket）**

Run: `npm run test -- qr-ticket`
Expected: PASS（鍵生成 hook テストが id/aria-label 変更の影響を受けないこと。受ける場合はテスト側の aria-label 参照を新しい label 文言に合わせて修正してよいが、文言自体は据え置き）。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/qr-ticket/GenerateTab.tsx
git commit -m "refactor(ui): GenerateTab の鍵表示を InputField・border を border-default に統一"
```

---

## Task 5: SecretScrubber の出力 textarea を InputField 化（項目4）

**Files:**

- Modify: `src/components/tools/SecretScrubber.tsx`

- [ ] **Step 1: 出力ブロックを InputField に置換（現 `:118-136`）**

`InputField` は既に import 済み。出力の `<div>...</div>`（ラベル行 + textarea）全体を以下に置換:

```tsx
{
  /* 出力 */
}
{
  input.length > 0 && (
    <InputField
      id="secret-scrubber-output"
      label="マスク済みテキスト"
      value={outputText}
      onChange={() => {}}
      multiline
      rows={10}
      mono
      readOnly
      busy={isPending}
      headerRight={<CopyButton text={outputText} label="コピー" ariaLabel="出力テキストをコピー" />}
    />
  );
}
```

注: aria-live は付与しない（InputField はそもそも付けない＝PR #631 の挙動維持）。`busy={isPending}` で従来の `aria-busy` を温存。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 3: SecretScrubber ユニットテスト**

Run: `npm run test -- SecretScrubber`
Expected: PASS。出力取得を `getByLabelText('マスク済みテキスト')` 等で行っていれば維持される。`secret-scrubber-output` id も維持済み。失敗する場合はテストのセレクタを新構造（label 関連付け）に合わせて修正（文言・id は据え置き）。

- [ ] **Step 4: aria-live 非再導入の確認（PR #631 ガード）**

Run: `grep -n "aria-live" src/components/tools/SecretScrubber.tsx`
Expected: sr-only の announcement `<p>`（`role="status" aria-live="polite"`）のみ 1 箇所。出力 textarea 周辺に aria-live が無いこと。

- [ ] **Step 5: コミット**

```bash
git add src/components/tools/SecretScrubber.tsx
git commit -m "refactor(ui): SecretScrubber のマスク出力を InputField に統一（aria-live 非導入を維持）"
```

---

## Task 6: Gs1Databar の border-default 置換（項目5）

**Files:**

- Modify: `src/components/tools/Gs1Databar.tsx`

- [ ] **Step 1: `:239` 付近の border-(--color-border) を確認して置換**

Run: `grep -n "border-(--color-border)" src/components/tools/Gs1Databar.tsx`
該当行の `border-(--color-border)` を `border-default` に置換する（前後の他クラスは維持）。

- [ ] **Step 2: 残存確認**

Run: `grep -rn "border-(--color-border)" src`
Expected: 0 件（GenerateTab・Gs1Databar とも置換済み）。

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/Gs1Databar.tsx
git commit -m "refactor(ui): Gs1Databar の border arbitrary 参照を border-default に置換"
```

---

## Task 7: 全体検証（型・ユニット・ビルド・E2E）

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック（全体）**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 2: フォーマットチェック**

Run: `npm run format:check`
Expected: pass（崩れていれば `npm run format` で整形し追加コミット）。

- [ ] **Step 3: ユニットテスト（全体）**

Run: `npm run test`
Expected: 全 PASS（`tests/meta/vrt-pages-coverage.test.ts` 含む）。

- [ ] **Step 4: ビルド**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: E2E**

Run: `npm run test:e2e`
Expected: 機能系 PASS。VRT は差分が出る可能性あり（QrReader 停止ボタンの背景・ボタン padding 等）。差分が出たら:

1. DOM 構造 diff と computed style diff の 2 段階で真の regression でないことを確認。
2. pixel 数のみを根拠に baseline 更新を recommend しない（CLAUDE.md §6.8）。意図した見た目変更（停止ボタンの透過化等）であることを記録し、baseline 更新の要否は人間の目視確認に委ねる。

- [ ] **Step 6: ドキュメント影響確認**

挙動・ツール一覧・SPEC への影響なし（内部リファクタのみ）。`README.md` / `SPEC.md` の更新は不要であることを確認。

---

## Self-Review チェック結果

- **Spec coverage**: 項目1=Task2 / 項目2=Task3 / 項目3=Task3 / 項目4=Task1+Task4+Task5 / 項目5=Task4+Task6。全 5 項目に対応タスクあり。
- **Placeholder scan**: TBD / TODO なし。各置換に実コードを記載。
- **Type consistency**: InputField の新 prop は `busy?: boolean`、利用は Task5 の `busy={isPending}` で一致。`onChange={() => {}}` を readOnly 各所で統一。
