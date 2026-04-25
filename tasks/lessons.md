# セッションで得た教訓・修正パターン

次のセッション開始時に確認する。

---

## [2026-04-25] Playwright 確認前にブラウザキャッシュをクリアする

### 現象

Playwright でスクリーンショットを撮影したとき、Service Worker キャッシュや localStorage に古いデータが残っており、実際の変更が映り込まなかった。ユーザーが毎回ブラウザの「デバイス上のサイトデータ」を手動削除する必要があった。

### 教訓

**Playwright でスクリーンショット確認をする前に、必ずキャッシュをクリアしてからリロードする。**

### 手順

```js
// 1. browser_evaluate でキャッシュ削除
const keys = await caches.keys();
await Promise.all(keys.map(k => caches.delete(k)));
localStorage.clear();
sessionStorage.clear();

// 2. browser_navigate でリロード（キャッシュなし再取得）
// 3. その後スクリーンショット撮影
```

### 予防策

UIコンポーネント・レイアウト変更後の Playwright 確認手順に「キャッシュクリア → リロード → 撮影」を必ず含める。

---

## [2026-04-25] SVG 手動組立時の XSS 対策（GS1データバー）

### 現象

ライブラリが生成した SVG 文字列に、ユーザー入力（AIフィールドの値）を文字列結合で `<text>` 要素として挿入していた。この際、エスケープを行わずに `dangerouslySetInnerHTML` で描画していたため、反射型 XSS の脆弱性が発生した。

### 原因

- `dangerouslySetInnerHTML` を使用して生の文字列を HTML としてレンダリングしていた。
- ライブラリ（bwip-js）の制限により SVG を手動加工する必要があったが、その際のセキュリティ考慮（エスケープ）が漏れていた。
- AI 10/21 などのフィールドが `<>&"` などの特殊文字をバリデーションで許可していた。

### 教訓

**`dangerouslySetInnerHTML` を使用する場合、外部からの入力（ユーザー入力、APIレスポンス等）は必ずエスケープまたはサニタイズする。**

特に SVG を文字列として組み立てる際は以下の点に注意する：
1. テキスト要素として挿入する値には、`escapeHtml` などの関数でエンティティエスケープを適用する。
2. SVG の幅や高さを計算する場合、エスケープ後の文字列長（`&amp;` は 5 文字）ではなく、元の文字列長（`&` は 1 文字）を使用する（ブラウザ描画上の幅と一致させるため）。

### 修正パターン

```typescript
// ❌ 脆弱な実装
const textEl = `<text x="50" y="20">${userInput}</text>`;
return `${openTag}${textEl}${inner}</svg>`;

// ✅ 安全な実装
const escapedText = escapeHtml(userInput);
const textEl = `<text x="50" y="20">${escapedText}</text>`;
return `${openTag}${textEl}${inner}</svg>`;
```

### 予防策

- `dangerouslySetInnerHTML` の使用箇所を grep で定期的に確認する。
- 可能な限り、文字列結合ではなく JSX や DOM API を使用して SVG を構築する。
- 設計判断（`docs/decisions.md` [028]）としてルールを明文化し、レビュー時に確認する。

---

## [2026-04-25] develop に直接コミットしない

### 現象

実装作業を develop ブランチ上で進め、直接コミットしてしまった。
develop にはブランチ保護が設定されており push できないため、あとからブランチを切り直す手間が発生した。

### 教訓

**実装開始前（最初のファイル編集より前）に必ず feature ブランチを切る。**

```bash
git checkout -b feat/<topic>
```

### 予防策

- セッション開始時に `git branch` で現在のブランチを確認する
- develop / main にいたら即座にブランチを切る
- コミット・プッシュは feature ブランチに対してのみ行い、develop へは PR 経由でマージする

---

## [2026-04-24] E2E テストを実装と同時に書く

### 現象

機能修正・バグ修正を実装した後、E2E テストを書かずにコミットすることが繰り返し発生した。
ユーザーから「テストはどうなった？」と指摘されて初めて追加するケースが複数あった。

今セッションでの例:
- ケースH: ToggleGroup の行間ハイライト排他性（修正コミット後に指摘されて追加）
- ケースI: コピーボタンの表示/非表示（修正コミット後に指摘されて追加）

### 教訓

**バグ修正・UI 挙動変更を実装したら、コミット前に必ず E2E テストを書く。**

