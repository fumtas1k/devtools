# key-converter JWK 変換堅牢化・メタデータ忠実化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JWK import を鍵素材のみの取り込みに変えて RS384/RS512/PS256・用途宣言付き鍵の import 失敗を解消し、出力 JWK のメタデータ（kid/use/alg）を入力に忠実化する。あわせて RSA PUBLIC KEY の openssl 案内を訂正する。

**Architecture:** `convert.ts` の `importFromJwk` で `alg`/`key_ops`/`use`/`ext` を除去してから `crypto.subtle.importKey` に渡し、Web Crypto の整合検証を回避する。メイン関数では `exportKey('jwk')` の結果から Web Crypto 注入の advisory フィールドを除去し、入力が JWK の場合のみ元の `kid`/`use`/`alg`/`key_ops` を復元する。`detect.ts` の案内文を 1 行訂正する。

**Tech Stack:** TypeScript, Web Crypto API (`crypto.subtle`), asn1js, Vitest, Astro。

参照スペック: `docs/superpowers/specs/2026-06-14-key-converter-jwk-fidelity-design.md`

---

## 事前確認（環境）

このリポジトリの規約（`.agents/rules/common.md`）:

- コミットメッセージは **日本語 + Conventional Commits**（`feat:`/`fix:`/`docs:`/`refactor:`/`test:` 等）。
- push 前に `npm run test`（ユニット）と `node_modules/.bin/astro check`（型）を実行。
- ステージは明示 pathspec のみ（`git add .`/`-A` 禁止）。
- 既に `develop` 起点の feature ブランチ `claude/key-format-conversion-review-e7iptz` で作業中。新規ブランチは作らない。

## File Structure

| ファイル                                  | 役割                                                        | 変更種別 |
| :---------------------------------------- | :---------------------------------------------------------- | :------- |
| `src/utils/key/convert.ts`                | JWK import の素材除去 + 出力 JWK 正規化                     | Modify   |
| `src/utils/key/detect.ts`                 | RSA PUBLIC KEY の openssl 案内訂正                          | Modify   |
| `src/utils/__tests__/key-convert.test.ts` | 回帰テスト追加（import 成功 / メタデータ保持 / alg 非付与） | Modify   |
| `docs/tools.md`                           | 仕組み・制限の追記                                          | Modify   |
| `src/pages/tools/key-converter.astro`     | 説明文の反映                                                | Modify   |
| `docs/decisions.md`                       | [112] への追記                                              | Modify   |

---

### Task 1: JWK import を鍵素材のみの取り込みに変更

**Files:**

- Modify: `src/utils/key/convert.ts`（`importFromJwk` 関数、現状 71-81 行付近）
- Test: `src/utils/__tests__/key-convert.test.ts`（陽性対照 describe に追加）

- [ ] **Step 1: 失敗するテストを追加**

`src/utils/__tests__/key-convert.test.ts` の `describe('陽性対照: 不正入力を検知して error を返す', ...)` ブロックの**直後**（`detectKeyInput` の describe の前）に、新しい describe を追加する。`rsaPublic` は既存の `beforeAll` で生成済みの素材を使う。

```ts
// ===========================================================================
// JWK 変換の堅牢化・メタデータ忠実化（PR: key-converter JWK fidelity）
// ===========================================================================

describe('JWK import の堅牢化（制約フィールド非依存）', () => {
  it('alg:"RS512" を宣言した RSA 公開鍵 JWK でも error なく変換できる', async () => {
    const jwk = JSON.parse(rsaPublic.jwkText) as Record<string, unknown>;
    jwk.alg = 'RS512';
    const result = await convertKey(JSON.stringify(jwk));
    expect(result.error).toBeUndefined();
    expect(result.algorithm).toBe('RSA');
  });

  it('use:"enc" を宣言した RSA 公開鍵 JWK でも error なく変換できる', async () => {
    const jwk = JSON.parse(rsaPublic.jwkText) as Record<string, unknown>;
    jwk.use = 'enc';
    jwk.key_ops = ['encrypt'];
    delete jwk.alg;
    const result = await convertKey(JSON.stringify(jwk));
    expect(result.error).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが fail することを確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts -t "JWK import の堅牢化"`
