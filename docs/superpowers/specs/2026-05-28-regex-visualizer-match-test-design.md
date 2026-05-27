# 正規表現ビジュアライザ マッチテスト機能（PR3）設計

- 作成日: 2026-05-28
- ステータス: 設計承認済み（実装計画は writing-plans で別途作成）
- 対象ツール: `regex-visualizer`（`/tools/regex-visualizer`）
- 前提: PR1（AST + ReDoS）/ PR2a-c（鉄道図）は develop へ merge 済み

## 1. 目的・スコープ

正規表現ビジュアライザに **マッチテスト機能**（regex101 風）を追加する。テスト文字列を入力すると、マッチ箇所をハイライトし、キャプチャグループを表で一覧表示する。

### スコープ（標準）

- テスト文字列入力 → マッチ箇所をインラインハイライト（コア）
- キャプチャグループ一覧（コア）
- マッチ詳細テーブル: 各マッチの位置・長さ、名前付きグループ、マッチ数（標準で追加）

### スコープ外（YAGNI）

- **置換プレビュー**（`$1` 等での substitution）: 今回は含めない。将来候補。
- マッチの説明文（regex101 の Explanation 相当）: 構造ツリー／鉄道図が既に構造説明を担うため不要。
- JS（ECMAScript）以外のフレーバー: ツール全体の方針どおり非対応。

## 2. 主要な設計判断

| 論点               | 決定                                                                    |
| :----------------- | :---------------------------------------------------------------------- |
| ReDoS フリーズ対策 | **ReDoS 判定と連動**（後述 6 章）。Worker は導入しない                  |
| g フラグ           | **忠実**: g なし=最初の1件のみ、g あり=全マッチ。g なし時はヒント表示   |
| 配置               | **独立セクション・常時表示**。ReDoS 判定パネルの直下                    |
| ハイライト表示     | マッチ全体を交互色で強調 + 下にキャプチャグループ表（hover で相互強調） |
| マッチ実行エンジン | ブラウザ native `RegExp`（CJS 依存なし → SSR 制約が無く静的 import 可） |

## 3. モジュール構成

新規 `src/utils/regex-visualizer/match.ts` を **import ゼロの純粋モジュール**として追加する（`railroad-layout.ts` と同方針）。マッチ実行は native `RegExp` のみで CJS 依存（regexp-tree / recheck）が無いため、`RegexVisualizer` の動的 import (`mod`) を経由せず**静的 import** できる。

```ts
export interface CaptureGroup {
  index: number; // 1 始まりのグループ番号
  name?: string; // 名前付きグループ名
  value?: string; // 未マッチ（省略可能グループ）のとき undefined
}

export interface RegexMatch {
  value: string; // マッチした部分文字列
  start: number; // 入力文字列内の開始位置
  end: number; // 終了位置（exclusive）
  groups: CaptureGroup[];
}

export interface MatchResult {
  matches: RegexMatch[];
  truncated: boolean; // 入力長キャップで切り詰めたか
}

/**
 * pattern + flags を input に対してマッチ実行する（native RegExp）。
 * g なしは最初の 1 件のみ。g ありは全マッチ。
 * 空マッチ時は lastIndex を 1 進めて無限ループを防ぐ。
 * maxLength を渡すと input を先頭 maxLength 文字に切り詰めて実行し truncated=true を返す
 *   （unknown verdict の force 実行で凍結時間の上限を下げるため）。
 * pattern / flags が不正な場合は呼び出し側で parse 済みエラーを表示しているため、
 * ここでは throw を許容（呼び出し側で gate する）。
 */
export function runMatch(
  pattern: string,
  flags: string,
  input: string,
  maxLength?: number
): MatchResult;
```

`src/utils/regex-visualizer/index.ts` に `runMatch` と型を re-export する。

## 4. データフロー

