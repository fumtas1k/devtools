# json-formatter ツリー仮想化（issue #512 残スコープ①）— 設計

## Context（なぜ作るか）

issue #512（json-formatter 大容量対応）の残スコープのうち **ツリー仮想化** を実装する。

PR #521（decisions [096]）でツリー遅延構築＋大入力ガード（整形済み 500KB 超で自動構築を保留 →「ツリーを表示」ボタンで明示構築）は導入済みだが、**強制表示すると全ノードを再帰 DOM 化するため依然重い**。また、ガード閾値未満（例: 300KB）でも数万ノード級の JSON では DOM 行数がそのまま積み上がり、描画・スクロールが重い。

方針は decisions [096] の measure-first を踏襲: 実装前に develop 上で実測して before を記録し、実装後の after と比較して効果を decisions / issue に残す。

## スコープ

- **対象**: ツリー表示の仮想化（可視範囲のみ DOM 化）。
- **対象外**（issue #512 に残す）:
  - 重い処理（parse/format/mask/query）の同一オリジン静的 Worker オフロード。
  - `getNodeValue`(value) の遅延化。
- 500KB ガード（自動構築保留）は **維持**する。ツリー構築（`makeTree`）自体のメインスレッド同期コストは仮想化では解消しないため（Worker 化は次サイクル）。

## 計測（measure-first）

1. **before**: develop 上で Playwright を使い、生成した大容量 JSON（数万ノード規模、例: 配列 1 万要素 × ネストオブジェクト）を入力 → ツリー強制表示。表示までの所要時間・DOM 行数（`.json-row` 数）・操作（スクロール・開閉）の応答を記録。
2. **after**: 実装ブランチで同条件を再計測。
3. 記録先: `docs/decisions.md` の新エントリ＋ issue #512 への進捗コメント。
4. before の時点で問題が再現しない（十分軽い）場合は立ち止まってユーザーに報告する（YAGNI）。

## アーキテクチャ

### flatten（`src/utils/json-formatter/flatten.ts` 新規）

開閉状態を集中管理し、可視行を平坦配列へ変換する純粋関数群。

- `interface FlatRow { node: TreeNode; depth: number; kind: 'value' | 'open' | 'close'; }`
  - 現行表示はコンテナの閉じ括弧が独立行（`json-close-line`）のため、`open` / `close` を別行にする。
  - 折りたたみ中のコンテナは `open` 行 1 行に集約（`{ … } N 項目` 表記。children / `close` 行は出さない）。
- `flattenTree(root: TreeNode, collapsed: ReadonlySet<string>, defaultOpen: boolean): FlatRow[]`
  - `collapsed` は **デフォルト開閉状態からの反転集合**（path の Set）。`defaultOpen=true` なら Set に入っている path が「閉じている」、`false` なら「開いている」。全折りたたみ時に全 path を列挙しないための XOR 設計。
- `countRows(root: TreeNode): number` — 全展開換算の総行数（経路判定用）。`flattenTree(root, 空Set, true).length` と一致する値を走査 1 回で返す。
- 行キーは `path`（クエリ・入力変化で tree が変わると `treeKey` 再マウントされるため衝突しない。`close` 行は `path + ':close'`）。

### 可視範囲計算（`computeWindow`、flatten.ts 内 or 同 util）

`computeWindow(scrollTop, viewportH, rowH, totalRows, overscan): { start: number; end: number }`

- `start = max(0, floor(scrollTop / rowH) - overscan)` / `end = min(totalRows, ceil((scrollTop + viewportH) / rowH) + overscan)`。
- 純粋関数。境界（負値・0 行・rowH 未確定時のフォールバック）を unit test で担保。

### 仮想ビュー（`src/components/tools/JsonTreeViewVirtual.tsx` 新規）

