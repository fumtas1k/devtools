# issue #664 共通コンポーネント整合リファクタリング 設計

- **issue**: #664 `refactor(ui): 共通コンポーネント未使用による実装不整合の解消（VerifyTab/GenerateTab/SecretScrubber/QrReader）`
- **優先度**: 低（P3・保守性 / 一貫性の改善、機能影響なし）
- **方針**: 全 5 項目を 1 PR にまとめる（項目 1〜3 が QrReader / VerifyTab に集中し、同一 PR の方が整合性を取りやすい）

## 背景

全ツール横断の DADS 準拠監査で検出した「共通 UI コンポーネントが既にあるのにアドホック実装している箇所」を整理し、デザインシステムの一貫性を担保する。挙動は全項目で同等を維持する。

## 対象と実装方針

### 項目1: QrReader カメラ起動/停止/再スキャンボタンの ActionButton 集約

`QrReader.tsx` の 3 つの ad-hoc ボタンを共通 `ActionButton` に置換し、VerifyTab と実装を揃える（#285 の「現状維持 OK」判断を、VerifyTab との乖離発生を理由に覆す）。

- 起動 (`:124`): `bg-primary text-on-primary border-0` の独自 → `<ActionButton variant="primary">`
- 停止 (`:143`): `border-error bg-error-tint text-error` の独自 → `<ActionButton variant="danger">`
  - **挙動変更点（意図通り）**: 現状の `bg-error-tint`（赤系塗り）背景は撤去され、`btn-action--danger`（透過ベース + hover/focus-visible で `error-bg`）になる。VerifyTab の停止ボタンと完全一致する。
- 再スキャン (`:188`): `btn-action--default` 相当の compact 独自 → `<ActionButton size="compact">`（variant は default）
  - size を `compact` にすることで隣接 CopyButton と高さが揃い、現状の見た目を維持する（VRT 差分最小）。
- これに伴い `cx` import が QrReader 内で不要になれば除去する。

### 項目2: VerifyTab の video 背景を semantic class へ

`VerifyTab.tsx:94` の primitive `bg-black` → `qr-video-preview` semantic class。QrReader (`:138`) と同種の video 要素で既に使用されているクラスに揃える。

### 項目3: VerifyTab のファイル選択を FileInputButton 化

`VerifyTab.tsx:110-123` の独自実装（`label` + `sr-only input` + `qr-file-picker-label` 専用クラス）を共通 `FileInputButton` に置換する。

- `<FileInputButton accept="image/*" onChange={onImageUpload} disabled={!verifyPubKeyStr.trim()}>画像を選択</FileInputButton>`
- `FileInputButton` の `disabled` prop が `aria-disabled` + `disabled` 属性を担保する。
- **挙動変更点（意図通り）**: 無効時の見た目が `qr-file-picker-label`（bg-surface + muted）から `btn-file-input[aria-disabled]`（bg-subtle + opacity 0.6）に変わる。QrReader の FileInputButton と統一される。
- `.qr-file-picker-label` / `.qr-file-picker-label[data-enabled='true']` CSS は VerifyTab が唯一の利用箇所のため、置換後に `src/styles/global.css` から削除する（dead CSS 化の解消）。

### 項目4: readOnly textarea を InputField 化

OutputField ではなく **InputField (`multiline` + `readOnly` + `mono`)** を使う。

- **理由**: OutputField は textarea ラッパーに `role="status" aria-live="polite"` を強制する。SecretScrubber は PR #631 で「全文が変更のたびに読み上げ対象になり件数サマリ live region と二重アナウンスになる」ため aria-live を付けないと明示決定済み。OutputField を使うと #631 の修正が打ち消される。また OutputField は `bg-subtle`/`border-default` で現状（`bg-surface`/`border-input`）と VRT 差分が出る。InputField の readOnly スタイルは `bg-surface`/`border-input`/`font-mono` で現状とクラスがほぼ同一であり、VRT 差分ほぼゼロかつ aria-live を付与しない。

対象:

- `GenerateTab.tsx:155-162`（秘密鍵）/ `:171-178`（公開鍵）→ `InputField`
  - `multiline` / `readOnly` / `rows={4}` / `mono` / ラベルは現行文言を維持 / `headerRight` に既存の `CopyButton` を差し込む。
  - **微小 VRT 差分（意図通り）**: ラベルが `span.caption font-semibold` → `label.body-emphasis`（htmlFor で関連付け）に変わる。適切なラベル関連付けを獲得するための意図的変更。
- `SecretScrubber.tsx:126-134`（マスク出力）→ `InputField`
  - 同構成（`multiline`/`readOnly`/`rows={10}`/`mono`、`headerRight` に既存 CopyButton）。
  - **aria-live は引き続き付与しない**（PR #631 の挙動を維持。InputField は aria-live を付けないため要件を満たす）。
  - 現状の `aria-busy={isPending}` を温存するため、**InputField に optional な `busy?: boolean` prop を追加**する。multiline（textarea）時のみ `aria-busy={busy || undefined}` を渡す単純 passthrough。これにより debounce 中の `aria-busy` 表明を失わない。

### 項目5: border の arbitrary CSS 変数参照を semantic class へ

`Gs1Databar.tsx:239`・`GenerateTab.tsx:239` の `border-(--color-border)`（arbitrary shorthand）→ 既存 `border-default` クラスに置換。

## 影響範囲・依存

- 変更ファイル: `QrReader.tsx`, `qr-ticket/VerifyTab.tsx`, `qr-ticket/GenerateTab.tsx`, `SecretScrubber.tsx`, `Gs1Databar.tsx`, `ui/InputField.tsx`（`busy` prop 追加）, `styles/global.css`（`.qr-file-picker-label` 削除）。
- 既存共通コンポーネント（ActionButton / FileInputButton / InputField / CopyButton）の API はほぼそのまま利用。InputField のみ後方互換な optional prop を 1 つ追加。

## テスト・検証

- `npm run test`（ユニット）/ `node_modules/.bin/astro check`（型）/ `npm run test:e2e`（E2E）を push 前に実行。
- VRT 対象 3 ページ（`/tools/qr-reader`・`/tools/qr-ticket`・`/tools/secret-scrubber`）は登録済み。
- VRT 差分が出た場合は DOM 構造 diff / computed style diff の 2 段階検証を行い、真の regression でないことを確認したうえで目視確認に委ねる。pixel 数のみを根拠に baseline 更新を recommend しない（CLAUDE.md §6.8）。
- SecretScrubber: 既存ユニット/E2E（announcement live region・出力内容）が green であることを確認し、aria-live を再導入していないことを担保する。

## 非対象（スコープ外）

- 機能・ロジックの変更、新規ツール追加。
- 関連する他ツールの ad-hoc 実装（本 issue 列挙箇所以外）の横断的な共通化。
- OutputField そのものの改修。
