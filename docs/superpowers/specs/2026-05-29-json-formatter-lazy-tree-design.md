# JSON整形・ビューア: ツリー遅延構築 + 大入力ガード — 設計

## Context（なぜ作るか）

json-formatter の follow-up。issue #507（テキスト表示中もツリーを毎回構築している無駄）と issue #512（大容量 JSON 対応）の一部を扱う。

現状 `processJson` は表示モードに関係なく毎回 `buildTree` を実行し、ツリーは全ノード DOM 化で仮想化なし。テキスト/マスク/型表示中もツリー構築コストがかかり、巨大 JSON をツリー表示するとメインスレッドが凍結する。

本サイクルは **(1) ツリー遅延構築（#507）と (2) 大入力ガード** に絞る。重い処理の **Worker オフロード**と**ツリー仮想化**（#512 の本体）は、遅延＋ガードで主要な無駄・凍結が解消されるため、実測で必要性を確認してから別サイクルとする（measure-first / YAGNI）。

## スコープ

- **対象**: ツリーの遅延構築、巨大入力時のツリー描画ガード（保留→明示ボタン）。
- **対象外**: Web Worker オフロード、ツリー仮想化、`getNodeValue`(value) の遅延化（mask/型でのみ使用・1パス・据え置き）。

## 1. ツリー遅延構築（#507）

`processJson` の戻り値から即時 `tree` を除き、**サンク `makeTree`** に置換する。

```ts
export interface ProcessResult {
  output: string; // 整形/最小化テキスト（即時・常に必要）
  value: unknown; // getNodeValue（mask/型用・即時。据え置き）
  makeTree: () => TreeNode; // ツリーは呼ばれたときだけ構築（root/text を閉包）
}
```

- `processJson` 内: `const makeTree = () => buildTree(root, text);` を返す。`buildTree` の即時実行を廃止。
- **RangeError 方針**: 深いネストの RangeError は従来 format/buildTree で発生し processJson の try で日本語化していた。`makeTree` が遅延化されるため、format（即時・再帰）が先に RangeError を投げれば従来どおり日本語エラーになる。format が通って makeTree だけが RangeError になるケースは稀だが、呼び出し側（component の useMemo）で try/catch し、失敗時は `null`（ツリー非表示・プレースホルダ）にフォールバックする。

### コンポーネント側（`JsonFormatter.tsx`）

- codec の meta = `{ value, makeTree }`（`tree` → `makeTree`）。
- `queryEval` の戻り値も `tree` → `makeTree`（クエリ結果の processJson から）。
- 表示用サンク: `const displayMakeTree = queryActive ? queryEval?.makeTree : meta.makeTree;`
- ツリーは `view === 'tree'` のときだけ構築:
  ```ts
  const displayTree = useMemo<TreeNode | null>(() => {
    if (view !== 'tree' || treeTooLarge || !displayMakeTree) return null;
    try {
      return displayMakeTree();
    } catch {
      return null; // 深いネスト等のフォールバック
    }
  }, [view, treeTooLarge, displayMakeTree]);
  ```
- `view` は **codec deps に入れない**（debounce ラグ回避、#507 が懸念した点）。

## 2. 大入力ガード

巨大入力をツリー表示すると全ノード DOM 化で凍結するため、自動構築を保留し明示操作で表示する。

- 閾値: `TREE_GUARD_THRESHOLD = 500_000`（整形済みテキスト長 = `displayOutput.length`。パース前の安価な代理指標）。
- `const [treeForced, setTreeForced] = useState(false);`
- `const treeTooLarge = displayOutput.length > TREE_GUARD_THRESHOLD && !treeForced;`
- `treeTooLarge` の間は `displayTree` を構築せず、`JsonTreeResult` が通知＋ボタンを表示:
  - 文言例: 「JSON が大きいため（約 N KB）ツリー描画を保留しています。」＋ ボタン「ツリーを表示」。
  - ボタン押下で `setTreeForced(true)` → 当該入力でツリー構築。
- **リセット**: `displayOutput` が変化したら `treeForced` を false に戻す（`useEffect(() => setTreeForced(false), [displayOutput])`）。新しい入力に古い force を持ち越さず、別の巨大入力には再びガードがかかる。`handleClear` は `reset()` で入力が空になり `displayOutput` も変わるため追加処理は不要（既存の `setView('text')` は維持）。

### `JsonTreeResult` の props 追加

```ts
interface Props {
  tree: TreeNode | null;
  output: string;
  treeKey: number;
  defaultOpen: boolean;
  rightSlot: ReactNode;
  tooLarge?: boolean; // ガード発動中
  onForceRender?: () => void; // 「ツリーを表示」
}
```

- `tooLarge` のとき tree box 内に通知＋ボタンを描画（`tree` ではなく案内）。
- `tooLarge` でなく `tree` が null（空/不正/未構築）のときは従来の「有効な JSON を入力すると…」。

## 不変条件・エッジ

- 入力が空/不正 → `displayMakeTree` は null（codec が空/error 時に meta を INITIAL にリセット）→ ツリー非表示。
- 全展開/全折りたたみ（`treeKey`/`treeOpen`）は従来どおり（ガード解除後のツリーに適用）。
- マスク/型表示はツリーを使わず、本変更の影響なし（value 経路は不変）。

## テスト

- **単体（Vitest）** `index.test.ts` 更新:
  - `processJson` が `makeTree`（呼ぶと `TreeNode`、type==='object' 等）を返す。`output` / `value` は従来どおり（既存アサーションの `.tree` を `.makeTree()` に置換）。
  - `makeTree` を呼ぶまで `buildTree` 相当の構築が走らないこと（呼び出し前後で挙動が変わらない範囲の確認。スパイは過剰なら `makeTree()` の戻り値検証で代替）。
- **E2E（Playwright, production CSP）** `json-formatter` spec 追記:
  - 通常サイズ: テキスト→ツリー切替でツリーが出る（遅延構築の動作確認、回帰ガード）。
  - 大入力ガード: 閾値超の JSON を入力しツリー表示 → 「保留」通知＋「ツリーを表示」ボタンが出る → 押すとツリーが描画される。
- **VRT**: 既定（空入力）表示は不変のため baseline 影響なし想定。

## ドキュメント更新

- `docs/decisions.md`（[096] 遅延構築＋大入力ガードの採用、Worker/仮想化を measure-first で別サイクルに据え置いた理由）。
- README / SPEC はツールの外形機能に変化なし（性能改善）のため原則更新不要。SPEC 9 章チェックリスト等に該当があれば追記。

## 新規/変更ファイル（想定）

- 変更: `src/utils/json-formatter/index.ts`（`processJson` 戻り値 `tree`→`makeTree`）
- 変更: `src/components/tools/JsonFormatter.tsx`（meta/queryEval の makeTree 化、displayTree useMemo、guard 状態）
- 変更: `src/components/tools/JsonTreeResult.tsx`（`tooLarge`/`onForceRender` props と通知 UI）
- 変更: `src/utils/json-formatter/__tests__/index.test.ts`（`.tree`→`.makeTree()`）
- 変更: `tests/e2e/json-formatter.spec.ts`（遅延構築・ガード E2E）
- 変更: `docs/decisions.md`

## 後続（本サイクル スコープ外）

- ツリー仮想化（flatten + `@tanstack/react-virtual` 等）→ 別 issue（#512 残）。
- 重い処理の同一オリジン Worker オフロード（CSP 制約下の設計・CSP E2E）→ 別 issue（#512 残）。
- `getNodeValue`(value) の遅延化。
