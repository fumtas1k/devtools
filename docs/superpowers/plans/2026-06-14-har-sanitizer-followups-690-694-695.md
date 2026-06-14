# HAR サニタイザ フォローアップ実装計画（#690 L-3 / #694 / #695）

**作成日: 2026-06-14**

PR #691 / #692 / #693（`docs/decisions.md [118]`）で HAR サニタイザ堅牢化の大部分を解消した。
本計画は残りの 3 件を **1 ブランチ・1 PR**（`claude/issues-690-694-695-uowikg`）で対応する。
3 件はいずれも `secret-scrubber/scrub.ts` / `har/sanitize.ts` を触り相互に衝突するため統合する。

## 目的

| issue    | 内容                                                               | リスク方向         |
| -------- | ------------------------------------------------------------------ | ------------------ |
| #695     | `data:` URL の base64 ペイロードが `scrubUrlPath` で破壊される     | 破壊（データ損失） |
| #690 L-3 | 入力中の既存 `[REDACTED:CAT_n]` リテラルとのトークン衝突・件数重複 | 安全側（表示品質） |
| #694     | 自由テキスト走査が AUTH_HEADER/QUERY トグルに意味的オーバーロード  | UX/件数表示        |

## スコープ外

- #690 の M-1/M-2/L-1/L-2（PR #691/#693 で対応済み）。
- ウォーターフォール等の機能追加。
- `scrubInto` が value 単位で独立 `scrubText` を呼ぶことによる「value 跨ぎのトークン不一致」（既存設計・別問題）。

---

## 項目 1: #695 — `data:` URL の破壊回避

### 現状

`scrubUrlPath`（`src/utils/har/sanitize.ts`）の scheme 判定は `/^[a-z][a-z0-9+.-]{0,31}:\/\//i` で `://` を要求する。
`data:image/png;base64,...` は `//` を持たないため `authorityEnd = 0` となり **URL 全体が `scrubText` に渡り**、
`HIGH_ENTROPY_BASE64` が base64 ペイロードを `[REDACTED]` に置換してデコード不能にする。
破壊は `scrubUrlPath` 内でのみ発生する（`redactUrl` の basic-auth 正規表現は `://` 必須・構造的クエリ redact は `?` 区切りで base64 に `?` は無いため無害）。

### 実装

`scrubUrlPath` の**冒頭**で `data:` スキーム（大文字小文字無視）を検出したら、scrubText を一切適用せず原文をそのまま返す。

```ts
function scrubUrlPath(url: string, counts: Record<HarRedactCategory, number>): string {
  // data: URL は base64/テキストの自己完結ペイロードを持ち、scrubText（特に
  // HIGH_ENTROPY_BASE64）がペイロードを破壊してデコード不能にする（#695）。
  // #690 M-2 で本文に対し回避した破壊クラスと同型。原文を返して破壊を防ぐ。
  if (/^data:/i.test(url)) return url;
  // ...既存処理...
}
```

### テスト（test-gates 準拠・退行対照）

`src/utils/har/__tests__/sanitize.test.ts` に追加:

- **退行対照（#695）**: `request.url` が `data:image/png;base64,<長い base64>` の HAR をサニタイズしても URL が**原文のまま**（base64 が壊れない）。`counts.PATH_SCAN`（後述の項目 3 後）が 0。
  - 陽性対照性の担保: ガード（`if (/^data:/i.test(url)) return url;`）を外すと base64 が `[REDACTED:...]` に置換され `toBe(原文)` が fail することを実機確認（コミットには残さない）。
- **退行対照**: `response.redirectURL` / `Location` ヘッダの `data:` URL も破壊されない（redactUrl 経由で scrubUrlPath を通る経路の確認）。
- **既存挙動維持**: 通常の `https://` URL のパストークン redact は従来どおり（既存テストでカバー済み、回帰しないこと）。

---

## 項目 2: #690 L-3 — 既存プレースホルダとのトークン衝突回避

### 現状の問題

