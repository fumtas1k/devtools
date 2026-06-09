# 正規表現ビジュアライザ 鉄道図リデザイン 設計

- 日付: 2026-06-10
- 対象: regex-visualizer ツールの「鉄道図」ビュー
- 関連ファイル:
  - `src/components/tools/RegexRailroad.tsx`（SVG 描画・純粋プレゼンテーション）
  - `src/utils/regex-visualizer/railroad-layout.ts`（pure レイアウト計算）
  - `src/utils/regex-visualizer/railroad.ts`（AST → RailNode 変換）
  - `src/styles/global.css`（`@theme` トークン・`@layer components` の `rr-*` クラス）

## 目的

現状の鉄道図は全リテラル/文字クラス/メタ文字が同一の灰色ボックスで描かれ、ノード種別が視覚的に区別できない。提示されたモックアップに合わせて、ノード種別ごとの色分け・形状・凡例・日本語量指定子ラベル・矢印付きループ弧を導入し、読みやすさを高める。

**スコープ外**: AST パース処理（`parse.ts`）の変更、構造ツリービュー、ReDoS 検出ロジック、鉄道図以外のツール。

## 1. ノード種別の色分け

凡例に掲載する4種:

| 種別                           | 対象ノード                                                                                         | 表現                                                             |
| :----------------------------- | :------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| 文字（リテラル）               | `Char`(simple/decimal/oct/hex/unicode 等の通常文字)                                                | 白塗り・薄灰枠（現状の `rr-box` 維持）                           |
| 文字クラス・メタ文字           | `CharacterClass`(`[..]` `\s` `\d` `\w` `\S` 等)、メタ `Char`(`.` および `\d \w \s` 等の meta kind) | 青塗り（blue-50 相当）+ 青枠（新クラス `rr-charclass`）          |
| アンカー（位置）               | Assertion の `^ $ \b \B`（先読み/後読みを除く単純アンカー）                                        | 紫塗りの円/楕円。1文字=円、複数文字=pill（新クラス `rr-anchor`） |
| 量指定子（くり返し・スキップ） | `Repetition` の弧                                                                                  | 弧 + 日本語ラベル（凡例はアイコンのみ）                          |

### 種別判定（railroad.ts）

現状 `Char` と `CharacterClass` はともに `measureTerminal`（`rr-box`）へ流れている。これを分割する。

- 新 `RailKind` に `charclass` を追加する。
- `build()` の分岐を変更:
  - `CharacterClass` → 新 `measureCharClass(label, loc)`
  - `Char` → `node.kind`（regexp-tree は `'simple' | 'meta' | 'decimal' | 'oct' | 'hex' | 'unicode' | 'control'` 等）を見て、`'meta'` なら `measureCharClass`、それ以外は `measureTerminal`（リテラル）。
    - 注: `.` `\d` `\w` `\s` `\D` `\W` `\S` は regexp-tree では `Char` の `kind: 'meta'`。`\n` `\t` 等のエスケープは `kind: 'meta'` ではなく制御/simple 扱いになるケースがあるため、実装時に regexp-tree の実際の `kind` を確認し、テストで固定する。

`measureCharClass` の寸法ロジックは `measureTerminal` と同一（ボックス寸法は共通）。種別が異なるだけ。

- 後方参照（`Backreference`）・解析不能（fallback）は現状どおり白系ボックス（破線で区別）を維持し、凡例には掲載しない。
- グループ枠・先読み/後読みコンテナは §4 のとおり薄灰塗りに変更（凡例非掲載）。

## 2. 量指定子ラベル（日本語のみ）

`railroad.ts` の `quantifierLabel()` を日本語化する。

| 量指定子 | 表示       |
| :------- | :--------- |
| `*`      | 0回以上    |
| `+`      | 1回以上    |
| `?`      | 0または1回 |
| `{n}`    | n回        |
| `{n,}`   | n回以上    |
| `{n,m}`  | n〜m回     |

