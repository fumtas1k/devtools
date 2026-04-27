# 設計ドキュメント: ダウンロードボタンのデザイン統一

各ツールに散在するダウンロードボタンのデザイン、ラベル、コンポーネント実装を統一し、UIの一貫性とメンテナンス性を改善します。

## 1. 目的

- ユーザー体験（UX）の向上: どのツールでも同じ見た目のダウンロードボタンを提供し、操作の予見性を高める。
- メンテナンス性の向上: 重複するインライン実装を排除し、デザイン変更を一箇所で管理できるようにする。

## 2. 新コンポーネント仕様: `DownloadButton`

### 場所

`src/components/ui/DownloadButton.tsx`

### デザイン仕様

- **形状**: `rounded-lg` (0.5rem) / `px-4 py-2` (または `0.5rem 1rem`)
- **フォント**: `fontWeight: 600`, `fontSize: 0.875rem` (caption)
- **バリアント**:
  - `primary`: 背景 `colors.primary` / 文字 `colors.textOnPrimary` / ホバー `opacity: 90%`
  - `secondary`: 背景 透明 / 文字 `colors.primary` / 枠線 `colors.primary` / ホバー `colors.bgActive`
- **アイコン**: ダウンロードアイコン（インラインSVG）を常に表示
- **Disabled状態**: 背景 `colors.bgSubtle` / 文字 `colors.muted` / `cursor: not-allowed`

### Props 構成

```typescript
interface Props {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary'; // デフォルトは 'primary'
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}
```

## 3. 修正・リファクタリング計画

### 3.1 既存コンポーネントの置換

- `DownloadButtonGroup.tsx`: 内部実装を `DownloadButton` ベースに置換（API互換性を維持）。
  - SVGダウンロードボタンを `secondary` に。
  - PNGダウンロードボタンを `primary` に。
  - **モバイル対応**: `flex-wrap` および `justify-center` を追加し、狭い画面でのボタンはみ出しを防止。

### 3.2 インライン実装の置換

- `QrCode.tsx`: インラインボタンを `DownloadButton` (secondary) に置換。
- `JsonCsv.tsx`: インラインボタンを `DownloadButton` (secondary) に置換。
- `EncodingConverter.tsx`: インラインボタンを `DownloadButton` (secondary) に置換。
- `Gs1Databar.tsx`: インラインの「全件ZIPダウンロード」を `DownloadButton` (primary) に置換。
  - **追加修正**: モバイル表示でのAIフィールドはみ出しを解消するため、`flex-col sm:flex-row` 構成に変更。

### 3.3 ツール固有コンポーネントの置換

- `qr-ticket/GenerateTab.tsx`: `ActionButton` を使用している箇所を `DownloadButton` に置換（ダウンロード用途のみ）。
  - 「一括ZIPダウンロード」: `primary`
  - 「SVG保存」: `secondary` かつラベルを「SVGダウンロード」に改称。

## 4. ラベル表記のルール

- 原則として `{形式名}ダウンロード` とする。
- 既存の「保存」や「SVG ダウンロード（スペースあり）」をこれに合わせる。
- 複数のファイルをまとめる場合は「ZIPダウンロード」や「一括ZIPダウンロード」を許容する。

## 5. テスト・検証計画

- **自動テスト**: `npm run test` および `npm run test:e2e` を実行し、既存の機能が壊れていないことを確認する。
- **E2Eテストの修正**:
  - ラベルの変更（「SVG 保存」→「SVGダウンロード」など）に伴い、失敗する既存のE2Eテストを修正する。
  - 代表的なツール（QRコード、QRチケット等）において、新しい `DownloadButton` が正しく表示されているか確認する。
- **視覚的確認**: Playwright を使用して、PCサイズ (1280x800) とスマホサイズ (390x844) の両方でボタンの配置や余白、はみ出しがないかを確認する。
  - **色検証**: `PRIMARY_COLOR` (`rgb(26, 86, 219)`) や `DISABLED_BG` (`rgb(243, 244, 246)`) を用いた厳密な色検証を実施。
- **型チェック**: `astro check` を実行し、Propsの不整合がないか確認する。
