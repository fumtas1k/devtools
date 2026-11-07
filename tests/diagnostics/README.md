# navigation 待機の手動診断（Issue #193）

`load` は画像待ちで navigation を長引かせうるが、`domcontentloaded` への一律変更だけでは React の操作準備を保証できない。今回の部分対応は比較用の手動診断と結果の記録に限定し、既存の `withProductionCsp` / `waitForReactHydration` / timeout / 通常 CI を維持する。[#193](https://github.com/fumtas1k/devtools/issues/193) は閉じない。

## 再実行

リポジトリルートで実行する。Node は `.node-version`、Playwright は lockfile の版を使う。

```bash
npm ci
npx playwright install chromium
npx playwright test --config tests/diagnostics/navigation.config.ts --repeat-each=3
npx playwright show-report playwright-report/navigation-diagnostics
```

依存・ブラウザが整備済みなら 3 行目からでよい。通常の設定からサーバー起動設定を継承し、Local では新規 build → preview（4321）と dev（4322）を起動する。診断の接続先は preview。両ポートを使う通常 E2E と同時実行しない。残存プロセスがある場合は所有者を確認して終了する。`GITHUB_ACTIONS=true` は事前 build が必要な別経路なので、ローカルで模倣するためだけに設定しない。

診断は `tests/e2e` の外に置き、専用 config でだけ探索する。1 worker・retry なし・fresh context・production CSP を使い、既存 helper の `goto` 相当箇所で `waitUntil` だけを変える。既存の `npm run test:e2e` や workflow への登録はない。

絞り込む場合:

```bash
npx playwright test --config tests/diagnostics/navigation.config.ts --grep '遅延画像'
npx playwright test --config tests/diagnostics/navigation.config.ts --grep '遅延 React'
```

出力は gitignore 対象の以下へ保存する。次の実行で上書きされるので、必要なら別名で保管する。

- `test-results/navigation-diagnostics/results.json`: 成否・所要時間と `navigation.json` 添付（JSON reporter の `body` は base64）。
- `playwright-report/navigation-diagnostics/`: HTML report。各ケースの添付から navigation の時間と状態を確認できる。
- `test-results/navigation-diagnostics/artifacts/`: 保存完了を検証した CSV / SVG / PNG。

## 比較条件と観測結果

2026-11-04、develop `d677bfe` 起点。Linux、Node 24.22.1、Playwright 1.59.1 / Chromium 147.0.7727.15、Astro 7.3.3 / React 19.3.0。14 ケース × 3 回 = **42 件成功**（retry なし）。実時間はマシン負荷・順序・キャッシュの影響を受けるため、性能の優劣や flake 解消の証拠とはしない。

| 条件              | `load`                                         | `domcontentloaded`         | 操作と完了確認                                                          |
| ----------------- | ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| 通常: Base64      | navigation → hydration                         | navigation → hydration     | `Hello` → `SGVsbG8=`                                                    |
| 通常: JSON / CSV  | 同上                                           | 同上                       | 入力後の結果、download event、保存完了、CSV の CRLF 内容                |
| 通常: QR コード   | 同上                                           | 同上                       | SVG プレビュー、download event、保存完了、SVG 内容                      |
| 通常: JAN コード  | 同上                                           | 同上                       | バーコード表示、PNG 生成・保存完了、PNG signature                       |
| 通常: `/about`    | navigation 後に表示確認                        | navigation 後に表示確認    | React 待ちをせず見出し確認（静的ページの対照）                          |
| 遅延画像          | DOM・hydration・変換が済んでも `goto` は未完了 | 画像保留中に `goto` が完了 | 保留解除後に両方式とも `load`・画像 `decode()`・幅 1 を確認             |
| 遅延 React module | `goto` が完了しても変換されない                | 同左                       | SSR 入力は可視・編集可能。解除後に既存 hydration 待ちと再入力で変換成功 |

遅延画像は実ページの HTML に同一 origin の eager 画像を 1 件だけ挿入し、その応答を barrier で保留する。`load` 側では待機中の `goto` と並行して操作可能性を観測する診断であり、現行 helper の実行順そのものではない。正確な遅延秒数や待機時間の閾値に頼らず、保留中・解除後の状態を比較する。

遅延 React は実際の `Base64Codec.*.js` の応答を保留する。可視性と `fill` の成功を操作準備の代用にすると早期成功することを示す陽性対照。既存の hydration 待ちは保留中に完了せず、解除後に完了する。このケースは helper が「全 island / effect の完了」を証明するものではない。ビルドでコンポーネントの chunk 名が変わった場合は route pattern を確認する。リクエストの捕捉確認が成功しなければ診断は失敗し、未注入のまま成功しない。

`navigation.json` の `navigationMs` は `goto` 解決まで、`readyMs` は追加の hydration 待ち終了まで、`checkedMs` は機能・download 検証終了まで（すべて同じ開始点からの累積 ms）。ブラウザの Navigation Timing とは時計・計測範囲が異なる。`loadEventEnd: 0` は未発火時にも現れるため、時間差ゼロと解釈しない。静的ページの `readyMs` に hydration 待ちは含めない。

通常条件の実測中央値（各 3 回、`navigationMs / readyMs / checkedMs`、単位 ms）:

| ページ     | `load`          | `domcontentloaded` |
| ---------- | --------------- | ------------------ |
| Base64     | 272 / 335 / 733 | 150 / 250 / 640    |
| JSON / CSV | 235 / 318 / 755 | 165 / 257 / 666    |
| QR コード  | 216 / 270 / 361 | 151 / 241 / 319    |
| JAN コード | 179 / 258 / 386 | 151 / 231 / 352    |
| `/about`   | 215 / 215 / 238 | 40 / 40 / 191      |

この測定は他のテストと並走せず取得したが、`load` → `domcontentloaded` の順序を固定し、warm-up を分離していない。ここでの小さな所要時間差を一律変更の根拠にせず、遅延条件での状態差を主な判断材料にする。

診断の検知能力も確認した。画像ケースの `goto` を意図的に常時 `domcontentloaded` にすると `load` の未完了検証が失敗し、遅延 React ケースの hydration 待ちを即時解決へ一時置換すると保留中の未完了検証が失敗した（各 1 件、期待した assertion failure）。両変更を復元した後の結果が上記 42 件成功である。

## 横展開の判断と残作業

上記は最初の代表診断の記録。後続の全 20 spec に対する代表経路の比較は下記を参照する。ローカル・無スロットリング・Chromium の結果から、低速端末・他ブラウザ・CI の flake 頻度改善は断定しない。

- 画像と無関係な変換では `domcontentloaded` + hydration + 目的の結果 assertion が候補。ただし、遅いリソースが実際の失敗原因かをログで確認してから spec ごとに判断する（#193 (c)）。
- QR 読取・QR チケットの画像から canvas への描画は既存の `Image.onload` / エラー処理、PNG 生成やダウンロードは生成結果・保存完了を待つ。ページの `load` で操作後に生成される画像や download の完了は保証されない。
- リンクの CSS 検証・モバイル drawer は computed style / 開閉状態、クリップボードは結果やフィードバックをそれぞれ確認する。フォント・レイアウトを比較する場合は目的に応じた font / 描画完了待ちも別途検討する（#193 (c)）。
- グローバル action / navigation timeout の明示は #193 (a)、React 非公開キー依存の解消は #193 (d) で追跡する。診断は既存 helper を使用し、代替方式の採用を決めない。

## 20 spec の代表経路と現行維持の判断（#193 (c)）

2026-11-08 JST、`653a056` 起点、Linux・Node 24.22.1・Chromium、1 worker / retry 0 / fresh context / production CSP。20 spec × 2 mode × 3 回の **120 件が成功**。各セルは各 3 回の中央値 `navigation / ready / checked`（ms、同じ開始点からの累積）。`ready` は現行 hydration helper 後、静的ページは navigation 後。`checked` は表の実操作と結果確認後。順序は load → domcontentloaded を繰り返し、cold / warm・ブラウザやマシン負荷の差を分離していない。小さな時間差から一律変更や flake 改善を結論づけない。

| spec               | 実測経路と操作・結果                                                                                 | load            | domcontentloaded |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------------- | ---------------- |
| base64             | `/tools/base64`: 入力→変換結果                                                                       | 177 / 234 / 618 | 49 / 174 / 552   |
| config-converter   | `/tools/config-converter`: JSON→YAML。既存に直接 goto / response 確認もある                          | 153 / 211 / 589 | 96 / 185 / 567   |
| copy-button        | `/tools/jan-code`: 結果生成、clipboard と成功通知                                                    | 144 / 186 / 387 | 93 / 171 / 382   |
| download-button    | `/tools/json-csv`: CSV の保存完了と内容。他に `/tools/jan-code` と `/tools/gs1-databar`              | 141 / 172 / 585 | 112 / 181 / 588  |
| dummy-text         | `/tools/dummy-text`: 文字数変更・結果                                                                | 130 / 174 / 204 | 115 / 162 / 189  |
| encoding-converter | `/tools/encoding-converter`: 日本語入力・文字コード判定                                              | 148 / 189 / 565 | 46 / 190 / 573   |
| filename-sanitize  | `/tools/encoding-converter`: ファイル変換と保存名・内容。他に `/tools/qr-ticket`                     | 157 / 205 / 435 | 106 / 198 / 426  |
| gs1-databar        | `/tools/gs1-databar`: GTIN 入力・バーコード生成                                                      | 173 / 224 / 264 | 125 / 197 / 231  |
| jan-code           | `/tools/jan-code`: サンプル生成・PNG 保存と署名                                                      | 130 / 171 / 279 | 100 / 189 / 297  |
| json-csv           | `/tools/json-csv`: JSON→CSV の出力                                                                   | 139 / 166 / 544 | 48 / 179 / 559   |
| json-xml           | `/tools/json-xml`: JSON→XML の出力                                                                   | 118 / 170 / 552 | 43 / 184 / 564   |
| jwt-decoder        | `/tools/jwt-decoder`: 架空 JWT の payload                                                            | 126 / 164 / 195 | 92 / 162 / 188   |
| link-styles        | `/privacy`: 通常・hover の computed CSS。他に `/about`・`/`・`/tools/base64`                         | 43 / 43 / 505   | 31 / 31 / 489    |
| mobile-drawer      | `/tools/url-encode`: 390px で開閉・aria-expanded。既存には `/tools/jwt-decoder` へのリンク遷移もある | 109 / 143 / 337 | 37 / 129 / 342   |
| qr-code            | `/tools/qr-code`: QR SVG と保存内容                                                                  | 135 / 162 / 299 | 47 / 166 / 309   |
| qr-reader          | `/tools/qr-code`→直接 goto `/tools/qr-reader`: QR 画像を生成・upload・読取                           | 131 / 175 / 551 | 48 / 162 / 549   |
| qr-ticket          | `/tools/qr-ticket`: 鍵生成・署名 QR の画像 upload・検証                                              | 158 / 219 / 605 | 50 / 200 / 582   |
| ulid-generator     | `/tools/ulid-generator`: 生成結果。既存に response 確認の直接 goto もある                            | 121 / 158 / 223 | 99 / 150 / 211   |
| url-encode         | `/tools/url-encode`: 日本語入力・変換結果                                                            | 124 / 159 / 183 | 102 / 173 / 197  |
| uuid-v7            | `/tools/uuid-v7`: 生成件数・形式。既存に response 確認の直接 goto もある                             | 146 / 182 / 240 | 47 / 176 / 237   |

各行は該当 spec の **1 代表経路**であり、同 spec の全テストや上記以外の経路を検証した意味ではない。QR reader の `navigation` / `ready` は最初の QR 生成ページ、`checked` は 2 回目の直接 goto・hydration・画像読取を含む。添付の `PerformanceNavigationTiming` は最後に開いた QR reader 文書の値で、Node 側の累積時計とは異なる。drawer は Header の通常 JS の開閉結果を検証しており、ツール island の hydration は共通 helper に合わせた付随待機である。静的 `/privacy` は hydration を待たず、CSS の実値と hover を確認する。

すべての spec で現行 `load` / hydration 待ちを維持する。各行の結果は該当代表操作が両方式で成功した証拠であり、遅延画像などで差が生じる条件・未測定の経路・端末を含めた一律変更の根拠にはならない。QR の画像生成・読取、署名検証、download は各完了結果を別に待つ。`navigation-cases.ts` に操作を、`navigation.json` 添付に各計測を記録する。診断の fresh context で、本番 CSP ヘッダの一致と意図的な inline script 違反の捕捉・不実行も別途確認する。

## 公開 hydration signal の比較（#193 (d)）

Astro 7.3.3 は hydrator 呼び出しを await 後に `ssr` を除去し `astro:hydrate` を発火するが、`@astrojs/react` 6.0.6 は `startTransition` の React commit を待たず戻る。実 Base64 component と同じ React chunk を使う診断専用 wrapper で、公開 `React.use(Promise)` により commit を保留し、公開 `useEffect` で対象 commit の sentinel を付けた。3 回とも、保留中に event 発火・`ssr` 不在となる一方、effect 未実行・入力後の変換結果は空だった。現行 helper と同じ非公開キー predicate のその瞬間の値は false。解除後は別 test で effect と既存 helper、実変換結果を確認した。

検知能力の確認として barrier を一時的に無効化し、effect 完了後に未commit assertion が fail することを確認、元に戻して成功させた。これは **対象 wrapper / Base64 の実 React 経路に限る**。effect sentinel は全 island、全 effect、非同期処理の完了を一般保証しない。wrapper の実 component と React chunk の抽出は build のファイル名・minified export に依存し、検出できないと診断は失敗する。これは製品 helper へ minified alias を採用する提案ではない。React 非公開キー依存の実運用置換は未完であり、現行 helper を維持する。
