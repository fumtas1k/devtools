# クリップボードインスペクタ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `paste` / drop の DataTransfer 全 MIME フレーバー（テキスト・HTML・カスタム型・ファイル）を可視化するツール `clipboard-inspector` を追加する。

**Architecture:** 純ロジック（DataTransfer スナップショット化・許可リスト HTML サニタイザ）を `src/utils/` に分離し、React コンポーネント（`src/components/tools/ClipboardInspector.tsx`）が表示を担う。HTML プレビューはサニタイズ＋ `sandbox=""` iframe の二重防御。

**Tech Stack:** React 19 / Astro / Vitest（unit）/ Playwright（E2E）。追加依存なし（DOMParser・Web API のみ）。

**Spec:** `docs/superpowers/specs/2026-06-12-clipboard-inspector-design.md`

**前提:** ブランチ `feat/clipboard-inspector` 上で作業。コミットメッセージは Conventional Commits 日本語必須。コミット時に pre-commit hook が Prettier / astro check を走らせるため、fail したら `npx prettier --write <file>` で整形して再コミット。

---

## File Structure

| ファイル                                                        | 操作   | 責務                                      |
| --------------------------------------------------------------- | ------ | ----------------------------------------- |
| `src/utils/sanitizeHtml.ts`                                     | Create | 許可リスト方式 HTML サニタイザ            |
| `src/utils/__tests__/sanitizeHtml.test.ts`                      | Create | サニタイザの陽性対照＋陰性対照テスト      |
| `src/utils/dataTransferSnapshot.ts`                             | Create | DataTransfer → スナップショット構造体変換 |
| `src/utils/__tests__/dataTransferSnapshot.test.ts`              | Create | スナップショット変換のユニットテスト      |
| `src/components/tools/ClipboardInspector.tsx`                   | Create | ツール UI 本体                            |
| `src/components/tools/__tests__/ClipboardInspector.test.tsx`    | Create | コンポーネントのユニットテスト            |
| `src/pages/tools/clipboard-inspector.astro`                     | Create | ルーティングページ                        |
| `src/data/tools.ts`                                             | Modify | ツール登録（toolEntries 配列末尾に追加）  |
| `tests/e2e/clipboard-inspector.spec.ts`                         | Create | E2E テスト                                |
| `tests/e2e/visual-regression-pages.ts`                          | Modify | VRT 対象に追加                            |
| `README.md` / `SPEC.md` / `docs/tools.md` / `docs/decisions.md` | Modify | ドキュメント更新                          |

---

### Task 1: HTML サニタイザ（`sanitizeHtml`）

許可リスト方式。**検知・ガード機構のため test-gates ルールに従い陽性対照テスト必須**（陽性対照と陰性対照は別 describe に分離する）。

**Files:**

- Create: `src/utils/sanitizeHtml.ts`
- Test: `src/utils/__tests__/sanitizeHtml.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/sanitizeHtml.test.ts` を以下の内容で作成:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

