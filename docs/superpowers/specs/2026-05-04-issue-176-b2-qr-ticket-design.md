# #176 B 案 PR 2: `qr-ticket/*` inline style 撤去 設計書

**作成日**: 2026-05-04
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 2
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) 完了済み
**参照**: バッチ計画全体は memory `project_b_plan_progress.md` を SoT。PR 1 spec (`docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`) と PR 1.5 spec (`docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`) の命名規約・既存 `@layer components` 定義を継承。

---

## ゴール

`src/components/tools/qr-ticket/` 配下の 3 ファイル（`GenerateTab.tsx` / `VerifyTab.tsx` / `TicketDetail.tsx`、合計 42 件の `style={{` ヒット）から JSX inline style を完全撤去し、`@layer components` の class + Tailwind utility に置換する。

完了基準:

1. 対象 3 ファイルから `style={{` ヒット数 0、`element.style.X = Y` 形式の inline mutation 0
2. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 3 ファイルを追加（`GenerateTab.tsx` / `VerifyTab.tsx` / `TicketDetail.tsx`）して migration test pass
3. `src/styles/global.css` の `@layer components` に **本 PR で必要な class のみ** 追加（YAGNI 厳守、§3 参照）
4. **同梱 issue [#225](https://github.com/fumtas1k/devtools/issues/225) の対応**:
   - `useTicketKeyPair.ts` / `useTicketGeneration.ts` の戻り値を `useMemo` で安定化（`useQrCamera` と同じ pattern）
   - `useTicketVerification.ts` の `verify` 関数に専用 `AbortController` を持たせ、`useQrCamera.onQrDetected: verify` 経由で渡される signal にも `verify` 内 state 更新が abort される経路を確保
5. **VRT 検証**: `visual-regression.yml` で 36/36 baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger して baseline 更新
6. ローカル必須ゲート: push 前に `npm run test`（vitest）/ `npx astro check` / `npm run test:e2e` 全 green
7. `src/utils/styles.ts` 自体は **削除しない**（PR 6 で削除）。本 PR では `caption` / `bodyEmphasis` / `colors` の **import を削除**するだけ
8. `docs/ui-conventions.md` 追加更新は不要（PR 1 で原則出揃い）

非ゴール:

- `JwtDecoder` / `UuidV7Generator` (PR 3)、`Gs1Databar` / `EncodingConverter` / `DummyText` (PR 4)、`QrReader` / `ConfigConverter` / `JanCode` / `QrCode` / `UlidGenerator` (PR 5)、`flip + cleanup` (PR 6)
- `src/utils/styles.ts` 削除（PR 6）
- `_headers` の `style-src 'unsafe-inline'` 撤去（PR 6）
- `docs/decisions.md` 新規エントリ（PR 6 [067] で B 案完了として一括記録）
- 標準 textarea を `InputField` に置換するリファクタ（GenerateTab の秘密鍵 / 公開鍵表示用 textarea — 直接 class 化に留める。`InputField` への置換は label / hint 構造が周辺 layout と合わずスコープ外）

---

## なぜ独立 PR か（PR 1.5 と分離する理由）

| 観点                                       | 説明                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR サイズ規律**                          | qr-ticket 単独で 42 件の inline style + 同梱 issue + 同 hook 群への refactor。PR 1.5 と bundle すると review unit が肥大化（memory `feedback_pr_size.md`）。                                                                                                                                          |
| **VRT 影響面の独立性**                     | qr-ticket は `qr-ticket.astro` 単一 page で baseline に乗る。Ulid/UuidV7 (PR 1.5) と差分原因を切り分けやすい。                                                                                                                                                                                        |
| **同 hook ファイル群への refactor (#225)** | qr-ticket の 3 hook は他 PR スコープと重ならず、本 PR と同 PR でないと merge conflict を起こす。                                                                                                                                                                                                      |
| **新規 class の責務範囲**                  | 本 PR で新規追加するのは `text-error/success/primary` 等の token utility と `alert-success/error` / `qr-file-picker-label` / `badge-category` / `btn-row-remove` / `qr-result-grid` の 8 件。これらは qr-ticket 固有の利用が現状唯一 → 独立 PR で導入し、後続 PR (3-5) で類似要件が出れば再利用する。 |

memory 参照:

- `project_b_plan_progress.md`（バッチ全体 SoT）
- `feedback_pr_size.md`
- `feedback_infra_feature_separation.md`
- `feedback_subagent_verification_trust.md`（subagent 報告は親が直接検証）
- `feedback_commander_checklist.md`（PR 作成前の親チェック）
- `feedback_e2e_before_pr.md`（PR 作成前に E2E）

---

## #258 (`ClearButton` / `CopyButton` `type="button"` 追加) の取り扱い

memory `project_b_plan_progress.md` の "PR 2 着手前 prerequisite" セクションで **本 PR 着手前に必ず別 PR で閉じる** と規定済み。

**現状確認** (2026-05-04):

- `qr-ticket/GenerateTab.tsx` で `CopyButton` を 2 ヶ所利用（line 163 / 191）。`ClearButton` 利用なし
- 当該箇所を `<form>` で wrap する箇所は無い（grep 確認済）→ 現時点で submit 暴発 risk は **顕在化していない**
- ただし「将来 form 内に置く可能性」を memory が前提としており、防御的に PR 2 着手前に閉じる方針は妥当

**推奨ハンドリング**: `feedback_pr_size.md` に従い、`ui/ClearButton.tsx` / `ui/CopyButton.tsx` への 4 行修正を **本 PR とは別の超小型 PR** として先行 merge する。本 PR の scope (qr-ticket migration) と異なるディレクトリ・性質のため bundle 不適。

**所要時間**: 2 ファイル × 数行の修正 → 数分で別 PR 化可能。

---

## 採用する設計（ファイル別）

### 1. `TicketDetail.tsx` (3 件) — 最も単純

#### 1.1 内部 `style={{}}` の除去

| 現状                                                                                          | 移行先                                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `<table style={{ width: '100%', borderCollapse: 'collapse' }}>`                               | `className="w-full border-collapse"`                                                      |
| `<td>` ラベル列: `caption + muted + paddingRight: '1rem' + paddingBottom: '0.25rem' + nowrap` | `className="caption text-muted pr-4 pb-1 whitespace-nowrap"`                              |
| `<td>` 値列: `caption + text + 動的 mono`                                                     | `className={\`caption text-default \${MONO_LABELS.includes(label) ? 'font-mono' : ''}\`}` |

#### 1.2 import 整理

```ts
// Before
import { colors, caption } from '@/utils/styles';
// After (削除のみ — 残す import なし)
```

ただし `colors` / `caption` を utility 関数で参照していた依存が `TicketDetail.tsx` 内に他にないことを最終確認。確認後に import 行ごと削除。

---

### 2. `VerifyTab.tsx` (12 件)

#### 2.1 静的 class 化（小修正）

| 現状                                                                                  | 移行先                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `<p style={{ ...caption, color: colors.muted }}>` (4 ヶ所、line 85 / 113 / 143 / 167) | `className="caption text-muted"`                 |
| `<p style={{ ...caption, color: colors.errorText }}>` (line 199)                      | `className="caption text-error-text"` (新 class) |

#### 2.2 video 表示切替（line 91-103）

`display: cameraActive ? 'block' : 'none'` を `hidden` attribute + 静的 class へ:

```jsx
<video
  ref={camera.videoRef}
  playsInline
  muted
  className="w-full max-w-[400px] rounded-lg bg-black block"
  hidden={!camera.cameraActive}
  aria-label="カメラプレビュー"
/>
```

**根拠**: `hidden` HTML 属性は `display: none` 相当、`hidden={false}` 解除時は元の `display: block`（class）が効く。`bg-black` は Tailwind 標準（`#000`）。

#### 2.3 canvas 非表示（line 109）

```jsx
<canvas ref={camera.canvasRef} hidden aria-hidden="true" />
```

#### 2.4 file input 非表示（line 133）— a11y 配慮で `sr-only`

```jsx
<input
  type="file"
  accept="image/*"
  className="sr-only"
  onChange={onImageUpload}
  disabled={!verifyPubKeyStr.trim()}
  aria-label="画像を選択"
/>
```

**根拠**: `display: none` だと file input がキーボード focus 不能になる。`sr-only` (Tailwind 標準 utility = `position:absolute; width:1px; height:1px; clip:rect(0,0,0,0)` 等) は視覚非表示かつ a11y tree 残存。label が wrap しているので click/keyboard で input が活性化される pattern を維持。

#### 2.5 file picker label の動的 styling（line 117-127）

`verifyPubKeyStr.trim()` の真偽で 4 properties が変わる動的 `<label>`。`data-enabled` 属性 + 専用 class へ:

```jsx
<label
  data-enabled={Boolean(verifyPubKeyStr.trim())}
  className="caption font-semibold inline-block px-4 py-2 rounded-lg border qr-file-picker-label"
>
  画像を選択
  <input ... />
</label>
```

`.qr-file-picker-label` 定義 (§3 で追加):

```css
.qr-file-picker-label {
  background: var(--color-bg-surface);
  color: var(--color-muted);
  border-color: var(--color-border-input);
  cursor: not-allowed;
}
.qr-file-picker-label[data-enabled='true'] {
  background: var(--color-bg-subtle);
  color: var(--color-text);
  cursor: pointer;
}
```

**設計判断**: `data-enabled` を採用する理由は `aria-disabled` を `<label>` に付けても browser/AT の挙動が input 側に効かないため。ARIA は input 側 `disabled` で既に正しく表現されているので、視覚状態は別属性 (`data-*`) で表す。

#### 2.6 hint p 要素（line 139）

```jsx
// Before
<p style={{ fontSize: '0.75rem', color: colors.muted, marginTop: '0.25rem' }}>
// After
<p className="text-xs text-muted mt-1">
```

`text-xs` は Tailwind 標準（0.75rem）。fontSize のみ変更 — line-height は元未指定なので utility default で OK。

#### 2.7 検証結果ボックス（line 170-204）

`valid` / `expired` / 無効の 3 状態で bg + border + 内側テキスト色が切替。`alert-base` + variant pattern で表現:

```jsx
<div
  className={`rounded-lg p-4 border ${verificationResult.valid ? 'alert-success' : 'alert-error'}`}
>
  <p
    className={`body-emphasis ${verificationResult.valid ? 'text-success' : 'text-error'} ${
      verificationResult.ticket ? 'mb-3' : ''
    }`}
  >
    {/* ... */}
  </p>
  {verificationResult.error && !verificationResult.valid && (
    <p className="caption text-error-text">{verificationResult.error}</p>
  )}
</div>
```

`.alert-success` / `.alert-error` 定義 (§3):

```css
.alert-success {
  background: var(--color-success-bg);
  border-color: var(--color-success);
}
.alert-error {
  background: var(--color-error-bg);
  border-color: var(--color-error);
}
```

`marginBottom: verificationResult.ticket ? '0.75rem' : 0` の三項 → `${ticket ? 'mb-3' : ''}` の条件 className join に変換（`mb-3` = 0.75rem ✓）。

---

### 3. `GenerateTab.tsx` (27 件) — 最大ファイル

#### 3.1 import 整理ボタン (line 114-130) — 既存 `.btn-link-plain` 流用

PR 1.5 で `.btn-link-plain` が追加済（InputField サンプルボタン用）。この `<button>` も「テキストリンク風 button」と同パターン:

```jsx
<button
  type="button"
  onClick={onToggleImport}
  aria-expanded={showImport}
  aria-controls="qr-ticket-import-panel"
  className="caption text-link btn-link-plain"
>
  <span aria-hidden="true">{showImport ? '▲ ' : '▼ '}</span>
  {showImport ? '秘密鍵インポートを閉じる' : '既存の秘密鍵をインポート'}
</button>
```

`.btn-link-plain` (PR 1.5 既存):

```css
.btn-link-plain {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
```

`.text-link` は line 158 既存（`<a>` 用）。`<button>` でも color として再利用可。

#### 3.2 鍵 textarea 周辺（line 153-211、2 ブロック対称）

各ブロックは:

1. flex 行: `marginBottom: '0.5rem'` → `mb-2` (0.5rem ✓)
2. label span: `caption + bold + text-default` → `caption font-semibold text-default`
3. textarea: `caption + mono + width 100% + padding + radius + border-input + bg-surface + text-default + resize-none`

```jsx
<div>
  <div className="flex items-center justify-between mb-2">
    <span className="caption font-semibold text-default">秘密鍵（主催者が保管）</span>
    <CopyButton text={privateKeyJwkStr} label="コピー" />
  </div>
  <textarea
    readOnly
    value={privateKeyJwkStr}
    rows={4}
    className="caption font-mono w-full px-3 py-2 rounded-lg border border-input bg-surface text-default resize-none"
    aria-label="秘密鍵（主催者が保管）"
  />
</div>
```

公開鍵側も同パターン。

#### 3.3 expiry label (line 229-238)

```jsx
// After
<label htmlFor="expiry" className="body-emphasis text-default block mb-3">
  有効期限
</label>
```

`mb-3` = 0.75rem ✓。

#### 3.4 ヘッダ列 + モバイル label の caption span 群 (line 257-282 / 298-345)

`caption + muted + bold` の組み合わせが繰り返し。共通パターン:

```jsx
<span className="flex-1 min-w-0 caption text-muted font-semibold">チケットID</span>
<span className="md:hidden caption text-muted font-semibold leading-none">チケットID</span> {/* lineHeight: 1 → leading-none */}
<span className="w-15 text-right caption text-muted font-semibold">サイズ</span>
```

`leading-none` = `line-height: 1` ✓。

#### 3.5 動的 isOver coloring (line 348-355)

```jsx
<span
  className={`w-auto md:w-15 caption text-right ${isOver ? 'text-error font-semibold' : 'text-muted'}`}
  title="QRコードに埋め込まれる全データ（署名・時間含む）の合計バイト数"
>
  {byteSize} B
</span>
```

`fontWeight: isOver ? 600 : 400` → 真分岐 `font-semibold` (600 ✓)、偽分岐は default (400)。

#### 3.6 行削除ボタン (line 359-374)

40x40 アイコンボタン。`disabled` 状態で色とカーソルが切替:

```jsx
<button
  type="button"
  className="flex items-center justify-center caption min-w-10 min-h-10 p-3 btn-row-remove"
  onClick={() => onRemoveTicket(i)}
  disabled={tickets.length <= 1}
  aria-label={`行 ${i + 1} を削除`}
>
  <span aria-hidden="true">✕</span>
</button>
```

`.btn-row-remove` (§3 で追加):

```css
.btn-row-remove {
  background: transparent;
  border: 0;
  color: var(--color-error);
  cursor: pointer;
}
.btn-row-remove:disabled {
  color: var(--color-muted);
  cursor: not-allowed;
}
```

#### 3.7 marginTop / marginBottom error wrappers (line 397, 421)

```jsx
// line 397: marginTop: '0.75rem' → mt-3
<div className="mt-3">
  <ErrorMessage message={generateError} />
</div>
// line 421: marginBottom: '1rem' → mb-4
<div className="mb-4">
  <ErrorMessage message={zipError} />
</div>
```

#### 3.8 grid auto-fill (line 425-429)

`gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))'` を新 class `.qr-result-grid` に逃がす:

```jsx
<div className="gap-4 qr-result-grid">
```

```css
.qr-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
```

#### 3.9 QR card div (line 432-435)

```jsx
<div
  key={qr._key}
  className="flex flex-col items-center gap-2 rounded-lg p-3 border border-default bg-surface"
>
```

`border` は Tailwind 標準（1px solid currentColor）+ `.border-default` で color override。

#### 3.10 QR svg container 固定サイズ (line 438-440)

```jsx
<div
  data-testid="qr-code-container"
  className="w-40 h-40"
  dangerouslySetInnerHTML={{ __html: qr.svg }}
/>
```

`w-40` / `h-40` = 10rem = 160px ✓。

#### 3.11 ticket id span (line 442-449)

```jsx
<span className="caption font-mono font-semibold text-default">{qr.ticket.t}</span>
```

#### 3.12 ticket name span (line 452-453)

```jsx
<span className="caption text-muted">{qr.ticket.n}</span>
```

#### 3.13 category badge pill (line 456-463)

専用 class:

```jsx
<span className="caption badge-category">{qr.ticket.p}</span>
```

```css
.badge-category {
  display: inline-block;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  border-radius: 9999px;
  padding: 0.1rem 0.5rem;
}
```

**代替案**: 完全 utility 化 (`caption text-primary border border-primary rounded-full px-2 py-0.5`) も可能だが、`py-0.5` (0.125rem) ≠ original `0.1rem` で VRT 差分が出る恐れあり。**`0.1rem` を厳密に守るため新 class** を作る。

---

### 4. `useTicketKeyPair.ts` / `useTicketGeneration.ts` / `useTicketVerification.ts` (#225 同梱)

#### 4.1 戻り値の `useMemo` 化（観点 1）

**before** (`useTicketKeyPair.ts` 抜粋):

```ts
return {
  cryptoKeyPair,
  privateKeyJwkStr,
  // ... 他 props
  generateKeys,
  toggleImport,
  setImportStr,
  importKey,
};
```

**after**:

```ts
return useMemo(
  () => ({
    cryptoKeyPair,
    privateKeyJwkStr,
    // ... 他 props
    generateKeys,
    toggleImport,
    setImportStr,
    importKey,
  }),
  [
    cryptoKeyPair,
    privateKeyJwkStr,
    /* ... 全 dep を列挙 */
  ]
);
```

`useTicketGeneration.ts` も同パターン。

**呼出側** (`QrTicket.tsx`): props オブジェクトリテラル `{ cryptoKeyPair: keyPair.cryptoKeyPair, ... }` の useMemo 化は **不要**（hook 戻り値が安定すれば、QrTicket.tsx 側の object literal も毎回同じ値で構築されるが、その object identity は依然不安定。ただし `GenerateTab` が `React.memo` 化されていない現状では実害なし。issue #225 の観点 1 が示す本質的解決は「`GenerateTab` 内 hook の依存配列で値再計算を防ぐ」点で、hook 側 useMemo で達成される。QrTicket.tsx 側の追加 useMemo は YAGNI）。

**確認方法**: `useQrCamera.ts` の return 部を読み、同一 pattern で実装。

#### 4.2 `verify` 専用 `AbortController` (観点 2)

**現状**: `useTicketVerification` の `verify` は `signal?` を受け取るが、`useQrCamera.onQrDetected: verify` 経由ではノーシグナル呼出。カメラ起動中アンマウント時に `setVerificationResult` が unmounted 後発火する race。

**修正**:

```ts
// useTicketVerification.ts
const controllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  return () => {
    controllerRef.current?.abort();
  };
}, []);

const verify = useCallback(
  async (
    qrData: string,
    pubKeyStrArg: string,
    externalSignal?: AbortSignal
  ): Promise<VerificationResult> => {
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    // externalSignal が来ていれば link
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort();
      else externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    setVerifying(true);
    try {
      const result = await verifyTicketQr(qrData, pubKeyStrArg /*, ctrl.signal */);
      if (ctrl.signal.aborted) {
        return result; // unmount 後 setState を抑制
      }
      setVerificationResult(result);
      setVerifying(false);
      return result;
    } catch (e) {
      if (ctrl.signal.aborted) throw e;
      setVerifying(false);
      throw e;
    }
  },
  []
);
```

**注意**: 既存 `useTicketVerification.test.tsx` で `verify` 戻り値や `verificationResult` 状態を assert している箇所があれば、`signal.aborted` の挙動を新規 test で陽性対照（`controller.abort()` 後の `setState` が走らない）も追加する。

#### 4.3 既存 test の影響範囲

- `__tests__/useTicketKeyPair.test.tsx`: 戻り値 shape 不変（useMemo wrap のみ）→ pass 想定
- `__tests__/useTicketGeneration.test.tsx`: 同上 → pass 想定
- `__tests__/useTicketVerification.test.tsx`: `verify` 内 abort 経路追加 → pass 想定。陽性対照 1 件追加（unmount 後 verify 完走しても state update 走らないこと）

---

## 3. `src/styles/global.css` への追記（PR 2 で**新規追加**する分のみ）

PR 1 / 1.5 で既に追加済みの class（`.caption` / `.body-emphasis` / `.text-default` / `.text-muted` / `.bg-default` / `.bg-subtle` / `.bg-surface` / `.border-default` / `.border-input` / `.bg-error-tint` / `.bg-success-tint` / `.btn-link-plain` 等）は再定義しない。本 PR 追加分:

```css
@layer components {
  /* === PR 2: qr-ticket migration helpers === */

  /* 色 token の text utility (Tailwind auto-utility 不在) */
  .text-error {
    color: var(--color-error);
  }
  .text-error-text {
    color: var(--color-error-text);
  }
  .text-success {
    color: var(--color-success);
  }
  .text-primary {
    color: var(--color-primary);
  }

  /* Validation alert box (VerifyTab 検証結果) */
  .alert-success {
    background: var(--color-success-bg);
    border-color: var(--color-success);
  }
  .alert-error {
    background: var(--color-error-bg);
    border-color: var(--color-error);
  }

  /* File picker label (VerifyTab upload mode) */
  .qr-file-picker-label {
    background: var(--color-bg-surface);
    color: var(--color-muted);
    border-color: var(--color-border-input);
    cursor: not-allowed;
  }
  .qr-file-picker-label[data-enabled='true'] {
    background: var(--color-bg-subtle);
    color: var(--color-text);
    cursor: pointer;
  }

  /* Category badge pill (GenerateTab 生成結果) */
  .badge-category {
    display: inline-block;
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    border-radius: 9999px;
    padding: 0.1rem 0.5rem;
  }

  /* Row remove button (GenerateTab チケット行削除) */
  .btn-row-remove {
    background: transparent;
    border: 0;
    color: var(--color-error);
    cursor: pointer;
  }
  .btn-row-remove:disabled {
    color: var(--color-muted);
    cursor: not-allowed;
  }

  /* QR result auto-fill grid (GenerateTab 生成結果カード列) */
  .qr-result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}
```

**衝突確認**:

- `.text-error` / `.text-success` / `.text-primary` は `@theme` 経由の Tailwind auto-utility が存在しない（`--color-error` 等は `:root` 直書きで `@theme` に登録していない、PR 1 と同方針）→ 命名衝突なし
- `.alert-*` / `.qr-*` / `.badge-*` / `.btn-row-remove` は BEM 風命名で唯一性確保
- `data-enabled` 属性は WAI-ARIA `aria-disabled` と異なる目的（視覚状態 vs 支援技術伝達）。同 element に両方付けても責務分離成立

**新 class の将来性**:

- `.text-error/success/primary` は PR 3-5 で他 tool migration 時に再利用見込（高）
- `.alert-success/error` は他検証系 tool（QrReader 等）で再利用見込（中）
- `.qr-file-picker-label` / `.badge-category` / `.btn-row-remove` / `.qr-result-grid` は qr-ticket 固有命名（低）。再利用時 rename も可

---

## 4. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済み (11 件、省略)
  // PR 1.5 で追加済み
  'src/components/ui/ResultTable.tsx',
  'src/components/ui/InputField.tsx',
  // PR 2 で追加
  'src/components/tools/qr-ticket/GenerateTab.tsx',
  'src/components/tools/qr-ticket/VerifyTab.tsx',
  'src/components/tools/qr-ticket/TicketDetail.tsx',
];
```

陽性対照テストブロックは PR 1 で導入済 → 変更不要。

---

## 5. consumer 変更範囲（**PR 2 で touch するファイル**）

| File                                                                      | 変更内容                           | 備考                              |
| ------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| `src/components/tools/qr-ticket/GenerateTab.tsx`                          | inline style 全除去 + import 整理  | MIGRATED_FILES 登録               |
| `src/components/tools/qr-ticket/VerifyTab.tsx`                            | inline style 全除去 + import 整理  | MIGRATED_FILES 登録               |
| `src/components/tools/qr-ticket/TicketDetail.tsx`                         | inline style 全除去 + import 整理  | MIGRATED_FILES 登録               |
| `src/components/tools/qr-ticket/useTicketKeyPair.ts`                      | 戻り値 useMemo 化                  | #225 観点 1                       |
| `src/components/tools/qr-ticket/useTicketGeneration.ts`                   | 戻り値 useMemo 化                  | #225 観点 1                       |
| `src/components/tools/qr-ticket/useTicketVerification.ts`                 | `verify` に AbortController 追加   | #225 観点 2                       |
| `src/components/tools/qr-ticket/__tests__/useTicketVerification.test.tsx` | unmount 後 abort 陽性対照 1 件追加 | #225 観点 2 検証                  |
| `src/styles/global.css`                                                   | §3 の `@layer components` 追記     | PR 1 / 1.5 既存ブロック末尾に追記 |
| `src/utils/__tests__/inline-style-migration.test.ts`                      | `MIGRATED_FILES` array に 3 件追加 | -                                 |

`src/components/tools/QrTicket.tsx` は **触らない**（hook 側で useMemo するため、QrTicket.tsx 側の object literal 追加 useMemo 不要 = §4.1 末尾参照）。

---

## 6. 検証戦略

### ローカル必須ゲート（push 前、PR 1 / 1.5 と同じ）

| 順  | コマンド                | 目的                                                                                                             | 失敗時                                                       |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `npm run test` (vitest) | unit + migration test の MIGRATED_FILES 範囲拡大（13 件 → 16 件 = 6 spec 追加） + useTicketVerification 陽性対照 | 該当ファイルの `style={{` を実コードで除去、abort 経路を確認 |
| 2   | `npx astro check`       | TypeScript 型チェック                                                                                            | hook 戻り値 type が消費側で互換維持確認                      |
| 3   | `npm run test:e2e`      | functional E2E 全 pass（qr-ticket の生成・検証フロー e2e）                                                       | regression を fix                                            |

memory `feedback_subagent_verification_trust.md` に従い、**親 Opus が直接実行**（subagent の "pass" 報告は信頼しない）。

### CI（PR push で起動）

| workflow                | 実行内容                              | required?       |
| ----------------------- | ------------------------------------- | --------------- |
| `test.yml`              | vitest + e2e                          | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (36 baseline 比較) | ❌ non-required |

memory `feedback_vrt_ci_only.md`: ローカル `npm run test:vrt` は走らせない（baseline 不在で fail）。

### VRT 差分の判断フロー（PR 1 / 1.5 と同じ）

PR comment に diff があった場合:

- 意図しない regression（badge 色違い / alert border 太さ違い等）→ class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和（事前合意必要）
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back

### a11y 退化検知 (memory `feedback_commander_checklist.md` 準拠)

本 PR で特に注意:

- VerifyTab 検証結果 div の `role="status"` / `aria-live` / `aria-atomic` 維持
- video / canvas の `aria-label` / `aria-hidden` 維持
- file input の `aria-label` 維持（`hidden` ではなく `sr-only` を採用したのは a11y のため）
- `<label htmlFor>` / `<button type="button">` 維持
- `<th scope>` 等は本 PR 対象外（TicketDetail は `<td>` のみ、`<th>` 不在）

親 Opus が PR 作成時に `git diff origin/develop -- src/components/tools/qr-ticket/` で aria/role/htmlFor/type の差分目視確認（**aria-\* 削除行が無いこと**を grep で機械検出: `git diff origin/develop -- src/components/tools/qr-ticket/ | grep -E '^-.*aria-' | grep -vE '^---|^\+\+\+'`）。

---

## 7. バッチ計画における本 PR の位置付け

memory `project_b_plan_progress.md` のテーブル参照。

| #        | スコープ                                                   | 状態           |
| -------- | ---------------------------------------------------------- | -------------- |
| PR 0     | VRT 導入                                                   | ✅ #254 merged |
| PR 1     | 基礎工事 + ui/\* simple 11                                 | ✅ #256 merged |
| PR 1.5   | ui/\* complex (ResultTable + InputField)                   | ✅ #261 merged |
| **PR 2** | **qr-ticket/\* (本 PR)**                                   | **本 PR**      |
| PR 3     | JwtDecoder + UuidV7Generator                               | 未着手         |
| PR 4     | Gs1Databar + EncodingConverter + DummyText                 | 未着手         |
| PR 5     | QrReader + ConfigConverter + JanCode + QrCode + 残り tools | 未着手         |
| PR 6     | flip + cleanup                                             | 未着手         |

PR は **直列**（前 PR がマージされてから次 PR 着手）。

---

## 8. ブランチ命名 / コミット粒度 / PR ベース

### ブランチ命名

- `feature/issue-176-b2-qr-ticket`（hyphen で区切る）
- worktree 経由の場合は memory `feedback_worktree_base_branch.md` に従い `git worktree add ... origin/develop -b feature/issue-176-b2-qr-ticket` を **明示**
- worktree の置き場所は memory `feedback_worktree_location.md` に従い `.claude/worktrees/<name>` または `$TMPDIR/<name>`

### コミット粒度

```
1. global.css に PR 2 用 @layer components 追記（text-error/success/primary, alert-*, qr-file-picker-label, badge-category, btn-row-remove, qr-result-grid）
2. TicketDetail.tsx: inline style 撤去 + import 整理
3. VerifyTab.tsx: inline style 撤去 + import 整理
4. GenerateTab.tsx: inline style 撤去 + import 整理（最大、必要なら 4-1 (鍵 textarea), 4-2 (チケットリスト), 4-3 (生成結果) に分割可）
5. useTicketKeyPair.ts: 戻り値 useMemo 化 (#225 観点 1)
6. useTicketGeneration.ts: 戻り値 useMemo 化 (#225 観点 1)
7. useTicketVerification.ts: verify AbortController 追加 (#225 観点 2)
8. useTicketVerification.test.tsx: unmount 後 abort 陽性対照追加 (#225 観点 2 検証)
9. inline-style-migration.test.ts: MIGRATED_FILES に 3 件追加
10. （VRT 差分が出た場合のみ）update-visual-baseline.yml trigger 結果の baseline commit (bot が自動 push)
```

各 commit で migration test を「追加した範囲だけ pass」する状態に保つ（コミット 9 は最後）。

### 並列 subagent 分担（sonnet）

memory `feedback_subagent_model.md` に従い `model: "sonnet"` を明示:

| Track | 担当ファイル                                                        | コミット番号       |
| ----- | ------------------------------------------------------------------- | ------------------ |
| **A** | `GenerateTab.tsx` (27 styles、最大)                                 | 4 (or 4-1/4-2/4-3) |
| **B** | `VerifyTab.tsx` (12 styles)                                         | 3                  |
| **C** | `TicketDetail.tsx` (3 styles) + 3 hook 群 (#225 全観点) + test 追加 | 2, 5, 6, 7, 8      |

**順序**:

1. **Phase 0** (親 Opus): spec → plan → worktree → コミット 1（global.css foundation） を直接実行
2. **Phase 1** (sonnet 並列): Track A / B / C を並列 dispatch
3. **Phase 2** (親 Opus): コミット 9 (`MIGRATED_FILES` 追加) → ローカル必須ゲート 3 件直接実行 → aria diff 確認 → push → develop ベース PR 作成

### PR ベース

`gh pr create --base develop` で必ず明示（memory `feedback_branch_workflow.md` / `feedback_pr_language.md` / `CLAUDE.md` 最重要ルール）。タイトル例:

> `refactor(ui): #176 B 案 PR 2 — qr-ticket inline style 撤去 + #225 useMemo/abort 対応`

PR 本文は `--body-file /tmp/claude/pr_body.md` 経由（memory `feedback_heredoc_no_escape.md` / `CLAUDE.md` 6.1）。

---

## 9. リスクと緩和

| ID  | リスク                                                                                                                                                                                     | 緩和                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `data-enabled` の動的属性更新が React 18 の hydration mismatch を起こす                                                                                                                    | 初期 SSR 時 `verifyPubKeyStr` は空文字列で `data-enabled="false"` 確定。React は client hydration 後 useState 経由で再評価するため初期描画 mismatch は起きない。VRT で初期 + 入力後の両 state を比較                                                   |
| R2  | `hidden` HTML 属性で video の display: block が効かなくなる                                                                                                                                | `className="block"` を base にし、`hidden={!cameraActive}` を解除すると元の `block` が効く（`hidden` は `display: none` を user-agent style で上乗せ、解除で base class 復帰）。Playwright で `await expect(page.locator('video')).toBeVisible()` 確認 |
| R3  | `sr-only` で file input の click が label 経由で発火しない                                                                                                                                 | label 内 wrap 構造を維持。Playwright の `page.locator('input[type="file"]').setInputFiles(...)` で file input 直接操作（既存 e2e で実施済 pattern）                                                                                                    |
| R4  | `useMemo` 戻り値 deps が漏れて stale closure                                                                                                                                               | 全 hook 戻り値 properties を deps array に列挙。lint (`react-hooks/exhaustive-deps`) で検証。astro check で型 break しないか確認                                                                                                                       |
| R5  | `verify` の AbortController が 2 重 abort で例外                                                                                                                                           | `controller.abort()` は idempotent（複数回呼んでも no-op）。Spec 上安全                                                                                                                                                                                |
| R6  | `badge-category` の `padding: '0.1rem 0.5rem'` が VRT pixel 差を出す                                                                                                                       | original も `0.1rem` のため厳密一致。Tailwind utility `py-0.5` (0.125rem) を採用しないことで差分発生回避                                                                                                                                               |
| R7  | hook 戻り値 useMemo 化で test setup の renderHook 結果 reference が変わる                                                                                                                  | useMemo の wrap は値が変わらない限り同 reference を返すため、test 側 act/rerender で再呼出後 reference が安定。既存 test の `result.current.X` 参照に影響なし。`useTicketGeneration.test.tsx` 等の existing test を変更不要で pass する想定            |
| R8  | カテゴリバッジの `display: inline-block` を spec で明示したが、`<span>` default は inline。utility (`inline-block`) を class に組み込まず CSS 側に閉じる選択 → consumer から override 不能 | `.badge-category` で `display: inline-block` を baked-in。consumer override は本 PR スコープ外（必要時に future PR で utility 化）                                                                                                                     |

---

## 10. 議論ポイント（spec 確定前に user 判断を要する項目）

以下は本 spec 内で「採用」と書いたが、user の判断で別案に切り替え可能な箇所。実装着手前にレビューを推奨:

### 10.1 #258 の処理タイミング

- **採用案**: PR 2 着手前に **別の超小型 PR** で先行 merge（4 行修正）
- **代替案**: PR 2 のコミット 0 として bundle（PR が少し大きくなるが、別 PR 作成のオーバーヘッドを省略）
- **推奨**: 採用案。memory `project_b_plan_progress.md` の prerequisite 規定 + memory `feedback_pr_size.md` の小 PR 原則に整合

### 10.2 鍵 textarea の `InputField` 置換可否

- **採用案**: 直接 class 化（`<textarea>` のまま）。理由: InputField は label / hint / error 構造を持ち、CopyButton を横に並べる現 layout (line 156-164) との結合が崩れる
- **代替案**: 周辺 layout も再設計して InputField に置換（リファクタ範囲拡大）
- **推奨**: 採用案。本 PR スコープを inline style 撤去に限定

### 10.3 `badge-category` の padding

- **採用案**: `0.1rem 0.5rem` を新 class として保持（original 厳密一致）
- **代替案**: Tailwind utility `px-2 py-0.5` (0.125rem 0.5rem) で近似（VRT で 1-2px 差分が出る可能性）
- **推奨**: 採用案。VRT 差分回避優先

### 10.4 `text-error/success/primary` の追加位置

- **採用案**: `@layer components` 内に手動定義（PR 1 / 1.5 と同方針）
- **代替案**: `@theme` block に色 token を追加して Tailwind auto-utility 生成（`bg-error` / `text-error` 等が全色 utility として手に入る）
- **推奨**: 採用案。`@theme` 切替は scope 外（PR 6 cleanup で再検討候補）

### 10.5 #225 観点 1 の useMemo 配置

- **採用案**: hook 側 (`useTicketKeyPair` / `useTicketGeneration`) で戻り値 useMemo 化
- **代替案**: QrTicket.tsx 側で props object literal を useMemo 化
- **推奨**: 採用案。`useQrCamera` 既存 pattern と整合し、各 consumer に useMemo を強制しない

### 10.6 並列 sonnet subagent の分割

- **採用案**: Track A (GenerateTab) / Track B (VerifyTab) / Track C (TicketDetail + 3 hook + test) の 3 並列
- **代替案**: 4 並列（hook 群を Track D 独立）or 1 直列（subagent 1 件で全実装）
- **推奨**: 採用案。バランス良い負荷分散 + 並列性で時間短縮、verify は親 Opus が直接実行

これら 6 項目に user が異論なければ、本 spec を最終とし plan ファイル (`docs/superpowers/plans/2026-05-04-issue-176-b2-qr-ticket.md`) 作成 → 実装着手へ。

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 同梱 issue: [#225](https://github.com/fumtas1k/devtools/issues/225) (refactor QrTicket)
- 前段 prerequisite issue: [#258](https://github.com/fumtas1k/devtools/issues/258) (ClearButton/CopyButton type=button)
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1) / [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp) / [#254](https://github.com/fumtas1k/devtools/pull/254) (VRT 導入) / [#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1) / [#261](https://github.com/fumtas1k/devtools/pull/261) (PR 1.5)
- 過去 decisions: [054]（CSP 初導入）/ [064]（A-1 採用）/ [066]（VRT 採用）
- memory: `project_b_plan_progress.md` / `feedback_pr_size.md` / `feedback_infra_feature_separation.md` / `feedback_subagent_model.md` / `feedback_subagent_verification_trust.md` / `feedback_commander_checklist.md` / `feedback_vrt_ci_only.md` / `feedback_e2e_before_pr.md` / `feedback_branch_workflow.md` / `feedback_pr_language.md` / `feedback_heredoc_no_escape.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- PR 1.5 spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
