# 独立生成 SAML 署名 fixture

`generate.py` は製品の xmldsigjs を使わず、Python の lxml 6.1.1 / libxml2 2.14.6 で Exclusive C14N、cryptography 50.0.0 で RSA-SHA256 と X.509 を生成する。秘密鍵はプロセスのメモリ内で生成し、シリアライズ・ログ出力・保存しない。保存するのは合成 XML と公開証明書だけ。再生成すると公開証明書と署名は変わる。

実行: `python tests/fixtures/saml-signature/generate.py`。Python の lxml / cryptography が必要だが、通常の unit / E2E はコミット済み fixture を読むため Python に依存しない。

| ファイル                   | 独立生成した内容                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `response.xml`             | Response だけに正当な署名。Assertion は未署名                                                                   |
| `assertion.xml`            | 直下 Assertion だけに正当な署名                                                                                 |
| `both.xml`                 | 直下 Assertion を署名した後に Response を署名                                                                   |
| `multiple.xml`             | 先頭 `_unsigned` は未署名、後続 `_second` / `_third` は個別に署名。NameID も各 ID に対応                        |
| `namespaces.xml`           | protocol の default namespace、別 prefix、局所 namespace、属性順、空白、日本語、CR 文字参照、コメントの正当署名 |
| `inclusive-prefixes.xml`   | SignedInfo InclusiveNamespaces 付きの正当署名。製品の限定プロファイルでは未対応                                 |
| `weak.xml`                 | 1024 bit RSA の正当署名。製品では弱鍵として拒否                                                                 |
| `wrong-digest.xml`         | Reference digest は故意に不一致。SignedInfo の RSA 署名自体は正当                                               |
| `tampered-content.xml`     | 正当な Response 署名を作成後、NameID を改ざん                                                                   |
| `tampered-signature.xml`   | 正当な Response 署名を作成後、SignatureValue を改ざん                                                           |
| `certificate.pem`          | 通常 fixture の署名者の公開証明書                                                                               |
| `other-certificate.pem`    | 別の RSA 公開証明書。埋込み証明書へのフォールバックを検知するために使う                                         |
| `weak-certificate.pem`     | 弱鍵 fixture に対応する公開証明書                                                                               |
| `overlong-certificate.pem` | 9216 bit の合成 RSA 公開 modulus を持つ公開証明書。CA 署名は別の 2048 bit 鍵。対象の秘密鍵は生成しない          |

生成時に lxml / cryptography 側で正当 fixture の全 Reference digest と SignatureValue を再検証している。`wrong-digest.xml` は digest 不一致と RSA 署名一致を別々に確認する。製品テストはこれらを再度検証し、同一ライブラリだけで sign / verify が一致する循環検証を避ける。