`scrubText`（`src/utils/secret-scrubber/scrub.ts`）の `categoryCounter` はカテゴリごとに 0 から採番する。
入力中に既に `[REDACTED:EMAIL_1]` 風のリテラル（前回サニタイズ結果の再投入等）があり、それ自体はどのルールにもマッチしない場合、
新規に検出した実機密（例: `alice@x.com`）が同じ `[REDACTED:EMAIL_1]` を割り当てられ、
**出力に同一トークンが 2 つ（リテラル由来 + 実機密由来）並んで曖昧化**する。

また `har/sanitize.ts` の `makeTokenizer` は、再サニタイズ時に既にプレースホルダ化済みの値（cookie 値が `[REDACTED:COOKIE_1]` 等）を
**再度トークン化して件数を二重計上**する（リネームは起きるが counts が膨らむ）。

### 実装

#### 2a. `scrubText` の採番を既存プレースホルダ考慮型にする（衝突回避）

`scrub.ts` に共有のプレースホルダ正規表現を定義し、`scrubText` 冒頭で入力を pre-scan してカテゴリ別の最大採番を求め、
新規トークンの番号がそれを超えるように採番する。

```ts
// rules.ts もしくは scrub.ts に定義（単一の真実源にする）
// 例: [REDACTED:HIGH_ENTROPY_2] → category=HIGH_ENTROPY, n=2
export const PLACEHOLDER_RE = /\[REDACTED:([A-Z_]+)_(\d+)\]/g;
```

`scrubText` 内:

```ts
// 入力中に既に存在する [REDACTED:CAT_n] リテラルのカテゴリ別最大 n を求め、
// 新規採番がそれを超えるようにして同一トークンの衝突を防ぐ（#690 L-3）。
const reservedMax: Record<string, number> = {};
PLACEHOLDER_RE.lastIndex = 0;
for (let pm; (pm = PLACEHOLDER_RE.exec(input)); ) {
  const cat = pm[1];
  const n = Number(pm[2]);
  if (n > (reservedMax[cat] ?? 0)) reservedMax[cat] = n;
}
PLACEHOLDER_RE.lastIndex = 0;
```

採番箇所（ステップ 3）:

```ts
if (!placeholder) {
  const base = Math.max(categoryCounter[m.category] ?? 0, reservedMax[m.category] ?? 0);
  const n = base + 1;
  categoryCounter[m.category] = n;
  placeholder = `[REDACTED:${m.category}_${n}]`;
  tokenMap.set(key, placeholder);
}
```

> 注: `[A-Z_]+` は貪欲なので `HIGH_ENTROPY_2` を `cat=HIGH_ENTROPY, n=2` に正しく分解する（`_(\d+)` が末尾の数値部を取る）。
> `reservedMax` は文字列キーで持ち、未知カテゴリ文字列が来ても無害（該当カテゴリの採番にのみ影響）。

#### 2b. `makeTokenizer` の冪等化（件数二重計上の回避）

`har/sanitize.ts` の `makeTokenizer` で、tokenize 対象の値が**既に `[REDACTED:CAT_n]` 単体**（前後に余分なし）なら、
そのまま返し件数を計上しない（再サニタイズの冪等性）。

```ts
// 単体プレースホルダ用（前後完全一致）。PLACEHOLDER_RE を anchored 化したもの。
const PLACEHOLDER_EXACT_RE = /^\[REDACTED:[A-Z_]+_\d+\]$/;

return (category, value) => {
  // 既にプレースホルダ化済みの値は再サニタイズで二重計上しない（#690 L-3・冪等性）
  if (PLACEHOLDER_EXACT_RE.test(value)) return value;
  // ...既存処理...
};
```

> `scrubInto` 経路（自由テキスト走査）の冪等性は 2a の採番修正でカバーされる
> （プレースホルダ自体はどのルールにもマッチしないため再計上されない）。

### テスト（test-gates 準拠・陽性/退行対照）

`src/utils/secret-scrubber/__tests__/`（既存 `secret-scrubber.test.ts` を確認し同所に）追加:

- **衝突回避（#690 L-3 陽性対照）**: 入力 `prev=[REDACTED:EMAIL_1] email=alice@example.com` を `scrubText`（EMAIL 有効）にかけると、
  実メールが `[REDACTED:EMAIL_1]` **ではない**番号（`_2` 以降）になり、出力に同一トークンが重複しない。
  - 担保: 採番修正を外すと実メールが `[REDACTED:EMAIL_1]` になり「重複しない」assert が fail することを実機確認。
