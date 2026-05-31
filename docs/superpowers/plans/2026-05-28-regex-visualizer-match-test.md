# 正規表現ビジュアライザ マッチテスト機能（PR3）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正規表現ビジュアライザにマッチテスト機能（テスト文字列入力 → マッチ箇所ハイライト → キャプチャグループ表）を追加する。

**Architecture:** マッチ実行は CJS 依存のない純粋モジュール `match.ts`（native `RegExp`・静的 import 可）に切り出す。UI は独立した `RegexMatchTester` コンポーネントに分離し、`RegexVisualizer` から ReDoS 判定（safe/vulnerable/unknown）と regex 有効性を props で受け取る。マッチ実行は ReDoS 判定でゲートする（safe=自動 / unknown=ボタン+入力長キャップ / vulnerable=無効）。

**Tech Stack:** Astro + React (TSX) / native `RegExp` / 既存 `useDebouncedTransform`・`InputField`・`ActionButton`・`ResultTable` / Vitest（unit・component）/ Playwright（E2E・本番 CSP 下）

**設計スペック:** `docs/superpowers/specs/2026-05-28-regex-visualizer-match-test-design.md`

---

## 前提知識（実装者向け）

- **依存ポリシー**: 新規ライブラリは追加しない。マッチ実行はブラウザ native `RegExp` のみ。
- **CJS 制約**: `regexp-tree` / `recheck` は CJS で、React から静的 import すると Astro dev SSR が `module is not defined` で落ちる。これらに依存する既存解析系は `RegexVisualizer` の `useEffect` 内動的 import（`mod`）経由でのみ呼ぶ。**`match.ts` は native `RegExp` のみで CJS 非依存のため静的 import してよい**（本計画の核）。
- **同期変換フック**: `useDebouncedTransform<I, R>(source, transform, emptyResult, deps, options?)`。`source === null` で即時クリア。`transform` が throw すると `error` をセットし result は `emptyResult` に戻す。返り値 `{ result, error, isPending }`。`emptyResult` は安定参照（モジュールスコープ定数）で渡す。`debounceMs` 既定 300。
- **共通 UI**:
  - `InputField`（`src/components/ui/InputField.tsx`）: `multiline` / `rows` / `maxLength` / `hint` / `mono` 対応。`getByLabelText(label)` でテストから参照可。
  - `ActionButton`（`src/components/ui/ActionButton.tsx`）: `onClick` / `variant`（'default'|'primary'|'secondary'|'danger'）/ `children`。
  - `ResultTable<T>`（`src/components/ui/ResultTable.tsx`）: `rows` / `columns: TableColumn<T>[]` / `getKey` / `selectedIndex` / `onRowClick` / `minWidth`。行クリック・キーボード（Enter/Space）選択を内蔵し、選択行は `data-selected='true'` で `--color-primary` 強調。`TableColumn` は `{ key, header, headerAlign?, cellAlign?, className?, render(row, index) }`。
- **色**: Tailwind primitive 直書き禁止（規約 7）。CSS は `src/styles/global.css` の `@layer components` に意味クラスを追加し `var(--color-*)` を使う。`@layer components` 手書きクラスに `hover:` 等 variant prefix を付けない（規約 7.1）。利用するトークン: `--color-blue-100` `--color-blue-300` `--color-primary` `--radius-sm`（すべて `@theme` 定義済み）。
- **テストロケータ**: `getByRole` / `getByText` / `getByLabel(Text)` を使う。`locator('[role="X"]')` は禁止。
- **E2E**: 本番 CSP 下（`withProductionCsp(browser, path, async (page) => {...})`、`tests/e2e/helpers`）。フラグボタンの aria-label は `${value}: ${desc}`（例 `g: 全マッチ（グローバル）`）。

---

## File Structure

