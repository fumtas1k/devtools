# json-formatter Worker オフロード 計測レポート

**日付**: 2026-06-11  
**ブランチ**: `feat/issue-512-offload-measurement`  
**計測フェーズ**: サイクル1（計測のみ・Worker 実装なし）

---

## 1. 計測環境

| 項目         | 値                                    |
| ------------ | ------------------------------------- |
| Node.js      | v22.22.2                              |
| ブラウザ     | Chromium (Playwright, Desktop Chrome) |
| OS           | macOS Darwin 25.5.0                   |
| jsonc-parser | 3.3.1                                 |
| jmespath     | 0.16.0                                |
| vitest       | 4.1.4                                 |

---

## 2. フィクスチャ定義

生成ヘルパー: `src/utils/json-formatter/__tests__/fixtures.ts`

| フィクスチャ | 形状                                         | 要素数/深さ | 整形済みサイズ |
| ------------ | -------------------------------------------- | ----------- | -------------- |
| WIDE_5000    | 幅広配列（email/ip/phone/secret_token 含む） | n=5,000     | 1,462 KB       |
| WIDE_10000   | 同上                                         | n=10,000    | 2,936 KB       |
| WIDE_50000   | 同上                                         | n=50,000    | 14,880 KB      |
| MASK_3000    | 文字列過多（EMAIL/JWT/IP/PHONE_JP 密集）     | n=3,000     | 1,009 KB       |
| MASK_6000    | 同上                                         | n=6,000     | 2,023 KB       |
| DEEP_200     | 深いネスト（入れ子オブジェクト）             | d=200       | 123 KB         |
| QUERY_2000   | クエリ対象（users 配列 + orders）            | n=2,000     | 1,301 KB       |
| QUERY_5000   | 同上                                         | n=5,000     | 3,266 KB       |

---

## 3. structuredClone 可否チェック

| 対象                                        | cloneable   |
| ------------------------------------------- | ----------- |
| Node AST（jsonc-parser `parseTree` 戻り値） | cloneable ✓ |
| TreeNode（`buildTree` 戻り値）              | cloneable ✓ |

両者とも関数・循環参照なし。ただし **Node AST の clone コストが極めて高い**（後述）。

---

## 4. Node.js ベンチ計測結果

計測方式: ウォームアップ 3 回後 10 回の中央値・p90。
`clone_in` = 入力を `structuredClone` するコスト、`clone_out` = 出力を `structuredClone` するコスト。

| 処理               | サイズ             | CPU 中央値 ms | CPU p90 ms | clone_in ms | clone_out ms | 正味便益 ms | 判定      |
| ------------------ | ------------------ | ------------: | ---------: | ----------: | -----------: | ----------: | --------- |
| parseJson          | ~1.4MB (n=5,000)   |          30.3 |       60.1 |         0.4 |        143.6 |      -113.7 | **no-go** |
| parseJson          | ~2.9MB (n=10,000)  |          56.9 |      110.0 |         0.4 |        294.0 |      -237.5 | **no-go** |
| parseJson          | ~14.5MB (n=50,000) |         406.9 |      524.5 |         4.2 |      1,689.0 |    -1,286.3 | **no-go** |
| formatJson         | ~1.4MB (n=5,000)   |           9.6 |       10.6 |         0.2 |          0.2 |         9.3 | **no-go** |
| formatJson         | ~14.5MB (n=50,000) |         102.7 |      120.3 |         4.2 |          4.2 |        94.3 | **go**    |
| minifyJson         | ~14.5MB (n=50,000) |          85.5 |       97.0 |         4.4 |          3.6 |        77.5 | **go**    |
| buildTree          | ~1.4MB (n=5,000)   |          14.9 |       19.3 |         0.4 |         68.2 |       -53.8 | **no-go** |
| buildTree          | ~14.5MB (n=50,000) |         130.2 |      144.4 |         5.5 |        732.5 |      -607.9 | **no-go** |
| buildTree          | ~123KB (d=200)     |           0.1 |        0.1 |         0.0 |         17.8 |       -17.8 | **no-go** |
| maskValue          | ~1.0MB (n=3,000)   |          12.0 |       12.8 |         2.7 |          1.8 |         7.6 | **no-go** |
| maskValue          | ~2.0MB (n=6,000)   |          22.4 |       25.1 |         5.6 |          3.7 |        13.1 | **no-go** |
| runQuery           | ~1.3MB (n=2,000)   |           0.4 |        0.6 |         8.0 |          0.0 |        -7.7 | **no-go** |
| runQuery           | ~3.2MB (n=5,000)   |           0.5 |        3.4 |        26.2 |          0.1 |       -25.7 | **no-go** |
| generateTypeScript | ~1.4MB (n=5,000)   |          39.0 |       46.7 |        11.0 |          0.0 |        28.0 | **no-go** |
| generateTypeScript | ~14.5MB (n=50,000) |         292.7 |      648.7 |       133.8 |          0.0 |       158.9 | **go**    |

