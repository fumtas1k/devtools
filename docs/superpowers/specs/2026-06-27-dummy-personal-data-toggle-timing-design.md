# ダミー個人データ生成: トグル反映タイミングの統一 設計書

- 対象 issue: #737
- 由来: PR #736（issue #735 / 一意性オプション追加）レビューで挙がった UX 課題の分離

## 背景・目的

`dummy-personal-data` ツールには、一度「生成」を押した後の操作で

- **トグルを押すだけで即座にプレビューへ反映されるもの**（出力項目チップ・連番ID列）
- **もう一度「生成」を押さないと反映されないもの**（人数・年齢範囲・氏名区切り・一意化）

が混在し、ユーザの予測を裏切る。特に「出力オプション」グループ内で「連番ID列 (No.)」（即時反映）と
「メール・電話番号を一意化」（要再生成）が同居しているため、「トグルすればその場で一意化される」と
誤解されやすい。

本対応では **方針1（セクション分離）+ 方針2（未反映インジケータ）** を併用し、

1. 「再生成が必要な操作」と「即時反映される操作」を UI セクションとして構造的に分離する
2. 生成後に生成条件を変更したら「再生成が必要」をライブにフィードバックする

ことで、メンタルモデルの不一致を解消する。

## スコープ

### 対象（`src/components/tools/DummyPersonalData.tsx`）

- UI を 2 セクション（「生成条件」「出力の見せ方」）に再編し、見出しで区別する
- 現状の「出力オプション」グループ（`seqId` + `unique` 同居）を解体し、
  - `unique`（要再生成）→「生成条件」セクションへ
  - `seqId`（即時反映）→「出力の見せ方」セクションへ
- 生成条件が生成時のスナップショットから変化したら、生成ボタン近傍に未反映（stale）インジケータを表示する

### 対象（`src/utils/dummy-personal-data/`）

- 生成条件の署名を作る純関数 `generationSignature` を追加（stale 判定の比較に使う・test-gates 陽性対照を書けるようにする）

### スコープ外

- 即時反映ロジック自体（`fields` / `seqId` のプレビュー描画）の変更
- 生成ロジック（`generate.ts` の乱数・辞書・一意化アルゴリズム）の変更
- 方針3（一意化を即時反映にする）— 一意化だけ即時化すると人数/年齢/区切りとの間に新たな不整合が
  生じ、件数依存・破壊的という難点も残るため不採用（`docs/decisions.md` に理由を記録）

## UI 設計（`DummyPersonalData.tsx`）

### セクション構成

```
NotificationBanner（架空データ警告・変更なし）

■ 生成条件
   補足: 「変更したら『生成』を押し直すとプレビューに反映されます」
   ・出力する人数（既存）
   ・年齢範囲（既存）
   ・氏名の区切り（既存）
   ・一意化 ToggleChips（unique を移設、legend「一意化」）

■ 出力の見せ方
   補足: 「プレビューに即時反映されます（生成し直し不要）」
   ・出力する項目 ToggleChips（fields・既存）
   ・追加する列 ToggleChips（seqId を移設、legend「追加する列」）

出力形式 ToggleGroup + [生成] + 未反映インジケータ + [ダウンロード]

プレビュー表（既存）
```

### 見出し・補足のスタイル

- 既存のラベル表現を流用し、新規 Tailwind 色直書き（`text-blue-*` 等）は使わない。
- セクション見出しは **`<p className="body-emphasis text-default">`** で表現する（`<h2>`/`<h3>` は使わない）。
  既存コンポーネント本体は全ラベルを `<p className="body-emphasis">` で統一しており、`ToolInfoSection` 側が
  `h3` を使う構成なので、本体に見出し要素を足すと heading-order を乱す。視覚的見出しに留める。
- 補足キャプション: `caption text-muted`
- `@layer components` への新規クラス追加は不要（既存の意味クラス・semantic token のみで構成）。

### トグルの振り分け

- `unique`（一意化）は単独 `ToggleChips`（legend「一意化」、チップ「メール・電話番号を一意化」）として
  「生成条件」セクションに置く。
- `seqId`（連番列）は単独 `ToggleChips`（legend「追加する列」、チップ「連番ID列 (No.)」）として
  「出力の見せ方」セクションに置く。
- `fields`（出力項目）の `ToggleChips` は「出力の見せ方」セクションに据え置き（legend は既存の「出力する項目」）。

## 未反映（stale）インジケータ設計（方針2）

### 署名関数（`src/utils/dummy-personal-data/`）

```ts
export interface GenerationParams {
  count: number;
  ageMin: number;
  ageMax: number;
  separator: string; // SEP_MAP[sep] 適用後の文字
  unique: boolean;
}

export function generationSignature(p: GenerationParams): string;
```

