# TOTP ランダム生成 連打 re-announce テスト補強 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `TotpHotpGenerator` の「ランダム生成」連打時に announce span が unmount→remount され再 announce される挙動を RTL component test で守る（dance を 1 行に退行させたら fail する陽性対照を備える）。

**Architecture:** 既存の定数のみのテストファイルを `.ts` → `.tsx` にリネームし RTL render を導入。`requestAnimationFrame` を蓄積式 stub にして決定論的にフレームを flush。TOTP の async crypto tick を避けるため `@/utils/totp-hotp` の `totp`/`hotp` のみ部分モック。実装（dance）は変更しない。

**Tech Stack:** Vitest 4 / @testing-library/react 16 / jsdom 26 / React 19

---

## File Structure

- `src/components/tools/__tests__/TotpHotpGenerator.test.ts` → **rename** to `.tsx`
  - 責務: `TotpHotpGenerator` の定数テスト（既存）＋ 連打 re-announce の RTL test（新規）
- `src/components/tools/TotpHotpGenerator.tsx` — **変更しない**（テスト対象、検証時に一時退行させるのみ）

---

## Task 1: テストファイルを .tsx 化し既存テストを維持

**Files:**

- Rename: `src/components/tools/__tests__/TotpHotpGenerator.test.ts` → `src/components/tools/__tests__/TotpHotpGenerator.test.tsx`

- [ ] **Step 1: git mv でリネーム**

```bash
git mv src/components/tools/__tests__/TotpHotpGenerator.test.ts src/components/tools/__tests__/TotpHotpGenerator.test.tsx
```

- [ ] **Step 2: 既存テストがそのまま通ることを確認**

Run: `npm run test -- src/components/tools/__tests__/TotpHotpGenerator.test.tsx`
Expected: PASS（既存 7 ケースが全て通る。リネームのみで内容未変更）

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/__tests__/TotpHotpGenerator.test.tsx
git commit -m "test: TotpHotpGenerator テストを .tsx へリネーム (#538)"
```

---

## Task 2: 連打 re-announce の RTL テストを追加

**Files:**

- Modify: `src/components/tools/__tests__/TotpHotpGenerator.test.tsx`

- [ ] **Step 1: ファイル全体を以下に書き換える（既存定数テスト維持 + RTL ブロック追加）**

ファイル先頭に `// @vitest-environment jsdom` を置く。`@/utils/totp-hotp` を部分モックし `totp`/`hotp` のみダミー化（`generateRandomBase32Secret`・`base32Decode`・`totp`(定数テストで使う) は実物が必要だが、定数テストの `totp` 呼び出しはモックされたものになる点に注意 → 定数テストの `totp` 利用箇所はモック値 `'000000'` を返すため `toHaveLength(DEFAULTS.digits)` が壊れる）。

> **重要な設計判断:** 既存の `DEFAULTS でサンプル secret を使って totp を生成できる` テストは **実物の `totp`** を必要とする。一方 RTL テストは tick の async crypto を避けるためモックしたい。両立のため、モックは **RTL テストを含む `describe` ブロック内で `vi.mock` ではなく `vi.spyOn` を使い、`beforeEach`/`afterEach` でローカルに差し替える**方式は hoisting の都合で不可。代わりに **ファイル全体で `vi.mock` し、定数テストの「totp 生成」ケースだけ `vi.importActual` で実物を取得して使う**方式を採る。

ファイル全体を次の内容にする:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { SAMPLE_SECRET_BASE32, DEFAULTS, TotpHotpGeneratorTool } from '../TotpHotpGenerator';
import { base32Decode } from '@/utils/totp-hotp';