// ─────────────────────────────────────────────────────────────
// 陽性対照: 危険なペイロードが実際に除去されることの証明
// （陰性対照のみでは「除去能力ゼロで green」と区別できない）
// ─────────────────────────────────────────────────────────────
describe('sanitizeHtml — 陽性対照（危険要素・属性の除去）', () => {
  it('script 要素を中身ごと除去する', () => {
    const out = sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
  });

  it('大文字小文字を混ぜた SCRIPT も除去する', () => {
    const out = sanitizeHtml('<ScRiPt>alert(1)</ScRiPt><p>x</p>');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>x</p>');
  });

  it('on* イベントハンドラ属性を除去する', () => {
    const out = sanitizeHtml('<img src="https://example.com/a.png" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('javascript: URL の href を除去する', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('link');
  });

  it('大文字混じり JAVASCRIPT: URL も除去する', () => {
    const out = sanitizeHtml('<a href="JaVaScRiPt:alert(1)">link</a>');
    expect(out).not.toContain('alert(1)');
  });

  it('iframe を中身ごと除去する', () => {
    const out = sanitizeHtml('<iframe src="https://evil.example.com"></iframe><p>x</p>');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<p>x</p>');
  });

  it('svg（onload 持ち込み経路）を中身ごと除去する', () => {
    const out = sanitizeHtml('<svg onload="alert(1)"><circle r="1"/></svg><p>x</p>');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('alert(1)');
  });

  it('img src の data:text/html を除去する（data は image/ のみ許可）', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(out).not.toContain('data:text/html');
  });

  it('style 属性を除去する（本番 CSP style-src strict 違反の発生源を断つ）', () => {
    const out = sanitizeHtml('<p style="color:red">x</p>');
    expect(out).not.toContain('style=');
    expect(out).toContain('x');
  });

  it('style 要素を中身ごと除去する', () => {
    const out = sanitizeHtml('<style>body{display:none}</style><p>x</p>');
    expect(out).not.toContain('display:none');
  });

  it('form / input を除去する', () => {
    const out = sanitizeHtml(
      '<form action="https://evil.example.com"><input name="a"></form><p>x</p>'
    );
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('HTML コメントを除去する（Word 由来の断片マーカー等）', () => {
    const out = sanitizeHtml('<p>x</p><!-- secret -->');
    expect(out).not.toContain('secret');
  });
});

// ─────────────────────────────────────────────────────────────
// 陰性対照: 安全な HTML が保持されること
// ─────────────────────────────────────────────────────────────
describe('sanitizeHtml — 陰性対照（安全な HTML の保持）', () => {
  it('基本的な書式タグを保持する', () => {
    const input = '<p><strong>太字</strong>と<em>斜体</em></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('テーブル構造を保持する', () => {
    const input = '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('https リンクと画像を保持する', () => {
    const out = sanitizeHtml(
      '<a href="https://example.com/">link</a><img src="https://example.com/a.png" alt="x">'
    );
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('alt="x"');
  });

  it('data:image/ の img src を保持する', () => {
    const input = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="dot">';
    expect(sanitizeHtml(input)).toContain('data:image/png;base64');
  });

  it('許可リスト外の無害タグは unwrap して子要素を残す', () => {
    const out = sanitizeHtml('<article><p>本文</p></article>');
    expect(out).not.toContain('<article');
    expect(out).toContain('<p>本文</p>');
  });

  it('テキストノードを保持する', () => {
    expect(sanitizeHtml('plain text')).toBe('plain text');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/utils/__tests__/sanitizeHtml.test.ts`
Expected: FAIL（`sanitizeHtml` モジュール不在）

- [ ] **Step 3: 実装を書く**

`src/utils/sanitizeHtml.ts` を以下の内容で作成:

```ts
/**
 * クリップボード由来 HTML の許可リスト方式サニタイザ。
 *
 * 防御は二重構造（本サニタイザでの除去 ＋ 表示側の sandbox iframe）であり、
 * ここでの見落としが直ちにスクリプト実行に繋がらない設計だが、
 * 拒否リストではなく許可リスト方式で堅く守る。
 *
 * style 属性 / style 要素は本番 CSP（style-src strict, unsafe-inline なし）で
 * srcdoc iframe にも違反として継承されるため許可しない。
 */

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** 子要素ごと丸ごと削除する要素（実行可能・埋め込み・メタ・フォーム系） */
const DROP_WITH_CHILDREN = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'noscript',
  'template',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'dialog',
  'slot',
]);

/** 全要素共通の属性許可リスト。href / src は別途 URL 検証を行う */
const ALLOWED_ATTRS = new Set([
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'start',
  'reversed',
  'dir',
  'lang',
]);

function isSafeUrl(value: string, opts: { allowDataImage?: boolean } = {}): boolean {
  let url: URL;
  try {
    // 相対 URL はダミー base で解決される（srcdoc 内では親 origin 基準になり無害）
    url = new URL(value.trim(), 'https://sandbox.invalid/');
  } catch {
    return false;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
    return true;
  }
  if (opts.allowDataImage && url.protocol === 'data:') {
    return /^image\//i.test(url.pathname);
  }
  return false;
}

function sanitizeAttributes(el: Element, tag: string): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' && (tag !== 'a' || !isSafeUrl(attr.value))) {
      el.removeAttribute(attr.name);
    } else if (
      name === 'src' &&
      (tag !== 'img' || !isSafeUrl(attr.value, { allowDataImage: true }))
    ) {
      el.removeAttribute(attr.name);
    }
  }
}

function sanitizeNode(root: Element): void {
  // 走査中に付け替え・削除を行うため childNodes は配列化してから処理する
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue; // テキストノードは保持
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CHILDREN.has(tag)) {
      el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // 許可リスト外の無害タグは unwrap（子要素のみ残す）。先に子を処理してから展開
      sanitizeNode(el);
      el.replaceWith(...el.childNodes);
      continue;
    }
    sanitizeAttributes(el, tag);
    sanitizeNode(el);
  }
}

