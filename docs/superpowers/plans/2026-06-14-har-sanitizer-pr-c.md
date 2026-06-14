# PR-C 性能・ReDoS対策 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scrubText` の O(n²) ReDoS（#688）を解消する。真因は `EMAIL` ルールの catastrophic backtracking なので、EMAIL 正規表現を RFC 準拠の長さ上限付きにして O(n) 化する。

**Architecture:** `secret-scrubber/rules.ts` の `EMAIL` パターン `[\w.+-]+@[\w-]+(?:\.[\w-]+)+` を `[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+` に変更（local part ≤64・label ≤63 = RFC 上限）。各開始位置のバックトラックが定数で打ち切られ線形になる。性能回帰テスト（陽性対照）と実在メール retention テストを併設する。

**Tech Stack:** TypeScript / Vitest / 既存 `secret-scrubber` ルールパイプライン。

**Spec:** `docs/superpowers/specs/2026-06-14-har-sanitizer-hardening-design.md`（PR-C 節は実機調査で真因確定後に更新済み）

**対象ブランチ:** `fix/har-sanitizer-redos`（`origin/develop` 先端 = PR-A マージ済み起点で作成済み）

---

## 前提・検証済み事実（実機 node で確認済み）

- O(n²) の主因は **2 つの catastrophic backtracking**:
  1. **`EMAIL` ルール** `[\w.+-]+@[\w-]+(?:\.[\w-]+)+`（`@` 無し長語連。40k で 1461ms）。
  2. **`CREDENTIAL_URL` 共有ビルダーの scheme 部** `[a-z][a-z0-9+.-]*:`（`:` 無し小文字英数連。100k で 8193ms）。PR-A 以前から存在。ランダム英数字計測では run が分断され見逃し、`'a'.repeat(n)` で顕在化（PR-C 着手時の実装中に判明）。
- 新 `EMAIL` `[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+` と新 scheme `[a-z][a-z0-9+.-]{0,31}:` を両方適用すると、全ルール合算が全 adversarial 入力（all-a / dots / slashes / scheme-ish / hex）で線形（100k で ≤52ms）。
- `HIGH_ENTROPY` は単一 greedy マッチで O(n)（無関係）。`{24,512}` 上限化は512字超で逆に O(n²) を生むため有害＝不採用。
- 実在メール・実在 URL（`https://` / `postgres://` / `mongodb+srv://` / `redis://[::1]` / protocol-relative）の検出は新旧で同一。上限超過の「メール風/scheme 風」文字列は RFC 上無効なため実害ある検出損失なし。
- `recheck`（依存にあり）は境界付き版も保守的に polynomial 判定するためゲートには使わない。代わりに実測ベースの性能 assert を陽性対照にする。

## File Structure

- 変更: `src/utils/secret-scrubber/rules.ts` — `EMAIL` と `JWT_TOKEN` の `pattern` を上限付きに変更（2箇所）。
- 変更: `src/utils/secret-scrubber/url-credential.ts` — `SCHEME` 定数を上限付き `{0,31}` に変更（1箇所）。`scrub.ts` の CREDENTIAL_URL と `sanitize.ts` の redactUrl 両方に共有ビルダー経由で波及。
- テスト: `src/utils/__tests__/secret-scrubber.test.ts` — 性能回帰テスト（陽性対照。EMAIL/scheme/JWT の3主因を adversarial コーパスで網羅）+ 実在メール retention テストを追加（JWT/JWE 検出は PR-A の既存テストでカバー）。

> **レビュー反映（PR #692）**: 当初 EMAIL/scheme のみ修正したが、レビューで `JWT_TOKEN` `\beyJ[\w-]+(?:\.[\w-]+){2,}` にも同型の O(n²)（`-eyJ` 反復で 80k=891ms）が残存し、`'a'.repeat` 回帰テストの盲点だったと指摘。JWT も `[\w-]{1,1024}` で bound し、回帰テストを `-eyJ` 連を含む adversarial コーパスに拡張した。巨大セグメントは `HIGH_ENTROPY_BASE64` が拾う安全網あり。

## 注意事項

- 変更は EMAIL と scheme の量化子上限のみ。`HIGH_ENTROPY` の量化子上限化・広域な入力長ガードは**行わない**（真因でなく、前者は512字超で逆に O(n²) を生むため有害、後者は YAGNI）。
- コミットは Conventional Commits + 日本語。明示パスのみ stage。コミット前に `git config user.email noreply@anthropic.com && git config user.name Claude` を確認。

---

### Task 1: EMAIL 正規表現と URL scheme の量化子を RFC 上限付きにする（#688）

**Files:**

- Modify: `src/utils/secret-scrubber/rules.ts`（`EMAIL` ルールの `pattern`、現状 `id: 'EMAIL'` の行付近）
- Test: `src/utils/__tests__/secret-scrubber.test.ts`（末尾に describe 追加）

- [ ] **Step 1: 失敗するテスト（性能 + retention）を書く**

`src/utils/__tests__/secret-scrubber.test.ts` の末尾に追加（`scrubText` / `DEFAULT_ENABLED` は既存 import を利用）:

```ts
describe('ReDoS 回帰防止 — EMAIL の線形時間性（#688）', () => {
  it('陽性対照: @ を含まない長語連でも閾値内に完了する（旧 greedy EMAIL regex なら fail）', () => {
    // 旧 `[\w.+-]+@...` は @ 無し長語連で O(n²)（80k で ~5.7s）。
    // 上限付き `[\w.+-]{1,64}@...` は O(n)（80k で ~30ms）。
    // 閾値 1500ms は旧（数千ms / vitest 既定 5s タイムアウト）と新（数十ms）の
    // 間に十分なマージンで置く（CI のばらつきにも耐える）。
    const input = 'a'.repeat(100000);
    const start = performance.now();
    scrubText(input, DEFAULT_ENABLED);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1500);
  });

  it('retention: 上限内の実在メールは引き続き検出・redact する', () => {
    for (const email of [
      'foo@bar.com',
      'alice.smith+tag@sub.example.co.jp',
      'x@y.io',
      'a_b-c@d-e.f.org',
    ]) {
      const r = scrubText(email, DEFAULT_ENABLED);
      expect(r.output).not.toContain(email);
      expect(r.counts.EMAIL).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test -- secret-scrubber`
Expected: 旧 `EMAIL` regex では性能テストが O(n²) のため**閾値超過 / vitest タイムアウトで FAIL**（retention は PASS）。

> 補足: 旧実装での FAIL を手早く確認するには、性能テストの入力を `'a'.repeat(40000)` 程度にしても旧は ~1.5s 前後で閾値に達する。本番テストは 100k で十分なマージンを取る。

- [ ] **Step 3: EMAIL 正規表現を上限付きに変更**

`src/utils/secret-scrubber/rules.ts` の `EMAIL` ルールの `pattern` 行:

```ts
    // ドメインは「.+セグメント」の繰り返しで終端し、文末ピリオドを巻き込まない
    pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
```

を次に置換（コメントも更新）:

```ts
    // local part ≤64 / label ≤63（RFC 上限）で量化子を bound し、@ 無し長語連での
    // catastrophic backtracking（O(n²) ReDoS, #688）を防ぐ。ドメインは「.+セグメント」の
    // 繰り返しで終端し文末ピリオドを巻き込まない。上限超過のメール風文字列は RFC 上無効。
    pattern: /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g,
```

さらに `src/utils/secret-scrubber/url-credential.ts` の `SCHEME` 定数:

```ts
const SCHEME = String.raw`[a-z][a-z0-9+.-]*:`;
```

を上限付きに置換（直前の doc コメントにも scheme 上限化の理由を追記）:

```ts
const SCHEME = String.raw`[a-z][a-z0-9+.-]{0,31}:`;
```

これで `scrub.ts` の `CREDENTIAL_URL`（requireScheme:true）と `sanitize.ts` の `redactUrl`（requireScheme:false）の両方の scheme 由来 O(n²) が解消される。性能テストの describe / コメントは EMAIL・scheme 両方をカバーする旨に更新する。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test -- secret-scrubber`
Expected: PASS（性能テスト・retention とも緑）

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add src/utils/secret-scrubber/rules.ts src/utils/__tests__/secret-scrubber.test.ts
git commit -m "fix: EMAIL正規表現をRFC上限付きにしO(n²) ReDoSを解消 (#688)"
```

---

### Task 2: 全体検証・push・PR 作成

- [ ] **Step 1: ユニットテスト全件**

Run: `npm run test`
Expected: 既存と同様に全 PASS（環境依存の `sw-cache-version`〔dist/sw.js 未生成〕・`codex-git-add-files`〔署名サーバ〕の2件のみローカル失敗、CI では PASS）。

- [ ] **Step 2: 型チェック全体**

Run: `node_modules/.bin/astro check`
Expected: 0 errors / 0 warnings / 0 hints

- [ ] **Step 3: format:check + Lint**

Run: `npm run format:check` と `npm run lint`
Expected: いずれもクリーン（format:check が落ちたら `npm run format` を実行して再コミット）

- [ ] **Step 4: E2E（サニタイザ関連）**

Run: `npm run test:e2e -- secret-scrubber har-viewer`
Expected: PASS（ロジックのみ変更・UI 不変）。流せない場合は CI に委ねる旨を報告。

- [ ] **Step 5: push**

```bash
git push -u origin fix/har-sanitizer-redos
```

- [ ] **Step 6: PR 作成**

`--base develop` で PR を作成（GitHub MCP `create_pull_request`）。本文は日本語で、#688 を Closes、PR-C（性能・ReDoS対策）である旨、**実機調査で真因が EMAIL と判明し当初の HIGH_ENTROPY 上限化案は不採用にした経緯**、O(n²)→O(n) の計測値、retention 確認を記載する。

---

## Self-Review（計画作成者によるチェック結果）

- **Spec coverage**: #688 = Task1（EMAIL 上限化）。spec PR-C 節の更新方針（EMAIL 修正・HIGH_ENTROPY 上限化と入力長ガードは不採用・性能 assert 陽性対照）と一致。
- **Placeholder scan**: TODO/TBD なし。全コードブロックに実コード記載。
- **Type consistency**: 変更は正規表現リテラル1箇所のみ。新規シンボルなし。テストは既存 `scrubText` / `DEFAULT_ENABLED` を使用（追加 import 不要）。
- **陽性対照の妥当性**: 性能テストは旧 regex（O(n²)）で閾値超過/タイムアウト → fail、新 regex（O(n)）で PASS。実機で旧 80k=5721ms / 新 80k=29ms を確認済み。`test-gates` の「旧実装に当てると fail する」要件を満たす。
