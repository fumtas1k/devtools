# UI 実装・E2E 詳細規約

このドキュメントは、UI コンポーネントを変更する際／Playwright で UI 確認・E2E テストを書く際に参照する詳細パターン集です。
基本ルール（Tailwind カラー使用制限・PC スマホ両サイズでの目視確認義務）は `docs/shared-agent-rules.md` の 6.1 / 7.1 を参照してください。

---

## 1. UI スタイリングパターン

### 1.1 ホバー時の色変化

`hover:` クラスは禁止（カラークラス使用制限と整合させるため）。`onMouseEnter` / `onMouseLeave` でインラインスタイルを差し替える。

```tsx
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
/>
```

### 1.2 ボタン高さの揃え

横並びでボタン高さを揃えたい場合は **`lineHeight: 1` を明示する**（`caption` / `bodyEmphasis` は lineHeight 1.7 のため意図より大きくなる）。

### 1.3 横並び ↔ 縦並びレスポンシブ

切替レイアウトには **`w-full md:flex-1 min-w-0`** をセットで使用（`min-w-0` を忘れると長いコンテンツがはみ出す）。

### 1.4 ToggleGroup のモード切替時のリセット要否

| トグルの種類                                 | リセット | 理由                       |
| :------------------------------------------- | :------- | :------------------------- |
| 操作の種類が変わる（エンコード/デコード等）  | する     | 入力の期待形式が変わる     |
| 同じ操作のサブバリアント（標準/URL-safe 等） | しない   | 出力比較のために保持が便利 |

---

## 2. Playwright での確認手順

### 2.1 撮影手順（必須）

```
1. caches.delete + localStorage.clear + sessionStorage.clear
2. browser_navigate（キャッシュなし）
3. browser_resize 1280x800 → screenshot
4. browser_resize 390x844 → screenshot
```

### 2.2 ロケーター・アサーション

- `getByRole` / `getByText` / `getByLabel` を使う。`locator('[role="X"]')` のような属性セレクタは禁止（アクセシビリティ・国際化に弱く、リファクタリング耐性も低い）。
- DOM 直接操作（`page.evaluate`）より `expect` のオートリトライを優先（React の再レンダータイミングで不安定になるため）。