Expected: FAIL（現状は `alg:"RS512"` / `use:"enc"` で `crypto.subtle.importKey` が `DataError` を投げ、`result.error` が定義されるため `toBeUndefined()` が失敗する）

- [ ] **Step 3: `importFromJwk` を制約フィールド除去に変更**

`src/utils/key/convert.ts` の `importFromJwk` 関数を以下に置き換える。

```ts
async function importFromJwk(
  jwkObject: JsonWebKey,
  visibility: KeyVisibility,
  algorithm: KeyAlgorithm,
  namedCurve: string | undefined
): Promise<CryptoKey> {
  const usages: KeyUsage[] = visibility === 'public' ? ['verify'] : ['sign'];
  const alg = algorithm === 'RSA' ? RSA_ALG : ecAlg(namedCurve!);

  // 用途・アルゴリズム宣言フィールドを除去して鍵素材のみを取り込む。
  // Web Crypto は JWK の alg / key_ops / use / ext と importKey の algorithm/usages の
  // 整合を厳密検証するため、これらが付いた JWK（RS384/RS512/PS256・enc 用途等）は
  // そのままだと DataError になる。本ツールは鍵素材の形式変換が目的で hash/用途は
  // 変換結果に影響しないため、制約フィールドを外して素材だけを import する。
  const {
    alg: _a,
    key_ops: _k,
    use: _u,
    ext: _e,
    ...material
  } = jwkObject as Record<string, unknown>;

  return crypto.subtle.importKey('jwk', material as JsonWebKey, alg, true, usages);
}
```

- [ ] **Step 4: テストが pass することを確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts -t "JWK import の堅牢化"`
Expected: PASS

- [ ] **Step 5: 既存テストの非回帰を確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts`
Expected: 全テスト PASS（既存 37 + 新規 2）

- [ ] **Step 6: コミット**

```bash
git add src/utils/key/convert.ts src/utils/__tests__/key-convert.test.ts
git commit -m "fix: key-converter の JWK import を鍵素材のみ取り込みに変更しRS384/512等の失敗を解消"
```

---

### Task 2: 出力 JWK のメタデータ正規化（kid/use/alg の忠実化）

**Files:**

- Modify: `src/utils/key/convert.ts`（メイン関数 `convertKey` の export ブロック、現状 126-156 行付近）
- Test: `src/utils/__tests__/key-convert.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

Task 1 で追加した describe の直後に、新しい describe を追加する。

```ts
describe('出力 JWK のメタデータ忠実化', () => {
  it('入力 JWK の kid / use を出力 JWK に保持する', async () => {
    const jwk = JSON.parse(rsaPublic.jwkText) as Record<string, unknown>;
    jwk.kid = 'my-key-2026';
    jwk.use = 'sig';
    const result = await convertKey(JSON.stringify(jwk));
    expect(result.error).toBeUndefined();
    const out = JSON.parse(result.jwk!) as Record<string, unknown>;
    expect(out.kid).toBe('my-key-2026');
    expect(out.use).toBe('sig');
  });

  it('入力 JWK の alg を出力 JWK に保持する', async () => {
    const jwk = JSON.parse(rsaPublic.jwkText) as Record<string, unknown>;
    jwk.alg = 'RS512';
    const result = await convertKey(JSON.stringify(jwk));
    expect(result.error).toBeUndefined();
    const out = JSON.parse(result.jwk!) as Record<string, unknown>;
    expect(out.alg).toBe('RS512');
  });

  it('PEM 入力の出力 JWK には alg / ext を付与しない（アルゴリズムを詐称しない）', async () => {
    const result = await convertKey(rsaPublic.pem);
    expect(result.error).toBeUndefined();
    const out = JSON.parse(result.jwk!) as Record<string, unknown>;
    expect('alg' in out).toBe(false);
    expect('ext' in out).toBe(false);
  });
});
```

- [ ] **Step 2: テストが fail することを確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts -t "出力 JWK のメタデータ忠実化"`
Expected: FAIL（現状は kid/use が脱落し、PEM 入力の出力 JWK に `alg:"RS256"` と `ext:true` が含まれる）

