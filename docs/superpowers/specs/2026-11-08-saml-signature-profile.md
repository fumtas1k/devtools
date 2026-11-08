# SAML XMLDSig 限定プロファイル（#745）

## 目的と対象

利用者が明示した公開証明書 1 件で、表示中の Response とその直下の各 Assertion の署名一致をブラウザ内だけで個別に確認する。#745 は復号などが残るため閉じない。develop 向け Draft PR と最終判定までとし、マージ・release・VRT baseline 更新は行わない。

起点は `origin/develop` の `a103ede97ec97a71a2d6782adbf4b14008a093f2`、branch は `feat/issue-745-saml-xmldsig`。fresh checkout の開始時 clean とリポジトリルート `/workspace/devtools`、既存 PR / branch の重複なしを確認済み。

## 受入条件

1. 原文 XML の DOM から表示モデルと署名対象を同時に作る。対象は Response と直下 Assertion の DOM 要素で対応付け、ID と Assertion 順序を表示する。整形・マスクした XML を検証材料にしない。
2. 対象の直下 Signature は 1 個、Reference は 1 個、URI は対象自身の非修飾 ID と完全一致する `#ID` のみ。ID は検索式の別解釈を避けるため ASCII 英字または `_` で始まる英数字・`_`・`.`・`-` の形式に限定し、それ以外は未対応とする。文書全体で重複 ID、ID の別名属性・名前空間による曖昧さ、隠れた Signature、別対象参照、wrapping を拒否する。各対象の結果を独立表示し、文書全体の成功バッジは作らない。
3. 署名検証前に文書全体の名前空間 URI と宣言値を調べ、`&`・`<`・`>`・`"` または空白を含む場合は未対応とする。prefix は ASCII 英字か `_` で始まり、英数字・`_`・`.`・`-` からなる形式のみ許可する（既定名前空間は可）。正規化ライブラリの名前空間出力と prefix 処理に合わせた防御的制約であり、正当な XML でも対象外となりうる。通常のテキストや属性値は制限せず、デコードと表示は維持する。RSA-SHA256、SHA256、enveloped → Exclusive C14N（コメントなし・パラメータなし）だけを扱う。SignedInfo は Exclusive C14N。全 Reference digest と SignatureValue を確認し、C14N はライブラリに委ねる。すべてのテキスト値要素は子要素を拒否する。
4. 未対応方式・構造と暗号学的不一致を区別する。空 / 外部 / XPointer URI、複数 Reference、XPath / XSLT / base64 transform、Object / Manifest、C14N1.1、コメント付き C14N、InclusiveNamespaces、SHA1 / HMAC、Redirect クエリ署名、Response 以外の署名検証は初版対象外。
5. 利用者が明示した信頼する公開 X.509 証明書（PEM）1 件だけを使う。埋込み証明書 / KeyValue にフォールバックしない。PRIVATE KEY・複数証明書・不正証明書を入力エラーにする。CA / chain 信頼・失効・IdP 正当性・SSO 成功を保証しない。
6. 未署名・未検証・処理中・一致・不一致・未対応・入力エラーを対象と理由付きで区別する。一致の文言は「指定証明書の公開鍵で Response / Assertion［ID］の署名が一致」。証明書・XML の変更、clear、navigation / unmount 時に非同期世代を無効化し、worker を停止する。共有用マスク出力には原文の一致結果が適用されないことを明示する。
7. 既存 32 MiB のデコード受理範囲を維持する。追加の署名検証だけを XML 2 MiB・要素 10,000・深さ 64・署名 16 個・証明書 PEM 64 KiB・RSA 2048〜8192 bit に制限する。上限超えは理由付き未対応 / 入力エラーとし、通常表示は維持する。DTD / ENTITY は拒否し、外部解決しない。検証は worker で行い、15 秒上限で停止する。DOMParser の worker 移植は仮定せず、原文 DOM のスナップショットを明示して XML parser の差異を検証する。
8. 検証操作時だけ依存と worker を遅延 load する。候補は `xmldsigjs@2.8.8` 固定、既存パッケージの版を変えない。worker parser の直接依存が必要なら同一解決版を明示する。新規依存の release age / license / advisory と npm audit を確認し、疑義があれば拡大しない。
9. 共通 UI・日本語・strict CSP・既存 a11y 属性を維持する。証明書 / SAML の送信・永続化・URL 埋込み・ログは追加しない。原文 / mask / copy の既存経路を保つ。