| ファイル                                                            | 責務                                                                                                                          |
| :------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/regex-visualizer/match.ts`                               | pattern+flags+input → `MatchResult`（native RegExp・純粋・import ゼロ）。g 制御・空マッチ guard・グループ名解決・長さキャップ |
| `src/utils/regex-visualizer/__tests__/match.test.ts`                | `runMatch` の unit テスト                                                                                                     |
| `src/utils/regex-visualizer/index.ts`                               | `runMatch` と型を re-export（barrel 追記）                                                                                    |
| `src/components/tools/RegexMatchTester.tsx`                         | マッチテストセクション全体（テスト文字列入力・ハイライト・グループ表・ReDoS ゲート UI）                                       |
| `src/components/tools/__tests__/RegexMatchTester.test.tsx`          | `RegexMatchTester` の component テスト（純粋・recheck 不要）                                                                  |
| `src/components/tools/RegexVisualizer.tsx`                          | マッチセクションを ReDoS の直下に組み込み、props を渡す（modify）                                                             |
| `src/components/tools/__tests__/RegexVisualizer.test.tsx`           | 統合テスト追記（modify）                                                                                                      |
| `src/styles/global.css`                                             | `.match-highlight*` 意味クラス追加（modify）                                                                                  |
| `tests/e2e/regex-visualizer.spec.ts`                                | E2E 追記（本番 CSP 下・modify）                                                                                               |
| `README.md` / `SPEC.md` / `src/data/tools.ts` / `docs/decisions.md` | ドキュメント更新（modify）                                                                                                    |

VRT: `/tools/regex-visualizer` は既に `tests/e2e/visual-regression-pages.ts` の `PAGES` に登録済み（追加作業なし）。

---

## Task 1: match.ts — pattern+flags+input を MatchResult へ

**Files:**

- Create: `src/utils/regex-visualizer/match.ts`
- Test: `src/utils/regex-visualizer/__tests__/match.test.ts`
- Modify: `src/utils/regex-visualizer/index.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/regex-visualizer/__tests__/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runMatch } from '../match';

describe('runMatch', () => {
  it('g なしは最初の1件のみ返す', () => {
    const r = runMatch('\\d+', '', 'a1 b22 c333');
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].value).toBe('1');
    expect(r.matches[0].start).toBe(1);
    expect(r.matches[0].end).toBe(2);
  });

  it('g ありは全マッチを返す', () => {
    const r = runMatch('\\d+', 'g', 'a1 b22 c333');
    expect(r.matches.map((m) => m.value)).toEqual(['1', '22', '333']);
  });

  it('キャプチャグループを index 付きで抽出する', () => {
    const r = runMatch('(\\w+)@(\\w+)', 'g', 'a@x b@y');
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].groups.map((g) => g.value)).toEqual(['a', 'x']);
    expect(r.matches[0].groups.map((g) => g.index)).toEqual([1, 2]);
  });

  it('名前付きグループの名前を解決する', () => {
    const r = runMatch('(?<user>\\w+)@(?<host>\\w+)', '', 'a@x');
    expect(r.matches[0].groups[0]).toMatchObject({ index: 1, name: 'user', value: 'a' });
    expect(r.matches[0].groups[1]).toMatchObject({ index: 2, name: 'host', value: 'x' });
  });

  it('非キャプチャ (?:) と先読み (?=) はグループ番号を消費しない', () => {
    const r = runMatch('(?:ab)(c)(?=d)', '', 'abcd');
    expect(r.matches[0].groups).toHaveLength(1);
    expect(r.matches[0].groups[0]).toMatchObject({ index: 1, value: 'c' });
  });

  it('エスケープ括弧と文字クラス内括弧はグループとして数えない', () => {
    const r = runMatch('\\((\\d)\\)[()]', '', '(5))');
    expect(r.matches[0].groups).toHaveLength(1);
    expect(r.matches[0].groups[0].value).toBe('5');
  });

  it('未マッチの省略可能グループは value undefined', () => {
    const r = runMatch('(a)?(b)', '', 'b');
    expect(r.matches[0].groups[0].value).toBeUndefined();
    expect(r.matches[0].groups[1].value).toBe('b');
  });

  it('マッチなしは空配列', () => {
    const r = runMatch('z+', 'g', 'aaa');
    expect(r.matches).toEqual([]);
  });

  it('空マッチでも無限ループせず有限件数を返す', () => {
    const r = runMatch('a*', 'g', 'aXa');
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.length).toBeLessThan(20);
  });

  it('maxLength で input を切り詰め truncated を立てる', () => {
    const r = runMatch('.', 'g', 'abcdef', 3);
    expect(r.truncated).toBe(true);
    expect(r.matches).toHaveLength(3);
  });

  it('maxLength 未指定なら truncated は false', () => {
    const r = runMatch('.', 'g', 'abc');
    expect(r.truncated).toBe(false);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/match.test.ts`
Expected: FAIL（`runMatch` 未定義）

- [ ] **Step 3: match.ts を実装**

`src/utils/regex-visualizer/match.ts`:

```ts
export interface CaptureGroup {
  /** 1 始まりのグループ番号 */
  index: number;
  /** 名前付きグループ名（なければ undefined） */
  name?: string;
  /** マッチ値。未マッチ（省略可能グループ）のとき undefined */
  value?: string;
}

export interface RegexMatch {
  value: string;
  start: number;
  /** 終了位置（exclusive） */
  end: number;
  groups: CaptureGroup[];
}

export interface MatchResult {
  matches: RegexMatch[];
  /** maxLength で input を切り詰めたか */
  truncated: boolean;
}

/**
 * pattern を走査し、各キャプチャグループ番号（1 始まり）に対応する名前を返す。
 * 名前なしグループは undefined。非キャプチャ (?:) / 先読み (?=)(?!) / 後読み (?<=)(?<!) は
 * グループ番号を消費しないので含めない。\\( のエスケープと [ ] 文字クラス内の括弧は無視する。
 */
function groupNames(pattern: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++; // 次の1文字をエスケープとしてスキップ
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c !== '(') continue;
    if (pattern[i + 1] !== '?') {
      names.push(undefined); // 通常のキャプチャグループ
      continue;
    }
    // (? で始まる: 名前付き (?<name> のみグループ番号を持つ。(?<= (?<! は後読みで持たない。
    if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') {
      const end = pattern.indexOf('>', i + 3);
      names.push(end === -1 ? undefined : pattern.slice(i + 3, end));
    }
    // (?: (?= (?! (?<= (?<! → グループ番号なし（何もしない）
  }
  return names;
}