- **退行対照**: 既存プレースホルダが無い通常入力では従来どおり `_1` から採番される（既存テストが回帰しないこと）。

`src/utils/har/__tests__/sanitize.test.ts` 追加:

- **冪等性（#690 L-3 退行対照）**: 一度 `sanitizeHar` した HAR を**もう一度** `sanitizeHar` にかけても、
  cookie/auth 等の構造的 redact 値が変わらず、`counts` が 2 回目は 0（または 1 回目以下）になる（二重計上しない）。
  - 担保: `makeTokenizer` の冪等ガードを外すと 2 回目の counts が増えて assert が fail することを実機確認。

---

## 項目 3: #694 — 自由テキスト走査カテゴリの分離

### 方針: 独立カテゴリへ分離（issue 第 1 案・user 確認済み「No preference」→ 推奨採用）

「フィールド名辞書ベースの確実な redact」と「自由テキスト走査（scrubText）」を別カテゴリ・別トグル・別件数に分ける。

### カテゴリ設計

`src/utils/har/rules.ts` の `HarRedactCategory` に 2 カテゴリ追加:

| カテゴリ            | ラベル       | 担当範囲                                                                                                               |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `COOKIE`            | Cookie       | （変更なし）                                                                                                           |
| `AUTH_HEADER`       | 認証ヘッダ   | **辞書（`AUTH_HEADER_NAMES`）一致ヘッダのみ**の値トークン化。辞書外ヘッダ走査は外す                                    |
| `QUERY`             | 機密クエリ   | **辞書（`SENSITIVE_PARAM_NAMES`）一致クエリ/POST param + URL basic-auth** の構造的 redact のみ。URL パス自由走査は外す |
| `BODY`              | POSTボディ   | （変更なし）                                                                                                           |
| `BODY_SCAN`         | 本文スキャン | （変更なし）                                                                                                           |
| `HEADER_SCAN`（新） | ヘッダ走査   | 辞書外ヘッダ値への `scrubText` フォールバック                                                                          |
| `PATH_SCAN`（新）   | URL走査      | URL パス + クエリ/フラグメント値への `scrubText`（`scrubUrlPath` 内部）                                                |

更新が必要な定義（`rules.ts`）:

- `HarRedactCategory` union に `HEADER_SCAN` / `PATH_SCAN` 追加
- `HAR_REDACT_CATEGORIES` 配列に追加（**トグル表示順**: 構造的カテゴリの後に走査カテゴリを並べる。例 `COOKIE, AUTH_HEADER, QUERY, BODY, BODY_SCAN, HEADER_SCAN, PATH_SCAN`）
- `HAR_REDACT_LABEL` に `HEADER_SCAN: 'ヘッダ走査'`, `PATH_SCAN: 'URL走査'`
- `HAR_REDACT_DEFAULT` に両方 `true`（既定 ON＝従来挙動を維持）
- `emptyRedactCounts` は配列駆動のため自動対応（変更不要）

### sanitize.ts の配線変更

1. **`redactHeaders` の辞書外ヘッダ走査**: 最終 `else if (enabled.AUTH_HEADER)` を `else if (enabled.HEADER_SCAN)` に変更し、
   `scrubInto(h.value, counts, 'HEADER_SCAN')` に計上。
2. **`scrubUrlPath` 内の `scrubInto` / `scrubPairValues`**: カテゴリを `'QUERY'` → `'PATH_SCAN'` に変更
   （`scrubInto(path, counts, 'PATH_SCAN')`、`scrubPairValues` 内の `scrubInto(..., 'PATH_SCAN')`）。
3. **`redactUrl` のゲート分離**:
   - basic-auth redact: `if (enabled.QUERY)`（維持・構造的）
   - 構造的クエリ param redact: `if (enabled.QUERY)`（維持・構造的）
   - `scrubUrlPath` 呼び出し: `if (enabled.PATH_SCAN)` に変更（自由走査）
4. **URL を運ぶヘッダ（`URL_HEADER_NAMES`）の分岐**: 現状 `else if (enabled.QUERY)` で `redactUrl` を呼ぶ。
   構造的・走査のどちらか一方でも ON なら URL 処理に入れるよう `else if (enabled.QUERY || enabled.PATH_SCAN)` に変更
   （`redactUrl` 内部で各ステップが個別ゲートされるため安全）。
