# SSL/TLS 証明書デコーダ 堅牢化 設計

- 日付: 2026-06-14
- 対象: `src/utils/cert/`（`detect.ts` / `parse.ts` / `chain.ts`）
- 種別: refactor + fix（ロジック堅牢化・表示整形）
- 関連: コードレビューで挙げた軽微な観点 #1, #3, #4, #5, #6（#2 CA 検証は対象外＝デコーダの性格を維持）

## 目的

証明書デコーダのパース／チェーン構築ロジックを、稀ケース・敵対入力・表示品質の観点で堅牢化する。
外部 I/F（公開関数シグネチャ・型・UI）は変更しない。デコーダとしての性格（信頼アンカー検証・CRL/OCSP を行わない）も維持する。

## スコープ外（明示）

- #2 issuer が CA か（BasicConstraints `cA` / KeyUsage `keyCertSign`）の検証。これは「デコーダ → 検証ツール」への性格変更につながるため行わない。
- UI コンポーネント（`CertDecoder.tsx`）・型定義（`types.ts`）・astro ページの変更。
- 失効確認・信頼アンカー検証の追加。

## 変更内容

### #1a PEM 正規表現の catastrophic backtracking 解消（`detect.ts`）

現状（`detect.ts:56`）:

```ts
const pemRegex = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
```

`([\s\S]*?)` の lazy 量化子と直後リテラルの重なりにより、END 無しの巨大入力で O(n²) のバックトラックが起こり得る。

変更後:

```ts
const pemRegex = /-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]*)-----END \1-----/g;
```

本文クラス `[A-Za-z0-9+/=\s]`（base64 + 空白）は `-` を含まないため、`-----END` 位置でのバックトラックが構造的に発生しない。正規の PEM 本文は base64 + 改行のみなので機能的後方互換。ラベルクラス `[A-Z0-9 ]+` は不変（`X509 CRL` 等の数字含むラベルを維持）。

### #1b 入力長ガード（`parse.ts`）

`parseCertificates(input)` 冒頭に上限チェックを追加。

```ts
const MAX_INPUT_LENGTH = 1024 * 1024; // 1 MiB（テキスト入力）

export async function parseCertificates(input: string | Uint8Array): Promise<ParseResult> {
  if (typeof input === 'string' && input.length > MAX_INPUT_LENGTH) {
    return { certs: [], topLevelError: '入力が大きすぎます（最大 1 MiB）。' };
  }
  // ...既存処理
}
```

- 対象は文字列入力のみ。DER バイナリ（`Uint8Array`）はファイル選択経由で信頼でき、長さ判定の意味が薄いため対象外。
- throw せず `topLevelError` で返す（既存のエラー表示経路に乗る）。
- 防御多重化: #1a で regex は線形化済みだが、過大入力そのものを早期に弾く第二の防壁。

### #3 + #5 親判定ロジックの一本化と DN 重複対応（`chain.ts`）

現状の問題:

- `buildOrder` は DN 一致のみで親を解決し、`buildChain` は DN + AKI/SKI で再解決するため、表示順とリンク情報が食い違い得る（ロジック二重実装）。
- `subjectMap: Map<string, number>` は同一 Subject DN を後勝ちで上書きし、クロス署名・同一 DN 複数枚で親候補を取り違える。

変更後:

```ts
/** subject.full → そのDNを持つ全 index */
function buildSubjectMap(certs: ParsedCert[]): Map<string, number[]> { ... }

/**
 * cert の親（issuer に該当する集合内 index）を解決する。
 * - 自己署名（subject==issuer）→ null
 * - DN 一致候補なし（自分自身を除く）→ null
 * - AKI あり: SKI 一致候補を優先。一致が無く、かつ SKI を持つ候補が存在 → null（不一致確定）。
 *            SKI を持つ候補が皆無 → DN 先頭候補を採用（比較不能なので後方互換）。
 * - AKI なし: DN 先頭候補を採用。
 */
function resolveParentIndex(
  cert: ParsedCert,
  idx: number,
  certs: ParsedCert[],
  subjectMap: Map<string, number[]>
): number | null { ... }
```