function toMatch(m: RegExpExecArray, names: (string | undefined)[]): RegexMatch {
  const value = m[0];
  const start = m.index;
  const groups: CaptureGroup[] = [];
  for (let i = 1; i < m.length; i++) {
    groups.push({ index: i, name: names[i - 1], value: m[i] });
  }
  return { value, start, end: start + value.length, groups };
}

/**
 * pattern + flags を input に対してマッチ実行する（native RegExp）。
 * g なしは最初の 1 件のみ、g ありは全マッチ。空マッチ時は lastIndex を 1 進めて無限ループを防ぐ。
 * maxLength を渡すと input を先頭 maxLength 文字に切り詰めて実行し truncated=true を返す。
 * 不正な pattern / flags は `new RegExp` が throw する（呼び出し側で gate 済み前提）。
 */
export function runMatch(
  pattern: string,
  flags: string,
  input: string,
  maxLength?: number
): MatchResult {
  const truncated = maxLength !== undefined && input.length > maxLength;
  const text = truncated ? input.slice(0, maxLength) : input;
  const re = new RegExp(pattern, flags);
  const names = groupNames(pattern);
  const matches: RegexMatch[] = [];

  if (!flags.includes('g')) {
    const m = re.exec(text);
    if (m) matches.push(toMatch(m, names));
    return { matches, truncated };
  }

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(toMatch(m, names));
    if (m.index === re.lastIndex) re.lastIndex++; // 空マッチ guard
  }
  return { matches, truncated };
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/match.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: barrel に re-export を追加**

`src/utils/regex-visualizer/index.ts` の末尾に追記:

```ts
export { runMatch, type MatchResult, type RegexMatch, type CaptureGroup } from './match';
```