- [ ] **Step 3: メイン関数の出力 JWK 構築を変更**

`src/utils/key/convert.ts` のメイン関数内、現状の以下の行:

```ts
// JWK export
const jwkExported = await crypto.subtle.exportKey('jwk', cryptoKey);
```

および後段の

```ts
const jwkText = JSON.stringify(jwkExported, null, 2);
```

を、それぞれ次のように置き換える。`jwkExported` の宣言を残しつつ、`jwkText` 生成の直前で正規化する。

`const jwkExported = await crypto.subtle.exportKey('jwk', cryptoKey);` を以下へ:

```ts
// JWK export（Web Crypto 注入の advisory フィールドを正規化する）
const jwkOut = (await crypto.subtle.exportKey('jwk', cryptoKey)) as Record<string, unknown>;
// Web Crypto が付与する advisory フィールドは変換アーティファクトなので除去する。
// 特に RSA では実際の意図に関わらず alg:"RS256" が注入されるため、鍵素材から
// 導けない情報を詐称しないよう削除する。
delete jwkOut.ext;
delete jwkOut.key_ops;
delete jwkOut.alg;
// 入力が JWK の場合、round-trip で失われる利用者由来メタデータを復元する。
if (source === 'jwk' && jwkObject) {
  const srcJwk = jwkObject as Record<string, unknown>;
  for (const field of ['alg', 'use', 'kid', 'key_ops'] as const) {
    if (srcJwk[field] !== undefined) jwkOut[field] = srcJwk[field];
  }
}
```

`const jwkText = JSON.stringify(jwkExported, null, 2);` を以下へ:

```ts
const jwkText = JSON.stringify(jwkOut, null, 2);
```

注意: 既存コードでは `jwkExported` という変数名を使っているため、上記で `jwkOut` に統一する。`jwkExported` への他の参照は無い（`jwkText` 生成のみ）ことを確認してから置換する。

- [ ] **Step 4: テストが pass することを確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts -t "出力 JWK のメタデータ忠実化"`
Expected: PASS

- [ ] **Step 5: 全ユニットテストと型チェック**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts`
Expected: 全 PASS（既存 37 + Task1 2 + Task2 3 = 42）

Run: `npx astro check --filter src/utils/key/convert.ts` もしくは `node_modules/.bin/astro check`
Expected: convert.ts に型エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/key/convert.ts src/utils/__tests__/key-convert.test.ts
git commit -m "fix: key-converter の出力JWKでkid/use/algを忠実化しRS256誤注入を解消"
```

---

### Task 3: RSA PUBLIC KEY の openssl 案内訂正

**Files:**

- Modify: `src/utils/key/detect.ts`（現状 395-396 行付近、legacy-pem の message 構築部）

- [ ] **Step 1: 案内文を訂正**

`src/utils/key/detect.ts` の以下の箇所:

```ts
          (label === 'RSA PUBLIC KEY'
            ? ' openssl rsa -in key.pem -pubout でSPKI形式に変換してください。'
            : ' openssl pkcs8 -topk8 -nocrypt -in key.pem -out key_pkcs8.pem でPKCS#8形式に変換してください。'),
```

の `RSA PUBLIC KEY` 側を `-RSAPublicKey_in` 付きに訂正する:

```ts
          (label === 'RSA PUBLIC KEY'
            ? ' openssl rsa -RSAPublicKey_in -in key.pem -pubout でSPKI形式に変換してください。'
            : ' openssl pkcs8 -topk8 -nocrypt -in key.pem -out key_pkcs8.pem でPKCS#8形式に変換してください。'),