// TOTP の setInterval tick が async crypto (crypto.subtle) を叩いて RTL テストを汚すのを避けるため、
// totp / hotp のみダミー化する。generateRandomBase32Secret / base32Decode は同期 (getRandomValues /
// 純計算) で crypto.subtle 非依存なので実物を維持する。
vi.mock('@/utils/totp-hotp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/totp-hotp')>();
  return {
    ...actual,
    totp: vi.fn(async () => '000000'),
    hotp: vi.fn(async () => '000000'),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SAMPLE_SECRET_BASE32', () => {
  it('有効な Base32 文字列である（デコード時に throw しない）', () => {
    expect(() => base32Decode(SAMPLE_SECRET_BASE32)).not.toThrow();
  });

  // 陽性対照: RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) を満たすか検証。
  // ツール自身が「ランダム生成は 160 bit」と謳いつつ、サンプルだけ短い (90 bit 等) に
  // 戻る silent regression を本テストが捕捉して fail させる。
  it('RFC 4226 §4 R6 強推奨の 160 bit (= 20 byte) 以上を満たす', () => {
    expect(base32Decode(SAMPLE_SECRET_BASE32).length).toBeGreaterThanOrEqual(20);
  });
});

describe('DEFAULTS', () => {
  it('アルゴリズムデフォルトは SHA-1（最も広くサポートされる）', () => {
    expect(DEFAULTS.algorithm).toBe('SHA-1');
  });

  it('桁数デフォルトは 6（RFC 4226 標準）', () => {
    expect(DEFAULTS.digits).toBe(6);
  });

  it('周期デフォルトは 30秒（RFC 6238 推奨）', () => {
    expect(DEFAULTS.period).toBe(30);
  });

  it('DEFAULTS でサンプル secret を使って totp を生成できる', async () => {
    // このケースは実物の totp が必要 (モックは固定 '000000' を返すため)。
    // importActual で実装を直接取得して検証する。
    const actual = await vi.importActual<typeof import('@/utils/totp-hotp')>('@/utils/totp-hotp');
    const secretBytes = actual.base32Decode(SAMPLE_SECRET_BASE32);
    const code = await actual.totp(secretBytes, { ...DEFAULTS, timestamp: 1234567890 * 1000 });
    expect(code).toHaveLength(DEFAULTS.digits);
    expect(/^\d+$/.test(code)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #538: ランダム生成 連打時の re-announce（unmount→remount dance）を守る陽性対照
// ─────────────────────────────────────────────────────────────────────────────
describe('TotpHotpGenerator — ランダム生成 連打の re-announce (#538)', () => {
  // requestAnimationFrame を蓄積式 stub にして決定論的に flush する。
  // 実装の dance は setRegenFlash(false) → rAF(() => setRegenFlash(true)) の順で、
  // 「flash 中の再 click で span が一旦 unmount され、次フレームで remount される」ことが要件。
  function setupRaf() {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    return () => {
      const pending = callbacks.splice(0);
      act(() => {
        pending.forEach((cb) => cb(0));
      });
    };
  }

  const ANNOUNCE = 'シークレットを再生成しました';
  const REGEN_LABEL = 'ランダム生成（新しいシークレット）';

  it('flash 表示中に再 click すると announce span が unmount→remount される', () => {
    const flushRaf = setupRaf();
    render(<TotpHotpGeneratorTool />);

    const regen = screen.getByRole('button', { name: REGEN_LABEL });

    // 1 回目: rAF flush 前は span 未 mount、flush 後に mount される
    act(() => {
      fireEvent.click(regen);
    });
    expect(screen.queryByText(ANNOUNCE)).toBeNull();
    flushRaf();
    const firstSpan = screen.getByText(ANNOUNCE);
    expect(firstSpan).toBeTruthy();

    // 2 回目（flash 表示中 = 1200ms setTimeout 前）: setRegenFlash(false) で span が一旦消える。
    // ← これが退行検知の要。1 行 setRegenFlash(true) 実装では span が消えずこの assert が fail する。
    act(() => {
      fireEvent.click(regen);
    });
    expect(screen.queryByText(ANNOUNCE)).toBeNull();

    // 次フレームで再 mount。同一ノードではなく remount されている = SR が再 announce する。
    flushRaf();
    const secondSpan = screen.getByText(ANNOUNCE);
    expect(secondSpan).toBeTruthy();
    expect(secondSpan).not.toBe(firstSpan);
  });
});
```

- [ ] **Step 2: テストが通ることを確認**

Run: `npm run test -- src/components/tools/__tests__/TotpHotpGenerator.test.tsx`
Expected: PASS（既存 7 ケース + 新規 1 ケース）

> もし TOTP tick の async setState による act 警告（`console.error`）が出る場合でもテスト自体は
> pass する（このプロジェクトの test-setup は console.error で fail させない）。ただし警告が出る場合は
> render 直後に `act(() => {})` を 1 回挟んで初期 tick の microtask を flush することで抑制できる。
> 警告が出ないなら不要。

- [ ] **Step 3: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0（新規 import / JSX に型エラーなし）

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/__tests__/TotpHotpGenerator.test.tsx
git commit -m "test: TOTP連打時のre-announce(unmount→remount)を守るテストを追加 (#538)"
```

---

## Task 3: 陽性対照の証跡（dance 退行で fail することを確認）

**Files:**

- Temporarily modify (then revert): `src/components/tools/TotpHotpGenerator.tsx:179-192`

- [ ] **Step 1: 実装の dance を一時的に 1 行へ退行させる**

`handleRegenerateSecret` の dance 部分を一時的に次へ置換（**この変更はコミットしない**）:

```tsx
const handleRegenerateSecret = () => {
  replaceSecret(generateRandomBase32Secret());
  setCounterStr('0');
  setRegenFlash(true);
};
```

- [ ] **Step 2: 追加テストが fail することを確認**

Run: `npm run test -- src/components/tools/__tests__/TotpHotpGenerator.test.tsx`
Expected: 新規ケース `flash 表示中に再 click すると announce span が unmount→remount される` が **FAIL**
（2 回目 click 後の `expect(screen.queryByText(ANNOUNCE)).toBeNull()` が、span が消えないため失敗する）。
これにより「dance を消すと検知できる」陽性対照が成立。

- [ ] **Step 3: 実装をきれいに戻す**

```bash
git restore src/components/tools/TotpHotpGenerator.tsx
git diff --stat src/components/tools/TotpHotpGenerator.tsx
```

Expected: diff なし（実装は元の dance のまま）。

- [ ] **Step 4: 退行を戻した状態でテストが再び pass することを確認**

Run: `npm run test -- src/components/tools/__tests__/TotpHotpGenerator.test.tsx`
Expected: PASS（全ケース）

---

## Task 4: 全体検証

- [ ] **Step 1: ユニットテスト全体**

Run: `npm run test`
Expected: 全 pass（既存テストへの回帰なし）。

- [ ] **Step 2: 型チェック全体**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 3: 整形チェック**

Run: `npm run format:check`
Expected: pass（必要なら `npm run format` で整形して再コミット）。

> **E2E について:** 本変更は test 追加のみで UI / ページに変更がないため E2E（`npm run test:e2e`）の
> 新規追加・実行は不要。VRT 対象ページの増減もないため baseline 再生成も不要。

---

## Self-Review メモ

- **Spec coverage:** spec の「対象ファイル」=Task1、「テスト戦略」=Task2、「核となる assertion」=Task2 Step1、
  「検証義務（陽性対照）」=Task3、`npm run test`/`astro check`=Task4 で全てカバー。
- **Placeholder scan:** TBD / TODO / 省略なし。全コードブロックは実コード。
- **Type consistency:** `ANNOUNCE` / `REGEN_LABEL` / `flushRaf` / `setupRaf` の命名は Task2 内で一貫。
  announce 文言・ボタン aria-label は実装（`TotpHotpGenerator.tsx:297, 325`）と一致。
- **既知の注意点:** `vi.mock` は hoisting される。定数テストの「totp 生成」ケースだけ実物が要るため
  `vi.importActual` で回避済み（Task2 Step1 に明記）。