- [ ] **Step 6: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/match.ts src/utils/regex-visualizer/__tests__/match.test.ts src/utils/regex-visualizer/index.ts
git commit -m "feat: 正規表現マッチ実行ユーティリティ runMatch を追加"
```

---

## Task 2: global.css — マッチハイライト意味クラス

**Files:** Modify `src/styles/global.css`

- [ ] **Step 1: `@layer components` にクラスを追加**

`src/styles/global.css` の `@layer components` 内（既存の `.regex-ast-node-hot` 付近）に追記:

```css
/* === マッチテスト: マッチ箇所ハイライト（PR3） === */
.match-highlight {
  border-radius: var(--radius-sm);
  padding: 0 1px;
  cursor: pointer;
}
.match-highlight-a {
  background: var(--color-blue-100);
}
.match-highlight-b {
  background: var(--color-blue-300);
}
.match-highlight-active {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
/* 空マッチ（幅ゼロ）の位置を示す細いマーカー */
.match-highlight-empty {
  border-left: 2px solid var(--color-primary);
}
```

> `<mark>` の UA 既定背景・文字色は、JSX 側で `text-default` クラスと `.match-highlight-a/-b` 背景を併用して上書きする（Task 3）。variant prefix（`hover:` 等）はこれら手書きクラスに付けない。

- [ ] **Step 2: ビルドで CSS 生成を確認**

Run: `npm run build`
Expected: 成功。続けて生成物にルールがあることを確認:

Run: `grep -l "match-highlight-a" dist/_astro/*.css`
Expected: 1 件以上ヒット（CSS ルールが生成されている）。

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: マッチテストのハイライト意味クラスを追加"
```

---

## Task 3: RegexMatchTester.tsx — マッチテストセクション

**Files:**

- Create: `src/components/tools/RegexMatchTester.tsx`
- Test: `src/components/tools/__tests__/RegexMatchTester.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/tools/__tests__/RegexMatchTester.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RegexMatchTester } from '../RegexMatchTester';

afterEach(() => {
  cleanup();
});

const FIND = { timeout: 2000 } as const;

function typeTest(value: string) {
  fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value } });
}

describe('RegexMatchTester', () => {
  it('safe 判定でテスト文字列を入力するとマッチ集計と表が出る', async () => {
    render(<RegexMatchTester pattern="\\d+" flags="g" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    expect(await screen.findByText(/2 件マッチ/, undefined, FIND)).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('g なしは1件のみ + g ヒントを表示', async () => {
    render(<RegexMatchTester pattern="\\d+" flags="" redosStatus="safe" regexValid />);
    typeTest('a1 b22');
    expect(await screen.findByText(/1 件マッチ/, undefined, FIND)).toBeTruthy();
    expect(screen.getByText(/g フラグを付けると/)).toBeTruthy();
  });

  it('マッチなしは「マッチしませんでした」', async () => {
    render(<RegexMatchTester pattern="z+" flags="g" redosStatus="safe" regexValid />);
    typeTest('aaa');
    expect(await screen.findByText('マッチしませんでした。', undefined, FIND)).toBeTruthy();
  });

  it('vulnerable 判定ではマッチ実行を無効化する（陽性確認）', () => {
    render(<RegexMatchTester pattern="(a+)+$" flags="" redosStatus="vulnerable" regexValid />);
    expect(screen.queryByLabelText('テスト文字列')).toBeNull();
    expect(screen.getByText(/マッチ実行を無効化/)).toBeTruthy();
  });

  it('unknown 判定では自動実行せず、ボタン押下で実行する', async () => {
    render(<RegexMatchTester pattern="\\d+" flags="g" redosStatus="unknown" regexValid />);
    typeTest('a1 b2');
    expect(screen.queryByText(/件マッチ/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /マッチを実行/ }));
    expect(await screen.findByText(/2 件マッチ/, undefined, FIND)).toBeTruthy();
  });

  it('regexValid=false なら案内文のみ', () => {
    render(<RegexMatchTester pattern="(" flags="" regexValid={false} />);
    expect(screen.getByText(/有効な正規表現を入力すると/)).toBeTruthy();
    expect(screen.queryByLabelText('テスト文字列')).toBeNull();
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexMatchTester.test.tsx`
Expected: FAIL（`RegexMatchTester` 未定義）

- [ ] **Step 3: RegexMatchTester.tsx を実装**

`src/components/tools/RegexMatchTester.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
import {
  runMatch,
  type MatchResult,
  type RegexMatch,
  type RedosStatus,
} from '@/utils/regex-visualizer';

interface Props {
  pattern: string;
  flags: string;
  /** ReDoS 判定（undefined = 未判定/解析中）。マッチ実行のゲートに使う。 */
  redosStatus?: RedosStatus;
  /** 正規表現が有効か（parse エラーなし）。false ならマッチ実行しない。 */
  regexValid: boolean;
}

const UNKNOWN_CAP = 1000; // unknown verdict の force 実行時の入力長上限
const SAFE_MAXLENGTH = 10000; // textarea の粗い上限（safe は線形マッチ）
const EMPTY_MATCH: MatchResult | null = null; // useDebouncedTransform 用の安定参照

/** マッチ結果をハイライト済み React 要素配列へ。マッチ全体を交互色 mark で囲む。 */
function highlight(
  input: string,
  matches: RegexMatch[],
  selected: number | null,
  onSelect: (i: number) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`t-${i}`}>{input.slice(cursor, m.start)}</span>);
    }
    const colorClass = i % 2 === 0 ? 'match-highlight-a' : 'match-highlight-b';
    const activeClass = selected === i ? ' match-highlight-active' : '';
    const emptyClass = m.value === '' ? ' match-highlight-empty' : '';
    nodes.push(
      <mark
        key={`m-${i}`}
        className={`match-highlight text-default ${colorClass}${activeClass}${emptyClass}`}
        onClick={() => onSelect(i)}
        title={`マッチ ${i + 1}`}
      >
        {m.value === '' ? '​' : m.value}
      </mark>
    );
    cursor = Math.max(cursor, m.end);
  });
  if (cursor < input.length) {
    nodes.push(<span key="t-tail">{input.slice(cursor)}</span>);
  }
  return nodes;
}