テストが必要かどうか迷ったら「このコードを壊しても CI が通ってしまうか？」で判断する。
→ 通ってしまうなら追加すべき。

### チェック観点

| 変更の種類 | E2E テストの追加が必要か |
|---|---|
| UI の表示/非表示の条件変更 | ✅ 必要（`toBeVisible` / `not.toBeVisible`） |
| `aria-pressed` などの状態管理バグ修正 | ✅ 必要（`toHaveAttribute`） |
| 入力 → 出力の変換ロジック修正 | ✅ 必要（出力内容を検証） |
| スタイルのみの変更（色・余白等） | 基本不要（目視確認で十分） |

### 予防策

実装コミットと E2E テストコミットは **同一コミットにまとめるか、続けて行う**。
「あとでテストを書く」は書かれない。実装直後に書く。

---

## [2026-04-14] UIレイアウト：ボタン高さがラベル行の高さを決める

### 現象

横並びレイアウトで、入力エリアと出力エリアのテキストエリア上端がずれていた。
ボタンが出現する前（初期状態）からずれており、ボタンの `visibility: hidden` で隠しても
高さは DOM に残ったままになる。

### 原因

ラベル行に hidden で配置されたボタンの実際の高さがラベル行の `minHeight` を超えていた。

- `CopyButton`（`py-2` + `lineHeight: 1`）→ 約 **32px**
- `CSVダウンロード`ボタン（`py-1.5` + `...caption` の `lineHeight: 1.7`）→ 約 **38px**

`caption` スタイルは `lineHeight: 1.7` を含むため、テキスト高が `fontSize` より大きくなる。

### 修正

ボタンに `lineHeight: 1` を明示追加して高さを揃える：

```tsx
style={{
  ...caption,
  lineHeight: 1,   // ← 追加。captionの lineHeight:1.7 を上書きしてボタン高さを抑える
  ...
}}
```

### 教訓

- **`...スタイルオブジェクトを spread したボタン` は lineHeight に注意**。`caption` / `bodyEmphasis` は lineHeight が 1.7 で、ボタンの実高さが意図より大きくなる。
- **ボタン高さを揃えたい場合は `lineHeight: 1` を明示する**（CopyButton パターンに倣う）。
- **`visibility: hidden` で隠しても高さは残る**。隣の要素に影響するので、ラベル行に hidden ボタンを入れるときは全ボタンの高さを統一しておく。

### 予防策

UIレイアウト変更後は Playwright でPC（1280×800）とスマホ（390×844）の両サイズを確認する（`CLAUDE.md` の「UIコンポーネント・レイアウト変更時の目視確認」参照）。

---

## [2026-04-14] レスポンシブ：モバイルで幅が縮まらない

### 現象

`md:flex-row` で横並びにしたとき、スマホ幅（縦並び）でも子要素の幅が縮まらず、
横スクロールが発生した。

### 原因

`flex-1` は flex コンテナが `flex-row` のときは有効だが、`flex-col` のときは
横幅が親に依存する。`min-w-0` がないと flexbox がコンテンツ幅を優先してしまう。

### 修正

```tsx
// ❌ 修正前
<div className="md:flex-1">

// ✅ 修正後
<div className="w-full md:flex-1 min-w-0">
```

### 教訓

- **横並び ↔ 縦並び切り替えには `w-full md:flex-1 min-w-0` がセット**。
- `min-w-0` を忘れると長いコンテンツがはみ出す。

---

## 2026-04-25: ホバー時の色変化はインラインスタイル＋`onMouseEnter`/`onMouseLeave` で

### 状況

`hover:bg-red-50` のような Tailwind ホバークラスが `Gs1Databar.tsx` / `JanCode.tsx` に残存し、CLAUDE.md の色クラス禁止規約に違反していた。

### 修正

```tsx
// ❌ 修正前
<button className="hover:bg-red-50" style={{ color: colors.error }}>削除</button>

// ✅ 修正後
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
>削除</button>
```

### 教訓

- **CLAUDE.md の「色は `colors.*` インラインスタイル」規約は擬似クラスにも適用される**。`hover:bg-*` も Tailwind 色クラスの一種として扱う。
- ホバー切替は既存の `onFocusRing` / `onBlurRing` と同じく `onMouseEnter` / `onMouseLeave` でインラインスタイルを差し替える流儀に揃える。

