# JSON整形・ビューア PR3: 機密データマスキング — 設計

## Context（なぜ作るか）

`json-formatter` の段階リリース第 3 段。プライバシーファースト（ブラウザ内完結）の核を活かし、「本番の機密 JSON を貼っても外部に出ない」だけでなく **共有用に安全化した JSON を作れる** ようにする。PII・シークレットらしき値を検出し、一括でマスク（伏字化）してコピー/DL できる「マスク」表示モードを追加する。

ロードマップ（decisions [092]）は「機密データ保護」に大容量対応（Web Worker + 仮想スクロール）も束ねていたが、両者は独立した subsystem であり、Worker は本番 CSP 制約（blob worker 不可）で別途慎重な設計を要する。本 PR は **マスキングのみ** に絞り、大容量対応は別 issue に切り出す。

## スコープ（PR3）

- PII/シークレットの **検出 → 一括マスク → コピー/DL**。
- 検出方式: **キー名 + 値パターンの両方**。
- マスク表現: **種別ラベルプレースホルダー** `"[REDACTED:EMAIL]"`。
- 大容量対応（Worker/仮想スクロール）は対象外（別 issue）。

## 検出ルール（初期セット）

### キー名ベース（値の中身に関わらず種別 `SECRET` でマスク）

キー名を **小文字化して部分一致** で判定する初期キーワード集合:
`password` / `passwd` / `pwd` / `secret` / `token` / `apikey` / `api_key` / `authorization` / `auth` / `credential` / `private_key` / `access_key` / `client_secret`

- 値が文字列でなくても（数値・boolean 等）マスク対象とし、プレースホルダー文字列 `"[REDACTED:SECRET]"` に置換する。
- ネストしたオブジェクト/配列を値に持つキーがマッチした場合も、その値全体をプレースホルダー文字列に置換する（部分木ごと隠す）。

### 値パターンベース（文字列値に正規表現を適用）

- `EMAIL`: `[\w.+-]+@[\w-]+\.[\w.-]+`
- `JWT`: `eyJ[\w-]+\.[\w-]+\.[\w-]+`（base64url 3 セグメント）
- `IP`: IPv4（`\b\d{1,3}(\.\d{1,3}){3}\b`、各オクテット 0–255 を検証）
- `CREDIT_CARD`: 13–16 桁の数字列（区切り `-`/空白許容）で **Luhn チェックを通過** したもののみ（誤検出抑制）
- `PHONE_JP`: 日本の電話番号形式（`0\d{1,4}-?\d{1,4}-?\d{3,4}` 相当、桁数で絞る）

- 文字列値の **一部** にパターンが含まれる場合も置換（例: `"連絡先: a@b.com まで"` → `"連絡先: [REDACTED:EMAIL] まで"`）。
- 1 つの文字列に複数種別が混在する場合は順に全て置換する。

### 種別トグル

結果欄上部に種別ごとのオン/オフトグルを置く（既定: **全オン**）。誤検出しやすい `CREDIT_CARD` / `PHONE_JP` をユーザーが個別に外せる。キー名規則は 1 グループとして 1 トグル（種別 `SECRET`）。

## マスク表現

- 値全体がマッチ（キー名規則・値が単一パターン）→ 文字列 `"[REDACTED:<CATEGORY>]"` に置換。
- 文字列の部分マッチ → 該当箇所のみ `[REDACTED:<CATEGORY>]` に置換し前後は保持。
- 種別は `EMAIL` / `JWT` / `IP` / `CREDIT_CARD` / `PHONE_JP` / `SECRET`（キー名規則）。キー名規則でマッチした値は `"[REDACTED:SECRET]"` に置換する。

## アーキテクチャ（PR2 を踏襲）

- **`src/utils/json-formatter/mask.ts`（新規）**:
  - `type MaskCategory = 'SECRET' | 'EMAIL' | 'JWT' | 'IP' | 'CREDIT_CARD' | 'PHONE_JP';`（`SECRET` がキー名規則）
  - `interface MaskOptions { enabled: Record<MaskCategory, boolean>; }`
  - `interface MaskResult { masked: unknown; counts: Record<MaskCategory, number>; }`
  - `function maskValue(value: unknown, options: MaskOptions): MaskResult` — パース済み JS 値を再帰走査。オブジェクトの各プロパティでキー名規則を先に判定し、マッチすれば値全体をプレースホルダーへ。非マッチの文字列値には値パターンを適用。`counts` に種別別の置換回数を積算。
  - 純粋関数・依存追加なし（正規表現のみ）。CSP 影響なし。