- lazy（`greedy === false`、例 `*?` `+?` `{2,5}?`）は上記の末尾に `（最短）` を付ける。例: `*?` → `0回以上（最短）`。
- greedy はサフィックスなし（現状の `?` サフィックス付与をやめる）。

## 3. 量指定子の弧（矢印付き表現）

モックアップに合わせ、現状の「上=スキップ・下=ループ」を反転し、**ループ弧を上・矢印付き / スキップ弧を下** とする。

- **ループ弧（上・反復方向の下向き矢印付き）**: `node.loop === true` のとき表示（`+` `*` `{n,}` `{n,m>1}` 等）。ノード出口（右）からノード上部を回って入口（左上）へ戻り、入口側の終端に下向き矢印マーカーを付ける。矢印は反復（ノードを再び通る）方向を示す。
- **スキップ弧（下・矢印なし）**: `node.skip === true` のとき表示（`?` `*` `{0,n}` 等）。入口（左）からノード下をバイパスして出口（右）へ抜ける U 字。
- 日本語ラベルはノード下端のさらに下（スキップ弧の下、または弧が無い側の下バンド）に配置し、SVG ビューポートに収まるようにする。
- `railroad-layout.ts` の `measureRepetition`: 上バンド = ループ弧高さ、下バンド = スキップ弧高さ + ラベル高さ、を割り当てるよう `top`/`bottom`/`connectY` の計算を更新する。`skip`/`loop` の有無で必要バンドのみ確保する。
- `RegexRailroad.tsx` の `repetition` case: 弧の path を上下入れ替え、SVG `<defs>` に矢印 `<marker>` を1つ定義してループ弧終端に適用する。矢印マーカーの色は `rr-rail` と同系。

### 弧バンドの寸法（既存定数を流用）

- `ARC_H`（=16）をループ弧/スキップ弧の高さに使う。
- ラベル用バンドは既存 `LABEL_H`（=12）を流用。

実装後、Playwright MCP で PC(1280x800)・スマホ(390x844) の実描画スクショを撮り、モックアップと突き合わせて弧・矢印・ラベル位置を目視確認する（弧の正確な曲率はモックアップ準拠で微調整）。

## 4. グループ枠・凡例・カード

### グループ枠

- `rr-group`: 現状 `fill: none` + 破線 → **薄灰塗り**（`fill: var(--color-bg-subtle)`）+ 実線または淡い枠に変更。タイトル（`#1` 等）は現状どおり左上に表示。
- 先読み/後読みコンテナも同じ `rr-group` を使うため自動的に同スタイルになる。

### 凡例

- `RegexRailroad.tsx` の SVG 直下に静的な凡例を追加する。
- 構成: 破線の区切り線 + 4チップ（各チップ = 見本図形 + ラベル）。
  - 白ボックス → 「文字（リテラル）」
  - 青ボックス → 「文字クラス・メタ文字」
  - 紫円 → 「アンカー（位置）」
  - 弧アイコン → 「量指定子（くり返し・スキップ）」
- 凡例は小さな SVG 図形 + テキストで構成。レイアウトは flex（横並び、スマホ幅で折り返し可）。
- a11y: 凡例全体は装飾的説明だが、テキストラベルはそのまま読み上げ可能にする（`aria-hidden` は付けない）。見本図形のみ装飾扱い。

### 外枠カード（任意）

- モックアップは全体を薄枠角丸カードで囲んでいる。既存の鉄道図パネルに枠が無い場合のみ、`@layer components` の既存 class（`bg-subtle` 等）を用いて薄枠を追加する。過剰なら省略可（VRT 差分を最小化する観点で、実装時に既存パネル枠の有無を確認して判断）。

## 5. 配色トークンと CSS クラス

プロジェクト規約（Tailwind primitive scale 直書き禁止・色は CSS 変数経由）に従う。

### `@theme` への追加トークン（紫系）

既存パレットに薄紫が無いため追加する:

```css
--color-violet-bg: #ede9fe; /* violet-100 相当: アンカー塗り */
--color-violet: #7c3aed; /* violet-600 相当: アンカー枠/文字（既存 --color-link-visited と同値） */
```

