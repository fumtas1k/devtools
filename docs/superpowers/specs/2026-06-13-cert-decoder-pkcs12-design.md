# cert-decoder: PKCS#12（.pfx/.p12）対応 設計

- 日付: 2026-06-13
- 関連: issue #644 / PR #643（cert-decoder v1）/ decision `[111]`
- ステータス: 設計確定（実装前）

## 1. 目的・背景

cert-decoder v1（PR #643）は PEM / DER / PKCS#7 のみ対応とし、PKCS#12（.pfx/.p12）は秘密鍵・パスワード処理の責務差からスコープ外とした（decision `[111]`）。本 issue #644 で、パスワード復号 → 証明書・秘密鍵抽出を**ブラウザ内で完結**して追加する。

全処理はブラウザ内で完結し、入力（PKCS#12 バイト・パスワード・抽出した秘密鍵）を一切外部送信しない。

## 2. スコープ

### v2 に含む

- **PKCS#12 検出 → パスワード入力 UI**: `.pfx/.p12` ファイル選択時、または PKCS#12 と検出された貼り付け Base64 テキスト時に、パスワード入力欄＋「解析」ボタンを表示（ライブ debounce ではなく明示トリガー）。
- **証明書抽出**: PFX → AuthenticatedSafe → SafeContents → CertBag を辿って X.509 証明書（DER）を取り出し、**既存の `ParsedCert` 化・チェーン署名検証パイプラインを再利用**して表示する。
- **秘密鍵抽出**: `KeyBag` / `PKCS8ShroudedKeyBag` から PKCS#8 秘密鍵を取り出し、メタ情報（アルゴリズム RSA/EC・鍵長・曲線）を**常時表示**。PKCS#8 PEM 生値は「秘密鍵を表示」**トグル（既定で折りたたみ）で開示**し、コピー／ダウンロードを提供。開示部には「ブラウザ内完結・外部送信なし」`NotificationBanner` を併記（KeyConverter の既存パターンと整合）。
- **入力手段**: `.pfx/.p12` ファイル選択を主経路。貼り付け Base64（および PEM 風 `-----BEGIN PKCS12-----`）も PKCS#12 として受理。
- **エラー分類**: パスワード誤り／MAC 不一致 → 再入力を促す明示メッセージ。レガシー暗号（Web Crypto 非対応）→ 案内バナー。壊れたデータ → パースエラー。

### v2 スコープ外

- **レガシー暗号（RC2-40 / 3DES, pbeWithSHA1And...）の復号**: ブラウザの Web Crypto API は PBES2（AES-CBC + PBKDF2 + HMAC）のみ復号可能。OpenSSL 1.x 既定の RC2/3DES PKCS#12 は復号できないため、「`openssl pkcs12 -keypbe AES-256-CBC -certpbe AES-256-CBC -export ...` で再エクスポートしてください」と案内する。`node-forge` 等の追加暗号実装は導入しない（decision `[111]` のバンドル・二重実装回避方針を踏襲）。
- **鍵フォーマット変換（PEM↔DER↔JWK）**: 既存の key-converter（issue #645 / decision `[112]`）の責務。本 PR では PKCS#8 PEM 表示のみ。
- **失効確認（CRL/OCSP）**: v1 同様、外部問い合わせ必須のため非対応。

## 3. アーキテクチャ

### 3.1 モジュール構成

```
src/utils/cert/
  pkcs12.ts   ← 新規: parsePkcs12(bytes, password) → Pkcs12Result
  parse.ts    ← 改修: parseDerCertificates(derList) を切り出して export
  types.ts    ← 追記: Pkcs12Result / Pkcs12KeyInfo
  index.ts    ← 追記: parsePkcs12 / parseDerCertificates の re-export
src/components/tools/
  CertDecoder.tsx  ← 改修: PKCS#12 モード（パスワード UI・秘密鍵セクション）
```

### 3.2 `parsePkcs12(bytes, password)`（pkcs12.ts）

pkijs の PKCS#12 クラス群で復号・抽出する（`ensureCryptoEngine()` で Web Crypto エンジン初期化済み前提）。

処理フロー:

1. `asn1js.fromBER(bytes)` → `new PFX({ schema })`。失敗 → `errorKind: 'parse-error'`。
2. `await pfx.parseInternalValues({ password, checkIntegrity: true })` で MAC 整合性検証。失敗（誤パスワード・改ざん）→ `errorKind: 'wrong-password'`。
3. `await pfx.parsedValue.authenticatedSafe.parseInternalValues({ safeContents: [...] })`。各 SafeContents に `password` を渡す。復号アルゴリズムが Web Crypto 非対応 → `errorKind: 'unsupported-encryption'`。
4. 全 SafeBag を走査:
   - `bagId === '1.2.840.113549.1.12.10.1.3'`（certBag）→ 内部 `CertBag` から X.509 証明書 DER を取得し `certs` に push。
   - `bagId === '1.2.840.113549.1.12.10.1.2'`（pkcs8ShroudedKeyBag）／`...10.1.1`（keyBag）→ PKCS#8 `PrivateKeyInfo` を取得し、PEM 化＋アルゴリズム判定して `privateKeys` に push。
5. 証明書ゼロ・鍵ゼロでもエラーにせず、取得できた分を返す（best-effort）。

> pkijs 3.4.0 の正確な API（`parseInternalValues` の引数形・SafeBag の値取得経路）は実装時に pkijs ソース／公式 PKCS12 例で確認する。

### 3.3 型定義（types.ts 追記）

