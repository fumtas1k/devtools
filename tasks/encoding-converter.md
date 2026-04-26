# 文字コード判定・変換ツール 進捗

現在のステータス: **完了**

## フェーズ1: 基盤

- [x] encoding-japanese@2.2.0 / @types/encoding-japanese を固定バージョンで追加
- [x] src/utils/encoding.ts を作成 (detectEncoding, decodeToText, convertBytes, textToUtf8Bytes)
- [x] src/utils/download.ts に downloadBytes を追加
- [x] astro check で型エラーゼロ

## フェーズ2: UI

- [x] src/components/tools/EncodingConverter.tsx を作成 (判定モード)
- [x] 変換モードの入力・設定 UI
- [x] ファイルアップロード UI (QrTicket パターン流用)
- [x] プレビュー・コピー・ダウンロード・クリア
- [ ] モバイル縦並びレイアウト確認

## フェーズ3: 統合

- [x] src/pages/tools/encoding-converter.astro を作成
- [x] src/data/tools.ts にメタデータ追加
- [x] src/components/ui/ToolIcon.astro にアイコン追加

## フェーズ4: E2Eテスト

- [x] tests/e2e/encoding-converter.spec.ts を作成
  - [x] ケースA: UTF-8 テキスト → 判定モード → UTF-8 と表示
  - [x] ケースB: SJIS ファイルアップロード → SJIS 判定 + プレビュー
  - [x] ケースC: SJIS ファイル → 変換 → UTF-8 BOM 付き → バイトを確認
  - [x] ケースD: EUC-JP → UTF-8 変換
  - [x] ケースE: UTF-8 BOM あり判定
  - [x] ケースF: 非テキストバイナリのエラー表示
  - [x] ケースG: クリア
  - [x] サンプルボタン
- [x] npm run test:e2e で全テスト GREEN (9/9)
- [x] スマホ (390×844) スクリーンショット目視 — 2行レイアウトで収まりOK
- [x] PC (1280×800) スクリーンショット目視 — 問題なし

## フェーズ5: ドキュメント

- [x] README.md ツール一覧追記
- [x] SPEC.md 2.3 ライブラリ表
- [x] SPEC.md 2.4 ディレクトリ
- [x] SPEC.md 4章ツール一覧
- [x] SPEC.md 5章新セクション追加
- [x] SPEC.md 9章チェックリスト
- [x] docs/decisions.md に encoding-japanese 採用理由

## メモ

- encoding-japanese@2.2.0 (2026-04-24 時点の最新)
- slug: encoding-converter、ツール名: 文字コード判定・変換