既存の parse/redos/railroad 用 `useDebouncedTransform`（pattern を source、deps=[mod, flags]）とは**別**に、マッチ用の 2 つ目の変換を持つ。テスト文字列の変更で再計算する。

```
テスト文字列入力
  → debounce (2 つ目の useDebouncedTransform)
  → shouldRun 判定（ReDoS verdict + force フラグ、6 章）
      ├─ 実行可 → runMatch(pattern, flags, testString) → ハイライト + 表
      └─ 不可   → 実行せずプレースホルダ / 警告表示
```

- source = `shouldRun ? testString : null`
- transform = `(ts) => runMatch(pattern, flags, ts)`
- deps = `[pattern, flags, shouldRun]`

`pattern` / `flags` が空・不正なときは parse 側のエラー表示に委ね、マッチセクションは「正規表現を入力してください」を表示する。

## 5. UI 構成

ページのセクション順（変更後）:

```
正規表現入力 + フラグトグル
ReDoS 判定パネル
マッチテスト（★新規・独立セクション）
可視化（構造ツリー / 鉄道図 タブ）
Clear
```

### マッチテストセクションの内訳

1. **テスト文字列入力**: `textarea`。`maxLength` で粗い上限を設定する。safe は線形マッチなので寛容な上限（例 10000 文字）でよい。unknown の force 実行時はさらに小さい上限を適用する（6 章）。
2. **ハイライト結果**: テスト文字列を「非マッチ部分テキスト + マッチ span」の React 要素配列に分割して描画する。**`dangerouslySetInnerHTML` は使わない**（XSS 規約 9.5）。隣接マッチを区別するためマッチ span は交互色（`.match-highlight-a` / `.match-highlight-b`）。
3. **キャプチャグループ表**: 行 = マッチ。列 = マッチ全体 / 位置（start–end）/ 各グループ（名前付きはラベル付き、未マッチは「(なし)」）。マッチ数を見出しに表示。
4. **相互強調**: `selectedMatch` state を持ち、ハイライト span または表行を**クリック**すると当該マッチを選択し、span と表行を相互に強調する。`ResultTable` は `selectedIndex` / `onRowClick` とキーボード操作（Enter/Space）を内蔵しているのでそれを使う（hover のみだとキーボード非対応のため、クリック選択を一次手段にして a11y を確保）。強調は React state によるクラス付替えで実現し、`@layer components` 手書きクラスへの `:hover` variant は使わない（Tailwind v4 制約・規約 7.1）。

### スタイル

- `.match-highlight-a` / `.match-highlight-b` / `.match-highlight-active`（hover 強調）を `src/styles/global.css` の `@layer components` に意味クラスとして追加。色は `@theme` semantic token / CSS 変数経由（primitive scale 直書き禁止・規約 7）。
- DADS 配色に収まる落ち着いた 2 色 + 強調色を使う（`dads-design-system` skill 参照）。

## 6. ReDoS フリーズ対策（重要）

native `RegExp` のマッチはメインスレッド同期実行で、走り出すと中断できない。Worker は導入しない（PR1 が CSP の blob Worker 制約で `checkSync` を選んだ経緯と整合）。**入力長キャップは指数時間バックトラッキングを防げない**（`(a+)+$` は数十文字でも凍る）ため、ReDoS 判定でマッチ実行をゲートする。

| ReDoS verdict  | マッチ実行の挙動                                                                                     |
| :------------- | :--------------------------------------------------------------------------------------------------- |
| **safe**       | テスト文字列を debounce して**自動ライブマッチ**                                                     |
| **unknown**    | 自動実行しない。「実行」ボタン押下で**入力長キャップ付き**実行（unknown は脆弱確定ではなく判断保留） |
| **vulnerable** | **ライブマッチを無効化**。理由を明示し、ReDoS パネルに表示済みの攻撃文字列を案内する                 |

