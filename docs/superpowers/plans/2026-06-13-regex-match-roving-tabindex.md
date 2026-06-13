# RegexMatchTester roving tabindex 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RegexMatchTester` のマッチハイライト群を roving tabindex 化し、キーボードの tab stop を N 個から 1 個に削減する（issue #666）。

**Architecture:** 純関数 `highlight()` を `MatchHighlights` サブコンポーネントへ抽出し、`rovingIndex` state と `<mark>` の ref を内包させる。常に 1 個の `<mark>` だけ `tabIndex={0}`、残りは `-1`。矢印 / Home / End で focus を移動（選択は変えない）、Enter / Space で既存の `onSelect` を呼ぶ。

**Tech Stack:** React 19 (function component / hooks), TypeScript, Vitest + @testing-library/react (jsdom), Playwright (E2E, production CSP)。

---

## File Structure

- Modify: `src/components/tools/RegexMatchTester.tsx`
  - 純関数 `highlight()` を削除し、`MatchHighlights` コンポーネントへ置換。
  - 呼び出し側（`matches.length > 0 ?` 分岐）を `<MatchHighlights .../>` に変更。
  - import に `useRef` と型 `KeyboardEvent` を追加。
- Modify (test): `src/components/tools/__tests__/RegexMatchTester.test.tsx`
  - roving tabindex のユニットテストを追加（既存テストは維持）。
- Modify (E2E): `tests/e2e/regex-visualizer.spec.ts`
  - roving tabindex の E2E（陽性対照）を追加。既存の role="button" テストは維持。

CSS（`src/styles/global.css` の `.match-highlight*`）は変更しない。

---

### Task 1: roving tabindex のユニットテストを追加（失敗する状態にする）

**Files:**
- Test: `src/components/tools/__tests__/RegexMatchTester.test.tsx`

ロービングの陽性対照テストを追加する。jest-dom の matcher（`toHaveFocus` 等）には依存せず、
`getAttribute('tabindex')` と `document.activeElement` で素の DOM を検証する（既存テストも
`.toBeTruthy()` 系で jest-dom 非依存のため、それに合わせる）。

- [ ] **Step 1: 失敗するテストを追記する**

`describe('RegexMatchTester', ...)` ブロックの末尾（既存の最後の `it` の後ろ）に以下を追加:

```tsx
  it('複数マッチで tabIndex=0 はちょうど 1 個（roving 初期状態）', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);

    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });
    expect(marks).toHaveLength(2);
    const tabbable = marks.filter((m) => m.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(marks[1].getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight で roving が次のマッチへ移動し、末尾で先頭に wrap する', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    marks[0].focus();
    fireEvent.keyDown(marks[0], { key: 'ArrowRight' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(marks[0].getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(marks[1]);

    // 末尾で ArrowRight → 先頭へ wrap
    fireEvent.keyDown(marks[1], { key: 'ArrowRight' });
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[0]);

    // 先頭で ArrowLeft → 末尾へ wrap
    fireEvent.keyDown(marks[0], { key: 'ArrowLeft' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[1]);
  });

  it('Home / End で先頭・末尾のマッチへ roving 移動する', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    marks[0].focus();
    fireEvent.keyDown(marks[0], { key: 'End' });
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[1]);

    fireEvent.keyDown(marks[1], { key: 'Home' });
    expect(marks[0].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(marks[0]);
  });

  it('Enter / Space は focus 移動ではなく選択（aria-pressed 切替）を行う', async () => {
    render(<RegexMatchTester pattern={String.raw`\d+`} flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    await screen.findByText(/2 件マッチ/, undefined, FIND);
    const marks = screen.getAllByRole('button', { name: /マッチ \d/ });

    expect(marks[0].getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(marks[0], { key: 'Enter' });
    expect(marks[0].getAttribute('aria-pressed')).toBe('true');

    expect(marks[1].getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(marks[1], { key: ' ' });
    expect(marks[1].getAttribute('aria-pressed')).toBe('true');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test -- RegexMatchTester`
Expected: 新規 4 件のうち少なくとも「tabIndex=0 はちょうど 1 個」「ArrowRight で roving」
「Home/End」が FAIL（旧実装は全 `<mark>` が `tabIndex=0` 固定で矢印ハンドラも無いため）。
既存 6 件は PASS のまま。

- [ ] **Step 3: コミット（red 状態）**

```bash
git add src/components/tools/__tests__/RegexMatchTester.test.tsx
git commit -m "test: RegexMatchTester roving tabindex の失敗テストを追加 (#666)"
```

---

### Task 2: `MatchHighlights` を実装してテストを通す

**Files:**
- Modify: `src/components/tools/RegexMatchTester.tsx`

