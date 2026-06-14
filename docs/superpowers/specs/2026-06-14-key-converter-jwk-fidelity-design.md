# key-converter: JWK 変換の堅牢化とメタデータ忠実化（設計）

- **日付**: 2026-06-14
- **対象ツール**: key-converter（`src/utils/key/`, `src/components/tools/KeyConverter.tsx`）
- **関連**: issue #645 / PR #648（初版実装）、decision [112]
- **ステータス**: 設計承認済み（実装待ち）

## 1. 背景・解決する問題

key-converter のレビューで、JWK 入出力に関する忠実性・堅牢性の問題が判明した。実機（Node.js の Web Crypto）で挙動を検証済み。

| # | 重要度 | 問題 | 検証結果 |
| - | :----- | :--- | :------- |
| P1 | 中 | `alg:"RS384"/"RS512"/"PS256"` を宣言した正当な RSA 署名 JWK が import 失敗する | ハードコードの `RSASSA-PKCS1-v1_5 / SHA-256` で import すると、JWK の `alg` と hash の不整合により `DataError`。UI では「鍵のインポートに失敗しました」になる |
| P2 | 中 | round-trip で `kid`/`use` が脱落し、RSA では `alg:"RS256"` が常時誤注入される | `importKey`→`exportKey('jwk')` を通すと入力の `kid`/`use` が失われ、RSA は鍵の意図に関わらず一律 `alg:"RS256"` が付く。説明文がうたう「JWKS への変換」で `kid` が要なのに失われる |
| P3 | 低 | `RSA PUBLIC KEY`（PKCS#1 公開鍵）の openssl 案内が不完全 | `detect.ts` の案内 `openssl rsa -in key.pem -pubout` は PKCS#1 公開鍵に効かない（`openssl rsa` は既定で秘密鍵を期待）。正しくは `-RSAPublicKey_in` が必要 |

## 2. 方針（採用：素材重視・制約除去）

本ツールの目的は **鍵素材（RSA: n/e/d…、EC: x/y/d）の形式変換** であり、署名/暗号の用途や hash は変換結果に影響しない。そこで JWK の import 時に用途・アルゴリズム宣言フィールドを取り除き、素材のみを取り込む。

- 検証済み: `alg`/`key_ops`/`use`/`ext` を除去すれば、RS384/RS512/PS256・用途宣言付き（`use:"enc"` 等）の RSA/EC JWK もすべて素材を保ったまま import できる。
- 副作用として RSA-OAEP / ECDH など暗号用途の鍵も「鍵素材の形式変換」として通るようになる（素材は同一であり安全側）。`kty` は引き続き RSA / EC のみ対応（OKP は非対応のまま）。

採用しなかった代替案: JWK の `alg` から import hash を導出（RS256→SHA-256 等）し PS*→RSA-PSS と name も切替える「hash マッピング」案。署名鍵限定を維持できるが分岐が増え、対応 alg を網羅する必要があり複雑。素材重視案の方がシンプルで対応範囲も広い。

## 3. 実装

### 3.1 `src/utils/key/convert.ts`

**`importFromJwk`**: `importKey` 前に制約フィールドを除去する。

```ts
async function importFromJwk(jwkObject, visibility, algorithm, namedCurve) {
  const usages: KeyUsage[] = visibility === 'public' ? ['verify'] : ['sign'];
  const alg = algorithm === 'RSA' ? RSA_ALG : ecAlg(namedCurve!);
  // 用途・アルゴリズム宣言フィールドを除去して鍵素材のみを取り込む。
  // Web Crypto は JWK の alg / key_ops / use / ext と importKey の algorithm/usages の
  // 整合を厳密検証するため、これらが付いた JWK（RS384/RS512/PS256・enc 用途等）は
  // そのままだと DataError になる。本ツールは鍵素材の形式変換が目的で hash/用途は
  // 変換結果に影響しないため、制約フィールドを外して素材だけを import する。
  const { alg: _a, key_ops: _k, use: _u, ext: _e, ...material } = jwkObject as Record<string, unknown>;
  return crypto.subtle.importKey('jwk', material as JsonWebKey, alg, true, usages);
}
```

