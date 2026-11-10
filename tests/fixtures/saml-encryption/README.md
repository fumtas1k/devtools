# SAML 暗号化の試験データ

この秘密鍵と Assertion は公開試験専用の合成データで、実環境では使用しない。

- producer: python-xmlsec 1.3.17 / libxmlsec 1.3.9、lxml 6.0.2
- 鍵: OpenSSL 3.5.7 で新規生成した RSA 2048 bit、非暗号化 PKCS#8
- `trial-weak-1024.pem`: OpenSSL 3.5.7 で別途生成した公開試験専用の RSA 1024 bit / 非暗号化 PKCS#8。弱い鍵を拒否するテスト専用であり、実環境では使用しない
- 暗号化: AES-128-GCM または AES-256-GCM。`-oaep11` なしは XML Encryption 1.0 の RSA-OAEP（既定 SHA-1 / MGF1-SHA1）、`-oaep11` 付きは XML Encryption 1.1 の RSA-OAEP（SHA-256 / MGF1-SHA256）。いずれもラベルなし
- 配置: EncryptedData の KeyInfo 内に EncryptedKey を置く。EncryptedKey 内の KeyName は試験用識別子である
- 期待値: `expected.xml`。ルートに名前空間を宣言し、日本語を含む合成 Assertion
- 検証: libxmlsec による復号と Node.js 24 の WebCrypto による復号で、両 AES 方式の平文を確認した。WebCrypto では UTF-8 デコード後に期待文字列との一致も確認した

この fixture はラベル付き OAEP、別の鍵配置またはブラウザーでの相互運用を証明しない。

`generate.py` と `generate-oaep11.py` は同じ試験鍵と期待平文からそれぞれ新しい暗号文を生成する。試験用に分離した Python 環境へ上記の `xmlsec` と `lxml` を用意し、`python generate.py <出力先ディレクトリ>` のように実行する。暗号化に乱数を使うため、生成結果は保存済みの暗号文とバイト単位では一致しない。

`saml-encryption-fixtures.test.ts` は fixture 自体の復号とタグ改変の拒否を確認する。アプリケーションの復号機能のテストではない。