- [ ] **Step 1: import を更新する**

1 行目を:

```tsx
import { useEffect, useState } from 'react';
```

から次へ変更:

```tsx
import { useEffect, useState, useRef } from 'react';
```

3 行目を:

```tsx
import type { ReactNode } from 'react';
```

から次へ変更:

```tsx
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
```

- [ ] **Step 2: 純関数 `highlight()` を `MatchHighlights` コンポーネントへ置換する**

現状の `highlight` 関数全体（`/** マッチ結果を…交互色 mark で囲む。 */` コメントから
関数末尾 `}` まで、ファイルの 30〜79 行目相当）を、次の実装で丸ごと置き換える:

```tsx
interface MatchHighlightsProps {
  text: string;
  matches: RegexMatch[];
  selected: number | null;
  onSelect: (i: number) => void;
}

/**
 * マッチ箇所を交互色 mark でハイライトする。roving tabindex パターンで、ハイライト群全体を
 * 1 つの tab stop に集約する（issue #666）。常に 1 個の <mark> だけ tabIndex=0、残りは -1。
 * 矢印 / Home / End で focus を移動（選択は変えない）、Enter / Space で onSelect を呼ぶ。
 */
function MatchHighlights({ text, matches, selected, onSelect }: MatchHighlightsProps) {
  const [rovingIndex, setRovingIndex] = useState(0);
  const markRefs = useRef<Array<HTMLElement | null>>([]);

  // 新しいマッチ結果（安定参照）が来たら roving を先頭へリセットする
  useEffect(() => {
    setRovingIndex(0);
  }, [matches]);

  const n = matches.length;
  // 件数縮小時の安全弁: 常に有効な tab stop が 1 個残るようにクランプ
  const safeRoving = Math.min(rovingIndex, n - 1);

  const focusMatch = (i: number) => {
    setRovingIndex(i);
    markRefs.current[i]?.focus();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>, i: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusMatch((i + 1) % n);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusMatch((i - 1 + n) % n);
        break;
      case 'Home':
        e.preventDefault();
        focusMatch(0);
        break;
      case 'End':
        e.preventDefault();
        focusMatch(n - 1);
        break;
      case 'Enter':
      case ' ':
        // Enter / スペースは focus 移動ではなく選択（クリックと同等）
        e.preventDefault();
        onSelect(i);
        break;
    }
  };

  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`t-${i}`}>{text.slice(cursor, m.start)}</span>);
    }
    const colorClass = i % 2 === 0 ? 'match-highlight-a' : 'match-highlight-b';
    // aria-label: 空マッチは「（空マッチ）」を付けて SR が聞き取れるようにする
    const ariaLabel =
      m.value === '' ? `マッチ ${i + 1}（空マッチ）` : `マッチ ${i + 1}: ${m.value}`;
    nodes.push(
      <mark
        key={`m-${i}`}
        ref={(el) => {
          markRefs.current[i] = el;
        }}
        role="button"
        // roving tabindex: 常に 1 個だけ 0、残りは -1（tab stop を 1 つに集約）
        tabIndex={i === safeRoving ? 0 : -1}
        aria-pressed={selected === i}
        aria-label={ariaLabel}
        className={cx(
          'match-highlight text-default',
          colorClass,
          selected === i && 'match-highlight-active',
          m.value === '' && 'match-highlight-empty'
        )}
        onClick={() => {
          // クリックでも roving item を更新し、次の Tab 復帰先を保持する
          setRovingIndex(i);
          onSelect(i);
        }}
        title={`マッチ ${i + 1}`}
        onKeyDown={(e) => handleKeyDown(e, i)}
      >
        {m.value === '' ? '​' : m.value}
      </mark>
    );
    cursor = Math.max(cursor, m.end);
  });
  if (cursor < text.length) {
    nodes.push(<span key="t-tail">{text.slice(cursor)}</span>);
  }

  // role="group" + aria-label で「矢印ナビ可能な 1 グループ」であることを SR に伝える。
  // span（inline）でラップし、親コンテナの whitespace-pre-wrap / break-all 描画を変えない。
  return (
    <span role="group" aria-label="マッチ箇所">
      {nodes}
    </span>
  );
}
```

> 注: `mark` に挿入している空マッチ用文字はゼロ幅スペース（U+200B）。元コードからそのまま移植する
> こと（`{m.value === '' ? '​' : m.value}` の最初の文字列リテラルは見た目空だが U+200B を含む）。

- [ ] **Step 3: 呼び出し側を置換する**

`matches.length > 0 ?` 分岐内の呼び出しを変更する。現状:

