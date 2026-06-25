# HAR ウォーターフォール（タイミング可視化）設計

- 親 issue: #674
- 元設計: `docs/superpowers/specs/2026-06-14-har-viewer-design.md`（v1）
- 決定記録: `docs/decisions.md [116]`
- slug: `har-viewer`（既存ツールの拡張。新規ツールではない）
- 作成日: 2026-06-15

## 目的

HAR ビューア v1（閲覧＋サニタイズ）に、各リクエストの所要時間を横棒で可視化する
**ウォーターフォール**を追加する。各エントリの `timings`（`blocked` / `dns` /
`connect` / `ssl` / `send` / `wait` / `receive`）と `startedDateTime` / `time` を使い、
全体タイムライン基準でフェーズ別に色分けした横棒を一覧テーブルに重ねて表示する。

## スコープ

### やること

- 一覧テーブルに「タイミング」列を追加し、各リクエストの横棒（フェーズ別色分け）を表示
- 全体タイムライン基準（最初の `startedDateTime` を起点に相対配置）
- フェーズ別内訳のツールチップ（バー）＋ 詳細パネルへの内訳表示
- PC（1280x800）/ スマホ（390x844）両対応のレスポンシブ
- DADS カラートークン経由の配色（primitive scale 直書き禁止）
- VRT baseline 再生成（CI Linux runner、手動 `workflow_dispatch`）

### スコープ外

- 列ソート・フィルタ（タイミング順並び替え等）。本 PR では現状の配列順を保つ
- バーのドラッグズーム / 範囲選択等のインタラクション
- `timings` を持たない HAR の補完推定（持たないエントリはバー非表示で degrade）

## アーキテクチャ

```
src/utils/har/
  types.ts          # HarTimings 型を追加し HarEntry.timings を定義
  waterfall.ts      # 新規: computeWaterfall（純関数）
  index.ts          # re-export 追加
  __tests__/
    waterfall.test.ts   # 新規: 陽性対照テスト
    sanitize.test.ts    # timings 非破壊の確認テストを追加

src/components/tools/
  HarEntryList.tsx       # タイミング列を追加
  HarEntryDetail.tsx     # フェーズ別内訳セクションを追加
  HarWaterfallBar.tsx    # 新規: 一覧用の横棒セル（表示専用）

src/styles/global.css    # @theme フェーズ色トークン + @layer components クラス
```

### データ型（`types.ts`）

```ts
export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  send?: number;
  wait?: number;
  receive?: number;
  ssl?: number;
  comment?: string;
  [key: string]: unknown;
}
```

`HarEntry` に `timings?: HarTimings` を追加する。サニタイザは `structuredClone` で
コピーしてから処理し `timings` には触れないため、サニタイズ後も保持される。

### 純粋ロジック（`waterfall.ts`）

`computeWaterfall(entries: (HarEntry | null)[]): WaterfallModel` を純関数で実装する。

```ts
export type HarPhase = 'blocked' | 'dns' | 'connect' | 'ssl' | 'send' | 'wait' | 'receive';

export interface WaterfallSegment {
  phase: HarPhase;
  ms: number; // フェーズ所要時間（ms、> 0）
  widthRatio: number; // バー内相対幅（ms / totalMs、0..1）。flex セグメント幅に使う
}

export interface WaterfallRow {
  hasTimeline: boolean; // 起点・timings から描画可能か
  offsetRatio: number; // 全体起点からの相対開始位置（(start - t0) / globalTotal、0..1）
  widthRatio: number; // バー全体幅（durationMs / globalTotal、0..1）
  totalMs: number; // このエントリの所要時間（フェーズ合計）
  segments: WaterfallSegment[];
}

export interface WaterfallModel {
  totalMs: number; // 全体タイムラインの総時間（ms）
  rows: WaterfallRow[]; // entries と同じ長さ・同じ順序
}
```

#### アルゴリズム

1. 各エントリの `startedDateTime`（ISO 文字列）を `Date.parse` で epoch ms に変換。
   解析不能・欠落は `hasTimeline=false`。
2. 有効な起点の最小値を `t0`、`start + max(time, フェーズ合計)` の最大値を `tEnd` とし、
   全体総時間 `totalMs = tEnd - t0`（0 以下なら 1 にフォールバックして除算を防ぐ）。
3. 各エントリのフェーズ列を組み立てる:
   - `blocked` / `dns` / `connect` / `send` / `wait` / `receive` の順に並べる
   - **`ssl` は `connect` に含まれる**（HAR 1.2 仕様: ssl は connect の部分時間）。
     二重計上を避けるため、`ssl >= 0` のとき `connect` セグメントを
     `connect - ssl`（下限 0）と `ssl` の 2 セグメントに分割し、色は connect→ssl の順で並べる
   - 値が `-1`（該当なし）/ 未定義 / `0` のフェーズはセグメント化しない