**メイン関数の出力 JWK 正規化**: `exportKey('jwk')` 後に Web Crypto 注入の advisory フィールドを除去し、入力が JWK の場合のみ元のメタデータを復元する。

```ts
const jwkOut = (await crypto.subtle.exportKey('jwk', cryptoKey)) as Record<string, unknown>;
// Web Crypto が付与する advisory フィールドは変換アーティファクトなので除去する。
// 特に RSA では実際の意図に関わらず alg:"RS256" が注入されるため、鍵素材から
// 導けない情報を詐称しないよう削除する。
delete jwkOut.ext;
delete jwkOut.key_ops;
delete jwkOut.alg;
// 入力が JWK の場合、round-trip で失われる利用者由来メタデータを復元する。
if (source === 'jwk' && jwkObject) {
  const src = jwkObject as Record<string, unknown>;
  for (const f of ['alg', 'use', 'kid', 'key_ops'] as const) {
    if (src[f] !== undefined) jwkOut[f] = src[f];
  }
}
const jwkText = JSON.stringify(jwkOut, null, 2);
```

結果:
- PEM/DER 入力 → 出力 JWK は `kty` + 素材のみ（`alg`/`ext`/`key_ops` を付けない＝アルゴリズムを詐称しない）。
- JWK 入力 → 出力 JWK は素材 + 入力由来の `kid`/`use`/`alg`/`key_ops` を忠実に保持。

### 3.2 `src/utils/key/detect.ts`

`RSA PUBLIC KEY` の案内コマンドを訂正する。

- 変更前: `openssl rsa -in key.pem -pubout でSPKI形式に変換してください。`
- 変更後: `openssl rsa -RSAPublicKey_in -in key.pem -pubout でSPKI形式に変換してください。`

## 4. テスト（`src/utils/__tests__/key-convert.test.ts` に追加）

test-gates 準拠で、いずれも「修正前なら fail する」観測可能な振る舞いを assert する。

1. `alg:"RS512"` を宣言した RSA 公開鍵 JWK → `error` が undefined（= import 成功）。修正前は `error` が立つため回帰を検出する。
2. `kid`/`use` を付与した JWK → 出力 JWK を JSON.parse すると `kid`/`use` が入力値で保持される。
3. PEM RSA 公開鍵入力 → 出力 JWK に `alg` プロパティと `ext` プロパティが存在しない。
4. `use:"enc"` を付与した RSA 公開鍵 JWK → `error` が undefined（制約除去で変換できる）。

既存テスト（`extractRsaFields`/`extractEcFields` は素材フィールドのみ比較）は影響を受けない。

## 5. ドキュメント

- `docs/tools.md` 「鍵フォーマット変換」: 仕組みに「JWK import は鍵素材のみを取り込み（alg/key_ops/use 非依存）、出力 JWK は入力 JWK の kid/use/alg を保持、PEM/DER 入力には alg を付与しない」を追記。準拠/制限欄も整合。
- `src/pages/tools/key-converter.astro`: 同趣旨を簡潔に反映（メタデータ保持・alg 非詐称）。
- `docs/decisions.md [112]`: 結果・トレードオフに本変更（素材重視 import・出力メタデータ正規化）の追記。

## 6. PR 戦略

単一 PR（`develop` ベース、squash マージ）。テーマが「key-converter の堅牢性・忠実性」に収まり規模も小さいため分割不要。UI は不変のため VRT baseline 再生成は不要。

## 7. スコープ外

- 鍵ペア生成（csr-generator 予定）/ cert-decoder 連携 / OKP（Ed25519/Ed448）対応は v1 非対応のまま。
- `kty` を RSA/EC 以外へ拡張しない。