```tsx
                {matches.length > 0 ? (
                  highlight(shownText, matches, selectedIndex, setSelected)
                ) : (
```

を次へ:

```tsx
                {matches.length > 0 ? (
                  <MatchHighlights
                    text={shownText}
                    matches={matches}
                    selected={selectedIndex}
                    onSelect={setSelected}
                  />
                ) : (
```

- [ ] **Step 4: 型チェック**

Run: `npx astro check --filter src/components/tools/RegexMatchTester.tsx`
（filter が効かない場合は `node_modules/.bin/astro check`）
Expected: エラー 0。

- [ ] **Step 5: ユニットテストが通ることを確認する**

Run: `npm run test -- RegexMatchTester`
Expected: 既存 6 件 + 新規 4 件すべて PASS。

- [ ] **Step 6: コミット（green 状態）**

```bash
git add src/components/tools/RegexMatchTester.tsx
git commit -m "feat(a11y): RegexMatchTester のマッチハイライトを roving tabindex 化 (#666)"
```

---

### Task 3: E2E（陽性対照）を追加する

**Files:**
- Modify: `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: 既存の role="button" E2E の直後にロービング E2E を追加する**

PR #665 で追加された
`test('マッチハイライトが role="button" を持ちキーボード（Enter）で選択できる…')`
ブロックの直後に、次を追加する:

```ts
  // a11y 陽性対照: roving tabindex で tab stop を 1 つに集約していることを検証。
  // 旧実装（全マッチ tabindex=0）に当てると「非 roving 要素が tabindex=-1」が偽になり fail する。
  test('マッチハイライトが roving tabindex で 1 つの tab stop に集約される（CSP 違反なし）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
      await page.getByRole('button', { name: 'g: 全マッチ' }).click();
      await page.getByLabel('正規表現').fill('\\d+');
      await page.getByLabel('テスト文字列').fill('a1 b22');

      await expect(page.getByText(/2 件マッチ/)).toBeVisible();

      const m1 = page.getByRole('button', { name: /マッチ 1/ }).first();
      const m2 = page.getByRole('button', { name: /マッチ 2/ }).first();

      // roving 初期状態: 1 件目だけ tab stop（0）、2 件目は -1（旧実装＝両方 0 と区別）
      await expect(m1).toHaveAttribute('tabindex', '0');
      await expect(m2).toHaveAttribute('tabindex', '-1');

      // 1 件目に focus → ArrowRight で 2 件目へ roving（focus と tabindex が移動）
      await m1.focus();
      await m1.press('ArrowRight');
      await expect(m2).toBeFocused();
      await expect(m2).toHaveAttribute('tabindex', '0');
      await expect(m1).toHaveAttribute('tabindex', '-1');

      // 末尾で ArrowRight → 先頭へ wrap
      await m2.press('ArrowRight');
      await expect(m1).toBeFocused();

      // Enter は focus 移動ではなく選択（aria-pressed=true）
      await m1.press('Enter');
      await expect(m1).toHaveAttribute('aria-pressed', 'true');
    });
  });
```

- [ ] **Step 2: E2E を実行する**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 新規テストを含め PASS。
（実行に preview build が必要。フルランは `npm run test:e2e`。）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test(e2e): RegexMatchTester roving tabindex の陽性対照を追加 (#666)"
```

---

### Task 4: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: ユニット全件**

Run: `npm run test`
Expected: 全 PASS（meta テスト含む）。

- [ ] **Step 2: 型チェック全体**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 3: フォーマットチェック**

Run: `npm run format:check`
Expected: 差分なし（あれば `npm run format` 後に再コミット）。

- [ ] **Step 4: E2E 全件（regex 関連最低限 + production CSP スイート）**

Run: `npm run test:e2e -- regex-visualizer`
Expected: PASS。

- [ ] **Step 5: VRT 確認**

`/tools/regex-visualizer` の VRT に差分が出ないことを確認する（DOM 属性のみの変更で描画不変の想定）。
差分が出た場合は baseline を安易に更新せず、DOM 構造 diff / computed style diff の 2 段階検証の上で
親（レビュアー）へ目視判断を仰ぐ（`.agents/rules/common.md` §6.8）。

---

## 完了報告フォーマット（subagent 用）

各タスクについて「実装 / 既存で十分 / スキップ理由」を項目別に明記すること。特に:

- Task 1〜4 の各テスト追加が漏れていないか（依頼 4 タスク vs 実装タスク数の突き合わせ）。
- `RegexMatchTester.tsx` の import 変更（`useRef` / `KeyboardEvent`）が入っているか。
- `npm run test` / `astro check` / `npm run test:e2e -- regex-visualizer` の実行結果（PASS/FAIL の実出力）。
