# JSON整形・ビューア PR2: JMESPath クエリ抽出 — 設計

## Context（なぜ作るか）

`json-formatter`（PR #506, v1）は整形・最小化・検証・折りたたみツリーを提供する。段階リリースの第 2 段として、**貼った JSON からクエリで値を抽出**する機能を追加する（ユーザー選択: 探索/クエリ軸、抽出方向、フィルタ条件あり）。

「本番の大きな JSON から必要な値だけ取り出す」用途を、プライバシーファースト（ブラウザ内完結）のまま実現する。

### エンジン選定: jmespath

本番 CSP は `script-src 'self' 'unsafe-inline'`（**`unsafe-eval` なし**、`src/utils/csp.ts`）。フィルタ式を `eval`/`Function` で評価するエンジンは CSP 違反で動かない。

- **採用: `jmespath`** — 独自パーサ/インタプリタで eval 不使用＝CSP 安全。約 81KB と軽量。フィルタ `[?price > \`1000\`]`・射影・関数まで対応。
- 却下: `jsonpath-plus`（約 644KB、safe eval モードの CSP 無違反が要実機検証でリスク）/ 自作 JSONPath+フィルタ評価器（式評価器の実装・テスト量が PR2 単体には過大）。
- 構文差（JMESPath ≠ JSONPath）はツール内の例・ヒントで吸収する。

## スコープ（PR2）

- クエリ**抽出**のみ（ツリー内インクリメンタル検索は対象外。必要なら別 PR）。
- フィルタ条件を含む JMESPath 全般。

## UX / UI

- オプション行の下に全幅の **クエリ欄「クエリ (JMESPath)」**（1 行 `InputField`、サンプル入力、クリア、JMESPath 構文ヒントへの外部リンク）。
- **クエリ空** → 結果は入力 JSON 全体（v1 の lossless 整形/ツリー、現状維持）。
- **クエリ有効** → 結果カラムに抽出結果を表示。既存の「テキスト/ツリー」「整形/最小化」「インデント」設定をそのまま適用。
- jmespath が該当なしのとき（`null` 返却）→ `null` を表示し、補足文言を添える。
- エラー表示は 2 系統に分離:
  - 入力 JSON 不正 → 入力欄下（v1 の `error`、現状維持）。
  - クエリ式不正 → クエリ欄下（新チャネル）。
  - 入力が不正な間はクエリを評価しない（クエリ欄に案内）。

## アーキテクチャ / 既存資産の再利用

- **依存追加**: `jmespath`（固定バージョン）+ devDep `@types/jmespath`。
- **`src/utils/json-formatter/query.ts`（新規）**: `runQuery(value: unknown, expr: string): { ok: true; result: unknown } | { ok: false; error: string }`。`jmespath.search` を try/catch し、不正式は日本語メッセージに変換。
- **`useCodecWithMeta` の meta 拡張**: `{ tree, value }`。`value` はパース済み JS 値（jmespath 入力用）。入力検証・全体整形・ツリーは v1 の lossless 経路を維持。
- **クエリ評価は codec の外**: component で `useMemo`（依存: query / meta.value / mode / indent）。クエリ入力は軽い debounce を挟む。
- **抽出結果の表示は既存経路を再利用**: `JSON.stringify(result)` → 既存 `parseJson` → `formatJson`/`minifyJson` / `buildTree`。クエリ結果は計算値のため lossless（元ソース slice）対象外で、JSON 数値表現に準拠する（大きな整数は精度欠落しうる旨を decisions に明記）。

### データフロー

```
入力 → parseJson → { ok, root(Node), value(JS値) }
  ├─ query 空      : 全体を lossless 整形/ツリー（v1）
  └─ query 有効    : result = runQuery(value, expr)
                     → 整形: JSON.stringify(result[, indent]) ／ ツリー: buildTree(parseJson(JSON.stringify(result)).root, ...)
                     → 不正式は queryError を別表示
```

## 不変条件・エッジ

- 入力が空 / 不正 → クエリ評価しない（クエリ欄 disabled or 案内）。
- result が `null`（該当なし）/ プリミティブ / 配列 / オブジェクト いずれも表示可（トップレベルプリミティブは v1 で対応済み）。
- 既存の深いネスト RangeError 日本語化（#1 fix）は再利用経路でも有効。

## テスト

- **単体（Vitest）** `query.test.ts`:
  - 陰性対照: ナビ（`a.b`）/ ワイルドカード（`items[*].price`）/ 再帰相当 / フィルタ（`items[?price > \`1000\`]`）/ 射影 / 関数 の抽出が正しい。
  - 陽性対照（別 it）: 不正式（`[?(` 等）で `ok:false` とエラー詳細を返す。「常に成功扱い」の空回り実装に当てると fail する設計。
- **E2E（Playwright, production CSP）** `json-formatter` spec 追記:
  - **陽性対照（CSP）**: フィルタ式クエリを実行し `withProductionCsp` の `guard` で **CSP 違反ゼロ**を assert（jmespath が eval 非使用であることを実機で証明。eval を使うエンジンに差し替えると fail）。
  - 抽出結果の表示、入力エラー / クエリエラーの分離表示、クエリクリアで全体表示に戻ること。
- **VRT**: クエリ UI 追加で `/tools/json-formatter` のスクショが変わるため、baseline を CI workflow_dispatch で再生成（PC + mobile、要ユーザー承認）。
- 実装時に **`test-gates` skill** を呼び、上記陽性対照（不正式検知 / CSP 無違反）の併設を確認する。

## ライブラリ確認（min-release-age）

- `jmespath` 0.16.0（2022 公開）/ `@types/jmespath` 0.15.2 — `min-release-age=7` 適合。`save-exact` で固定。
- install 後、パッケージ内に `Function(`/`eval(` が無いことを grep で確認し、CSP 安全を E2E 陽性対照で確証する。

## ドキュメント更新

- `SPEC.md`（2.3 ライブラリに jmespath 追記 / ツール説明にクエリ機能）
- `README.md`（json-formatter の説明にクエリ抽出を追記）
- `docs/decisions.md`（jmespath 採用理由＝CSP・サイズ・フィルタ、jsonpath-plus 却下理由、クエリ結果が lossless 非対象である点）

## 新規/変更ファイル（想定）

- 新規: `src/utils/json-formatter/query.ts` + `__tests__/query.test.ts`
- 変更: `src/utils/json-formatter/index.ts`（value を返す / 再利用 API）、`src/components/tools/JsonFormatter.tsx`（クエリ欄・2 系統エラー・useMemo 評価）、`tests/e2e/json-formatter.spec.ts`、`package.json` / `package-lock.json`、README / SPEC / decisions

## 後続（PR2 スコープ外）

- ツリー内インクリメンタル検索、jq 風サポート、クエリ履歴。