export function RegexMatchTester({ pattern, flags, redosStatus, regexValid }: Props) {
  const [testString, setTestString] = useState('');
  const [forceUnknown, setForceUnknown] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // 正規表現や ReDoS 判定が変わったら force 実行と選択をリセット
  useEffect(() => {
    setForceUnknown(false);
    setSelected(null);
  }, [pattern, flags, redosStatus]);

  const shouldRun =
    regexValid &&
    testString.length > 0 &&
    (redosStatus === 'safe' || (redosStatus === 'unknown' && forceUnknown));

  const match = useDebouncedTransform<string, MatchResult | null>(
    shouldRun ? testString : null,
    (ts) => runMatch(pattern, flags, ts, redosStatus === 'unknown' ? UNKNOWN_CAP : undefined),
    EMPTY_MATCH,
    [pattern, flags, redosStatus, forceUnknown],
    { fallbackError: 'マッチ実行に失敗しました' }
  );

  const result = match.result;
  const matches = result?.matches ?? [];
  const selectedIndex = selected !== null && selected < matches.length ? selected : null;
  // 表示中のテキスト（unknown は capped 入力でマッチしているのでハイライトも同じ範囲）
  const shownText = redosStatus === 'unknown' ? testString.slice(0, UNKNOWN_CAP) : testString;

  // グループ列（先頭マッチのグループ構成から導出。同一 regex なら全マッチ共通）
  const groupCols: TableColumn<RegexMatch>[] = (matches[0]?.groups ?? []).map((g) => ({
    key: `g${g.index}`,
    header: g.name ? `${g.index}: ${g.name}` : `グループ${g.index}`,
    className: 'font-mono',
    render: (row: RegexMatch) => {
      const cell = row.groups[g.index - 1];
      return cell?.value === undefined ? <span className="text-muted">(なし)</span> : cell.value;
    },
  }));

  const columns: TableColumn<RegexMatch>[] = [
    { key: 'no', header: '#', cellAlign: 'right', render: (_row, i) => i + 1 },
    {
      key: 'value',
      header: 'マッチ',
      className: 'font-mono',
      render: (row) =>
        row.value === '' ? <span className="text-muted">(空マッチ)</span> : row.value,
    },
    { key: 'pos', header: '位置', cellAlign: 'right', render: (row) => `${row.start}–${row.end}` },
    ...groupCols,
  ];

  return (
    <section aria-label="マッチテスト" className="space-y-3">
      <h2 className="body-emphasis text-default">マッチテスト</h2>

      {!regexValid ? (
        <p className="caption text-subtle">有効な正規表現を入力するとマッチを試せます。</p>
      ) : redosStatus === 'vulnerable' ? (
        <p className="text-warning caption">
          この正規表現は ReDoS のリスクがあるため、マッチ実行を無効化しています。上の ReDoS
          判定パネルに表示された攻撃文字列を参照してください。
        </p>
      ) : (
        <>
          <InputField
            id="regex-test-input"
            label="テスト文字列"
            value={testString}
            onChange={setTestString}
            placeholder="ここにマッチさせたい文字列を入力"
            hint={
              redosStatus === 'unknown'
                ? 'ReDoS 判定不能のため自動実行しません。下のボタンで実行してください。'
                : undefined
            }
            multiline
            rows={4}
            mono
            maxLength={SAFE_MAXLENGTH}
          />

          {redosStatus === 'unknown' && !forceUnknown && (
            <ActionButton onClick={() => setForceUnknown(true)} variant="secondary">
              マッチを実行（先頭 {UNKNOWN_CAP} 文字まで）
            </ActionButton>
          )}

          {match.isPending && <p className="caption text-subtle">マッチ実行中…</p>}

          {!match.isPending && result && (
            <div className="space-y-2" aria-live="polite">
              {result.truncated && (
                <p className="caption text-warning">
                  入力が長いため先頭 {UNKNOWN_CAP} 文字だけで実行しました。
                </p>
              )}
              <div className="rounded-lg border border-default p-3 font-mono caption whitespace-pre-wrap break-all">
                {matches.length > 0 ? (
                  highlight(shownText, matches, selectedIndex, setSelected)
                ) : (
                  <span className="text-subtle">マッチしませんでした。</span>
                )}
              </div>

              {matches.length > 0 && (
                <>
                  <p className="caption text-subtle">
                    {matches.length} 件マッチ
                    {!flags.includes('g') && '（g フラグを付けると全マッチを表示します）'}
                  </p>
                  <ResultTable
                    rows={matches}
                    columns={columns}
                    getKey={(row) => `${row.start}-${row.end}-${row.value}`}
                    selectedIndex={selectedIndex}
                    onRowClick={(i) => setSelected(i)}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexMatchTester.test.tsx`
Expected: 全 PASS。

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/components/tools/RegexMatchTester.tsx src/components/tools/__tests__/RegexMatchTester.test.tsx
git commit -m "feat: マッチテストセクション RegexMatchTester を追加"
```

---

## Task 4: RegexVisualizer.tsx へ統合

**Files:**

- Modify: `src/components/tools/RegexVisualizer.tsx`
- Modify: `src/components/tools/__tests__/RegexVisualizer.test.tsx`

- [ ] **Step 1: import と clear nonce を追加**

`src/components/tools/RegexVisualizer.tsx` の import 群に追記:

```tsx
import { RegexMatchTester } from './RegexMatchTester';
```

`const [view, setView] = useState<'tree' | 'railroad'>('tree');` の直後に追記:

```tsx
// Clear 時に RegexMatchTester を remount してテスト文字列等の内部 state をリセットするための nonce
const [clearNonce, setClearNonce] = useState(0);
```

`handleClear` を更新:

```tsx
const handleClear = () => {
  setPattern('');
  setFlags('');
  setClearNonce((n) => n + 1);
};
```

- [ ] **Step 2: マッチセクションを ReDoS パネルの直下に挿入**

ReDoS 判定 `<section ...>...</section>`（`aria-label="ReDoS 判定"` のブロック）の閉じ `</section>` 直後、可視化 `<section aria-label="可視化">` の直前に挿入:

```tsx
{
  /* マッチテスト（ReDoS の直下・独立セクション） */
}
<RegexMatchTester
  key={clearNonce}
  pattern={pattern}
  flags={flags}
  redosStatus={redos?.status}
  regexValid={!analysis.error && !!ast}
/>;
```

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 4: 統合テストを追記**

`src/components/tools/__tests__/RegexVisualizer.test.tsx` の `describe` 内末尾に追記:

```tsx
it('安全な正規表現でテスト文字列を入力するとマッチが集計される', async () => {
  render(<RegexVisualizer />);
  setPattern('\\d+');
  // safe 判定の確定を待つ（動的 import + debounce 完了の目印）
  await screen.findByText(/安全/, undefined, FIND);
  fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'a1 b2' } });
  expect(await screen.findByText(/件マッチ/, undefined, FIND)).toBeTruthy();
});

it('脆弱な正規表現ではマッチ実行が無効化される', async () => {
  render(<RegexVisualizer />);
  setPattern('(a+)+$');
  await screen.findByText(/脆弱/, undefined, FIND);
  expect(await screen.findByText(/マッチ実行を無効化/, undefined, FIND)).toBeTruthy();
});
```

- [ ] **Step 5: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/RegexVisualizer.tsx src/components/tools/__tests__/RegexVisualizer.test.tsx
git commit -m "feat: 正規表現ビジュアライザにマッチテストセクションを統合"
```

---

## Task 5: E2E（本番 CSP 下）

**Files:** Modify `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: E2E ケースを追記**

`tests/e2e/regex-visualizer.spec.ts` の `test.describe('正規表現ビジュアライザ', () => {` 内末尾（最後の `test(...)` の後）に追記:

```ts
test('safe な正規表現でマッチが集計される（g なし=1件 + ヒント）', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('\\d+');
    await page.getByLabel('テスト文字列').fill('a1 b22 c333');
    await expect(page.getByText(/1 件マッチ/)).toBeVisible();
    await expect(page.getByText(/g フラグを付けると/)).toBeVisible();
  });
});

test('g フラグありで全マッチが集計される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('\\d+');
    await page.getByRole('button', { name: 'g: 全マッチ（グローバル）' }).click();
    await page.getByLabel('テスト文字列').fill('a1 b22 c333');
    await expect(page.getByText(/3 件マッチ/)).toBeVisible();
  });
});

test('vulnerable な正規表現ではマッチ実行が無効化される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('(a+)+$');
    await expect(page.getByText(/マッチ実行を無効化/)).toBeVisible();
  });
});
```

- [ ] **Step 2: E2E 実行（preview 経由）**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS。CSP 違反 0（`withProductionCsp` の `assertNoViolations`）。

> 4321 ポートが stale で謎 fail する場合は `npm run pretest:e2e`（または該当 pretest スクリプト）で kill してから再実行する。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test: マッチテストの E2E を本番 CSP 下で追加"
```

---

## Task 6: ドキュメント更新

**Files:** Modify `README.md` / `SPEC.md` / `src/data/tools.ts` / `docs/decisions.md`

- [ ] **Step 1: tools.ts の description を更新**

`src/data/tools.ts` の `regex-visualizer` エントリの `description` を差し替え:

```ts
    description:
      '正規表現を構造ツリー・鉄道図で可視化し、ReDoS 脆弱性を検出。テスト文字列に対するマッチ箇所のハイライトとキャプチャグループ表示も行います',
```

- [ ] **Step 2: README.md のツール一覧を更新**

`README.md:49` の行の説明を差し替え（マッチテストを追記）:

```md
| 正規表現ビジュアライザ＆ReDoS検出 | 正規表現を構造ツリー・鉄道図で可視化し、ReDoS（壊滅的バックトラッキング）脆弱性を検出。マッチテスト（ハイライト・キャプチャグループ表示）も対応 |
```

- [ ] **Step 3: SPEC.md を更新**

`SPEC.md:297` のツール一覧（No.19）の説明にマッチテストを追記:

```md
| 19 | 正規表現ビジュアライザ＆ReDoS検出 | `regex-visualizer` | 正規表現を AST ツリー・鉄道図で可視化し、ReDoS 脆弱性を検出。テスト文字列に対するマッチハイライトとキャプチャグループ表示に対応。JavaScript（ECMAScript）正規表現対応 |
```

`SPEC.md:190` のディレクトリ説明に `match.ts` を追記:

```md
        ├── regex-visualizer/   # 正規表現 AST 変換・ReDoS 判定・鉄道図レイアウト・マッチ実行（parse.ts / redos.ts / railroad-layout.ts / railroad.ts / match.ts / index.ts）
```

- [ ] **Step 4: decisions.md に追記**

`docs/decisions.md` の末尾（`## [090] ...` の節の後）に追記:

```md
## [091] 2026-05-28 — 正規表現ビジュアライザにマッチテスト機能を追加（PR3）

### 背景

regex-visualizer は PR1（AST + ReDoS）/ PR2（鉄道図）で構造可視化と脆弱性検出を提供してきた。設計時にスコープ外（将来 PR3 候補）としていたマッチテスト（regex101 風のテスト文字列マッチ・キャプチャグループ表示）を追加する。

### 決断

- **マッチ実行は native `RegExp`**: regexp-tree / recheck（CJS・動的 import 必須）と異なり、マッチは native `RegExp` で実行できる。CJS 非依存のため `match.ts` を import ゼロの純粋モジュールとして静的 import する（SSR 安全を維持）。
- **ReDoS 判定でマッチ実行をゲート**: native `RegExp` はメインスレッド同期実行で中断不可。Worker は導入しない（PR1 が CSP の blob Worker 制約で checkSync を選んだ経緯と整合）。判定が **safe=自動ライブマッチ / unknown=明示ボタン + 入力長キャップ（先頭 1000 文字）/ vulnerable=ライブマッチ無効化** とする。入力長キャップは指数時間バックトラッキングを防げない（数十文字でも凍る）ため、vulnerable は実行手段を提供しないのが唯一確実な凍結回避という判断。
- **g フラグ忠実**: g なし=最初の1件のみ、g あり=全マッチ。学習・可視化ツールとして実際の挙動をそのまま見せる（regex101 の「常に全マッチ」とは異なる）。g なし時は「g で全マッチ」のヒントを表示。
- **相互強調はクリック選択**: ハイライト span / 表行クリックで選択し相互強調。ResultTable 内蔵のキーボード操作（Enter/Space）を活かし、hover のみのキーボード非対応を避けた。

### 却下した選択肢

- **Web Worker + タイムアウト**: vulnerable を確実に中断できるが、static worker ファイル + Astro バンドル + 本番 CSP 下 E2E 検証のコストが PR の本筋に対して過大。
- **入力長キャップのみ（常時自動実行）**: 指数時間バックトラッキングは入力長に対し指数的で、長さ制限だけでは凍結を防げない。
- **置換プレビュー（substitution）**: 今回スコープ外（YAGNI）。将来候補。

### 結果・トレードオフ

- vulnerable な正規表現は「短い安全な入力で試す」ことができない（マッチ実行自体を無効化）。誠実な凍結回避を優先したトレードオフ。攻撃文字列は ReDoS パネルに表示済みのためそちらを案内する。
- グループ名解決は pattern を自前走査する `groupNames`（エスケープ・文字クラス・非キャプチャ・先読み/後読みを考慮）で行い、regexp-tree への依存を避けた。
```

- [ ] **Step 5: 整形 & Commit**

```bash
npm run format
git add README.md SPEC.md src/data/tools.ts docs/decisions.md
git commit -m "docs: マッチテスト追加に伴うドキュメント更新"
```

---

## Task 7: 最終検証（push 前必須）

- [ ] **Step 1: unit テスト全実行（集計行を確認）**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files ... passed` / `Tests ... passed`（fail 0）。集計行を必ず確認する（Duration 行だけで判断しない）。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 3: E2E 全実行**

Run: `npm run test:e2e`
Expected: 全 PASS。

- [ ] **Step 4: UI 目視（PC 1280x800 / スマホ 390x844）**

Playwright MCP で以下を撮影し目視確認（`.agents/rules/common.md` 7 章）。撮影前に SW unregister + caches.delete + localStorage.clear → リロード（[[playwright-cache-clear]]）。

- safe（例 `(\w+)@(\w+)` × `a@x b@y`、g あり）: 全マッチ交互色ハイライト + グループ表、行/span クリックで相互強調
- g なし: 1件のみ + g ヒント
- vulnerable（`(a+)+$`）: マッチ無効化メッセージ
- unknown（recheck が判定保留する複雑な regex）: ボタン表示 → 押下で実行
- レスポンシブ: 表が overflow-x で破綻しないこと

> push / PR は `develop` ベース（`gh pr create --base develop`）。VRT baseline はマッチセクション追加で変わるため、CI Linux runner で `Update Visual Regression Baseline` workflow を**承認を得てから** dispatch して更新する（ローカル mac 生成不可）。

---

## Self-Review（計画 vs スペック）

- **スコープ（標準）**: マッチハイライト = Task 3（`highlight`）✅ / キャプチャグループ表 = Task 3（`ResultTable`）✅ / マッチ詳細（位置・名前付き・件数）= Task 3 columns ✅ / 置換は不実装（スコープ外）✅
- **ReDoS ゲート（spec 6）**: safe=自動 / unknown=ボタン+`UNKNOWN_CAP` / vulnerable=無効 = Task 3 `shouldRun` + 分岐 ✅。陽性確認（vulnerable で実行されない）= Task 3 test ✅
- **g 忠実（spec 2）**: `runMatch` の `flags.includes('g')` 分岐 = Task 1 ✅ / g なしヒント = Task 3 ✅
- **配置（spec 5）**: ReDoS 直下に独立セクション = Task 4 Step 2 ✅
- **モジュール（spec 3）**: `match.ts` 純粋・静的 import・barrel re-export = Task 1 ✅
- **エッジケース（spec 7）**: 空マッチ guard = Task 1 test + 実装 ✅ / マッチなし・空入力・グループ undefined = Task 3 分岐 + Task 1 test ✅ / グループ位置は `.index`（マッチ全体）✅（per-group 位置は d フラグ前提のため非実装＝スコープ通り）
- **XSS（規約 9.5）**: `dangerouslySetInnerHTML` 不使用、React 要素配列で組み立て = Task 3 `highlight` ✅
- **テスト（spec 8）**: unit（match.ts）= Task 1 / component = Task 3 / 統合 = Task 4 / E2E 本番 CSP = Task 5 / VRT 登録済み ✅
- **ドキュメント（spec 9）**: README / SPEC / tools.ts / decisions[091] = Task 6 ✅
- **型整合**: `MatchResult` / `RegexMatch` / `CaptureGroup`（match.ts）を index.ts で re-export し RegexMatchTester で一貫使用。`RedosStatus` は既存 export を再利用 ✅
- **placeholder スキャン**: TODO/TBD なし。各コード step に実コードあり ✅
