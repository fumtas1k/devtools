# har-viewer: 壊れた entry 行の再選択対応（issue #701）

## 背景・課題

`HarEntryList` は URL を持たない（request/response を欠く）壊れた entry 行を、非クリッカブルな
`<span>（壊れたエントリ）</span>` で描画している（`src/components/tools/HarEntryList.tsx`）。

- 読み込み時に先頭 entry が壊れている場合、auto-select で詳細パネルにプレースホルダが出る
  （issue #684 / PR #700 で対応済み）。
- しかし一度別の正常 entry をクリックして選択を移すと、**壊れた行はクリックできないため
  二度と選択し直せない**という非対称が残る。

issue #701 はこの非対称の解消方針を決めてから着手する follow-up。優先度は低（クラッシュなし）。

## 方針（owner 承認済み）

**壊れた行もクリック可能にして再選択できるようにする**（issue の対応案）。クリックすると
`HarEntryDetail` の既存プレースホルダ「request / response を欠くため詳細を表示できません。」が
出るため、auto-select の挙動と完全に一貫する。

検討した代替案:

- **auto-select が壊れ行を回避**: 読み込み時に最初の正常 entry を選ぶ案。プレースホルダを auto でも
  出さない方向だが、PR #700 が陽性 E2E で固定した「先頭 null でもプレースホルダ表示」の意図と衝突し、
  既存テストの書き換えが必要になるため不採用。
- **wontfix クローズ**: 既存仕様の範囲だが、再選択不能は明確な UX バグであり owner が対応を選択。

## 設計

### 変更対象

- `src/components/tools/HarEntryList.tsx`（本体）
- `src/components/tools/__tests__/HarEntryList.test.tsx`（既存 assert 更新 + 陽性対照追加）
- `tests/e2e/har-viewer.spec.ts`（再現シナリオの回帰 E2E 追加）

### HarEntryList.tsx の変更

`url == null` の分岐で描画している `<span>` を、`onSelect(i)` を呼ぶ `<button>` に置き換える。

```tsx
// before
<span className="text-muted">（壊れたエントリ）</span>

// after
<button
  type="button"
  aria-current={selectedIndex === i ? 'true' : undefined}
  className="text-left text-muted underline-offset-2 hover:underline"
  onClick={() => onSelect(i)}
>
  （壊れたエントリ）
</button>
```

- **affordance**: 正常行の URL ボタン（`text-primary` + `hover:underline`）と区別するため
  `text-muted` を維持。クリック可能性は `hover:underline` で示す（`underline` は Tailwind コア
  utility なので `hover:` variant が効く。`@layer components` 手書き class ではないため
  variant 非対応問題には該当しない）。
- **選択状態**: `aria-current` を正常行と同様に付与。行ハイライト（`bg-active`）は既存の `<tr>`
  側ロジックでそのまま効く。
- **対象**: `{}`・`null`・`url 欠落 request` のすべての `url == null` 行。これらは auto-select が
  land する index と一致するため、これで非対称が解消する。

`type="button"` は必須（lint で button type 漏れ検出あり）。

### データフロー

クリック → `onSelect(i)` → `HarViewer.setSelectedIndex(i)` → `selectedEntry` が壊れた entry →
`HarEntryDetail` が既存プレースホルダを描画。auto-select 経路と同一。

## テスト

### ユニット（HarEntryList.test.tsx）

既存テストが新挙動と矛盾するため更新する:

- 「壊れた entry の URL セルは選択 button を持たない」（現在 `getAllByRole('button')` が
  `toHaveLength(2)`）→ **新挙動に合わせて更新**。4 件中、url を持つ 2 行（ok / noresp）+
  壊れた 2 行（{} / null）= 計 4 button になる。
- **陽性対照を追加**: 壊れた行（「（壊れたエントリ）」button）をクリックすると `onSelect` が
  その index で呼ばれることを `vi.fn()` で検証。これを欠くと「button にしたが onSelect 未配線」の
  回帰を検知できない。
- 「（壊れたエントリ）」テキストが button の accessible name として残ることを確認。

### E2E（har-viewer.spec.ts）

issue の再現シナリオを回帰ガードとして追加:

1. 先頭が壊れた entry（`{}` または `null`）+ 正常 entry を含む HAR を読み込む。
2. auto-select で詳細プレースホルダが出ることを確認（前提）。
3. 正常 entry をクリックして選択を移す → 詳細に正常 entry の URL が出る。
4. 壊れた行（「（壊れたエントリ）」button）を再クリック → 詳細プレースホルダが再表示される。

修正前は手順 4 の button が存在せずクリックできないため、この E2E は fail する（陽性ガード）。

## スコープ外

- `HarEntryDetail` のプレースホルダ文言。
- `HarViewer` の auto-select ロジック。
- 他コンポーネント・VRT baseline（DOM 構造は button 化のみで視覚差は hover 時のみ。
  既存ページの静止 screenshot には影響しない想定。CI VRT で確認）。

## 検証

push 前に必須: `npm run test`（ユニット）/ `node_modules/.bin/astro check`（型）/
`npm run test:e2e`（E2E）。`npm run lint`（button type 漏れ検出）も実行。