/** HTML 文字列をサニタイズして安全な HTML 文字列を返す */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/__tests__/sanitizeHtml.test.ts`
Expected: PASS（全 18 テスト）

- [ ] **Step 5: コミット**

```bash
git add src/utils/sanitizeHtml.ts src/utils/__tests__/sanitizeHtml.test.ts
git commit -m "feat: 許可リスト方式 HTML サニタイザを追加（陽性対照テスト同梱）"
```

---

### Task 2: DataTransfer スナップショット（`dataTransferSnapshot`）

**Files:**

- Create: `src/utils/dataTransferSnapshot.ts`
- Test: `src/utils/__tests__/dataTransferSnapshot.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/dataTransferSnapshot.test.ts` を以下の内容で作成（node 環境で動く。File は Node 22 のグローバル）:

```ts
import { describe, it, expect } from 'vitest';
import { snapshotDataTransfer } from '@/utils/dataTransferSnapshot';

/** getAsString のコールバック API を再現するモック item */
function mockStringItem(type: string, content: string): DataTransferItem {
  return {
    kind: 'string',
    type,
    getAsString: (cb: ((data: string) => void) | null) => {
      // 実ブラウザ同様、非同期にコールバックされる
      if (cb) setTimeout(() => cb(content), 0);
    },
    getAsFile: () => null,
  } as unknown as DataTransferItem;
}

function mockFileItem(file: File): DataTransferItem {
  return {
    kind: 'file',
    type: file.type,
    getAsString: (cb: ((data: string) => void) | null) => {
      if (cb) setTimeout(() => cb(''), 0);
    },
    getAsFile: () => file,
  } as unknown as DataTransferItem;
}

function mockDataTransfer(items: DataTransferItem[]): DataTransfer {
  const list = Object.assign([...items], { length: items.length });
  return { items: list } as unknown as DataTransfer;
}

