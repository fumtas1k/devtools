# 正規表現 鉄道図（railroad diagram）レンダラ 設計（PR2）

- 作成日: 2026-05-27
- ステータス: 設計承認済み（PR2a の実装計画は writing-plans で別途作成）
- 前提: PR1（正規表現ビジュアライザ＆ReDoS検出, PR #490 merged）の続き。スペック親 = `docs/superpowers/specs/2026-05-27-regex-visualizer-design.md` 9 章「PR2: 鉄道図 SVG レンダラ」。

## 1. 目的

正規表現の構造を **鉄道図（railroad / syntax diagram）** で可視化し、`/tools/regex-visualizer` に「構造ツリー」と並ぶ表示タブとして追加する。regexper / Debuggex 風のフロー図で、AST ツリーより直感的に「マッチの流れ」を示す。

## 2. 方式: 自前 React SVG レンダラ（採用）

レイアウトを自前計算し、**React の SVG 要素**として描画する。

### 却下した代替案

- **`railroad-diagrams` ライブラリ**: CC0・依存ゼロだが 2015 年以降未保守・CommonJS・型なし・API が DOM/innerHTML 前提・専用 CSS 必須。SVG 文字列を innerHTML 挿入する経路は正規表現テキストの反射型 XSS 対策が別途必要（CLAUDE.md 9.5）。PR1 で CJS 依存の Vite/SSR 統合に苦労した負債を増やす。
- **`regexper` の描画ロジック流用**: GPL-3.0 でライセンス非互換。

### 採用理由

- 依存ゼロ。React 要素で SVG を組むため `dangerouslySetInnerHTML` 不要 = 原理的に XSS なし。
- 配色（DADS トークン）・hotspot ハイライト・レスポンシブを完全制御。
- regexper 完全互換は狙わず「読みやすく構造が分かる鉄道図」を目標スコープとする（過剰な typesetting を避け YAGNI）。

## 3. アーキテクチャ

| ファイル                                                 | 責務                                                                                                                                                                        |
| :------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/regex-visualizer/parse.ts`（既存・小改修）    | regexp-tree parse を railroad と共有するため、生 AST を返すヘルパー（例 `parseToRegExpTree`）を切り出す。既存 `parseRegex` / `RegexAstNode` は温存                          |
| `src/utils/regex-visualizer/railroad.ts`（新規）         | regexp-tree の生 AST → **レイアウトモデル**を構築する純粋関数。各ノードを `{ kind, width, height, entryY, exitY, children, loc, ... }` に変換（描画と分離し単体テスト可能） |
| `src/components/tools/RegexRailroad.tsx`（新規）         | レイアウトモデルを React の `<svg>` 要素として描画。接続線は `<path>` / `<line>`。文字は `<text>`（React テキスト子のため自動エスケープ）                                   |
| `src/components/tools/RegexVisualizer.tsx`（既存・改修） | ToggleGroup「構造ツリー / 鉄道図」を追加。`mod`（動的 import 済みの解析モジュール）から railroad ビルダも提供                                                               |

### レイアウトモデル

- 各ノードは「入口・出口を持つ箱」。`measure`（部分木の幅・高さ・入口/出口 Y を算出）→ `position`（絶対座標を割当）→ React SVG 描画、の 3 段。
- 純粋関数（DOM 非依存）なので、寸法・構造をテキストで単体テストできる（テキスト幅は固定幅フォント前提の概算 + 文字数ベースで算出し、pixel-perfect は求めない）。

### graceful degradation

未実装の構文ノード（後続 PR 担当分）は **汎用ラベルボックス**にフォールバックして描画を継続（クラッシュ・空白化させない）。後続 PR が本実装へ置換する。

### hotspot ハイライト

ReDoS の `hotspot`（pattern オフセット範囲）と各ノードの `loc`（offset-1 補正済み、PR1 と同座標系）を突き合わせ、AST ツリーと同じく **最深の重なりノードのみ**警告色で強調する。

### タブ統合

`RegexVisualizer` に `ToggleGroup`「構造ツリー / 鉄道図」を追加。**デフォルトは「構造ツリー」**を維持（空入力時の初期描画が PR1 と同一 = VRT baseline 不変）。

## 4. PR 分割（順次・各 PR は動く増分）

| PR                                      | スコープ                                                                                                                                                                                                                                         | 完成時に描けるもの                          |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------ |
| **PR2a 基盤＋連結/終端/グループ＋タブ** | レイアウトエンジン中核（measure→position→接続パス）、終端（Char / CharacterClass）、連結（Alternative の横並び）、グループ（capturing / 非capturing のコンテナ枠）、タブ追加、未対応ノードのフォールバック枠、parse.ts の生 AST ヘルパー切り出し | `abc` / `(abc)` / `a\dc` 等の直列パターン   |
| **PR2b 選択肢＋アサーション**           | Disjunction `a\|b`（縦分岐＝split/merge の接続パス）、Assertion（`^` `$` `\b` 先読み/後読み）の描画                                                                                                                                              | `a\|b\|c` / `^abc$`                         |
| **PR2c 量指定子＋後方参照＋hotspot**    | Repetition `+ * ? {n,m}` のループバック弧（最難）＋ greedy/lazy 注記、Backreference、ReDoS hotspot ハイライト                                                                                                                                    | `(a+)+$` を完全描画（ループ＋危険箇所強調） |

- PR2a でタブと基盤が入り、直列正規表現は鉄道図で閲覧可能。未対応構文はフォールバック枠で壊れず表示。
- PR2b / PR2c がフォールバックを本実装へ順次置換。レイアウトの 2 大難所（分岐 = 2b、ループ = 2c）を分離。

## 5. テスト方針（各 PR 共通）

- **Unit (Vitest)**: `railroad.ts` のレイアウトモデルを検証（部分木の寸法・入口/出口・子の相対配置・フォールバック判定）。pixel-perfect ではなく構造とおおよその寸法を assert。
- **Component (Vitest/jsdom)**: タブ切替で `<svg>` が描画される、終端/グループ等が期待ノード数で出る。
- **E2E (Playwright, 本番 CSP 下 `withProductionCsp`)**: タブを「鉄道図」に切替 → SVG が表示される。PR2c では `(a+)+$` で hotspot 強調が出る。
- **VRT**: デフォルトタブ（構造ツリー・空入力）の初期描画は不変のため原則 baseline 再生成不要。鉄道図タブの描画を VRT 対象に含める場合は別途 baseline を CI で生成。

## 6. ドキュメント更新

- `SPEC.md`（2.4 章にファイル追加、9 章チェックリスト）
- `docs/decisions.md`（鉄道図の自前 React SVG 採用理由・railroad-diagrams/regexper 却下理由）
- PR1 の親スペック 9 章「PR2」を本スペックへのリンクで更新（任意）

## 7. スコープ外

- regexper 完全互換の typesetting（過剰な美的調整）。
- マッチテスト（PR3 候補・別スペック）。
