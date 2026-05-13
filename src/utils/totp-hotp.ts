export type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-512';
export type Digits = 6 | 7 | 8;
export type Period = 30 | 60;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  if (!input) return new Uint8Array(0);
  const s = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];

  for (const ch of s) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base32 character: "${ch}"`);
    bits = (bits << 5) | idx;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >>> bitCount) & 0xff);
    }
  }

  return new Uint8Array(output);
}

export function base32Encode(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  let bits = 0;
  let bitCount = 0;
  let output = '';

  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += BASE32_ALPHABET[(bits >>> bitCount) & 0x1f];
    }
  }

  if (bitCount > 0) {
    output += BASE32_ALPHABET[(bits << (5 - bitCount)) & 0x1f];
  }

  while (output.length % 8 !== 0) {
    output += '=';
  }

  return output;
}

export async function hotp(
  secret: Uint8Array<ArrayBuffer>,
  counter: bigint,
  opts: { algorithm: HashAlgo; digits: Digits }
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: opts.algorithm },
    false,
    ['sign']
  );

  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = Number(c & 0xffn);
    c >>= 8n;
  }

  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));

  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    (((mac[offset] & 0x7f) << 24) |
      ((mac[offset + 1] & 0xff) << 16) |
      ((mac[offset + 2] & 0xff) << 8) |
      (mac[offset + 3] & 0xff)) %
    10 ** opts.digits;

  return code.toString().padStart(opts.digits, '0');
}

export async function totp(
  secret: Uint8Array<ArrayBuffer>,
  opts: { algorithm: HashAlgo; digits: Digits; period: Period; timestamp?: number }
): Promise<string> {
  const ts = opts.timestamp ?? Date.now();
  const counter = BigInt(Math.floor(ts / (opts.period * 1000)));
  return hotp(secret, counter, { algorithm: opts.algorithm, digits: opts.digits });
}

export async function verifyTotp(
  code: string,
  secret: Uint8Array<ArrayBuffer>,
  opts: { algorithm: HashAlgo; digits: Digits; period: Period; timestamp?: number; window?: number }
): Promise<{ valid: boolean; offset: number | null }> {
  const ts = opts.timestamp ?? Date.now();
  const currentCounter = BigInt(Math.floor(ts / (opts.period * 1000)));
  const windowSize = opts.window ?? 1;

  for (let offset = -windowSize; offset <= windowSize; offset++) {
    const counter = currentCounter + BigInt(offset);
    const expected = await hotp(secret, counter, {
      algorithm: opts.algorithm,
      digits: opts.digits,
    });
    if (expected === code) {
      return { valid: true, offset };
    }
  }

  return { valid: false, offset: null };
}

export function buildOtpauthUri(opts: {
  type: 'totp' | 'hotp';
  issuer: string;
  account: string;
  secretBase32: string;
  algorithm: HashAlgo;
  digits: Digits;
  period?: Period;
  counter?: bigint;
}): string {
  if (opts.issuer.includes(':')) {
    throw new Error(`issuer must not contain a colon: "${opts.issuer}"`);
  }

  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const algorithmName = opts.algorithm.replace('-', '');

  const paramParts = [
    `secret=${opts.secretBase32}`,
    `issuer=${encodeURIComponent(opts.issuer)}`,
    `algorithm=${algorithmName}`,
    `digits=${opts.digits}`,
  ];

  if (opts.type === 'totp') {
    paramParts.push(`period=${opts.period ?? 30}`);
  } else {
    paramParts.push(`counter=${opts.counter ?? 0n}`);
  }

  return `otpauth://${opts.type}/${label}?${paramParts.join('&')}`;
}