---

## [2026-04-25] `<label htmlFor>` がある場合は Select に aria-label を併用しない

### 状況

`EncodingConverter.tsx` で `<label htmlFor="enc-source">` が存在するにもかかわらず、Select コンポーネントに `ariaLabel="元の文字コード"` も渡していた。

### 教訓

**`<label htmlFor>` で紐付け済みの場合、`aria-label` は不要（かつ冗長）。**

- `aria-label` が存在すると `<label>` より優先されるため、意図した読み上げテキストと差異が出る可能性がある。
- `<label>` を持たない要素（Gs1Databar の AI コード Select 等）には引き続き `ariaLabel` を使う。

```tsx
// ❌ 冗長
<label htmlFor="enc-source">元の文字コード:</label>
<Select id="enc-source" ariaLabel="元の文字コード" ... />

// ✅ 正しい
<label htmlFor="enc-source">元の文字コード:</label>
<Select id="enc-source" ... />
```

---

## [2026-04-25] Playwright では DOM 直接操作より expect オートリトライを優先

### 状況

`gs1-databar.spec.ts` で `page.evaluate` / `page.waitForFunction` で DOM を直接操作・監視していた。

### 教訓

**ロール/ラベルロケーター + `expect` のオートリトライで React の再レンダー後の状態変化を待つ。**

```ts
// ❌ 旧パターン
await page.waitForFunction(() => {
  const opt = document.querySelector('select[aria-label="..."] option[value="11"]');
  return opt?.disabled === true;
});
const disabled = await page.locator('...').evaluate((el) => el.disabled);
expect(disabled).toBe(false);

// ✅ 新パターン
await expect(page.getByLabel('AI コード 2').getByRole('option', { name: '製造日 (11)' })).toBeDisabled();
await expect(page.getByLabel('AI コード 2').getByRole('option', { name: '賞味/消費期限 (17)' })).toBeEnabled();
```

- `page.evaluate` によるクリックより `getByRole('button', ...).first().click()` の方がシンプルで堅牢。
- DOM 直接操作は `waitForReactHydration` が通った後でも flaky になりやすい。

---

## 2026-04-25: `Uint8Array<ArrayBuffer>` の戻り型は `crypto.subtle.verify` で必須

### 状況

`base64UrlToBytes(str): Uint8Array` と書くと TS は `Uint8Array<ArrayBufferLike>` に展開し、`crypto.subtle.verify(..., signature, ...)` の `BufferSource = ArrayBufferView<ArrayBuffer>` 制約を満たせず型エラーになる。

### 修正

```ts
// ❌ 修正前
export function base64UrlToBytes(str: string): Uint8Array { ... }

// ✅ 修正後
export function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> { ... }
```

### 教訓

- `new Uint8Array(length)` の戻り値は `Uint8Array<ArrayBuffer>` だが、関数戻り型を `Uint8Array` と書くと境界で `Uint8Array<ArrayBufferLike>` に広がる。
- `crypto.subtle` 系・厳密な `BufferSource` を要求する API に渡す Uint8Array を返す関数は、戻り型を `Uint8Array<ArrayBuffer>` に絞り込むこと。

---

## [2026-04-25] モード/形式トグル切替時に入力をクリアしない

### 現象

Base64 ツールでエンコード/デコード切替や標準/URL-safe 切替を行うと、入力欄がリセットされて再入力が必要だった。

### 教訓

**変換の方向や形式を切り替えるトグルでは、入力をクリアしないこと。** ユーザーは同じ入力で異なる変換結果を見比べたいケースが多い。

### パターン

`useCodec` のように `deps` に基づいて `useEffect` で再変換するフックを使っている場合、トグルの `onChange` は `setMode` / `setFormat` を直接渡せばよい。`reset()` や `setInput('')` を呼ぶと入力が消える。

```tsx
// ❌ 入力がクリアされる
const handleModeChange = (next: Mode) => {
  setMode(next);
  reset(); // input/output/error を全クリア
};

// ✅ 入力を保持して再変換のみ走る
<ToggleGroup value={mode} onChange={setMode} ... />
```

入力が新しい形式で不正になった場合は `useCodec` 内の `try/catch` がエラー表示するため UX 上問題ない。明示的なクリアは「クリア」ボタンに集約する。
