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

今回の比較は代表 4 ツールと静的 1 ページであり、#193 (c) の全 20 spec を変更候補として検証した結果ではない。ローカル・無スロットリング・Chromium の結果から、低速端末・他ブラウザ・CI の flake 頻度改善は断定しない。

- 画像と無関係な変換では `domcontentloaded` + hydration + 目的の結果 assertion が候補。ただし、遅いリソースが実際の失敗原因かをログで確認してから spec ごとに判断する（#193 (c)）。
- QR 読取・QR チケットの画像から canvas への描画は既存の `Image.onload` / エラー処理、PNG 生成やダウンロードは生成結果・保存完了を待つ。ページの `load` で操作後に生成される画像や download の完了は保証されない。今回未検証の QR 読取・チケット等は #193 (c) の残作業。
- リンクの CSS 検証・モバイル drawer は computed style / 開閉状態、クリップボードは結果やフィードバックをそれぞれ確認する。フォント・レイアウトを比較する場合は目的に応じた font / 描画完了待ちも別途検討する（#193 (c)）。
- グローバル action / navigation timeout の明示は #193 (a)、React 非公開キー依存の解消は #193 (d) で追跡する。診断は既存 helper を使用し、代替方式の採用を決めない。
