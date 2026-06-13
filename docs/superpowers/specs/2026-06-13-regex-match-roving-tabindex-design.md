# RegexMatchTester マッチハイライトの roving tabindex 化 設計

- 対象 issue: #666
- 関連: PR #665（`<mark>` の `role="button"` 化 / issue #663）
- 優先度: 低（a11y 改善。現状でも操作自体は可能）
- 作成日: 2026-06-13

## 背景・課題

PR #665 で `RegexMatchTester` のマッチハイライト `<mark>` を `role="button"` + `tabIndex={0}`
でキーボード操作可能にした。しかし `g` フラグ + 長文では全マッチがそれぞれ独立した tab stop に
なり、キーボードユーザーはマッチ N 個に対し N 回 Tab を踏む。下部 `ResultTable` でも行選択できる
ため実害は小さいが、navigation コストが高い。

## ゴール

- マッチハイライト群の tab stop を **N → 1** に削減する（roving tabindex パターン）。
- 既存の挙動（選択・`aria-pressed`・`ResultTable` 連動・色分け・空マッチ表示）は維持する。
- キーボードユーザーが矢印キーでマッチ間を移動できるようにする。

## 非ゴール（スコープ外）

- マッチ実行ロジック（`runMatch` / `useDebouncedTransform`）の変更。
- `ResultTable` 側の挙動変更。
- CSS（`.match-highlight*`）の見た目変更。
- `aria-current` の導入（選択状態は既存の `aria-pressed` を継続使用する）。

## 設計

### 1. 構造リファクタ: `MatchHighlights` サブコンポーネント抽出

現状の純関数 `highlight(input, matches, selected, onSelect)` は ref / focus / 内部 state を
持てないため、roving ロジックを内包する **`MatchHighlights` サブコンポーネント** へ抽出する。

- props: `text: string` / `matches: RegexMatch[]` / `selected: number | null` /
  `onSelect: (i: number) => void`（現行 `highlight()` と同じ情報量）。
- 呼び出し側（`RegexMatchTester` 内 `matches.length > 0 ?` 分岐）を
  `<MatchHighlights text={shownText} matches={matches} selected={selectedIndex} onSelect={setSelected} />`
  に置換する。
- テキストセグメントと `<mark>` を交互に並べる描画ロジックは現行 `highlight()` をそのまま移植する。

### 2. roving tabindex（子ローブ方式）

issue 本文は「コンテナを `tabIndex={0}`」と「個々の `<mark>` のうち選択中のみ `tabIndex={0}`」を
併記しているが、両立すると tab stop が二重になる。標準的でクリーンな **子ローブ方式** を採用する:

- コンテナ自体は tab stop にしない（`tabIndex` を付けない）。
- マッチ群のうち **常に 1 個だけ `tabIndex={0}`**（roving item）、残りは `tabIndex={-1}`。
- `MatchHighlights` 内で `rovingIndex` state を保持。`safeRoving = Math.min(rovingIndex, n - 1)`
  を tabIndex 割当に使う（マッチ件数が縮小したときの安全弁。常に有効な tab stop が 1 個残る）。
- 各 `<mark>` に ref を持たせる（`markRefs = useRef<Array<HTMLElement | null>>([])`、
  `ref={(el) => { markRefs.current[i] = el; }}`）。キー操作時に `markRefs.current[idx]?.focus()`。
- `matches`（`useDebouncedTransform` でメモ化された安定参照）が変わったら
  `useEffect(() => setRovingIndex(0), [matches])` で先頭へリセットする。

> 補足: `MatchHighlights` は `matches.length > 0` の分岐内でのみマウントされ、`matches` は
> メモ化済みの安定参照のため、`useEffect([matches])` は新しいマッチ結果が来たときだけ発火する。

### 3. キーバインド（`onKeyDown` 拡張）

各 `<mark>` の `onKeyDown(e, i)` で以下を処理する（いずれも `e.preventDefault()`）:

| キー            | 動作                                                          |
| :-------------- | :----------------------------------------------------------- |
| `ArrowRight`    | 次のマッチへ focus 移動（末尾なら先頭へ wrap）               |
| `ArrowLeft`     | 前のマッチへ focus 移動（先頭なら末尾へ wrap）               |
| `Home`          | 先頭マッチへ focus 移動                                       |
| `End`           | 末尾マッチへ focus 移動                                       |
| `Enter` / `' '` | `onSelect(i)`（= `aria-pressed` + `ResultTable` 連動、現行） |

- 矢印 / Home / End は **focus のみ移動**し、選択（`selected`）は変えない（toolbar 型）。
  focus 移動時は `setRovingIndex(next)` + `markRefs.current[next]?.focus()`。
- wrap 計算: `next = (i + 1) % n` / `prev = (i - 1 + n) % n`。
- `↑` / `↓` は割り当てない（今回スコープ外）。

### 4. クリック時の roving 同期

`onClick` は現行どおり `onSelect(i)` を呼ぶことに加え、`setRovingIndex(i)` でその要素を roving item
にする（クリック後の Tab 復帰先を、最後に触れたマッチへ保持するため）。

### 5. a11y 補強

ハイライト容器 `<div>`（`rounded-lg border ... whitespace-pre-wrap break-all`）に
`role="group"` + `aria-label="マッチ箇所"` を付与し、矢印ナビゲーション可能な 1 グループであることを
SR に伝える。既存の `role="button"` / `aria-pressed` / `aria-label`（空マッチは「（空マッチ）」付き）
/ `title` はすべて維持する。

### 6. CSS

変更なし。`.match-highlight` / `-a` / `-b` / `-active` / `-empty` はそのまま。

## テスト戦略（陽性対照付き）

> ガード / 回帰防止テストの実装のため、`test-gates` skill を参照し陽性対照の妥当性を担保する。

### Unit (`src/components/tools/__tests__/RegexMatchTester.test.tsx`)

1. **roving 初期状態**: 複数マッチ時、`tabIndex=0` を持つ `<mark>` がちょうど 1 個・他は `-1`。
   - 陽性対照: 旧実装（全マッチ `tabIndex=0`）に当てると「1 個だけ」が偽になり fail する。
2. **`ArrowRight` で roving 移動**: focus した 1 件目で `→` → 2 件目が `tabIndex=0` / focus。
3. **wrap**: 末尾で `→` → 先頭へ。
4. **`Home` / `End`**: それぞれ先頭 / 末尾へ roving 移動。
5. **`Enter` / `Space` で選択維持**: `aria-pressed` が `false → true` に切り替わる。

既存ユニットテスト（件数集計 / g ヒント / no-match / vulnerable / unknown / regexValid=false）は
そのまま維持する。

### E2E (`tests/e2e/regex-visualizer.spec.ts`)

- 既存の `role="button"` + `Enter` 選択テストは維持。
- 追加（陽性対照）: `g` フラグ + `\d+` + `a1 b22`（2 マッチ）で、
  - roving 要素は `tabindex="0"`、非 roving 要素は `tabindex="-1"`（旧実装＝全 `0` と区別）。
  - 1 件目を `focus()` → `→` で 2 件目が `toBeFocused`（roving 移動の証明）。
  - `Enter` で `aria-pressed="true"`。
- ロケーターは `getByRole('button', { name: /マッチ N/ })` を使用（属性セレクタ禁止）。

### VRT

DOM 属性（`tabindex` / `role` / `aria-*`）変更のみで描画は不変のため baseline 更新は不要の見込み。
万一 pixel diff が出た場合は数値根拠で baseline 更新を勧めず、DOM 構造 / computed style の 2 段階
検証の上でユーザーの目視判断を仰ぐ。

## 検証（push 前必須）

- `npm run test`（ユニット）
- `node_modules/.bin/astro check`（型）
- `npm run test:e2e`（E2E）

## ドキュメント更新

- 挙動の細かな a11y 改善であり、ツール追加 / slug 変更 / ライブラリ変更には当たらないため
  `README.md` / `SPEC.md` の更新は不要。`docs/tools.md` も仕組みの説明に影響しないため対象外。
- 必要に応じて `docs/decisions.md` への追記は行わない（設計上の重要決断ではなく既存パターン適用）。
