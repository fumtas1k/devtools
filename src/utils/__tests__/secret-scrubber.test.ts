import { describe, it, expect } from 'vitest';
import { scrubText, resolveMaskRange } from '@/utils/secret-scrubber/scrub';
import { DEFAULT_ENABLED } from '@/utils/secret-scrubber/rules';
import type { ScrubCategory } from '@/utils/secret-scrubber/rules';
import { makeUrlCredentialRegex } from '@/utils/secret-scrubber/url-credential';

/** 全カテゴリ無効の状態を返すヘルパー */
function onlyEnabled(categories: ScrubCategory[]) {
  const enabled = { ...DEFAULT_ENABLED };
  for (const cat of Object.keys(enabled) as ScrubCategory[]) {
    enabled[cat] = categories.includes(cat);
  }
  return enabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// 陽性対照: 各ルールが実際に検出し、出力に元の値が残らないことを保証する
// ─────────────────────────────────────────────────────────────────────────────

describe('陽性対照 — API_KEY', () => {
  it('AWS_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE を検出し出力に含まれない', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const result = scrubText(`aws_access_key=${secret}`, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
    expect(result.output).toContain('[REDACTED:');
  });

  it('GITHUB_TOKEN: ghp_ プレフィックストークンを検出し出力に含まれない', () => {
    const secret = 'ghp_' + 'A'.repeat(36);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('ANTHROPIC_KEY: sk-ant- プレフィックスキーを検出し出力に含まれない', () => {
    const secret = 'sk-ant-' + 'A'.repeat(32);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('OPENAI_KEY: sk- プレフィックスキーを検出し出力に含まれない', () => {
    const secret = 'sk-' + 'a'.repeat(32);
    const result = scrubText(`key=${secret}`, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('NPM_TOKEN: npm_ プレフィックストークンを検出し出力に含まれない', () => {
    const secret = 'npm_' + 'A'.repeat(36);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('STRIPE_KEY: sk_live_ プレフィックスキーを検出し出力に含まれない', () => {
    const secret = 'sk_live_' + 'a'.repeat(24);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('GOOGLE_API_KEY: AIza プレフィックスキーを検出し出力に含まれない', () => {
    const secret = 'AIza' + 'a'.repeat(35);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('SLACK_TOKEN: xoxb- プレフィックストークンを検出し出力に含まれない', () => {
    const secret = 'xoxb-' + '1234567890-ABCDEFGHIJ';
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('SENDGRID_KEY: SG. 形式キーを検出し出力に含まれない', () => {
    const secret = 'SG.' + 'a'.repeat(20) + '.' + 'b'.repeat(40);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('GITLAB_PAT: glpat- プレフィックストークンを検出し出力に含まれない', () => {
    const secret = 'glpat-' + 'a'.repeat(25);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });

  it('GITHUB_FINE_PAT: github_pat_ プレフィックストークンを検出し出力に含まれない', () => {
    const secret = 'github_pat_' + 'A'.repeat(22) + '_' + 'B'.repeat(59);
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.API_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });
});

describe('陽性対照 — PRIVATE_KEY', () => {
  it('PEM 秘密鍵ブロックを検出し出力に含まれない', () => {
    const secret =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEo...base64...\n-----END RSA PRIVATE KEY-----';
    const result = scrubText(secret, DEFAULT_ENABLED);
    expect(result.counts.PRIVATE_KEY).toBeGreaterThan(0);
    expect(result.output).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(result.output).toContain('[REDACTED:PRIVATE_KEY_1]');
  });
});

describe('陽性対照 — CREDENTIAL', () => {
  it('password= 代入式の値を検出し出力に含まれない', () => {
    const secret = 'mysecretpassword123';
    const result = scrubText(`password=${secret}`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
    // キー名は残る
    expect(result.output).toContain('password=');
  });

  it('URL 認証情報のパスワード部を検出し出力に含まれない', () => {
    const password = 'hunter2secret';
    const result = scrubText(`postgres://user:${password}@localhost/db`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(password);
    // ホスト部は残る
    expect(result.output).toContain('localhost');
  });

  it('Authorization ヘッダのトークン部を検出し出力に含まれない', () => {
    const token = 'AbCdEfGhIjKlMnOpQrSt';
    const result = scrubText(`Authorization: Bearer ${token}`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(token);
    // ヘッダ名と Bearer は残る
    expect(result.output).toContain('Authorization');
  });

  // 回帰防止: グループ位置を indexOf で探す旧実装では、キー名/ユーザー名と値が
  // 同一文字列のとき値側を取り違えてパスワードが漏えいした（indices 移行で修正）
  it('URL 認証情報でユーザー名とパスワードが同一でもパスワード側がマスクされる', () => {
    const result = scrubText('postgres://admin:admin@db.example.com/mydb', DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    // ユーザー名は残り、パスワード部（: と @ の間）がプレースホルダになる
    expect(result.output).toContain('postgres://admin:[REDACTED:CREDENTIAL_1]@db.example.com');
  });

  // 回帰防止: ホスト部を `[\w.-]+` 必須にした regex ではブラケット形式 IPv6 ホストで
  // ルール全体が不成立になりパスワードが素通しした（PR #631 再レビュー指摘）
  it('ブラケット形式 IPv6 ホストの URL 認証情報でもパスワードがマスクされる', () => {
    const password = 's3cretpw';
    const result = scrubText(`redis://user:${password}@[::1]:6379`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(password);
    // ホスト部は残る
    expect(result.output).toContain('@[::1]:6379');
  });

  it('代入式でキー名と値が同一でも値側がマスクされる', () => {
    const result = scrubText('password=password', DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).toBe('password=[REDACTED:CREDENTIAL_1]');
  });

  it('日本語キー名（パスワード）+ 全角コロンの代入式を検出し値が出力に含まれない', () => {
    const secret = 'himitsu-no-atai123';
    const result = scrubText(`パスワード： ${secret}`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
    // キー名は残る
    expect(result.output).toContain('パスワード');
  });

  it('日本語キー名（トークン）+ 半角コロンの代入式を検出し値が出力に含まれない', () => {
    const secret = 'tok-abcdef123456';
    const result = scrubText(`トークン: ${secret}`, DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).not.toContain(secret);
  });
});

describe('陽性対照 — JWT', () => {
  it('JWT トークンを検出し出力に含まれない', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scrubText(jwt, DEFAULT_ENABLED);
    expect(result.counts.JWT).toBeGreaterThan(0);
    expect(result.output).not.toContain(jwt);
    expect(result.output).toContain('[REDACTED:JWT_1]');
  });
});

describe('陽性対照 — EMAIL', () => {
  it('メールアドレスを検出し出力に含まれない', () => {
    const email = 'user@example.com';
    const result = scrubText(`contact: ${email}`, DEFAULT_ENABLED);
    expect(result.counts.EMAIL).toBeGreaterThan(0);
    expect(result.output).not.toContain(email);
    expect(result.output).toContain('[REDACTED:EMAIL_1]');
  });

  it('文末ピリオドはプレースホルダに巻き込まれない', () => {
    const result = scrubText('Contact user@example.com.', DEFAULT_ENABLED);
    expect(result.counts.EMAIL).toBe(1);
    expect(result.output).toBe('Contact [REDACTED:EMAIL_1].');
  });
});

describe('陽性対照 — IP', () => {
  it('有効な IPv4 アドレスを検出し出力に含まれない', () => {
    const ip = '192.168.1.100';
    const result = scrubText(`server_ip=${ip}`, DEFAULT_ENABLED);
    expect(result.counts.IP).toBeGreaterThan(0);
    expect(result.output).not.toContain(ip);
    expect(result.output).toContain('[REDACTED:IP_1]');
  });
});

describe('陽性対照 — PHONE_JP', () => {
  it('ハイフン区切り日本の電話番号を検出し出力に含まれない', () => {
    const phone = '090-1234-5678';
    const result = scrubText(`電話番号: ${phone}`, DEFAULT_ENABLED);
    expect(result.counts.PHONE_JP).toBeGreaterThan(0);
    expect(result.output).not.toContain(phone);
  });

  it('+81 形式の国際電話番号を検出し出力に含まれない', () => {
    const phone = '+81-90-1234-5678';
    const result = scrubText(phone, DEFAULT_ENABLED);
    expect(result.counts.PHONE_JP).toBeGreaterThan(0);
    expect(result.output).not.toContain(phone);
  });
});

describe('陽性対照 — CREDIT_CARD', () => {
  it('Luhn チェック通過するカード番号を検出し出力に含まれない', () => {
    // Visa テスト番号（Luhn 有効）
    const card = '4532015112830366';
    const result = scrubText(`card: ${card}`, DEFAULT_ENABLED);
    expect(result.counts.CREDIT_CARD).toBeGreaterThan(0);
    expect(result.output).not.toContain(card);
  });
});

describe('陽性対照 — HIGH_ENTROPY', () => {
  it('高エントロピー base64 風文字列を検出し出力に含まれない', () => {
    // ランダムに見える 32 文字以上の文字列
    const token = 'xK9mP3nR7wQ2vL8jT6yH4bC1dF5gA0sE';
    const enabled = onlyEnabled(['HIGH_ENTROPY']);
    const result = scrubText(token, enabled);
    expect(result.counts.HIGH_ENTROPY).toBeGreaterThan(0);
    expect(result.output).not.toContain(token);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 一貫トークン化のテスト
// ─────────────────────────────────────────────────────────────────────────────

describe('一貫トークン化', () => {
  it('同一メールアドレスが 2 回出現した場合、同一プレースホルダに置換される', () => {
    const email = 'admin@example.com';
    const result = scrubText(`from: ${email} and to: ${email}`, DEFAULT_ENABLED);
    // [REDACTED:EMAIL_1] が 2 個出現し、counts は 2
    expect(result.counts.EMAIL).toBe(2);
    const placeholders = result.findings.map((f) => f.placeholder);
    expect(placeholders.every((p) => p === '[REDACTED:EMAIL_1]')).toBe(true);
    expect(result.output).toContain('[REDACTED:EMAIL_1]');
    // 元の値は一切残らない
    expect(result.output).not.toContain(email);
  });

  it('異なるメールアドレスが出現した場合、連番プレースホルダが割り当てられる', () => {
    const result = scrubText('user1@example.com and user2@example.com', DEFAULT_ENABLED);
    expect(result.counts.EMAIL).toBe(2);
    const placeholders = result.findings.map((f) => f.placeholder);
    expect(placeholders).toContain('[REDACTED:EMAIL_1]');
    expect(placeholders).toContain('[REDACTED:EMAIL_2]');
  });

  it('複数カテゴリの場合それぞれ独立して連番が振られる', () => {
    const email = 'admin@example.com';
    const ip = '10.0.0.1';
    const result = scrubText(`contact: ${email} from ${ip}`, DEFAULT_ENABLED);
    const emailFindings = result.findings.filter((f) => f.category === 'EMAIL');
    const ipFindings = result.findings.filter((f) => f.category === 'IP');
    expect(emailFindings[0].placeholder).toBe('[REDACTED:EMAIL_1]');
    expect(ipFindings[0].placeholder).toBe('[REDACTED:IP_1]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 重複解決のテスト
// ─────────────────────────────────────────────────────────────────────────────

describe('重複解決', () => {
  it('Authorization ヘッダ内の JWT は二重置換にならない', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const input = `Authorization: Bearer ${jwt}`;
    const result = scrubText(input, DEFAULT_ENABLED);
    // プレースホルダは 1 つだけ
    const redacted = result.output.match(/\[REDACTED:[^\]]+\]/g) ?? [];
    expect(redacted.length).toBe(1);
    // 元の JWT は残らない
    expect(result.output).not.toContain(jwt);
  });

  // 回帰防止（陽性対照）: 負けたマッチを丸ごと破棄する旧実装では、勝者に覆われて
  // いない断片（高エントロピー文字列の内側だけが AWS キーにマッチしたときの前後）が
  // マスクされず漏えいした。union マージで範囲を min(start)〜max(end) に広げて解消
  it('高エントロピー文字列の内側に AWS キーがあるとき、前後の断片も漏えいしない', () => {
    const input = 'Qz7vWx2RtYpL-AKIAIOSFODNN7EXAMPLE-pQ9sKd4FhB8nJc6';
    const result = scrubText(input, DEFAULT_ENABLED);
    // 全体が 1 つのプレースホルダになり、前後の高エントロピー断片が残らない
    expect(result.output).not.toContain('Qz7vWx2RtYpL');
    expect(result.output).not.toContain('pQ9sKd4FhB8nJc6');
    expect(result.output).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // 勝者（priority 高）の API_KEY カテゴリでマスクされる
    expect(result.output).toBe('[REDACTED:API_KEY_1]');
  });

  it('負けたマッチの尾部が勝者の end を超えて伸びる場合も漏えいしない', () => {
    // AWS キーと同じ位置から始まり、より長く伸びる高エントロピー文字列
    const input = 'AKIAIOSFODNN7EXAMPLE-pQ9sKd4FhB8nJc6xT2mWv5Z';
    const result = scrubText(input, DEFAULT_ENABLED);
    expect(result.output).not.toContain('pQ9sKd4FhB8nJc6');
    expect(result.output).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.output).toBe('[REDACTED:API_KEY_1]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// トグル（カテゴリ OFF）のテスト
// ─────────────────────────────────────────────────────────────────────────────

describe('トグル', () => {
  it('EMAIL カテゴリを OFF にするとメールが素通しされる', () => {
    const email = 'user@example.com';
    const enabled = { ...DEFAULT_ENABLED, EMAIL: false };
    const result = scrubText(`contact: ${email}`, enabled);
    expect(result.counts.EMAIL).toBe(0);
    expect(result.output).toContain(email);
  });

  it('EMAIL だけ OFF にしても他カテゴリ（IP）は検出継続する', () => {
    const ip = '192.168.1.1';
    const email = 'user@example.com';
    const enabled = { ...DEFAULT_ENABLED, EMAIL: false };
    const result = scrubText(`contact: ${email} at ${ip}`, enabled);
    expect(result.counts.EMAIL).toBe(0);
    expect(result.counts.IP).toBeGreaterThan(0);
    expect(result.output).toContain(email);
    expect(result.output).not.toContain(ip);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 陰性対照: 誤検出しないことを確認（別 describe）
// ─────────────────────────────────────────────────────────────────────────────

describe('陰性対照 — 誤検出しない', () => {
  it('機密情報を含まない平文: output === input, counts すべて 0', () => {
    const input = 'Hello, World! This is a plain text with no secrets.';
    const result = scrubText(input, DEFAULT_ENABLED);
    expect(result.output).toBe(input);
    expect(Object.values(result.counts).every((v) => v === 0)).toBe(true);
  });

  it('不正 IPv4（999.1.1.1）は検出されない', () => {
    const result = scrubText('address: 999.1.1.1', DEFAULT_ENABLED);
    expect(result.counts.IP).toBe(0);
  });

  it('Luhn 不成立の数字列は検出されない', () => {
    // 12345678901234 は Luhn 不成立
    const result = scrubText('12345678901234', DEFAULT_ENABLED);
    expect(result.counts.CREDIT_CARD).toBe(0);
  });

  it('UUID 形式は HIGH_ENTROPY で検出されない', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const enabled = onlyEnabled(['HIGH_ENTROPY']);
    const result = scrubText(uuid, enabled);
    expect(result.counts.HIGH_ENTROPY).toBe(0);
  });

  it('低エントロピーの長文字列（繰り返し）は HIGH_ENTROPY で検出されない', () => {
    const lowEntropy = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const enabled = onlyEnabled(['HIGH_ENTROPY']);
    const result = scrubText(lowEntropy, enabled);
    expect(result.counts.HIGH_ENTROPY).toBe(0);
  });
});

describe('makeUrlCredentialRegex', () => {
  function redact(url: string, requireScheme: boolean): string {
    const re = makeUrlCredentialRegex({ flags: 'g', requireScheme });
    return url.replace(re, (_m, pre, _pass, post) => `${pre}[X]${post}`);
  }

  it('正常 basic-auth のパスワードのみ redact しホストを残す', () => {
    expect(redact('https://user:secretpw@host.com/', false)).toBe('https://user:[X]@host.com/');
  });

  it('host:port + 後続 @ を含む URL を破壊せず内側の認証情報のみ redact する', () => {
    expect(redact('https://host:8080/redirect?to=https://u:p@evil.com', false)).toBe(
      'https://host:8080/redirect?to=https://u:[X]@evil.com'
    );
  });

  it('パス内 @ で誤爆しない（host:port/p@th を無変更）', () => {
    expect(redact('https://host:8080/p@th', false)).toBe('https://host:8080/p@th');
  });

  it('パスワード中の @ を含めて完全に redact する（断片を残さない）', () => {
    expect(redact('https://user:pa@ss@host.com/path', false)).toBe(
      'https://user:[X]@host.com/path'
    );
  });

  it('protocol-relative URL (requireScheme:false) のパスワードを redact する', () => {
    expect(redact('//user:pass@host.com/', false)).toBe('//user:[X]@host.com/');
  });

  it('IPv6 ホストでもパスワードのみ redact しホストを残す', () => {
    expect(redact('https://user:pw@[::1]:8080/x', false)).toBe('https://user:[X]@[::1]:8080/x');
  });

  it('認証情報の無い通常 URL では何も変更しない', () => {
    expect(redact('https://api.example.com/v1/users', false)).toBe(
      'https://api.example.com/v1/users'
    );
  });

  it('退行: パス無し + クエリ内 @ を含む URL でホスト/クエリを破壊しない（PR #691 レビュー指摘）', () => {
    // password 部が host・query を巻き込んで over-redact する #686 同クラスの回帰を防ぐ
    expect(redact('https://u:p@host.com?redirect=x@y.com', false)).toBe(
      'https://u:[X]@host.com?redirect=x@y.com'
    );
  });

  it('退行: フラグメント内 @ を巻き込まない', () => {
    expect(redact('https://u:p@host.com#frag@x', false)).toBe('https://u:[X]@host.com#frag@x');
  });

  it('requireScheme:true では scheme の無い //a:b@c や 3//4:5@6 を誤検出しない', () => {
    expect(redact('3//4:5@6.com', true)).toBe('3//4:5@6.com');
    expect(redact('//user:pass@host.com/', true)).toBe('//user:pass@host.com/');
  });

  it('requireScheme:true では scheme 付き URL のパスワードを redact する', () => {
    expect(redact('https://user:secretpw@host.com/', true)).toBe('https://user:[X]@host.com/');
  });
});

describe('JWT_TOKEN — 多セグメント（JWE）の陽性対照（#690 L-1）', () => {
  it('5セグメント JWE を末尾セグメントを残さず全体 redact する', () => {
    // 裸の JWE（機密キーワードの prefix を付けない）で JWT_TOKEN ルール単体を分離する。
    // `token=<jwe>` 形式だと Task4 拡張後の CREDENTIAL_ASSIGN が先に値全体を捕捉して
    // union マージし、旧 JWT_TOKEN でも PASS してしまい陽性対照にならないため。
    const jwe = 'eyJhbGciOiJSU0Et.QUFB.QkJC.Q0ND.RERE';
    const r = scrubText(jwe, DEFAULT_ENABLED);
    expect(r.output).not.toContain('RERE'); // 末尾の暗号文/タグが残らない
    expect(r.output).not.toContain(jwe);
  });

  it('退行対照: 通常の3セグメント JWT は引き続き redact する', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QTabc';
    const r = scrubText(jwt, DEFAULT_ENABLED);
    expect(r.output).not.toContain(jwt);
  });
});

describe('CREDENTIAL_ASSIGN — JSON / 全角の陽性対照（#685 / #690 L-2）', () => {
  it('JSON の "password":"value" を redact する', () => {
    const r = scrubText('{"username":"alice","password":"hunter2"}', DEFAULT_ENABLED);
    expect(r.output).not.toContain('hunter2');
    expect(r.output).toContain('"username":"alice"'); // 非機密キーは保持
  });

  it('JSON の "client_secret":"value" を redact する', () => {
    const r = scrubText('{"client_secret":"GOCSPX-abcdefABCDEF12"}', DEFAULT_ENABLED);
    expect(r.output).not.toContain('GOCSPX-abcdefABCDEF12');
  });

  it('全角イコール パスワード＝value を redact する', () => {
    const r = scrubText('パスワード＝secret123', DEFAULT_ENABLED);
    expect(r.output).not.toContain('secret123');
  });

  it('退行対照: 非機密の通常文を過剰マスクしない', () => {
    const text = 'description: this is a long sentence value';
    const r = scrubText(text, DEFAULT_ENABLED);
    expect(r.output).toBe(text);
  });

  it('退行対照: form 形式 password=value は引き続き redact する', () => {
    const r = scrubText('password=myP@ssw0rd', DEFAULT_ENABLED);
    expect(r.output).not.toContain('myP@ssw0rd');
  });
});

describe('CREDENTIAL_URL — multi-@ / protocol-relative の陽性対照', () => {
  it('パスワード中の @ を含む URL 認証情報を断片なく redact する', () => {
    const r = scrubText('see https://user:pa@ss@host.com/path for detail', DEFAULT_ENABLED);
    expect(r.output).not.toContain('pa@ss');
    expect(r.output).not.toContain(':pa');
    // ホストは保持される
    expect(r.output).toContain('@host.com/path');
  });

  it('host:port を含む URL を破壊せず内側の認証情報のみ redact する', () => {
    const r = scrubText('https://host:8080/redirect?to=https://u:p@evil.com', DEFAULT_ENABLED);
    expect(r.output).toContain('https://host:8080/redirect?to=https://u:');
    expect(r.output).toContain('@evil.com');
  });
});

describe('ReDoS 回帰防止 — scrubText の線形時間性（#688）', () => {
  it('陽性対照: greedy-unbounded ルールを踏む adversarial 入力でも閾値内に完了する', () => {
    // catastrophic backtracking を起こす 3 つの主因を網羅する adversarial コーパス。
    // どの regex を旧の上限なし版に戻しても、対応する入力が O(n²) になり閾値超過/
    // vitest タイムアウトで fail する（検知能力ゼロで green を避ける = test-gates の趣旨）。
    //  - `'a'.repeat(n)`  : 旧 EMAIL `[\w.+-]+@...` と 旧 scheme `[a-z][a-z0-9+.-]*:` の両方
    //  - `'-eyJ'.repeat(n)`: 旧 JWT `\beyJ[\w-]+(?:\.[\w-]+){2,}` の `.` 不在バックトラック
    // 上限付き（EMAIL/JWT セグメント・scheme を bound）では全体 O(n)（100k で数十ms）。
    // 閾値 1500ms は新（数十ms）と旧（数千ms 以上）の間に十分なマージンで置く。
    const adversarialInputs: Record<string, string> = {
      'EMAIL/scheme (a 連)': 'a'.repeat(100000),
      'JWT (-eyJ 連)': '-eyJ'.repeat(25000),
    };
    for (const [name, input] of Object.entries(adversarialInputs)) {
      const start = performance.now();
      scrubText(input, DEFAULT_ENABLED);
      const elapsed = performance.now() - start;
      expect(elapsed, `${name} が線形時間で完了する`).toBeLessThan(1500);
    }
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

describe('resolveMaskRange — d フラグ fail-safe（#690 M-1）', () => {
  it('indices が取れない場合はマッチ全体を over-mask する（漏えい方向に倒さない）', () => {
    // d フラグ非対応環境を模した、.indices を持たないマッチ
    const fake = Object.assign(['Bearer abc12345', 'abc12345'], {
      index: 7,
    }) as unknown as RegExpExecArray;
    expect(resolveMaskRange(fake, 1)).toEqual({
      value: 'Bearer abc12345',
      start: 7,
      end: 7 + 'Bearer abc12345'.length,
    });
  });

  it('indices があればグループ範囲を使う', () => {
    const re = /authorization\s*:\s*([a-z0-9]+)/dgi;
    const m = re.exec('authorization: abc123')!;
    const r = resolveMaskRange(m, 1);
    expect(r.value).toBe('abc123');
    expect('authorization: abc123'.slice(r.start, r.end)).toBe('abc123');
  });
});
