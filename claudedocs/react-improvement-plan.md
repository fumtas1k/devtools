# React ベストプラクティス改善計画

作成日: 2026-04-18

## フォルダ構造の評価

**変更不要** — 現状のフォルダ構造は適切。

- `components/tools/` と `components/ui/` の分離 ✅
- `hooks/` で共通フックを管理 ✅
- `utils/` でビジネスロジックを分離（テストも `__tests__/` に配置）✅
- `styles/` で CSS 変数を管理 ✅

---

## 改善項目

### 🔴 HIGH: 巨大コンポーネントの分割

| ファイル | 行数 | 問題 |
|----------|------|------|
| `QrTicket.tsx` | 1103行 | 20+ useState、カメラ管理ロジック混在、props過多 |
| `Gs1Databar.tsx` | 539行 | BarcodeCard内部定義、eslint-disable |
| `JwtDecoder.tsx` | 391行 | Section/PayloadValueがインライン定義 |
| `UuidV7Generator.tsx` | 385行 | ColoredUuidがインライン定義 |

### 🟡 MEDIUM: Reactパターン改善

| 問題 | ファイル | 詳細 |
|------|----------|------|
| setTimeout未クリーンアップ | `CopyButton.tsx:57` | アンマウント時にタイマーがリーク |
| eslint-disable | `Gs1Databar.tsx:165` | `onSvgChange` が deps から欠落。useCallback化で解決 |
| レンダー毎再計算 | `Gs1Databar.tsx:206-214` | `usedAis`, `gs1String` を `useMemo` 化 |

### 🟢 LOW: コード品質

| 問題 | ファイル | 詳細 |
|------|----------|------|
| ハードコード色値 | `UuidV7Generator.tsx:14-20` | `FIELD_COLORS` に直値 |
| ハードコード色値 | `JwtDecoder.tsx:17` | `jsonValueColor = '#6e4f0e'` |
| ActionButton再利用性 | `QrTicket.tsx:77` | `ui/` に抽出する価値あり |

---

## 実行フェーズ

### Phase 1: CopyButton setTimeout クリーンアップ ✅
- `useRef` でタイマーIDを保持
- アンマウント時に `clearTimeout` する `useEffect` を追加
- ファイル: `src/components/ui/CopyButton.tsx`

### Phase 2: QrTicket.tsx 分割
- `src/hooks/useCamera.ts` — カメラ起動/停止/スキャンループを抽出
- `src/components/tools/qr-ticket/GenerateTab.tsx` — 生成タブUI
- `src/components/tools/qr-ticket/VerifyTab.tsx` — 検証タブUI
- `src/components/tools/qr-ticket/QrTicketTool.tsx` — メインコンポーネント（状態管理のみ）

### Phase 3: Gs1Databar.tsx の eslint-disable 解消 + useMemo化
- `onSvgChange` を useCallback でラップし deps に追加
- `usedAis`, `gs1String` を `useMemo` 化
- ファイル: `src/components/tools/Gs1Databar.tsx`

### Phase 4: サブコンポーネント分離 ✅（確認済み・変更不要）
調査の結果、対象コンポーネントはすべて既にメイン関数より前のモジュールレベルで定義済みだった。

| ファイル | コンポーネント | 定義位置 |
|---|---|---|
| `JwtDecoder.tsx` | `PayloadValue` | 133行目（`JwtDecoderTool` の前） |
| `JwtDecoder.tsx` | `Section` | 156行目（`JwtDecoderTool` の前） |
| `UuidV7Generator.tsx` | `ColoredUuid` | 32行目（`UuidV7GeneratorTool` の前） |
| `UuidV7Generator.tsx` | `FieldBreakdownPanel` | 52行目（`UuidV7GeneratorTool` の前） |

分析時に「インライン定義」と誤判定したが、実際はベストプラクティス通り。

**残余の改善余地（スコープ外・任意）:**
`JwtDecoder.tsx` 内の純粋なユーティリティ関数（`toBase64Url`・`generateSampleJwt`・`pemToArrayBuffer`・`verifySignature`）を `utils/jwt.ts` へ移動するとテスタビリティが向上する。