`buildOrder` と `buildChain` の双方がこの `resolveParentIndex` を使い、親関係を単一の真実源から導く。
これにより表示順（order）と検証リンク（links）が常に整合する。単一候補時の挙動は現行 `buildChain` と等価（後方互換）。

### #4 DN 非文字列値の整形（`parse.ts` `parseDn`）

現状（`parse.ts:145`）の最終フォールバック `String(atv.value ?? '')` は、文字列化できない asn1js 値オブジェクトで `[object Object]` を表示し得る。

変更後:

```ts
} else {
  // 文字列として取り出せない稀なエンコーディングは hex 表示にフォールバック
  const hexView = (atv.value as { valueBlock?: { valueHexView?: Uint8Array } })
    ?.valueBlock?.valueHexView;
  val = hexView && hexView.length > 0 ? bytesToHexPlain(hexView) : '';
}
```

既存の 2 分岐（`valueBlock.value` が string／`.value` が string）は不変。標準的な DirectoryString は従来通り文字列で取得される。

### #6 IPv6 アドレスの RFC 5952 圧縮（`parse.ts` `formatIpAddress`）

現状は 16 byte を `::` 圧縮せずフル 8 グループで表示。RFC 5952 準拠に変更:

- 各グループを小文字 hex 表記。
- 連続するゼログループの最長ラン（長さ 2 以上）を 1 箇所だけ `::` に圧縮。
- 全ゼロ → `::`、先頭/末尾ランも正しく処理。

テスト容易化のため、純粋関数 `formatIpAddress(bytes: Uint8Array): string` を `parse.ts` から **export** する（既存の内部利用は不変）。

## テスト方針（test-gates 準拠・陽性対照必須）

`src/utils/__tests__/` に追加。ガード/バリデータ系（#1）は陽性対照（検知する）と陰性対照（正常を通す）を必ず併設する。

| # | 陽性対照 | 陰性対照 |
|---|----------|----------|
| 1a | 多数の `-----BEGIN X-----`（END 無し）敵対入力が即時に候補ゼロを返す（回帰防止） | 既存の正常な複数 PEM 連結が従来通り全件抽出される |
| 1b | 1 MiB 超入力 → `topLevelError` | 上限直下の正常入力 → パース成功 |
| 3/5 | 同一 Subject DN・異 SKI の 2 枚で、AKI が正しい親 index を選ぶ／表示順とリンクが一致 | 単一候補時の親解決が現行と等価 |
| 4 | hex フォールバックの単体テスト（valueHexView あり → hex 文字列、無し → 空文字） | 標準 DN（CN/O 等）が従来通り文字列取得 |
| 6 | `formatIpAddress` 直接テスト: `2001:db8::1` 圧縮、全ゼロ `::`、末尾ゼロラン圧縮、IPv4 4byte 不変 | 圧縮対象が無い（ゼロラン長 1）アドレスは圧縮しない |

既存の cert 系ユニットテスト（22 件）が全て green を維持することを必須とする。

## 検証コマンド

- `npm run test`（ユニット）
- `node_modules/.bin/astro check`（型）
- E2E は本変更が UI/挙動を変えないため必須ではないが、`cert-decoder` ページの既存 VRT/E2E が落ちないことを確認する。

## 影響ファイル

- 変更: `src/utils/cert/detect.ts`, `src/utils/cert/parse.ts`, `src/utils/cert/chain.ts`
- 追加/更新: `src/utils/__tests__/cert-*.test.ts`（該当ケース追加）
- ドキュメント: 機能・対応形式・制限事項に変更がないため `README.md` / `SPEC.md` / `docs/tools.md` の更新は不要。