**判定基準**: CPU 中央値 > 50ms かつ 正味便益 > 0ms → go（Worker 化対象）

---

## 5. ブラウザ実測結果

### 5-1. long task 計測（PerformanceObserver）

測定入力サイズ: WIDE_5000 (~1.4MB) / WIDE_10000 (~2.9MB) / MASK_3000 (~1.0MB)

ブラウザ内で JSON.parse / JSON.stringify で各処理を近似計測（実際の jsonc-parser は同等かやや遅い）。

| 処理                                 | サイズ | CPU 中央値 ms | CPU p90 ms |
| ------------------------------------ | ------ | ------------: | ---------: |
| JSON.parse (≈parseJson)              | ~1.4MB |           3.0 |        3.1 |
| JSON.parse (≈parseJson)              | ~2.9MB |           6.0 |        6.2 |
| JSON.stringify 2-space (≈formatJson) | ~1.4MB |           2.2 |        2.9 |
| JSON.stringify 2-space (≈formatJson) | ~2.9MB |           4.4 |        5.0 |
| JSON.stringify compact (≈minifyJson) | ~1.4MB |           0.7 |        1.0 |
| JSON.stringify compact (≈minifyJson) | ~2.9MB |           1.6 |        1.9 |
| structuredClone string               | ~1.4MB |           0.2 |        0.4 |
| structuredClone string               | ~2.9MB |           0.6 |        0.6 |
| structuredClone JS value             | ~1.4MB |           4.9 |        6.7 |
| structuredClone JS value             | ~2.9MB |           8.7 |        9.8 |
| structuredClone mask input           | ~1.0MB |           1.4 |        1.6 |

**long task (≥50ms) 検出: ゼロ件**（1.4MB〜2.9MB の範囲ではブラウザの V8 最適化により long task 未発生）

### 5-2. postMessage 往復コスト（代替計測）

本番 CSP (`worker-src 'self'`) により Blob URL Worker は blocked される。  
`structuredClone` でブラウザ側の clone コストを近似計測。

| 計測項目                                    | 中央値 ms | p90 ms |
| ------------------------------------------- | --------: | -----: |
| structuredClone string ~1.4MB               |       0.3 |    0.5 |
| structuredClone string ~2.9MB               |       0.5 |    3.7 |
| structuredClone JS value ~1.4MB             |       4.6 |    4.9 |
| structuredClone JS value ~2.9MB             |       8.9 |   10.0 |
| JSON.parse(JSON.stringify) deepClone ~1.4MB |       3.0 |    3.2 |

**Worker 往復コスト概算（clone_in + clone_out）:**

| 処理                                | ~1.4MB | ~2.9MB |
| ----------------------------------- | -----: | -----: |
| formatJson 往復（string → string）  | 0.5 ms | 1.0 ms |
| buildTree 往復（string → JS value） | 4.8 ms | 9.4 ms |

### 5-3. Node 概算との突き合わせ

| 項目                  | Node.js（structuredClone） | ブラウザ（structuredClone） | 備考                                                 |
| --------------------- | -------------------------: | --------------------------: | ---------------------------------------------------- |
| string clone ~1.4MB   |                     0.4 ms |                      0.3 ms | ほぼ同等                                             |
| string clone ~2.9MB   |                     0.4 ms |                      0.5 ms | ほぼ同等                                             |
| JS value clone ~1.4MB |                          — |                      4.6 ms | Node は parsed value で非計測（Node AST ≈ 68–144ms） |
| Node AST clone ~1.4MB |                   143.6 ms |                           — | Node 特有の jsonc-parser AST 構造が極めて重い        |

Node.js での Node AST clone が 143ms と異常に重いのは、jsonc-parser の `Node` オブジェクトが `parent` 双方向参照を持つためと推定される（ただし structuredClone は循環参照対応なので clone 自体は成功、コストだけが高い）。

---

## 6. go/no-go 判定と理由