describe('snapshotDataTransfer', () => {
  it('string item を type / content / byteSize 付きで収集する', async () => {
    const dt = mockDataTransfer([mockStringItem('text/plain', 'あいう')]);
    const snap = await snapshotDataTransfer(dt, 'paste');
    expect(snap.source).toBe('paste');
    expect(snap.strings).toEqual([
      { type: 'text/plain', content: 'あいう', byteSize: 9 }, // UTF-8 で 3 バイト × 3 文字
    ]);
    expect(snap.files).toEqual([]);
  });

  it('複数の string item の順序を保持する', async () => {
    const dt = mockDataTransfer([
      mockStringItem('text/plain', 'plain'),
      mockStringItem('text/html', '<p>html</p>'),
      mockStringItem('application/x-custom', 'custom'),
    ]);
    const snap = await snapshotDataTransfer(dt, 'paste');
    expect(snap.strings.map((s) => s.type)).toEqual([
      'text/plain',
      'text/html',
      'application/x-custom',
    ]);
  });

  it('file item をメタデータ付きで収集する', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'test.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });
    const dt = mockDataTransfer([mockFileItem(file)]);
    const snap = await snapshotDataTransfer(dt, 'drop');
    expect(snap.source).toBe('drop');
    expect(snap.files).toHaveLength(1);
    expect(snap.files[0]).toMatchObject({
      type: 'image/png',
      name: 'test.png',
      size: 3,
      lastModified: 1700000000000,
    });
    expect(snap.files[0].file).toBe(file);
  });

  it('string と file の混在を扱える', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    const dt = mockDataTransfer([mockStringItem('text/plain', 'text'), mockFileItem(file)]);
    const snap = await snapshotDataTransfer(dt, 'drop');
    expect(snap.strings).toHaveLength(1);
    expect(snap.files).toHaveLength(1);
  });

  it('空の DataTransfer は空のスナップショットになる', async () => {
    const snap = await snapshotDataTransfer(mockDataTransfer([]), 'paste');
    expect(snap.strings).toEqual([]);
    expect(snap.files).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/utils/__tests__/dataTransferSnapshot.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装を書く**

`src/utils/dataTransferSnapshot.ts` を以下の内容で作成:

```ts
/**
 * DataTransfer（paste / drop イベント）の全フレーバーをスナップショット化する。
 *
 * DataTransferItemList はイベントハンドラの同期実行中しかアクセスできない
 * （ハンドラ終了後は項目が無効化される）ため、getAsString / getAsFile の
 * 呼び出しは本関数の同期パスで全件発行し、結果の解決のみを await する。
 * イベントハンドラからは同期的に本関数を呼ぶこと。
 */

export type CaptureSource = 'paste' | 'drop';

export interface StringFlavor {
  type: string;
  content: string;
  /** UTF-8 バイト長 */
  byteSize: number;
}

export interface FileFlavor {
  type: string;
  name: string;
  size: number;
  lastModified: number;
  file: File;
}

export interface DataTransferSnapshot {
  source: CaptureSource;
  strings: StringFlavor[];
  files: FileFlavor[];
}

export function snapshotDataTransfer(
  dt: DataTransfer,
  source: CaptureSource
): Promise<DataTransferSnapshot> {
  const stringPromises: Promise<StringFlavor>[] = [];
  const files: FileFlavor[] = [];

  // DataTransferItemList の iterable 実装はブラウザ差があるため index アクセスで走査
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind === 'string') {
      const type = item.type;
      stringPromises.push(
        new Promise((resolve) => {
          item.getAsString((content) => {
            resolve({
              type,
              content,
              byteSize: new TextEncoder().encode(content).length,
            });
          });
        })
      );
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        files.push({
          type: file.type,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          file,
        });
      }
    }
  }

  return Promise.all(stringPromises).then((strings) => ({ source, strings, files }));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/__tests__/dataTransferSnapshot.test.ts`
Expected: PASS（全 5 テスト）

- [ ] **Step 5: コミット**

```bash
git add src/utils/dataTransferSnapshot.ts src/utils/__tests__/dataTransferSnapshot.test.ts
git commit -m "feat: DataTransfer スナップショット変換ユーティリティを追加"
```

---

### Task 3: ツール登録・UI コンポーネント・ページ

**Files:**

- Modify: `src/data/tools.ts`（`toolEntries` 配列の末尾、`secret-scrubber` エントリの後に追加）
- Create: `src/components/tools/ClipboardInspector.tsx`
- Create: `src/pages/tools/clipboard-inspector.astro`
- Test: `src/components/tools/__tests__/ClipboardInspector.test.tsx`

- [ ] **Step 1: tools.ts にエントリ追加**

`src/data/tools.ts` の `toolEntries` 配列末尾（secret-scrubber エントリの `},` の後）に追加:

```ts
  {
    slug: 'clipboard-inspector',
    name: 'クリップボードインスペクタ',
    description:
      '貼り付け・ドラッグ&ドロップしたデータの全 MIME フレーバー（テキスト・HTML・画像・ファイル）と中身を可視化します。HTML はサニタイズ後プレビュー付き',
    category: 'convert',
    yomi: 'くりっぷぼーどいんすぺくた',
  },
```

- [ ] **Step 2: 失敗するコンポーネントテストを書く**

`src/components/tools/__tests__/ClipboardInspector.test.tsx` を以下の内容で作成:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipboardInspectorTool } from '@/components/tools/ClipboardInspector';

afterEach(() => {
  cleanup();
});

/** jsdom には DataTransfer がないため、コンポーネントが参照する範囲のみモック */
function mockClipboardData(flavors: Record<string, string>): DataTransfer {
  const items = Object.entries(flavors).map(([type, content]) => ({
    kind: 'string',
    type,
    getAsString: (cb: ((data: string) => void) | null) => {
      if (cb) setTimeout(() => cb(content), 0);
    },
    getAsFile: () => null,
  }));
  return { items: Object.assign([...items], { length: items.length }) } as unknown as DataTransfer;
}

describe('ClipboardInspector — 初期表示', () => {
  it('貼り付け/ドロップ受付領域と SR 向け live region が常設される', () => {
    const { container } = render(<ClipboardInspectorTool />);
    expect(screen.getByText(/Ctrl\+V/)).toBeTruthy();
    const live = container.querySelector('[data-testid="clipboard-announcement"]');
    expect(live).not.toBeNull();
    expect(live!.getAttribute('role')).toBe('status');
    expect(live!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('ClipboardInspector — paste 捕捉', () => {
  it('text/plain と text/html のフレーバーカードを表示する', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({
        'text/plain': 'こんにちは',
        'text/html': '<p>こんにちは</p>',
      }),
    });
    await waitFor(() => {
      expect(screen.getByText('text/plain')).toBeTruthy();
      expect(screen.getByText('text/html')).toBeTruthy();
      expect(screen.getByText('こんにちは')).toBeTruthy();
    });
    // 経路バッジ
    expect(screen.getByText('貼り付け')).toBeTruthy();
  });

  it('text/html カードのプレビュー切替でサニタイズ済み srcdoc の iframe を表示する', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({
        'text/html': '<p>safe</p><script>alert(1)</script>',
      }),
    });
    await waitFor(() => expect(screen.getByText('text/html')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'サニタイズ後プレビュー' }));
    const iframe = await screen.findByTitle('サニタイズ後プレビュー');
    const srcdoc = iframe.getAttribute('srcdoc')!;
    expect(srcdoc).toContain('<p>safe</p>');
    expect(srcdoc).not.toContain('<script');
  });

  it('クリアボタンで結果をリセットする', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': 'abc' }),
    });
    await waitFor(() => expect(screen.getByText('text/plain')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.queryByText('text/plain')).toBeNull();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx vitest run src/components/tools/__tests__/ClipboardInspector.test.tsx`
Expected: FAIL（コンポーネント不在）

- [ ] **Step 4: コンポーネントを実装**

`src/components/tools/ClipboardInspector.tsx` を以下の内容で作成:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Section } from '@/components/ui/Section';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { downloadBlob } from '@/utils/download';
import { snapshotDataTransfer } from '@/utils/dataTransferSnapshot';
import type { CaptureSource, DataTransferSnapshot, FileFlavor } from '@/utils/dataTransferSnapshot';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

const SOURCE_LABEL: Record<CaptureSource, string> = {
  paste: '貼り付け',
  drop: 'ドロップ',
};

type HtmlView = 'source' | 'preview';

const HTML_VIEW_OPTIONS: { value: HtmlView; label: string }[] = [
  { value: 'source', label: '生ソース' },
  { value: 'preview', label: 'サニタイズ後プレビュー' },
];

/** フレーバー本文の共通 pre 表示 */
function FlavorPre({ content }: { content: string }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-subtle p-3 font-mono text-sm text-default">
      {content}
    </pre>
  );
}

function HtmlFlavorBody({
  html,
  view,
  onViewChange,
}: {
  html: string;
  view: HtmlView;
  onViewChange: (view: HtmlView) => void;
}) {
  return (
    <div className="space-y-3">
      <ToggleGroup
        options={HTML_VIEW_OPTIONS}
        value={view}
        onChange={onViewChange}
        ariaLabel="HTML の表示方法"
        size="sm"
        layout="wrap"
      />
      {view === 'source' ? (
        <FlavorPre content={html} />
      ) : (
        <div>
          {/* サニタイズ + sandbox（allow-scripts なし）の二重防御で描画する */}
          <iframe
            title="サニタイズ後プレビュー"
            sandbox=""
            srcDoc={sanitizeHtml(html)}
            className="h-64 w-full rounded-lg border border-default bg-default"
          />
          <p className="caption text-muted m-0 mt-2">
            スクリプト・危険な属性は除去済み。セキュリティポリシー（CSP）によりインラインスタイルは反映されず、構造とテキスト中心の表示になります。
          </p>
        </div>
      )}
    </div>
  );
}

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt={`${file.name} のプレビュー`}
      className="mt-3 max-h-64 max-w-full rounded-lg border border-default"
    />
  );
}

function FileFlavorCard({ entry }: { entry: FileFlavor }) {
  return (
    <Section
      title={<code className="font-mono">{entry.type || '(type 不明)'}</code>}
      headerSlot={
        <div className="flex flex-wrap items-center gap-2">
          <ChipLabel tone="neutral">ファイル</ChipLabel>
          <DownloadButton
            variant="secondary"
            label="ダウンロード"
            aria-label={`${entry.name} をダウンロード`}
            onClick={() => downloadBlob(entry.file, entry.name)}
          />
        </div>
      }
    >
      <dl className="caption m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">ファイル名</dt>
        <dd className="m-0 break-all font-mono">{entry.name}</dd>
        <dt className="text-muted">サイズ</dt>
        <dd className="m-0">{entry.size.toLocaleString('ja-JP')} バイト</dd>
        <dt className="text-muted">更新日時</dt>
        <dd className="m-0">{new Date(entry.lastModified).toLocaleString('ja-JP')}</dd>
      </dl>
      {entry.type.startsWith('image/') && <ImagePreview file={entry.file} />}
    </Section>
  );
}

export function ClipboardInspectorTool() {
  const [snapshot, setSnapshot] = useState<DataTransferSnapshot | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [htmlViews, setHtmlViews] = useState<Record<number, HtmlView>>({});

  const capture = useCallback((dt: DataTransfer | null, source: CaptureSource) => {
    if (!dt) return;
    // getAsString の発行はイベントハンドラの同期パスで行う必要がある
    // （ハンドラ終了後は DataTransferItemList が無効化されるため await を挟まない）
    void snapshotDataTransfer(dt, source).then((snap) => {
      setSnapshot(snap);
      setHtmlViews({});
    });
  }, []);

  // ページ内のどこで Cmd/Ctrl+V しても捕捉できるよう document に listener を張る
  // （本ページには他に貼り付け先となる入力欄がないため競合しない）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      capture(e.clipboardData, 'paste');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [capture]);

  const flavorCount = snapshot ? snapshot.strings.length + snapshot.files.length : 0;

  return (
    <div className="space-y-6">
      {/* 受付領域（paste は document 全体で捕捉、ここは案内と drop の的） */}
      <div
        data-testid="clipboard-drop-zone"
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          capture(e.dataTransfer, 'drop');
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        className={`rounded-xl border-2 border-dashed border-default p-8 text-center ${
          isDragOver ? 'bg-subtle' : ''
        }`}
      >
        <p className="body-emphasis text-default m-0">
          このページで Ctrl+V / Cmd+V で貼り付け、またはここにドラッグ&ドロップ
        </p>
        <p className="caption text-muted m-0 mt-2">
          クリップボード・ドラッグデータの内容はブラウザ内でのみ処理され、外部に送信されません
        </p>
      </div>

      {/* SR 向け捕捉アナウンス（常設 live region） */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="clipboard-announcement">
        {snapshot ? `${flavorCount} 件のフレーバーを捕捉しました` : ''}
      </p>

      {snapshot && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ChipLabel tone="info">{SOURCE_LABEL[snapshot.source]}</ChipLabel>
              <span className="caption text-muted leading-none">
                {flavorCount} 件のフレーバーを捕捉
              </span>
            </div>
            <ClearButton onClick={() => setSnapshot(null)} />
          </div>

          {flavorCount === 0 && (
            <p className="caption text-muted m-0">
              フレーバーが見つかりませんでした。コピー元によっては空の DataTransfer
              になることがあります。
            </p>
          )}

          {snapshot.strings.map((flavor, i) => (
            <Section
              key={`${flavor.type}-${i}`}
              title={<code className="font-mono">{flavor.type}</code>}
              headerSlot={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="caption text-muted leading-none">
                    {[...flavor.content].length.toLocaleString('ja-JP')} 文字 /{' '}
                    {flavor.byteSize.toLocaleString('ja-JP')} バイト
                  </span>
                  <CopyButton text={flavor.content} ariaLabel={`${flavor.type} の内容をコピー`} />
                </div>
              }
            >
              {flavor.type === 'text/html' ? (
                <HtmlFlavorBody
                  html={flavor.content}
                  view={htmlViews[i] ?? 'source'}
                  onViewChange={(v) => setHtmlViews((prev) => ({ ...prev, [i]: v }))}
                />
              ) : (
                <FlavorPre content={flavor.content} />
              )}
            </Section>
          ))}

          {snapshot.files.map((entry, i) => (
            <FileFlavorCard key={`${entry.name}-${i}`} entry={entry} />
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: コンポーネントテストが通ることを確認**

Run: `npx vitest run src/components/tools/__tests__/ClipboardInspector.test.tsx`
Expected: PASS（全 4 テスト）

- [ ] **Step 6: Astro ページを作成**

`src/pages/tools/clipboard-inspector.astro` を以下の内容で作成:

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { ClipboardInspectorTool } from '@/components/tools/ClipboardInspector';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'clipboard-inspector')!;
---

<ToolLayout tool={tool}>
  <ClipboardInspectorTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      貼り付け（Ctrl+V / Cmd+V）またはドラッグ&ドロップした瞬間の
      <code class="rounded px-1 font-mono bg-subtle text-sm">DataTransfer</code>
      を検査し、クリップボード上の全 MIME フレーバー（テキスト・HTML・カスタム型・画像・ファイル）の種別と中身を表示します。クリップボードの内容はブラウザ内でのみ処理され、外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">仕組み</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>paste / drop イベントの DataTransferItemList を列挙し、全フレーバーを取得</li>
      <li>
        text/html は許可リスト方式サニタイザでスクリプト・危険属性を除去したうえで、sandbox 属性付き
        iframe（スクリプト実行不許可）に描画する二重防御
      </li>
      <li>画像ファイルはブラウザ内 blob URL でプレビュー</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>リッチテキストエディタ開発で「貼り付けで何が来るか」を確認するデバッグ</li>
      <li>Excel / Word / ブラウザからのコピーが持つ HTML 構造の調査</li>
      <li>同じデータでも貼り付けとドロップでフレーバーがどう違うかの比較</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">制限事項</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>
        OS
        のクリップボードにあってもブラウザが公開しないフレーバー（独自アプリ形式等）は表示できません
      </li>
      <li>
        サニタイズ後プレビューはセキュリティポリシー（CSP）の制約によりインラインスタイルが反映されず、構造とテキスト中心の表示になります
      </li>
      <li>Async Clipboard API（ボタンクリックでの読み取り）には対応していません</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 7: 型チェックと開発サーバー確認**

```bash
node_modules/.bin/astro check
```

Expected: 0 errors

- [ ] **Step 8: コミット**

```bash
git add src/data/tools.ts src/components/tools/ClipboardInspector.tsx src/components/tools/__tests__/ClipboardInspector.test.tsx src/pages/tools/clipboard-inspector.astro
git commit -m "feat: クリップボードインスペクタを追加"
```

---

### Task 4: VRT 対象登録

**Files:**

- Modify: `tests/e2e/visual-regression-pages.ts`

- [ ] **Step 1: PAGES 配列に追加**

`tests/e2e/visual-regression-pages.ts` の `'/tools/secret-scrubber',` の次の行に追加:

```ts
  '/tools/clipboard-inspector',
```

- [ ] **Step 2: meta テスト（vrt-pages-coverage）を含む全ユニットテストが通ることを確認**

Run: `npm run test`
Expected: 集計行 `Test Files N passed` / `Tests M passed`（fail 0）。**集計行を必ず確認**（Duration 行だけ見て pass と判断しない）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/visual-regression-pages.ts
git commit -m "test: clipboard-inspector を VRT 対象ページに追加"
```

※ VRT baseline は PR マージ前に CI の `Update Visual Regression Baseline` workflow（workflow_dispatch）で生成する。**ローカル mac では実行しない**。workflow の実行はユーザー承認必須のため親エージェントが依頼する。

---

### Task 5: E2E テスト

**Files:**

- Create: `tests/e2e/clipboard-inspector.spec.ts`

- [ ] **Step 1: E2E テストを書く**

`tests/e2e/clipboard-inspector.spec.ts` を以下の内容で作成:

```ts
import { test, expect, type Page } from '@playwright/test';
import { waitForReactHydration, withProductionCsp } from './helpers';

const PAGE_PATH = '/tools/clipboard-inspector';

/**
 * 合成 ClipboardEvent をディスパッチして貼り付けを再現する。
 * Playwright にはクリップボードを直接操作する API がないため、
 * page.evaluate で DataTransfer を構築してイベントを発火する（入力シミュレーション用途）。
 */
async function dispatchPaste(page: Page, flavors: Record<string, string>): Promise<void> {
  await page.evaluate((flavorEntries) => {
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(flavorEntries)) {
      dt.setData(type, value);
    }
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
  }, flavors);
}

/** 合成 DragEvent（drop）でファイルドロップを再現する */
async function dispatchFileDrop(page: Page): Promise<void> {
  await page.evaluate(() => {
    // 1x1 透明 PNG
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'test.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const zone = document.querySelector('[data-testid="clipboard-drop-zone"]')!;
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
}

test.describe('クリップボードインスペクタ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_PATH);
    await waitForReactHydration(page);
  });

  test('貼り付けで text/plain と text/html のフレーバーカードが表示される', async ({ page }) => {
    await dispatchPaste(page, {
      'text/plain': 'プレーンテキスト',
      'text/html': '<p>リッチテキスト</p>',
    });
    await expect(page.getByText('text/plain', { exact: true })).toBeVisible();
    await expect(page.getByText('text/html', { exact: true })).toBeVisible();
    await expect(page.getByText('プレーンテキスト')).toBeVisible();
    await expect(page.getByText('貼り付け', { exact: true })).toBeVisible();
  });

  test('サニタイズ後プレビューで script が除去された srcdoc を表示する（陽性対照）', async ({
    page,
  }) => {
    await dispatchPaste(page, {
      'text/html': '<p>safe content</p><script>document.title="pwned"</script>',
    });
    await expect(page.getByText('text/html', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
    const iframe = page.getByTitle('サニタイズ後プレビュー');
    await expect(iframe).toBeVisible();
    const srcdoc = await iframe.getAttribute('srcdoc');
    expect(srcdoc).toContain('<p>safe content</p>');
    expect(srcdoc).not.toContain('<script');
    expect(srcdoc).not.toContain('pwned');
  });

  test('ファイルドロップでメタデータカードと drop バッジが表示される', async ({ page }) => {
    await dispatchFileDrop(page);
    await expect(page.getByText('image/png', { exact: true })).toBeVisible();
    await expect(page.getByText('test.png')).toBeVisible();
    await expect(page.getByText('ドロップ', { exact: true })).toBeVisible();
    // 画像プレビュー（blob URL）
    await expect(page.getByAltText('test.png のプレビュー')).toBeVisible();
  });

  test('クリアボタンで結果がリセットされる', async ({ page }) => {
    await dispatchPaste(page, { 'text/plain': 'abc' });
    await expect(page.getByText('text/plain', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByText('text/plain', { exact: true })).toBeHidden();
  });
});

test.describe('クリップボードインスペクタ — 本番 CSP', () => {
  test('本番 CSP 下で inline style 持ち HTML のプレビューを表示しても CSP 違反が発生しない（sanitizer が style を除去するため）', async ({
    browser,
  }) => {
    await withProductionCsp(browser, PAGE_PATH, async (page) => {
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/html', '<p style="color:red">styled</p>');
        document.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        );
      });
      await expect(page.getByText('text/html', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'サニタイズ後プレビュー' }).click();
      await expect(page.getByTitle('サニタイズ後プレビュー')).toBeVisible();
      // withProductionCsp が終端で assertNoViolations() を呼ぶ
    });
  });
});
```

- [ ] **Step 2: E2E テストを実行**

```bash
npm run pretest:e2e && npm run test:e2e -- clipboard-inspector.spec.ts
```

Expected: PASS（全 5 テスト）。fail した場合は `npm run pretest:e2e` で stale port を kill して再実行してから調査する

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/clipboard-inspector.spec.ts
git commit -m "test: クリップボードインスペクタの E2E テストを追加"
```

---

### Task 6: ドキュメント更新

**Files:**

- Modify: `README.md`（ツール一覧）
- Modify: `SPEC.md`（2.3 / 2.4 / 4 / 5 / 9 章）
- Modify: `docs/tools.md`
- Modify: `docs/decisions.md`

- [ ] **Step 1: README.md のツール一覧に追加**

既存ツールの行形式を確認し、同じ形式で追加する（secret-scrubber の行を参考に）。記載内容:

- 名前: クリップボードインスペクタ
- slug: `clipboard-inspector`
- 説明: 貼り付け・D&D したデータの全 MIME フレーバーと中身を可視化。HTML はサニタイズ後プレビュー付き

- [ ] **Step 2: SPEC.md を更新**

- 2.3 節（ライブラリ）: 追加依存なしのため変更不要（確認のみ）
- 2.4 節（ディレクトリ構成）: ツール一覧に `clipboard-inspector` 追記（既存形式に従う）
- 4 章・5 章: ツール一覧表に既存形式で追加
- 9 章: チェックリストに完了項目として追加

- [ ] **Step 3: docs/tools.md に技術解説を追加**

既存ツールのセクション形式に従い追加。内容の要点:

- **仕組み**: paste / drop イベントの `DataTransfer` を同期パスで列挙し（イベント終了後は無効化されるため）、`getAsString` を Promise 化して全フレーバーを収集
- **HTML プレビューの安全設計**: 許可リスト方式サニタイザ（script / iframe / on\* 属性 / javascript: URL / style を除去）＋ `sandbox=""` iframe srcdoc の二重防御
- **制限**: ブラウザが公開しないフレーバーは見えない。srcdoc iframe は親の CSP（style-src strict）を継承するためインラインスタイルは反映されない。Async Clipboard API 非対応

- [ ] **Step 4: docs/decisions.md に意思決定を追記**

末尾の最新エントリ番号を確認し、次番号で追加:

```markdown
## [NNN] clipboard-inspector: DOMPurify 不採用＝自作許可リストサニタイザ＋sandbox iframe 二重防御

- **決定**: text/html フレーバーのプレビューは、自作の許可リスト方式サニタイザで除去したうえで `sandbox=""`（allow-scripts なし）iframe の srcdoc に描画する。DOMPurify は導入しない。
- **理由**: sandbox iframe が第二防壁として存在するため、サニタイザの見落としが直ちにスクリプト実行に繋がらない。依存追加（約 20KB gzip）よりも依存ゼロの二重防御を選択。
- **補足**: style 属性 / style 要素もサニタイズ対象。srcdoc iframe は親ドキュメントの CSP（style-src strict）を継承するため、残しても CSP 違反ノイズになるだけで描画されない。サニタイザは検知・ガード機構として test-gates ルールに従い陽性対照テストを同梱（`src/utils/__tests__/sanitizeHtml.test.ts`）。
- 関連: spec `docs/superpowers/specs/2026-06-12-clipboard-inspector-design.md`
```

- [ ] **Step 5: コミット**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: クリップボードインスペクタのドキュメントを追加"
```

---

### Task 7: 全体検証

- [ ] **Step 1: ユニットテスト全件**

Run: `npm run test`
Expected: 集計行で fail 0（`Test Files N passed` / `Tests M passed` を必ず確認）

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 3: E2E 全件**

Run: `npm run pretest:e2e && npm run test:e2e`
Expected: 全件 PASS

- [ ] **Step 4: フォーマットチェック**

Run: `npm run format:check`
Expected: エラーなし（エラー時は `npm run format` 後に差分をコミット）

---

## 親エージェント側の作業（subagent スコープ外）

1. **実装レビュー**: superpowers:requesting-code-review で diff レビュー
2. **UI 実機確認**: Playwright MCP で PC (1280x800) / スマホ (390x844) のスクリーンショットを撮影（SW unregister + caches.delete + localStorage.clear 後）し、ユーザーの目視承認を得る
3. **push 前**: ローカルで unit / astro check / E2E を親が直接再実行して確認
4. **PR 作成**: `gh pr create --base develop --body-file /tmp/claude/pr_body.md`
5. **VRT baseline**: ユーザー承認を得てから `Update Visual Regression Baseline` workflow を dispatch
