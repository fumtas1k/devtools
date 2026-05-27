# 正規表現ビジュアライザ＆ReDoS検出 設計

- 作成日: 2026-05-27
- ステータス: 設計承認済み（実装計画は writing-plans で別途作成）

## 1. 目的・スコープ

正規表現の構造を可視化し、ReDoS（壊滅的バックトラッキング）脆弱性を検出するブラウザ完結型ツール。2 つの柱で構成する。

1. **構造の可視化**: regex を AST ツリー／鉄道図（railroad diagram）で図示
2. **ReDoS 検出**: 脆弱性の有無を判定し、攻撃文字列・複雑度・危険箇所を提示

### メタ情報

| 項目       | 値                                                                  |
| :--------- | :------------------------------------------------------------------ |
| slug       | `regex-visualizer`                                                  |
| name       | 正規表現ビジュアライザ＆ReDoS検出                                   |
| category   | `convert`（「変換・解析」— char-count, sql-formatter と同バケット） |
| yomi       | `せいきひょうげんびじゅあらいざ`                                    |
| フレーバー | JS（ECMAScript）のみ。flags（g/i/m/s/u/y/d）入力対応                |

### スコープ外（YAGNI）

- **マッチテスト**（テスト文字列入力→マッチハイライト→キャプチャグループ表示）: 将来 PR 候補（PR3）。今回は 2 柱に集中する。
- JS 以外のフレーバー（PCRE/Python 等）: 独自パーサが必要でブラウザのネイティブ実行とも矛盾するため非対応。

## 2. 依存ライブラリ（要 spike 検証）

| 役割   | 候補              | 用途                   | 備考                                                                                                  |
| :----- | :---------------- | :--------------------- | :---------------------------------------------------------------------------------------------------- |
| パース | `regexp-tree`     | regex → AST            | ESLint 等で広く使われ成熟。手書きパーサは unicode property escape / lookbehind 等でバグりやすく不採用 |
| ReDoS  | `recheck`（WASM） | 脆弱性判定＋攻撃文字列 | 第一候補。理論的に厳密寄りの判定。spike 失敗時は自前静的解析へフォールバック                          |

**未検証事項（PR0 spike で潰す）**: 両ライブラリとも Astro/Vite ブラウザビルドでクリーンにバンドル・実行できるか、バージョン固定ポリシー・min-release-age 審査を通過するかは未確認。

`safe-regex` は star height 等の単純指標のみで誤判定・見逃しが多く、ReDoS 検出器としては不採用。

## 3. ディレクトリ・コンポーネント構成

```
src/utils/regex-visualizer/
  parse.ts       # regexp-tree ラップ、描画用 AST へ正規化
  redos.ts       # recheck ラップ（async）、タイムアウト・不明状態の正規化
  railroad.ts    # （PR2）AST → SVG レイアウト
src/components/tools/RegexVisualizer.tsx   # メインコンポーネント
src/pages/tools/regex-visualizer.astro     # client:load でマウント
```

各ユニットの責務:

- **parse.ts**: 入力文字列（pattern + flags）を受け取り、成功時は描画用 AST、失敗時は箇所付きパースエラーを返す。クラッシュさせない。
- **redos.ts**: pattern + flags を受け取り、`安全 | 脆弱 | 不明` の判定・攻撃文字列・複雑度を async で返す。recheck の生出力を本ツールの 3 状態モデルへ正規化する。
- **RegexVisualizer.tsx**: 入力欄・flags トグル・ビュー切替タブ・ReDoS パネル・エラー表示を統括。既存 `useDebouncedTransform` で入力を debounce。

## 4. データフロー

```
regex入力 + flags
  → debounce (既存 useDebouncedTransform)
  → parse(regexp-tree)
      ├─ 成功 → AST → [ASTツリー描画] / [鉄道図描画(PR2)]
      └─ 失敗 → パースエラー表示（クラッシュさせない）
  → ReDoS解析(recheck, async)
      → 判定 + 攻撃文字列 + 複雑度
      → 危険ノードを AST/鉄道図上で色付け
```

## 5. ReDoS 判定の誠実さ（重要）

判定は **3 状態を明確に区別**する。

- `安全`: recheck が脆弱性なしと判定
- `脆弱`: recheck が脆弱性ありと判定（攻撃文字列・複雑度を表示）
- `判定タイムアウト・不明`: recheck が timeout / unknown を返した場合

**「不明」を「安全」と表示してはならない**（誤った安心感を与えるのは検出器が無いより危険）。WASM ロード失敗時は ReDoS 機能のみ無効化し、パース・AST 表示は機能継続する（graceful degradation）。

ReDoS 検出は「検知機構」であるため、実装時に **test-gates スキル＋陽性対照テスト**を必須とする。既知の脆弱 regex（例 `(a+)+$`）を必ず `脆弱` と判定できることをテストで保証する（陰性対照のみでは検知能力ゼロでも green になり区別不能）。

## 6. エラーハンドリング

| 事象                    | 挙動                                               |
| :---------------------- | :------------------------------------------------- |
| 不正な regex            | catch して箇所付きエラー表示。クラッシュさせない   |
| recheck timeout/unknown | 「判定不能」状態として表示（安全と誤表示しない）   |
| WASM ロード失敗         | ReDoS 機能を無効化＋通知。parse/AST 表示は機能継続 |

## 7. テスト

- **Unit (Vitest)**: parse ラッパ（正常・各種構文・エラーケース）／ redos ラッパ（既知脆弱＝陽性対照・既知安全＝陰性対照の両方）
- **E2E (Playwright)**: regex 入力→AST 表示 ／ 脆弱 regex→警告表示 ／ 不正 regex→エラー表示
- **VRT**: `tests/e2e/visual-regression-pages.ts` の `PAGES` に `/tools/regex-visualizer` を追加（漏れは `tests/meta/vrt-pages-coverage.test.ts` が検知）。baseline は CI Linux runner で生成
- **test-gates**: ReDoS 検出器は検知機構のため陽性対照を必須（5 章参照）

## 8. ドキュメント更新

- `README.md`（ツール一覧）
- `SPEC.md`（2.3, 2.4, 4, 5, 9 章）
- `docs/decisions.md`（ライブラリ選定理由: regexp-tree / recheck、safe-regex 不採用理由、自前静的解析フォールバック方針）

## 9. PR 分割（段階実装）

| PR              | 内容                                                                                    |
| :-------------- | :-------------------------------------------------------------------------------------- |
| **PR0 (spike)** | recheck-wasm + regexp-tree が Vite ブラウザビルドで動くか検証。失敗時フォールバック判断 |
| **PR1**         | parse + AST ツリー + ReDoS 検出パネル + ツール登録 + ページ + docs                      |
| **PR2**         | 鉄道図 SVG レンダラ（タブ追加）                                                         |
| PR3（将来）     | マッチテスト（スコープ外、要再ブレインストーミング）                                    |

鉄道図 SVG レンダラ（PR2）は工数が大きいため、実装計画段階で独自の詳細プランを立てる。本スペックでは全体像を定義し、writing-plans ではまず PR0/PR1 を詳細化する。