| 処理                   | 判定            | 理由                                                                                                                                                                                                                                                        |
| ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **parseJson**          | **no-go**       | clone_out（Node AST）が CPU の 3〜4 倍以上。大入力で CPU 407ms でも clone_out 1,689ms となり便益が大幅マイナス。Worker に渡すインターフェースを「文字列 → JS value」に変えれば改善するが、それは parseJson ではなく `JSON.parse` をオフロードする設計になる |
| **formatJson**         | **条件付き go** | ~14.5MB (n=50,000) で CPU 102ms・便益 94ms。入力も出力も string なので clone コストが安い。ただし UI で現実的なサイズ（~1.4MB = n=5,000 では CPU 9.6ms）では no-go。long task は 50,000 要素以上の極端な入力でのみ発生                                      |
| **minifyJson**         | **条件付き go** | ~14.5MB で CPU 86ms・便益 78ms。formatJson と同じ構造（string → string）。同サイズ帯でのみ対象                                                                                                                                                              |
| **buildTree**          | **no-go**       | TreeNode の clone_out が CPU より数倍大きい（n=5,000 で CPU 15ms、clone_out 68ms）。TreeNode は巨大ネスト構造で clone コストが高い。Worker 化には「ツリーを返さず、描画用の軽量 flat リスト（行番号・インデント・値のみ）を返す」設計変更が必要             |
| **maskValue**          | **no-go**       | 最大 n=6,000 (2MB) でも CPU 22ms。long task 閾値 50ms に達しない。clone_in（JS value）が CPU と同程度で便益が小さい                                                                                                                                         |
| **runQuery**           | **no-go**       | CPU 0.4〜0.5ms と極めて高速。clone_in（JS value 全体）が CPU の 20〜50 倍重い。完全にオーバーヘッド負け                                                                                                                                                     |
| **generateTypeScript** | **条件付き go** | ~14.5MB (n=50,000) で CPU 293ms・便益 159ms。入力（JS value）の clone_in 134ms が重く、対象サイズでの 2 倍ヘッドルームはギリギリ。n=5,000（~1.4MB）では CPU 39ms・便益 28ms で no-go                                                                        |

### 現実的なユーザー操作サイズでの再評価

ブラウザ実測で確認したとおり、**~1.4MB（n=5,000）〜~3MB（n=10,000）の範囲では long task 未発生**。既存の仮想化（PR #622）で表示は解決済み。

実際に UI が固まる可能性があるのは **~15MB 前後（n=50,000 以上）** の入力のみ。その規模では:

- `formatJson` / `minifyJson`: go（string→string で clone コスト安い）
- `generateTypeScript`: 条件付き go（clone_in が重く、設計検討が必要）
- `parseJson` / `buildTree`: no-go（AST・TreeNode の clone コストが CPU を上回る）

---

## 7. Worker 設計への含意

### parseJson の no-go について（重要）

parseJson の出力 `Node AST` の clone_out（~1.4MB で 144ms）が CPU（30ms）の約 5 倍。Worker 化するには出力インターフェースを変更する必要がある:

- **案 A**: Worker 内で parse + format/minify まで一気に行い、string のみを返す（parseJson は Worker 内でのみ使い、AST を渡さない）
- **案 B**: Worker 内で parse + getNodeValue（JS value）まで行い、JS value を返す（AST を外に出さない）
- **案 C**: parseJson を Worker 化せず、文字列変換系（format/minify）のみを Worker 化する

案 A が最もシンプルで clone コストを最小化できる（string → string）。

### buildTree の no-go について

TreeNode は再帰的な子配列構造で clone_out が重い（~1.4MB で 68ms）。Worker 化には：

- 仮想スクロール用フラット行リスト（`{ depth, key, value, type }[]`）を Worker 内で生成して返す設計に変更すれば clone コストを大幅削減できる可能性あり。ただし UI 側の展開/折りたたみ状態管理の再設計が必要で、スコープが大きい。

---

## 8. 作成ファイル一覧（未コミット）

| ファイル                                                                  | 種別                     | 備考                                     |
| ------------------------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| `src/utils/json-formatter/__tests__/fixtures.ts`                          | フィクスチャ生成ヘルパー | Node ベンチと E2E 両方から再利用可能     |
| `src/utils/json-formatter/__tests__/offload.bench.ts`                     | vitest bench ファイル    | `npm run test` には含まれない（glob 外） |
| `docs/superpowers/specs/2026-06-11-json-formatter-offload-measurement.md` | 本レポート               | —                                        |

削除済み（一時ファイル）:

- `tests/e2e/offload-measure-temp.spec.ts`（計測後削除済み）
- `/tmp/claude/bench_runner.mjs`（計測後削除済み）

---

## 9. 結論・次サイクルへの推奨

**即時 Worker 化の最有力候補**: `formatJson` / `minifyJson`（~15MB 以上の超大入力で有効、string→string で clone コスト最小）

**設計変更込みなら候補**: `generateTypeScript`（~15MB 以上、clone_in 重いが便益あり）

**Worker 化しない**: `parseJson`（AST clone が CPU を大幅上回る）、`buildTree`（TreeNode clone が CPU を超える）、`maskValue`（CPU が long task 閾値未到達）、`runQuery`（CPU が clone より桁違いに小さい）

**実用的な判断**: 現行のユーザー操作範囲（〜3MB）ではブラウザで long task 未発生。Worker 化の優先度は、既存の仮想化（PR #622）後では低め。超大入力（〜15MB 以上）対応を要件にするかどうかをユーザーと確認してから実装着手を推奨する。

### 最終判断（2026-06-11・ユーザー確定）

**Worker オフロードは見送り（YAGNI クローズ）。** 現実サイズでは割に合わず、~15MB+ で整形/minify のみ限定的に成立するに過ぎないため、本 issue では実装しない。本レポートと再現用ベンチ（`offload.bench.ts` / `fixtures.ts`）を成果物として残し、将来 ~15MB+ 対応が要件化したときの再判断材料とする。詳細は decisions [104]。