- `shouldRun` の前提として **regex が有効**であること（parse エラーなし）を必須とする。不正な regex のときは verdict に関わらず実行しない。
- `shouldRun` = 有効 && (`safe` なら常に true / `unknown` は force ボタン押下後 true / `vulnerable` は常に false)。
- vulnerable で無効化する理由: Worker なしでは vulnerable な正規表現を安全に実行する手段が無い。キャップを付けても指数パターンでは保護にならないため、「短い入力で試す」よりも確実な凍結回避を優先する（誠実さ優先）。
- unknown の force 実行時は `runMatch(..., maxLength=1000)` を渡し、textarea の通常上限（例 10000 文字）より小さい上限まで input を切り詰めて実行する。`MatchResult.truncated` が true なら切り詰めをユーザーに通知する。

この「vulnerable は実行不可」というゲート挙動自体が安全機構であり、テストで保証する（7 章）。

## 7. エラーハンドリング・エッジケース

| 事象                       | 挙動                                                                                                                     |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| 不正な regex               | parse 側でエラー表示済み。マッチセクションは実行しない                                                                   |
| 空マッチ（`a*` × g 等）    | `lastIndex` を 1 進めて無限ループ回避（実装の要・unit テスト対象）                                                       |
| マッチなし                 | 「マッチしませんでした」を表示                                                                                           |
| テスト文字列が空           | 「テスト文字列を入力してください」を表示                                                                                 |
| グループ位置               | マッチ全体の位置は `.index` で常に取得。各グループの位置は `d` フラグ時のみ表示（忠実方針に沿い `d` を勝手に付与しない） |
| 未マッチの省略可能グループ | `value: undefined` → 表では「(なし)」表示                                                                                |

## 8. テスト

- **Unit (Vitest)** `match.test.ts`:
  - g なし → 最初の 1 件のみ
  - g あり → 全マッチ
  - 名前付きグループの抽出
  - マッチなし → `matches: []`
  - **空マッチ guard**（`a*` × g で無限ループしない・有限件数で返る）
  - 省略可能グループ未マッチ → `value: undefined`
- **ゲート挙動のテスト**: `shouldRun` ロジック（safe=自動 / unknown=ボタン後 / vulnerable=無効）をコンポーネントテストで保証。vulnerable な正規表現でマッチ実行が走らないことを明示的に検証する（安全機構の陽性確認）。
- **Component (Vitest + Testing Library)**: テスト文字列入力でハイライトと表が出る／vulnerable でマッチ無効化メッセージが出る。
- **E2E (Playwright・本番 CSP 下 `withProductionCsp`)**: safe な regex でマッチ表示／vulnerable でマッチ無効化／g 有無での件数差。
- **VRT**: `/tools/regex-visualizer` は既に `PAGES` 登録済み（追加作業なし）。baseline はマッチセクション追加で変わるため CI Linux runner で更新（承認を得てから dispatch）。

## 9. ドキュメント更新

- `README.md`: ツール説明にマッチテストを追記（必要なら）
- `SPEC.md`: 該当ツールの機能記述を更新
- `docs/decisions.md`: マッチテストの設計判断を追記
  - native `RegExp` 採用（CJS 依存なし・静的 import 可）
  - ReDoS 判定連動のマッチ実行ゲート（vulnerable は実行不可・Worker 非導入の理由）
  - g フラグ忠実方針 / 入力長キャップ（unknown force 時）

## 10. 制約の再確認（PR1/2 で確立）

- recheck / regexp-tree は CJS。React から静的 import すると Astro dev SSR が `module is not defined` で落ちる。これらに依存する解析系は `RegexVisualizer` の `useEffect` 内動的 import (`mod`) 経由のみ。**`match.ts` は native `RegExp` のみで CJS 非依存のため静的 import 可**（本設計の前提）。
- E2E は `withProductionCsp` 下。Playwright 目視前は SW unregister + caches.delete + localStorage.clear してからリロード・撮影。
- 描画系・ロジックの純粋モジュール分離を維持（`match.ts` は import ゼロ）。