- スクロールコンテナは既存の `.json-tree-box`（高さ 28rem / `overflow: auto`）をそのまま利用。コンテナの UX 変更なし。
- **行高**: 全行等高（1 行固定・`nowrap`）前提。初回描画行を `getBoundingClientRect` で実測し、`ResizeObserver` でズーム・フォント変化に追従。実測前は推定値（`1.6 × caption font-size + padding` 相当の定数）で描画し実測後に補正。
- **スクロール**: コンテナの scroll イベントを rAF throttle で state 化。
- **spacer**: 可視 slice の上下に spacer 要素（`<li>`）を置き、高さは `useDynamicStyleSheet`（ToggleGroup / decisions [098] で実績済みの constructable stylesheet 注入）で専用 class に注入する。**JSX `style={{}}` / `style` 属性 / `el.style` mutation は使用しない**（CSP `style-src 'unsafe-inline'` 撤去済み・issue #176 B 案準拠）。
- **行レンダリング**: 現行 `JsonTreeView` の見た目クラス（`json-line` / `json-key` / `json-string` 等）と行内操作（パスコピー / 値コピー、`aria-expanded` 付きトグル）を踏襲。インデントは depth ベースの padding 用 class で表現する（depth 上限までの静的 class を `global.css` に定義。上限超は最大値に飽和）。
- **入れ子 ul の罫線（`border-left` インデントガイド）は仮想パスでは省略**。flat 構造で再現コストが高く、仮想パスは巨大入力時限定のため VRT 影響もない。
- **開閉状態**: `collapsed: Set<string>` を component state で保持。トグルで XOR 更新。全展開 / 全折りたたみは既存の `treeKey` 再マウント＋ `defaultOpen` 反映で state ごとリセット（現行 API と互換）。
- a11y: 現行と同じく表示専用（`role="tree"` は付けない）。flat `<ul>` + `role="group"` + `aria-label` を維持。トグルは `button` + `aria-expanded`。

### 経路の出し分け（`JsonTreeResult.tsx` 変更）

- `TREE_VIRTUALIZE_THRESHOLD = 2_000`（全展開換算の総行数）。
- `countRows(tree)` が閾値以下 → 現行 `JsonTreeView`（再帰・入れ子 ul）。**DOM・見た目・VRT 完全不変**。
- 閾値超 → `JsonTreeViewVirtual`。
- 判定は tree ごとに 1 回（`useMemo`）。開閉状態に依存しないため経路がフリッカしない。

### 既存ガードとの関係

| 入力規模（目安）             | 挙動                                                             |
| :--------------------------- | :--------------------------------------------------------------- |
| 〜2,000 行                   | 現行どおり再帰ツリー（変更なし）                                 |
| 2,000 行超 〜 整形済み 500KB | 自動構築 → 仮想ビュー（従来は重い再帰 DOM だった）               |
| 整形済み 500KB 超            | ガードで保留 →「ツリーを表示」→ 仮想ビュー（従来は凍結級だった） |

## テスト戦略

- **unit**（`src/utils/json-formatter/__tests__/flatten.test.ts`）:
  - `flattenTree`: 開閉反映（XOR）・`kind` 並び・折りたたみ集約・depth・行キー。
  - `countRows`: flatten 全展開の length と一致。
  - `computeWindow`: 境界・clamp・overscan。
- **E2E**（`tests/e2e/`）: 閾値超の JSON を入力し、
  - 仮想化発動: DOM 上の行数 < 総行数 を assert。
  - スクロールで後方の行（最終行など）が出現する。
  - 行の開閉トグル・全展開 / 全折りたたみが機能する。
  - **陰性側**: 閾値未満の入力では従来構造（入れ子 ul）のまま。
  - 閾値切替はガード的機構のため、実装時に `test-gates` skill を呼び **陽性対照**（仮想化を壊すと fail するテスト）を設計する。
- **CSP**: `withProductionCsp` 下で仮想ビュー操作（表示・スクロール・開閉）に violation ゼロを E2E で assert（spacer の動的 stylesheet 経路の検証）。
- **VRT**: 既存ページは閾値未満入力のため現行パスのまま。baseline 更新不要。

## ドキュメント / 運用

- `docs/decisions.md` に新エントリ（計測値 before/after・閾値根拠・自前 windowing 採用理由〔CSP 制約で @tanstack/react-virtual の inline style 前提と衝突・等高単純ケース・supply-chain 方針〕）。
- `docs/tools.md` の json-formatter 節に仮想化の挙動・制限（罫線省略）を追記。
- issue #512 に進捗コメント（残スコープ: Worker オフロード / getNodeValue 遅延化）。
- PR は 1 本（feature → develop、squash）。依存追加なし。

## 却下した選択肢

- **`@tanstack/react-virtual`**: 公式パターンが全可視行の inline style（`transform` / `height`）前提で、CSP `style-src 'unsafe-inline'` 撤去済みの本プロジェクトでは配置を結局自前実装するハイブリッドになり、依存 2 パッケージ追加の割に提供価値が薄い。
- **常時仮想化（単一経路）**: コード経路は 1 本になるが、通常入力でも DOM 構造が変わり罫線・a11y 意味論の再現と VRT baseline 更新（CI dispatch 要承認）が確実に発生。閾値切替なら通常入力への影響ゼロ。
- **500KB ガード超のみ仮想化**: 影響範囲は最小だが、ガード未満の数万ノード入力の重さが解消されず不完全。