- **表示は PR2 と同じ再利用経路**: マスクモード時、`maskValue` の結果を `JSON.stringify(masked)` → 既存 `processJson` に通して整形/ツリー表示。コピー/DL は既存ボタンでマスク済み文字列を対象にする。
- **クエリ（PR2）との併用**: マスクの入力は「クエリ有効ならクエリ抽出結果、なければ入力全体のパース値」。すなわち抽出 → マスクの順で合成する。
- **検出内訳バッジ**: 結果欄に「メール 3 / トークン 1 …」のように種別別 count（0 件は非表示）。

## コンポーネント変更（`JsonFormatter.tsx`）

- `View` 型に `'mask'` を追加（既存 `'text' | 'tree'`）。表示トグルに「マスク」を追加。
- マスクモード選択時のみ、種別トグル群と検出内訳バッジを表示。
- `useMemo` でマスク評価（依存: 表示モード/種別 enabled/マスク対象値/mode/indent）。クエリ評価（PR2）の後段に位置づける。
- マスクモードのテキスト表示・ツリー表示はそれぞれ既存 OutputField / JsonTreeView を再利用（マスク済み JSON を流す）。

## 不変条件・エッジ

- 入力が空/不正 → マスク評価しない（結果欄は既存どおり）。
- 全種別オフ → マスクなし（入力＝出力、counts 全 0）。
- マスク済み JSON は計算値のため lossless 非対象（JSON 数値準拠）。元の機密値は出力に含まれない（最重要不変条件）。

## テスト（test-gates 必須）

- **単体（Vitest）** `mask.test.ts`:
  - 陰性対照: 非機密の文字列・数値はそのまま（counts 0）。
  - **陽性対照（最重要・別 describe）**: email / JWT / `password` キー等を含む値で、(1) 種別プレースホルダーへ置換され、(2) **元の機密値の文字列が `JSON.stringify(masked)` に一切含まれない** ことを assert。無変換の空回り実装に当てると fail する。
  - Luhn 検証: 16 桁でもチェック不通過の数字列は CREDIT_CARD として検出しない。
  - 種別オフ: 当該種別を `enabled:false` にすると素通り（counts 0・原値保持）。
  - counts が種別別に正しく積算される。
- **E2E（Playwright, production CSP）** `json-formatter` spec 追記:
  - マスクモードで機密入り JSON を入力 → マスク済み表示（`[REDACTED:...]` が見える）＋ 内訳バッジ、**元の機密値が DOM に出ない**ことを assert。CSP 違反ゼロ。
- **VRT**: マスクモード追加で `/tools/json-formatter` のスクショが変わるため baseline 再生成（PC + mobile、CI workflow_dispatch、要ユーザー承認）。
- 実装時に **`test-gates` skill** を呼び、上記陽性対照（原値が出力に残らないこと）の併設を確認する。

## ドキュメント更新

- `README.md`（json-formatter の説明にマスク機能追記）
- `SPEC.md`（4 章 json-formatter 概要にマスク機能）
- `docs/decisions.md`（[094] 検出方式＝キー名+値パターン / プレースホルダー方式 / 誤検出種別を toggle 化 / 大容量を別 issue 化した理由）

## 新規/変更ファイル（想定）

- 新規: `src/utils/json-formatter/mask.ts` + `__tests__/mask.test.ts`
- 変更: `src/utils/json-formatter/index.ts`（mask を re-export）、`src/components/tools/JsonFormatter.tsx`（マスクモード・種別トグル・内訳バッジ・useMemo 評価）、`tests/e2e/json-formatter.spec.ts`、README / SPEC / decisions

## 後続（PR3 スコープ外）

- 大容量対応（同一オリジン Worker + 仮想スクロール、CSP 制約を踏まえた設計）→ 別 issue。
- 検出種別の拡張（マイナンバー・住所・国際電話等）、カスタム正規表現追加。
