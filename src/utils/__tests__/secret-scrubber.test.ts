import { describe, it, expect } from 'vitest';
import { scrubText } from '@/utils/secret-scrubber/scrub';
import { DEFAULT_ENABLED } from '@/utils/secret-scrubber/rules';
import type { ScrubCategory } from '@/utils/secret-scrubber/rules';

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

  it('代入式でキー名と値が同一でも値側がマスクされる', () => {
    const result = scrubText('password=password', DEFAULT_ENABLED);
    expect(result.counts.CREDENTIAL).toBeGreaterThan(0);
    expect(result.output).toBe('password=[REDACTED:CREDENTIAL_1]');
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