- 生成結果に影響する生成条件（人数・年齢下限・年齢上限・氏名区切り・一意化）のみを対象に決定論的な
  文字列署名を返す。
- `fields` / `seqId` / `format` は即時反映（または出力時のみ作用）なので署名に**含めない**。
- 配置: `generate.ts` に追加（生成条件と密結合のため）。export してユニットテストから検証可能にする。

### コンポーネント側の state とロジック

- `generate` 実行時に、その時点の生成条件署名を `lastGenSig` state に保存する。
- 現在の生成条件署名 `currentSig` を毎レンダーで算出（`generationSignature` 呼び出し。安価なので memo 不要、
  必要なら `useMemo`）。
- `isStale = records.length > 0 && currentSig !== lastGenSig`。
- 比較に使う `count` / `ageMin` / `ageMax` は `useClampedInput` の確定値（`value`）を用いる
  （入力途中の `inputStr` ではなく確定値で比較する）。

### 表示

- `isStale` のとき、生成ボタンの近傍に未反映インジケータを表示する。
- マークアップ: ライブ領域を**常時 DOM に置き**（空 → 内容挿入で SR が読み上げる）、`aria-live="polite"`
  - `aria-atomic="true"` を付与する。**`role="status"` は付けない**。
  * 理由: プレビュー側に既存の `role="status"`（「N 件…生成しました」アナウンス）があり、新インジケータにも
    `role="status"` を付けると status ロールが 2 つになって既存 E2E の `getByRole('status')`（単数 strict）が
    壊れる。`aria-live` のみなら status ロールにならず衝突しない。
- 文言: 「生成条件が変更されました。再生成してください」。
- スタイル: 既存の `ChipLabel`（`tone="info"`、`chip-label--info` は `global.css` に定義済み）を用い、
  新規色クラスは追加しない。空のときレイアウトを動かさないよう、余白（`mt-2`）は `isStale` のときのみ付ける。
- 即時反映トグル（`fields` / `seqId`）や出力形式変更では **表示しない**（署名に含めないため自然に満たす）。
- 再生成すると `lastGenSig` が更新され、インジケータは消える。

## テスト設計（test-gates 準拠）

### ユニット（`src/utils/dummy-personal-data/__tests__/generate.test.ts` へ追記）

- **陰性対照**: 同一の生成条件 → `generationSignature` が同一文字列を返す（誤検知しないこと）。
- **陽性対照**: 各フィールド（count / ageMin / ageMax / separator / unique）を 1 つずつ変えると署名が
  変化する（＝ stale 検知が実際に効くこと）。フィールドごとに個別検証し、「どれか 1 つ変えれば検知できる」
  ことを担保する。
- **非影響**: 署名対象外（出力整形系）が署名に混ざっていないことは、`GenerationParams` 型に存在しない
  ことで構造的に保証されるため、テストは生成条件フィールドのみを対象とする。

### E2E（`tests/e2e/dummy-personal-data.spec.ts` へ追記）

- **陽性対照**: 生成 → 人数を変更 → 「生成条件が変更されました。再生成してください」がテキストで出現
  （`getByText`）。
- **陰性対照1**: 上記からさらに「生成」押下 → インジケータが消える（`toHaveCount(0)` / `not.toBeVisible`）。
- **陰性対照2**: 生成 → 連番ID列トグル（即時反映）押下 → インジケータが**出ない**（プレビューは即時変化）。
- セクション見出し「生成条件」「出力の見せ方」が表示されることを確認。

> 注: インジケータは `role="status"` を持たない（`aria-live` のみ）ため、既存の `getByRole('status')`
> （生成完了アナウンス）と衝突しない。E2E ではテキスト内容（「変更されました」）で識別する。

## ドキュメント更新

- `SPEC.md` 5.31: UI セクション構成（生成条件 / 出力の見せ方）と stale インジケータの記述を追記。
- `docs/tools.md`: 該当ツールの UI 説明があれば、トグルの即時反映 / 要再生成の区別と未反映表示を追記。
- `docs/decisions.md`: 方針1+2 採用と方針3 不採用の理由（一意化だけ即時化すると新たな不整合が生じる）を記録。

## 注意（運用）

UI を再編・インジケータ追加するため VRT baseline に差分が出る。**web セッションのトークンでは
`workflow_dispatch` 不可**のため、`Update Visual Regression Baseline` workflow の手動トリガーが
PR 後に必要（`.claude/rules/github-web-session.md`）。`/tools/dummy-personal-data` は
`tests/e2e/visual-regression-pages.ts` に登録済み。