## 検証と分担

- 指揮は Sol 6.1 xhigh、実装は Terra 6.1 xhigh、独立レビューは Astra 6 high。実装担当は製品コード・unit / E2E・関連ドキュメントを担当し、指揮担当は独立生成 fixture、最終全体検証、Draft PR / CI 判定を担当する。
- fixture は独立した Python lxml / libxml2 + cryptography で生成する。テスト秘密鍵は生成プロセスのメモリにのみ保持し、公開証明書と合成署名 XML だけを保存する。
- 正当署名、改ざん / digest / 証明書不一致、弱鍵、証明書なし・不正、namespace / 空白 / 属性順序 / C14N、重複 ID / 参照 / wrapping / 未署名先頭 / 複数 Assertion、未知方式、DTD / 外部参照と通信ゼロ、処理中の XML / 証明書 / clear の変更を検証する。
- test-gates に従い、不正入力の陽性対照を通常テストへ含め、検証を常時成功へ変異させたときにテストが fail することも確認する。
- 最終 head で全 unit / meta、format、lint、型 0/0/0、build、本番 build / CSP E2E、dev hydration、PC / mobile 目視、必要な VRT と独立レビューを行う。Firefox / WebKit は既存設定を変えず一時設定で実動確認し、未確認を明示する。初期 / 追加 chunk gzip を測る。
- Draft PR URL / SHA を早期報告し、同 head の全 CI / VRT / CodeQL・レビュー・warning を確認する。新規 security warning / 未解決指摘は green でも保留し、根拠と扱いを確定する。

## スコープ外と保留

復号・他署名方式・IdP 信頼判定、#774 / Vitest 5、#202(F) hook / CI 配線、#950 の alert API、#300 コメント / close、既存 release 保留には触らない。拒否済み alert API を再試行・別経路で照会しない。セキュリティ設定・formatter 全面適用・baseline 更新は行わない。

## 名前空間制約の根拠・検証・レビュー記録

- コードで確認した根拠: `xmldsigjs@2.8.8` の `canonicalizer.js` / `WriteNamespacesAxis` は名前空間 URI を属性エスケープせず出力し、宣言 prefix の抽出に ASCII ベースの式を使う。このため原文 DOM と worker DOM の一致に加え、C14N 前に文書全体の名前空間を制限する。URI・宣言値は `[&<>"\s]`、prefix は `^[A-Za-z_][A-Za-z0-9_.-]*$` で判定し、既定名前空間を許容する。`\s` は JavaScript の空白文字集合であり、TAB / LF / CR も含む。
- 再現済みの範囲: Astra は依存単体の限定したローカル実験で異なる DOM の同一正規化出力を報告した。SAML 全経路の誤一致は未確認。起動済み Chromium / Firefox の parser 確認は結果未取得であり、安全判定による拒否後は追加照会・再試行を行っていない。全経路の成立を確認済みとは扱わない。
- 陽性対照: 変更前 `bcc5c1206f07afb9d38e797c9f23eb064bc6efd1` の profile に新しい入力拒否テストだけを適用すると、query の `&`、空白、二重引用符、TAB / LF / CR、`<` / `>`、非 ASCII prefix の 9 件が失敗した。制約を復旧すると 9 件とも成功する。署名衝突の生成や拒否された実験の再実行はしていない。
- 陰性対照: 通常の日本語・`&` を含む属性値と本文を受理するテストは変更前後とも成功する。独立生成した ASCII namespace / default namespace の正当署名 5 種も unit で維持した。ブラウザ E2E はデコード表示が残ること、未対応理由、通常本文の受理と署名の一致を確認する。
- 独立レビュー: Astra 6 high は `bcc5c12` で製品・依存・fixture・テストを読み、関連 unit 47 件を独立実行したが、上記懸念により承認保留とした。防御的変更 `bd540969f880ce19da9cb08b6e43360b0361ca21` の静的再レビュー依頼もプラットフォームに `possible cybersecurity risk` として拒否されたため、最終 head の独立レビューは未完了。拒否操作は停止しており、別経路での代替実行は行わない。最終判定は独立レビュー完了まで保留する。

最終 head のテスト・CI・VRT と上記の残るレビュー状態は Draft PR の検証欄に対応付ける。成功したテストだけで独立レビューや CodeQL の新規 alert 確認を代替しない。
