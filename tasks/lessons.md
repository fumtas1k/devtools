# セッションで得た教訓・修正パターン

次のセッション開始時に確認する。

---

## [2026-04-14] UIレイアウト：ボタン高さがラベル行の高さを決める

### 現象

横並びレイアウトで、入力エリアと出力エリアのテキストエリア上端がずれていた。
ボタンが出現する前（初期状態）からずれており、ボタンの `visibility: hidden` で隠しても
高さは DOM に残ったままになる。

### 原因

ラベル行に hidden で配置されたボタンの実際の高さがラベル行の `minHeight` を超えていた。

- `CopyButton`（`py-2` + `lineHeight: 1`）→ 約 **32px**
- `CSVダウンロード`ボタン（`py-1.5` + `...caption` の `lineHeight: 1.7`）→ 約 **38px**

`caption` スタイルは `lineHeight: 1.7` を含むため、テキスト高が `fontSize` より大きくなる。

### 修正

ボタンに `lineHeight: 1` を明示追加して高さを揃える：

```tsx
style={{
  ...caption,
  lineHeight: 1,   // ← 追加。captionの lineHeight:1.7 を上書きしてボタン高さを抑える
  ...
}}
```

### 教訓

- **`...スタイルオブジェクトを spread したボタン` は lineHeight に注意**。`caption` / `bodyEmphasis` は lineHeight が 1.7 で、ボタンの実高さが意図より大きくなる。
- **ボタン高さを揃えたい場合は `lineHeight: 1` を明示する**（CopyButton パターンに倣う）。
- **`visibility: hidden` で隠しても高さは残る**。隣の要素に影響するので、ラベル行に hidden ボタンを入れるときは全ボタンの高さを統一しておく。

### 予防策

UIレイアウト変更後は Playwright でPC（1280×800）とスマホ（390×844）の両サイズを確認する（`CLAUDE.md` の「UIコンポーネント・レイアウト変更時の目視確認」参照）。

---

## [2026-04-14] レスポンシブ：モバイルで幅が縮まらない

### 現象

`md:flex-row` で横並びにしたとき、スマホ幅（縦並び）でも子要素の幅が縮まらず、
横スクロールが発生した。

### 原因

`flex-1` は flex コンテナが `flex-row` のときは有効だが、`flex-col` のときは
横幅が親に依存する。`min-w-0` がないと flexbox がコンテンツ幅を優先してしまう。

### 修正

```tsx
// ❌ 修正前
<div className="md:flex-1">

// ✅ 修正後
<div className="w-full md:flex-1 min-w-0">
```

### 教訓

- **横並び ↔ 縦並び切り替えには `w-full md:flex-1 min-w-0` がセット**。
- `min-w-0` を忘れると長いコンテンツがはみ出す。