5. **`response.redirectURL`**: `if (enabled.QUERY && ...)` → `if ((enabled.QUERY || enabled.PATH_SCAN) && ...)`。
6. **`request.url`**: 無条件で `redactUrl` を呼ぶ現状を維持（内部ゲートで制御）。

> `scrubPairValues` / `scrubUrlPath` のシグネチャはカテゴリ固定（PATH_SCAN）にハードコードでよい
> （これらは URL 走査専用ヘルパーのため）。`scrubInto` の第 3 引数だけ差し替える。

### UI（`src/components/tools/HarViewer.tsx`）

`ToggleChips` は `HAR_REDACT_CATEGORIES` を map して描画しているため**追加変更は基本不要**
（新カテゴリが自動でチップ表示・件数バッジ付与される）。表示順は配列順に従う。
ラベル文言は `HAR_REDACT_LABEL` 経由。

### テスト更新（既存 assert の付け替え + 新規対照）

`src/utils/har/__tests__/sanitize.test.ts`:

- `ALL_OFF` リテラルに `HEADER_SCAN: false, PATH_SCAN: false` を追加（**重要**: 漏れると型エラー）。
- **件数カテゴリの付け替え**:
  - 「辞書外ヘッダの JWT」テスト（#687b）: 値が消えることは不変。件数を確認している箇所があれば `AUTH_HEADER` → `HEADER_SCAN`。
  - 「URL パストークン」(#687c) / 「辞書外クエリ JWT」(#689b): 件数確認は `QUERY` → `PATH_SCAN`。
- **分離の陽性対照（新規・#694）**:
  - `AUTH_HEADER` のみ ON（`HEADER_SCAN` OFF）→ 辞書一致ヘッダ（Authorization）は redact されるが、辞書外ヘッダ値の機密は **redact されない**。
  - `HEADER_SCAN` のみ ON（`AUTH_HEADER` OFF）→ 辞書外ヘッダの JWT は redact されるが、Authorization ヘッダは **redact されない**。
  - 同様に `QUERY` のみ ON → URL パストークンは残る／`PATH_SCAN` のみ ON → 構造的機密クエリ（辞書一致）は残るがパストークンは redact。
  - これにより「辞書ベース」と「自由走査」が**別トグルで独立制御できる**ことを担保（test-gates: トグル ON/OFF 両方向の検知）。

---

## ドキュメント更新

- `docs/decisions.md [118]`「既知の残存リスク」: L-3 据置の記述を「#690 L-3 対応済み（採番の既存プレースホルダ考慮 + makeTokenizer 冪等化）」に更新。
  併せて #694（自由テキスト走査の独立カテゴリ化）・#695（`data:` URL 破壊回避）を反映した短い追記。
- `docs/tools.md` の har-viewer 節: redact カテゴリ一覧に「ヘッダ走査 / URL走査」を追記し、
  「認証ヘッダ / 機密クエリ」は辞書ベース、「ヘッダ走査 / URL走査」は自由テキスト走査である旨を 1〜2 行で明記（#694 のユーザー向け説明）。
  - 該当節が無ければ無理に追記しない（既存記述に合わせる）。

## 検証ゲート（push 前必須）

- `node_modules/.bin/astro check`（型 0/0/0）
- `npm run test`（secret-scrubber / har sanitize 全 PASS。環境要因の `sw-cache-version` / `codex-git-add-files` 失敗は本変更無関係）
- `npm run lint` / `npm run format:check` クリーン
- E2E（`har-viewer.spec.ts`）は UI のトグル増のみで挙動不変のため、既存が通ることを確認（新規 E2E は不要、ユニットで網羅）

## 完了報告フォーマット（subagent → 親）

項目ごとに「実装 / 既存で十分 / スキップ理由」を明示すること（CLAUDE.md §6.9）。

- #695 実装/テスト
- #690 L-3（2a / 2b）実装/テスト
- #694（カテゴリ定義 / sanitize 配線 / テスト付け替え / 新規対照 / UI 確認）実装
- ドキュメント更新
- 検証ゲート結果（コマンド出力の要点）
