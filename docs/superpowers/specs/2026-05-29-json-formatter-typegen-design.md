# JSON整形・ビューア PR4: TypeScript 型生成 — 設計

## Context（なぜ作るか）

`json-formatter` 段階リリースの最終段（v1 で掲げた 3 軸: クエリ・マスク・型生成 の最後）。実 API レスポンスを貼って **TypeScript の型定義を起こす** ことを、プライバシーファースト（ブラウザ内完結）のまま実現する。

スコープは **TypeScript のみ**（Go/Zod は後続）。エンジンは **自作エミッター**（依存ゼロ・CSP 安全・小バンドル）。`quicktype-core`（2.3 MB）/ `json-to-ts`（2017 年製・`es7-shim` 等 3 依存・TS 専用）は却下。

## スコープ（PR4）

- 表示モードに **「型」** を追加（既存 text/tree/mask と同列）。
- 入力 JSON（クエリ有効時は抽出結果）から TypeScript の型定義を生成し、コピー/DL（`types.ts`）。
- TypeScript のみ。Go/Zod・カスタムルート名・型の手編集は対象外。

## 型推論（全要素マージ）

`src/utils/json-formatter/type-gen.ts` に内部型 `TypeNode` を定義し、パース済み JS 値から再帰推論する。

```ts
type TypeNode =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'object'; fields: Map<string, { type: TypeNode; optional: boolean }> }
  | { kind: 'array'; element: TypeNode }
  | { kind: 'union'; members: TypeNode[] }
  | { kind: 'unknown' }; // 空配列の要素型など
```

- **primitive**: `typeof` で `string`/`number`/`boolean`、`null` は専用。
- **object**: 各プロパティを推論。
- **array**: 全要素を推論し **マージ** して単一の要素型に。
  - object 要素同士のマージ: フィールド集合の和。**いずれかの要素で欠けるキーは `optional: true`**。同名キーの型が異なれば union。
  - 異種要素（object と primitive 混在等）は union。
  - 空配列 → `unknown`。
- **union**: 重複を除いた型の集合（`string | number`）。`null` も union 要素として扱う（例 `number | null`）。

### マージ例

`[{a:1}, {a:null, b:2}]` →

```ts
{ a: number | null; b?: number }
```

## TS エミッター

`generateTypeScript(value: unknown, rootName = 'Root'): string`:

- ルートが **object** → `interface Root { ... }`。
- ルートが **array** → 要素型を生成し `type Root = Elem[]`（要素が object なら `interface RootItem` を別途出力）。
- ルートが **primitive/union** → `type Root = ...`。
- **ネスト object は別 interface に切り出して命名**: キー名を PascalCase 化（例 `user` → `User`、`order_items` → `OrderItems`）。名前衝突は数字サフィックス（`User`, `User2`）。配列要素 object は親名 + `Item`（`Tags` → `TagsItem`）。
- フィールド: `key: T;`、optional は `key?: T;`。キーが TS 識別子にならない場合は `"key-name": T;`（クォート）。
- 出力は **依存している interface を先に、ルートを最後** に並べる（前方参照でも TS は通るが可読性のため）。

純関数・依存ゼロ・CSP 影響なし（文字列生成のみ）。

## アーキテクチャ（既存踏襲）

- `src/utils/json-formatter/index.ts` で `export * from './type-gen';`。
- `JsonFormatter.tsx`: `View` に `'type'` 追加、表示トグルに「型」。mask と同方式で `useMemo` 生成（基準値＝クエリ有効なら抽出結果、無ければ `meta.value`）。`view === 'type'` 時に `OutputField`（`ariaLabel="生成された型"`、DL ファイル名 `types.ts`、mime `text/plain`）。
- **コンポーネントのモード切り出し refactor は本 PR では行わない**（追加のみ）。肥大化対応は別 issue に分離。

## 不変条件・エッジ

- 入力が空/不正 → 型生成しない（結果欄は既存どおり空）。
- クエリ有効で抽出結果が `undefined`/`null` → ルートは `type Root = null;` 等、生成は破綻しない。
- 生成は実構造に基づく（マスクは適用しない）。
- 巨大ネストは既存同様 RangeError の可能性があるが、生成経路は `processJson` を通さない純粋走査のため、深いネストは `generateTypeScript` 内で再帰。極端な深さは v1 では許容（型生成は通常 API レスポンス規模を想定）。

## テスト

- **単体（Vitest）** `type-gen.test.ts`（変換器のため通常の単体テストで担保。検知機構ではないので test-gates 陽性対照は不要）:
  - primitive ルート / object ルート / array of object ルート。
  - 全要素マージ（欠けキー→optional、型違い→union、`null` の扱い）。
  - ネスト object の interface 切り出しと命名（PascalCase・衝突サフィックス・配列要素 `Item`）。
  - 非識別子キーのクォート。
  - 空配列 → `unknown[]`。
  - エミッター出力の厳密文字列一致。
- **E2E（Playwright, production CSP）** `json-formatter` spec 追記:
  - 型モードでサンプル入力 → 生成 TS（`interface Root` 等）が表示される、コピー可能、CSP 違反ゼロ。
- **VRT**: 「型」トグル追加で `/tools/json-formatter` のスクショが変わるため、必要なら baseline 再生成（CI 判定。mask 同様、閾値内で pass する可能性あり。再生成は workflow_dispatch・要ユーザー承認）。

## ドキュメント更新

- `README.md`（json-formatter 説明に型生成追記）
- `SPEC.md`（4 章 row 20 概要に TypeScript 型生成）
- `docs/decisions.md`（[095] 自作エミッター採用＝CSP/バンドル/将来 Zod 拡張、quicktype・json-to-ts 却下理由、TS-only スコープ）

## 新規/変更ファイル（想定）

- 新規: `src/utils/json-formatter/type-gen.ts` + `__tests__/type-gen.test.ts`
- 変更: `src/utils/json-formatter/index.ts`（re-export）、`src/components/tools/JsonFormatter.tsx`（型モード追加）、`tests/e2e/json-formatter.spec.ts`、README / SPEC / decisions
- 別 issue: `JsonFormatter.tsx` のモード切り出し refactor（肥大化対応）

## 後続（PR4 スコープ外）

- Go struct / Zod スキーマ生成（推論コアを再利用してエミッター追加）。
- ルート名のカスタマイズ、型の readonly/union 詳細化、JSON Schema からの生成。
- コンポーネントのモード切り出し refactor（別 issue）。
