import { describe, expect, it, vi } from 'vitest';
import { scrubText } from '@/utils/secret-scrubber/scrub';
import { DEFAULT_ENABLED, SCRUB_CATEGORIES } from '@/utils/secret-scrubber/rules';
import { createMask } from '@/utils/mcp-config-inspector/display';

// すべて公開サンプルまたはこのテスト用の架空値。
const aws = 'AKIAIOSFODNN7EXAMPLE';
const unknown = 'Qz7vWx2RtYpL9pQ9sKd4FhB8nJc6';
const wrapped = `Qz7vWx2RtYpL-${aws}-pQ9sKd4FhB8nJc6`;
const jwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const entropyOnly = Object.fromEntries(
  SCRUB_CATEGORIES.map((c) => [c, c === 'HIGH_ENTROPY'])
) as typeof DEFAULT_ENABLED;

describe('#908 代入式の構造保持', () => {
  it('MCP 表示の追加走査でも長い秘密を完全にマスクする', () => {
    const mask = createMask(new Set());
    expect(mask(`aws_access_key=${wrapped}`)).toBe('aws_access_key=[REDACTED:API_KEY_1]');
    expect(mask(`aws_access_key=${wrapped}`)).toBe('aws_access_key=[REDACTED:API_KEY_1]');
  });

  it('同じ行の複数代入は構造を推測せず各秘密をマスクする', () => {
    const result = scrubText(`first_value=${wrapped} second_value=${wrapped}`, DEFAULT_ENABLED);
    expect(result.output).toBe('[REDACTED:API_KEY_1] [REDACTED:API_KEY_2]');
  });

  it.each([
    ['aws_access_key', aws, 'API_KEY'],
    ['aws_secret', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'CREDENTIAL'],
    ['support_phone', '03-1234-5678', 'PHONE_JP'],
    ['jwt_token', jwt, 'JWT'],
  ])('全カテゴリ ON: %s のキーを保持して値全体を消す', (key, value, category) => {
    const result = scrubText(`${key}=${value}`, DEFAULT_ENABLED);
    expect(result.output).toBe(`${key}=[REDACTED:${category}_1]`);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      start: key.length + 1,
      end: key.length + 1 + value.length,
    });
  });

  it('陰性対照: 短い通常値は変更しない', () => {
    const input = 'app_mode=dev\nlog_level=info';
    expect(scrubText(input, entropyOnly).output).toBe(input);
  });

  it('陽性対照: キーを除くと閾値未満になる秘密も前後の断片を残さない', () => {
    const secret = `abcabc-${aws}-abcabc`;
    expect(scrubText(`custom_value=${secret}`, DEFAULT_ENABLED).output).toBe(
      'custom_value=[REDACTED:API_KEY_1]'
    );
    expect(scrubText(`custom_value=${secret}`, entropyOnly).output).toBe(
      'custom_value=[REDACTED:HIGH_ENTROPY_1]'
    );
  });

  it('陽性対照: 未知の長い秘密は専用ルールなしでも検出する', () => {
    expect(scrubText(`custom_value=${unknown}`, entropyOnly).output).toBe(
      'custom_value=[REDACTED:HIGH_ENTROPY_1]'
    );
    expect(scrubText(unknown, entropyOnly).output).toBe('[REDACTED:HIGH_ENTROPY_1]');
  });

  it('陽性対照: 専用ルールに部分一致する長い秘密の前後も union で消す', () => {
    expect(scrubText(`aws_access_key=${wrapped}`, DEFAULT_ENABLED).output).toBe(
      'aws_access_key=[REDACTED:API_KEY_1]'
    );
    expect(scrubText(wrapped, DEFAULT_ENABLED).output).toBe('[REDACTED:API_KEY_1]');
  });

  it.each([
    'Qz7vWx2RtYpL=',
    'custom_value=prefix=',
    'log: custom_value=',
    'https://example.com/?custom_value=',
  ])('陽性対照: 曖昧な構造 %s では断片を残さない', (prefix) => {
    const result = scrubText(`${prefix}${wrapped}`, DEFAULT_ENABLED);
    expect(result.output).not.toContain('Qz7vWx2RtYpL');
    expect(result.output).not.toContain('pQ9sKd4FhB8nJc6');
    expect(result.output).not.toContain(aws);
  });

  it('高エントロピー OFF でも専用カテゴリを検出し、専用カテゴリ OFF でも高エントロピー候補を保護する', () => {
    expect(
      scrubText(`aws_access_key=${aws}`, { ...DEFAULT_ENABLED, HIGH_ENTROPY: false }).output
    ).toBe('aws_access_key=[REDACTED:API_KEY_1]');
    expect(scrubText(`aws_access_key=${aws}`, entropyOnly).output).toBe(
      'aws_access_key=[REDACTED:HIGH_ENTROPY_1]'
    );
    expect(
      scrubText(`custom_value=${unknown}`, { ...entropyOnly, HIGH_ENTROPY: false }).output
    ).toBe(`custom_value=${unknown}`);
  });

  it('隣接・複数候補と同一値の一貫置換を保つ', () => {
    const input = `  first_value = ${unknown}\r\nsecond_value=${unknown}\n${wrapped},${wrapped}`;
    expect(scrubText(input, DEFAULT_ENABLED).output).toBe(
      '  first_value = [REDACTED:HIGH_ENTROPY_1]\r\nsecond_value=[REDACTED:HIGH_ENTROPY_1]\n[REDACTED:API_KEY_1],[REDACTED:API_KEY_1]'
    );
  });

  it('URL 資格情報・既存プレースホルダを保つ', () => {
    const input = `prev_value=[REDACTED:API_KEY_3]\naws_access_key=${aws}\ndatabase_url=postgres://admin:admin@db.example.com/mydb`;
    expect(scrubText(input, DEFAULT_ENABLED).output).toBe(
      'prev_value=[REDACTED:API_KEY_3]\naws_access_key=[REDACTED:API_KEY_4]\ndatabase_url=postgres://admin:[REDACTED:CREDENTIAL_1]@db.example.com/mydb'
    );
  });

  it('indices がない場合は構造保持を諦め over-mask する', () => {
    const original = RegExp.prototype.exec;
    const spy = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (
      this: RegExp,
      text: string
    ) {
      const match = original.call(this, text);
      if (match) delete match.indices;
      return match;
    });
    let output: string;
    try {
      output = scrubText(`aws_access_key=${aws}`, DEFAULT_ENABLED).output;
    } finally {
      spy.mockRestore();
    }
    expect(output).toBe('[REDACTED:API_KEY_1]');
  });
});