4. エントリ毎: `offsetRatio = (start - t0) / globalTotal`、`widthRatio(bar) = durationMs / globalTotal`。
   各セグメントの `widthRatio = ms / durationMs`（バー内相対。flex で横並びにする）。
5. `rows` は入力 `entries` と同じ index 対応（壊れたエントリも `hasTimeline=false` で埋める）。

純関数・入力非破壊。`entries` を読むのみで mutate しない。

### 配色（`global.css`）

7フェーズを質的に区別できる semantic token を `@theme` に新設する（primitive scale を
className に直書きしない原則に従い、CSS 変数経由で指定）。

```css
@theme {
  --color-har-blocked: #9ca3af; /* neutral-400: 待機・キュー */
  --color-har-dns: #854d0e; /* amber-800 系: 名前解決 */
  --color-har-connect: #15803d; /* green-700: TCP 接続 */
  --color-har-ssl: #7c3aed; /* violet-600: TLS ハンドシェイク */
  --color-har-send: #0e3293; /* tertiary: 送信 */
  --color-har-wait: #1a56db; /* primary: TTFB（最重要フェーズ） */
  --color-har-receive: #2563eb; /* blue-600: 受信 */
}
```

`@layer components` に各フェーズの背景クラスを定義（Tailwind v4 の variant 非対応制約に
留意し、hover 等は付けず塗りのみ）:

```css
@layer components {
  .har-phase-blocked {
    background: var(--color-har-blocked);
  }
  .har-phase-dns {
    background: var(--color-har-dns);
  }
  .har-phase-connect {
    background: var(--color-har-connect);
  }
  .har-phase-ssl {
    background: var(--color-har-ssl);
  }
  .har-phase-send {
    background: var(--color-har-send);
  }
  .har-phase-wait {
    background: var(--color-har-wait);
  }
  .har-phase-receive {
    background: var(--color-har-receive);
  }
}
```

色値は WCAG コントラストを満たす既存トークンの色相を流用しつつ、隣接フェーズが
区別できる質的パレットとする。フェーズ→クラス名の対応は `HarWaterfallBar` 内の
定数マップで一元管理する。

### 一覧テーブル（`HarEntryList.tsx`）

- `<thead>` に「タイミング」列ヘッダを追加（`scope="col"`）。
- 各行の末尾セルに `HarWaterfallBar` を描画。`WaterfallModel.rows[i]` を渡す。
- **スマホ列非表示**: ヘッダ・セルの両方に `hidden md:table-cell`（レイアウト
  ユーティリティのため許可）を付け、390px では列ごと消す。情報は詳細パネルで担保。
- `computeWaterfall` は `HarViewer` 側で `useMemo` 化し、`entries` から 1 回計算して
  `HarEntryList` に渡す（行ごとの再計算を避ける）。

### 横棒セル（`HarWaterfallBar.tsx`、表示専用）＋ 動的幅の指定方法

- `position: relative` のトラック（横幅 100%）内に、`left: offsetRatio%`・
  `width: totalRatio%` のバーを絶対配置し、その中にフェーズセグメントを `flex` で横並び。
- 各セグメント幅は `ms / totalMs`（バー内相対）。最小視認幅は CSS の `min-width` で担保。
- バー全体に `title` と `aria-label` でフェーズ内訳（例:「wait 120ms, receive 30ms, 合計 165ms」）。
- `hasTimeline=false` の行は `—` を表示。

#### ⚠️ 動的幅・オフセットは inline `style` 禁止（CSP `style-src` / decisions [067]）

本プロジェクトは **`style` 属性 / `setProperty` を一切使わない**。`ProgressBar` と同様、
`useDynamicStyleSheet`（Constructable Stylesheets = `new CSSStyleSheet()` + `replaceSync`、
`style-src` 対象外）で CSS カスタムプロパティを注入する。`style={{ width }}` も
`style={{ '--bar-width': ... }}` も**不可**。

実装方針（per-row stylesheet を量産しないため、一覧では**単一の hook 呼び出し**で全行分の
ルールを生成する）:

- `useDynamicStyleSheet` は **hook なのでループ内・行ごとに呼べない**（Rules of Hooks）。
  よって `HarEntryList`（一覧レベル）で **1 回だけ** `useDynamicStyleSheet` を呼び、
  `WaterfallModel` 全体から全行・全セグメント分の CSS ルールを 1 つの文字列にまとめて生成する。
