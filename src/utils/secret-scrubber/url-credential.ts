/**
 * URL の basic-auth 認証情報（`scheme://user:password@host`）の **パスワード部** を
 * 捉える共有正規表現ビルダー。
 *
 * `secret-scrubber/scrub.ts` の CREDENTIAL_URL ルール（自由テキスト走査）と
 * `har/sanitize.ts` の redactUrl（HAR の URL フィールド）の二重実装を一本化するための
 * 単一の真実源。
 *
 * グループ構成:
 *   1: パスワード手前までの prefix（`scheme://user:`）— 残す
 *   2: パスワード — マスク対象
 *   3: `@host` — 残す（host はブラケット IPv6 `[::1]` にも対応）
 *
 * 設計上のポイント:
 * - user 部は `[^/\s:@]+`（`/` を含まない）。`https://host:8080/...@...` のポート/パスを
 *   ユーザー名やパスワードと誤認して URL を破壊する事故を防ぐ。
 * - password 部は `[^/\s?#]+`（`@` を許容し、host 直前の最後の `@` まで貪欲）。
 *   `user:pa@ss@host` のような生 `@` 入りパスワードでも断片を残さない。`?`/`#` を
 *   除外することで、パス `/` の無い URL（`https://u:p@host?redirect=x@y.com`）でも
 *   クエリ/フラグメント内の `@` を巻き込んで host を破壊しない（PR #691 レビュー指摘）。
 * - `requireScheme: true` は自由テキスト走査用。`scheme:` を必須にして
 *   `3//4:5@6` のような非 URL 断片の誤検出を防ぐ。
 * - `requireScheme: false` は HAR の URL フィールド用。protocol-relative
 *   (`//user:pass@host`) に対応する。
 * - scheme は `{0,31}` で上限化（実在 scheme は十分短い）。`:` の無い小文字英数連で
 *   各開始位置から greedy にバックトラックして O(n²) になる ReDoS（#688）を防ぐ。
 */
const SCHEME = String.raw`[a-z][a-z0-9+.-]{0,31}:`;
const HOST = String.raw`(?:\[[^\]\s]+\]|[\w.-]+)`;

export function makeUrlCredentialRegex(opts: { flags: string; requireScheme: boolean }): RegExp {
  const scheme = opts.requireScheme ? SCHEME : `(?:${SCHEME})?`;
  return new RegExp(String.raw`(${scheme}\/\/[^/\s:@]+:)([^/\s?#]+)(@${HOST})`, opts.flags);
}