```ts
export interface Pkcs12KeyInfo {
  algorithm: string; // 'RSA' | 'EC' | OID
  keySizeBits?: number;
  namedCurve?: string;
  pkcs8Pem: string; // -----BEGIN PRIVATE KEY----- ...
}

export interface Pkcs12Result {
  certs: Uint8Array[]; // 抽出した証明書 DER
  privateKeys: Pkcs12KeyInfo[];
  error?: string;
  errorKind?: 'wrong-password' | 'unsupported-encryption' | 'parse-error';
}
```

鍵のアルゴリズム・鍵長・曲線判定は既存 `parse.ts` の OID マップ（`PUBKEY_ALG_OID` / `EC_NAMED_CURVE_OID`）と同等のロジックを用いる。RSA 鍵長は PKCS#8 内 `RSAPrivateKey.modulus` のバイト長から算出（best-effort）。

### 3.4 `parseDerCertificates(derList)`（parse.ts 改修）

既存 `parseCertificates` の「DER 候補 → `ParsedCert[]`」部分を `parseDerCertificates(derList: Uint8Array[]): Promise<ParseResult>` として切り出し export する。`parseCertificates` はこれを内部利用する形にリファクタ（挙動不変）。PKCS#12 経路は抽出 DER をこの関数に流し、後段の `buildChain` も共通利用する。

### 3.5 UI フロー（CertDecoder.tsx）

`DecodeState` に PKCS#12 用の状態を追加（既存の text 経路は不変）:

- ファイル選択 `handleFileChange`: `.pfx/.p12` 拡張子を判定し、バイト列を `pkcs12Bytes` state に格納 → パスワード入力欄＋「解析」ボタンを表示するモードに遷移。
- text 経路で `detectInput` が `pkcs12` を返した場合も同様にパスワード UI を表示（Base64/PEM 本文をバイト列化）。
- 「解析」押下 → `parsePkcs12(bytes, password)`:
  - 成功 → `parseDerCertificates(result.certs)` ＋ `buildChain` → 既存 `CertCard` 群表示。加えて **秘密鍵セクション**を描画。
  - `errorKind` 別にバナー／エラー表示（誤パスワード＝再入力、unsupported-encryption＝レガシー案内、parse-error＝汎用エラー）。
- 秘密鍵セクション: `Pkcs12KeyInfo` ごとにメタ情報チップ（`ChipLabel` tone=error「秘密鍵」＋アルゴリズム＋鍵長/曲線）を常時表示。`<details>` トグル「秘密鍵（PKCS#8 PEM）を表示」内に PEM を `OutputField`／`CopyButton`＋`DownloadButton` で開示。トグルの外側上部に `NotificationBanner` variant=info「秘密鍵はブラウザ外に送信されません」。

既存 v1 の「PKCS#12 は v1 非対応」警告バナー（`decodeState.status === 'pkcs12'`）は**パスワード入力 UI に置き換える**。

## 4. テスト（test-gates 準拠）

`parsePkcs12` はパスワード復号バリデーター（誤入力・改ざんを検知して `errorKind` を返す検知機構）であり、陽性対照テストを必須とする。

- **フィクスチャ生成** `src/utils/__tests__/cert-pkcs12-fixtures.ts`: pkijs で PBES2/AES-256-CBC + PBKDF2 の `.p12` バイト列をテスト時に動的生成（証明書＋EC/RSA 秘密鍵入り）。有効期限切れ回避のため動的生成（既存 `cert-fixtures.ts` と同方針）。
- **陰性対照（正常系）** `cert-pkcs12.test.ts`: 正パスワードで `parsePkcs12` → `certs.length >= 1` かつ `privateKeys.length >= 1`、抽出証明書を `parseDerCertificates` に通すと Subject 等が取れること。
- **陽性対照（検知能力）** 別 describe に分離:
  - 誤パスワード → throw せず `errorKind: 'wrong-password'`。
  - 非 PKCS#12 バイト（ランダム/別 DER）→ `errorKind: 'parse-error'`。
- `detect.test.ts`: PKCS#12 検出（PEM 風ラベル・証明書なし ENCRYPTED PRIVATE KEY）の既存テストを維持。

## 5. ドキュメント更新

- `docs/decisions.md`: 新 decision を追記（PKCS#12 対応・PBES2/AES 限定の根拠・秘密鍵トグル開示・node-forge 不採用継続）。
- `docs/tools.md`: cert-decoder 節に PKCS#12 対応と暗号方式の制限・秘密鍵の扱いを追記。
- `README.md` / `SPEC.md`: cert-decoder の対応形式表記に PKCS#12（.pfx/.p12）を追加。
- `docs/decisions.md [111]` 内の「PKCS#12 はスコープ外」記述に、#644 で対応した旨の追記（または新 decision からの相互参照）。
- VRT: 既存 `/tools/cert-decoder` ページのため `PAGES` への新規追加は不要。UI 変化があるため PC/スマホ目視確認は実施。

## 6. リスク・トレードオフ

- ✅ 既存パース／チェーン検証パイプラインを再利用し、PKCS#12 経路は「復号＋抽出」のみの薄い追加で済む。
- ✅ 秘密鍵は既定で非表示（トグル開示）＋ browser-only バナーで安全側に倒す。
- ⚠️ レガシー暗号（RC2/3DES）の `.p12` は Web Crypto の制約で復号不可。明示エラー＋再エクスポート案内で UX を担保するが、ユーザーによっては OpenSSL 操作が必要。
- ⚠️ pkijs の PKCS#12 API は ASN.1 構造を直接辿るため込み入っており、SafeBag 値取得経路は実装時に要検証。