- ルールはスコープ class（hook が返す）配下で、行・セグメントを index で識別して当てる:
  ```
  .${scope} [data-har-bar="i"]   { --bar-left: L%; --bar-width: W%; }
  .${scope} [data-har-seg="i-j"] { --seg-width: S%; }
  ```
- `global.css` 側の `.har-bar` / `.har-seg` 基底クラスが
  `left: var(--bar-left); width: var(--bar-width)` / `width: var(--seg-width)` を参照する。
- `HarWaterfallBar` は純粋な表示コンポーネントとして、`data-har-bar` / `data-har-seg`
  属性と `.har-phase-*` 色クラスを付けた要素を描画するのみ（dynamic stylesheet は親が管理）。
- 詳細パネルのミニバーは 1 エントリのみ描画のため、`HarEntryDetail` 内で
  `useDynamicStyleSheet` を 1 回呼んで同様に当てる。

> パフォーマンス注記: 一覧は v1 同様に全エントリを描画する方針。大型 HAR では生成 CSS
> 文字列が大きくなりうるが、`replaceSync` 1 回・単一 sheet のため adoptedStyleSheets の
> 増殖は起きない。行ごとに hook を呼ぶ実装（sheet 量産）は禁止。

### 詳細パネル（`HarEntryDetail.tsx`）

- 「タイミング」セクションを追加し、各フェーズ（`-1`/欠落を除く）を行で表示:
  フェーズ名・色チップ・ms 値・フェーズ内相対ミニバー。
- `timings` が無いエントリではセクションごと非表示。
- スマホで一覧のバー列が消える分、ここがタイミング情報の主担保になる。

## アクセシビリティ

- バーは装飾。意味は `aria-label`（バー）と詳細パネルのテキストで担保する。
- 色のみに依存しないよう、詳細パネルはフェーズ名テキストを併記する。
- 列ヘッダ `scope="col"`、`hidden md:table-cell` で a11y ツリーからも整合的に消える。

## テスト

### 陽性対照必須（`test-gates` 準拠）

`computeWaterfall` は「タイミングを正しく配置する」検出器ではないが、計算ロジックの
回帰を防ぐため期待値 assert を陽性対照として置く:

- **既知 timings → 期待 ratio/offset**: 2〜3 エントリの固定 HAR で、各 row の
  `offsetRatio` / 各セグメント `ratio` / `totalMs` が期待値に一致することを assert。
- **ssl/connect 重複控除**: `connect=100, ssl=40` → connect セグメント 60ms + ssl 40ms に
  分割され、合計が二重計上されないことを assert（控除しない実装なら fail する陽性対照）。
- **`-1`・未定義の除外**: `dns=-1` のフェーズがセグメントに現れないことを assert。
- **欠落エントリ**: `startedDateTime` 欠落・`null` エントリ・`timings` 欠落で
  `hasTimeline=false` になり例外を投げないことを assert。
- **全体タイムライン基準**: 起点の異なる 2 エントリで、後発エントリの `offsetRatio` が
  正しく相対配置されることを assert。

### サニタイズ非破壊

- `sanitize.test.ts` に、`timings` を含む HAR をサニタイズしても `timings` が
  そのまま保持される（mutate されない）ことの assert を追加。

### 型・E2E・VRT

- `node_modules/.bin/astro check`（型）
- `npm run test`（ユニット）
- `npm run test:e2e`（E2E、preview 経由）
- `/tools/har-viewer` は既に VRT 登録済み。**baseline 再生成は CI Linux runner の
  手動 `workflow_dispatch`**（web セッションは `actions: write` 無しで起動不可。
  マージ前にユーザーへ手動トリガーを依頼する）。

## ドキュメント更新

- `docs/tools.md`: HAR ビューアの仕組みに timings / ウォーターフォールの解説を追記。
- `docs/decisions.md`: [116] に追補（ウォーターフォール実装方針・ssl/connect 控除・配色）
  または新規決定として記録。
- `SPEC.md`: 該当章（機能一覧・進捗）に反映。
- README は既存ツールの機能拡張のため、ツール一覧の記述に変更が必要なら更新。

## 段階分け（実装順）

1. 型拡張（`HarTimings` / `HarEntry.timings`）＋ サニタイズ非破壊テスト
2. `computeWaterfall` ＋ 陽性対照テスト（ここまでで純ロジック完結）
3. 配色トークン＋クラス（`global.css`）
4. `HarWaterfallBar` ＋ `HarEntryList` 列追加（スマホ非表示）
5. `HarEntryDetail` 内訳セクション
6. `HarViewer` で `useMemo` 配線
7. ドキュメント更新
8. 型 / ユニット / E2E 検証 → push → PR → VRT 手動トリガー依頼
