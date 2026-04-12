# DevTools

ブラウザで完結する無料の開発者ツール集。インストール不要・登録不要・データは外部送信なし。

## ツール一覧

### 生成
| ツール | 説明 |
|--------|------|
| ULID生成 | ULIDを一括生成。タイムスタンプ付き表示 |
| ダミーテキスト生成 | 文字種と文字数を指定してダミーテキストを生成 |
| QRコード生成 | テキスト/URLからQRコード画像を生成 |
| JANコード生成 | 12桁からチェックディジットを計算してバーコードを生成 |

### 変換・解析
| ツール | 説明 |
|--------|------|
| URLエンコード/デコード | テキストとURLエンコード形式を相互変換 |
| JWTデコーダー | Header・Payload・署名を分解表示。HS/RS/ES署名検証対応 |

## 技術スタック

- **フレームワーク**: [Astro](https://astro.build/) 6
- **UI**: [React](https://react.dev/) 19 + [Tailwind CSS](https://tailwindcss.com/) v4
- **言語**: TypeScript
- **ランタイム**: Node.js 22+

## 開発

```bash
npm install
npm run dev      # 開発サーバー起動 (http://localhost:4321)
npm run build    # 本番ビルド
npm run preview  # ビルド結果をプレビュー
npm test         # 単体テスト実行
```

## 設計方針

- **ブラウザ完結**: すべての処理はクライアントサイドで完結。データは外部に送信されない
- **依存最小化**: ツールごとに必要な最小限のライブラリのみ使用
- **デザイン**: デジタル庁デザインシステム（DADS）準拠。設計の決断は [docs/decisions.md](docs/decisions.md) を参照