```

- [ ] **Step 2: 既存の legacy-pem テストが引き続き pass することを確認**

Run: `npx vitest run src/utils/__tests__/key-convert.test.ts -t "legacy"`
Expected: PASS（テストは `unsupportedReason === 'legacy-pem'` のみ assert し message 全文は見ないため影響なし）

- [ ] **Step 3: コミット**

```bash
git add src/utils/key/detect.ts
git commit -m "fix: key-converter の RSA PUBLIC KEY openssl 案内に -RSAPublicKey_in を補完"
```

---

### Task 4: ドキュメント更新

**Files:**

- Modify: `docs/tools.md`（「鍵フォーマット変換」節、現状 566-591 行付近）
- Modify: `src/pages/tools/key-converter.astro`（ToolInfoSection 内）
- Modify: `docs/decisions.md`（[112] の結果・トレードオフ）

- [ ] **Step 1: `docs/tools.md` の仕組みに JWK メタデータ扱いを追記**

「鍵フォーマット変換」→「仕組み・アルゴリズム」の箇条書きのうち、JWK に言及する行（現状 572 行: 「JWK の場合は `kty` / `crv` ...」）の**直後**に次の 2 行を追加する。

```markdown
- JWK の import は鍵素材（RSA: `n`/`e`/`d`…、EC: `x`/`y`/`d`）のみを取り込み、入力 JWK の `alg` / `key_ops` / `use` / `ext` は import 前に除去する。これにより `RS384` / `RS512` / `PS256` を宣言した署名鍵や用途宣言付きの鍵も鍵素材の形式変換として扱える（hash・用途は変換結果に影響しないため）
- 出力 JWK は Web Crypto が付与する `ext` / `key_ops` / `alg` を除去したうえで、入力が JWK の場合のみ元の `kid` / `use` / `alg` / `key_ops` を復元する。PEM / DER 入力では鍵素材から導けない `alg` を付与せず、アルゴリズムを詐称しない
```

- [ ] **Step 2: `docs/tools.md` の制限・エッジケースを調整**

「制限・エッジケース」の「全処理はブラウザ内で完結し、秘密鍵データは外部に送信しない」の行の**前**に次を追加する。

```markdown
- JWK 出力は鍵素材 + 入力由来のメタデータ（`kid` / `use` / `alg`）のみを保持する。`kty` が RSA / EC 以外（`OKP` 等）は引き続き非対応
```

- [ ] **Step 3: `src/pages/tools/key-converter.astro` に説明を反映**

「対応形式」の `<ul>` 内、JWK の `<li>`（現状: `<li>JWK（JSON Web Key、RFC 7517）</li>`）を次に置き換える。

```astro
<li>
  JWK（JSON Web Key、RFC 7517）。入力 JWK の <code>kid</code> / <code>use</code> / <code>alg</code> は出力に保持されます
</li>
```

- [ ] **Step 4: `docs/decisions.md` [112] に結果追記**

`docs/decisions.md` の `## [112]` 節の「### 結果・トレードオフ」リスト末尾（`## [113]` の直前）に次の行を追加する。

```markdown
- 🔧 **追補（2026-06-14）**: JWK import を鍵素材のみの取り込みに変更（`alg`/`key_ops`/`use`/`ext` を除去）し、`RS384`/`RS512`/`PS256` 等を宣言した署名鍵の import 失敗を解消。出力 JWK は Web Crypto 注入の advisory フィールドを除去し、入力 JWK の `kid`/`use`/`alg` を忠実に復元する（JWKS 用途で `kid` が失われる問題を修正）。
```

- [ ] **Step 5: 型チェック（astro 変更の検証）**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（警告は既存分のみ）

- [ ] **Step 6: コミット**

```bash
git add docs/tools.md src/pages/tools/key-converter.astro docs/decisions.md
git commit -m "docs: key-converter の JWK メタデータ扱いと素材重視 import を反映"
```

---

## 完了条件

- [ ] `npx vitest run src/utils/__tests__/key-convert.test.ts` が全 PASS（42 件）
- [ ] `node_modules/.bin/astro check` が key 関連で型エラーなし
- [ ] 4 コミットが揃っている（Task1 fix / Task2 fix / Task3 fix / Task4 docs）

## スコープ外（やらない）

- 鍵ペア生成 / cert 連携 / OKP 対応
- `convert.ts` / `detect.ts` の `toArrayBuffer` リファクタ（潜在課題だが本 PR 対象外）
- VRT baseline 再生成（UI 不変）