青系は既存 `--color-bg-active`(#eff6ff = blue-50) と `--color-blue-100/200` を流用する。

### `@layer components` の `rr-*` クラス（追加・変更）

- 追加: `.rr-charclass`（青塗り + 青枠）, `.rr-anchor`（紫塗り + 紫枠）。
- 変更: `.rr-group`（薄灰塗り化）, `.rr-assertion` は `.rr-anchor` へ置換または統合。
- 凡例用クラス: `.rr-legend`（flex コンテナ）, `.rr-legend-item` 等を必要に応じて追加。
- Tailwind v4 の variant 制約に留意（`@layer components` 手書き class は `hover:` 等 variant 非対応）。本リデザインは hover を伴わないため影響は小さいが、状態色が必要なら専用 class を定義する。

> 注: 既存 `.rr-box-hot`（hotspot ハイライト）との重なり順を維持する。`charclass`/`anchor` ノードが hot のときも `rr-box-hot` が後勝ちで上書きできるよう、クラス付与順を `boxClass()` と同様に保つ。

## 6. テスト・検証

### unit テスト（更新）

- `src/utils/regex-visualizer/__tests__/railroad.test.ts`: `quantifierLabel` の期待値を日本語に更新。`Char`(meta) / `CharacterClass` が `charclass` kind になることを検証するケースを追加。リテラル `Char` が `terminal` のままであることも検証（種別分割のリグレッション防止）。
- `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`: `measureRepetition` の上下バンド割当（ループ=上 / スキップ=下 / ラベルバンド）を検証。`measureCharClass` の寸法を検証。
- `src/components/tools/__tests__/RegexRailroad.test.tsx`: 種別ごとの class 付与（`rr-charclass` / `rr-anchor`）、矢印 marker の存在、凡例レンダリングを検証。

### E2E テスト（更新）

- 量指定子ラベルを assert している箇所があれば日本語（例 `0回以上`）へ更新する。実装時に `tests/e2e/` を grep して該当を洗い出す。
- 本リデザインは検知機構ではないため陽性対照メタテストは不要。

### VRT

- regex-visualizer ページの描画が変わるため **baseline 再生成が必須**。
- baseline 更新は CI Linux runner の `Update Visual Regression Baseline` workflow を `workflow_dispatch` で実行する必要がある。**この workflow 実行はユーザーの明示承認を得てから行う**（エージェントが勝手に回さない）。実装・ローカル検証完了後にユーザーへ依頼する。

### ドキュメント更新

- 挙動（見た目）変更のため `docs/tools.md` の regex-visualizer 該当節があれば、鉄道図の色分け・凡例・日本語ラベルについて追記する。

## 7. 実装順序（概略）

1. `railroad-layout.ts`: `charclass` kind 追加・`measureCharClass`・`measureRepetition` の弧バンド改修。
2. `railroad.ts`: `build()` の `Char`/`CharacterClass` 振り分け・`quantifierLabel` 日本語化。
3. `global.css`: 紫トークン追加・`rr-charclass`/`rr-anchor`/`rr-group` 改修・凡例クラス。
4. `RegexRailroad.tsx`: 種別別 class 描画・矢印 marker・弧の上下入れ替え・凡例追加。
5. unit テスト更新 → `npm run test`。
6. 型チェック `node_modules/.bin/astro check`。
7. E2E 該当更新 → `npm run test:e2e`。
8. Playwright MCP 実描画スクショ（PC/スマホ）で目視確認・ユーザー承認。
9. VRT baseline 再生成（ユーザー承認後に workflow_dispatch）。

## 受け入れ基準

- リテラル・文字クラス/メタ文字・アンカーが色/形で区別される。
- 量指定子ラベルが日本語表示になる。
- ループ弧が上・矢印付き、スキップ弧が下で描かれる。
- グループ枠が薄灰塗りになる。
- 凡例4種が SVG 直下に表示される。
- 既存の hotspot ハイライト・後方参照・先読み等が壊れない。
- unit/型/E2E が green。
