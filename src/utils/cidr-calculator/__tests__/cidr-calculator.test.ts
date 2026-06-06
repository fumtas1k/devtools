import { describe, it, expect } from 'vitest';
import { parseCidr } from '@/utils/cidr-calculator';

// ─── 陽性対照: バリデータが確実に不正入力を throw することを確認 ────────────────

describe('parseCidr - 不正入力バリデーション（陽性対照）', () => {
  it('空文字列で throw する', () => {
    expect(() => parseCidr('')).toThrow();
  });

  it('"/" のみで throw する', () => {
    expect(() => parseCidr('/')).toThrow();
  });

  it('IPv4: オクテット 256 で throw する', () => {
    expect(() => parseCidr('256.0.0.0/8')).toThrow();
  });

  it('IPv4: オクテット 999 で throw する', () => {
    expect(() => parseCidr('999.1.1.1/8')).toThrow();
  });

  it('IPv4: 先頭ゼロのオクテットで throw する', () => {
    expect(() => parseCidr('01.0.0.0/8')).toThrow();
  });

  it('IPv4: prefix が 33 で throw する', () => {
    expect(() => parseCidr('1.2.3.4/33')).toThrow();
  });

  it('IPv4: prefix が負数で throw する', () => {
    expect(() => parseCidr('1.2.3.4/-1')).toThrow();
  });

  it('IPv4: prefix が非数 (abc) で throw する', () => {
    expect(() => parseCidr('1.2.3.4/abc')).toThrow();
  });

  it('IPv4: オクテット数が 3 で throw する', () => {
    expect(() => parseCidr('192.168.1/24')).toThrow();
  });

  it('IPv4: オクテット数が 5 で throw する', () => {
    expect(() => parseCidr('1.2.3.4.5/8')).toThrow();
  });

  it('IPv6: prefix が 129 で throw する', () => {
    expect(() => parseCidr('::/129')).toThrow();
  });

  it('IPv6: hextet が 5 桁以上 (fffff) で throw する', () => {
    expect(() => parseCidr('fffff::/16')).toThrow();
  });

  it('IPv6: "::" が 2 回出現して throw する', () => {
    expect(() => parseCidr('1::2::3')).toThrow();
  });

  it('IPv6: "::" なしでグループ数が 9 で throw する', () => {
    expect(() => parseCidr('1:2:3:4:5:6:7:8:9/64')).toThrow();
  });

  it('IPv6: "::" なしでグループ数が 7 で throw する', () => {
    expect(() => parseCidr('1:2:3:4:5:6:7/64')).toThrow();
  });

  it('IPv6: ":::" (空グループ) で throw する', () => {
    expect(() => parseCidr(':::1/128')).toThrow();
  });
});

// ─── IPv4 正常系 ────────────────────────────────────────────────────────────

describe('parseCidr - IPv4 正常系', () => {
  describe('192.168.1.0/24 の各フィールド', () => {
    const result = parseCidr('192.168.1.0/24');

    it('version = 4', () => expect(result.version).toBe(4));
    it('inputAddress = "192.168.1.0"', () => expect(result.inputAddress).toBe('192.168.1.0'));
    it('prefixLength = 24', () => expect(result.prefixLength).toBe(24));
    it('networkAddress = "192.168.1.0"', () => expect(result.networkAddress).toBe('192.168.1.0'));
    it('broadcastAddress = "192.168.1.255"', () =>
      expect(result.broadcastAddress).toBe('192.168.1.255'));
    it('firstHost = "192.168.1.1"', () => expect(result.firstHost).toBe('192.168.1.1'));
    it('lastHost = "192.168.1.254"', () => expect(result.lastHost).toBe('192.168.1.254'));
    it('totalCount = 256n', () => expect(result.totalCount).toBe(256n));
    it('usableHostCount = 254n', () => expect(result.usableHostCount).toBe(254n));
    it('subnetMask = "255.255.255.0"', () => expect(result.subnetMask).toBe('255.255.255.0'));
    it('wildcardMask = "0.0.0.255"', () => expect(result.wildcardMask).toBe('0.0.0.255'));
    it('binaryNetwork: 先頭 24 ビットがネットワーク', () => {
      expect(result.binaryNetwork).toBe('11000000.10101000.00000001.00000000');
    });
  });

  describe('10.0.0.0/8 の各フィールド', () => {
    const result = parseCidr('10.0.0.0/8');

    it('networkAddress = "10.0.0.0"', () => expect(result.networkAddress).toBe('10.0.0.0'));
    it('broadcastAddress = "10.255.255.255"', () =>
      expect(result.broadcastAddress).toBe('10.255.255.255'));
    it('firstHost = "10.0.0.1"', () => expect(result.firstHost).toBe('10.0.0.1'));
    it('lastHost = "10.255.255.254"', () => expect(result.lastHost).toBe('10.255.255.254'));
    it('totalCount = 2^24 = 16777216n', () => expect(result.totalCount).toBe(16_777_216n));
    it('usableHostCount = 16777214n', () => expect(result.usableHostCount).toBe(16_777_214n));
    it('subnetMask = "255.0.0.0"', () => expect(result.subnetMask).toBe('255.0.0.0'));
    it('wildcardMask = "0.255.255.255"', () => expect(result.wildcardMask).toBe('0.255.255.255'));
  });

  it('ホストビットが立っていてもネットワークアドレスをマスクで算出する', () => {
    const r = parseCidr('192.168.1.100/24');
    expect(r.networkAddress).toBe('192.168.1.0');
    expect(r.broadcastAddress).toBe('192.168.1.255');
  });
});

// ─── IPv4 境界ケース ─────────────────────────────────────────────────────────

describe('parseCidr - IPv4 境界ケース', () => {
  describe('/32 (ホスト単体)', () => {
    const r = parseCidr('10.0.0.1/32');

    it('totalCount = 1n', () => expect(r.totalCount).toBe(1n));
    it('usableHostCount = 1n', () => expect(r.usableHostCount).toBe(1n));
    it('networkAddress = broadcastAddress', () =>
      expect(r.networkAddress).toBe(r.broadcastAddress));
    it('firstHost = lastHost = "10.0.0.1"', () => {
      expect(r.firstHost).toBe('10.0.0.1');
      expect(r.lastHost).toBe('10.0.0.1');
    });
  });

  describe('/31 (RFC 3021 P2P リンク)', () => {
    const r = parseCidr('192.0.2.0/31');

    it('totalCount = 2n', () => expect(r.totalCount).toBe(2n));
    it('usableHostCount = 2n (network/broadcast 控除なし)', () =>
      expect(r.usableHostCount).toBe(2n));
    it('firstHost = "192.0.2.0"', () => expect(r.firstHost).toBe('192.0.2.0'));
    it('lastHost = "192.0.2.1"', () => expect(r.lastHost).toBe('192.0.2.1'));
  });

  describe('/30 (最小の通常サブネット)', () => {
    const r = parseCidr('192.168.0.0/30');

    it('totalCount = 4n', () => expect(r.totalCount).toBe(4n));
    it('usableHostCount = 2n', () => expect(r.usableHostCount).toBe(2n));
    it('firstHost = "192.168.0.1"', () => expect(r.firstHost).toBe('192.168.0.1'));
    it('lastHost = "192.168.0.2"', () => expect(r.lastHost).toBe('192.168.0.2'));
  });

  describe('/0 (全 IPv4 空間)', () => {
    const r = parseCidr('0.0.0.0/0');

    it('totalCount = 2^32', () => expect(r.totalCount).toBe(4_294_967_296n));
    it('networkAddress = "0.0.0.0"', () => expect(r.networkAddress).toBe('0.0.0.0'));
    it('broadcastAddress = "255.255.255.255"', () =>
      expect(r.broadcastAddress).toBe('255.255.255.255'));
    it('usableHostCount = 2^32 - 2', () => expect(r.usableHostCount).toBe(4_294_967_294n));
  });

  it('prefix 省略時は /32 とみなす', () => {
    const r = parseCidr('10.0.0.1');
    expect(r.prefixLength).toBe(32);
    expect(r.totalCount).toBe(1n);
  });
});

// ─── IPv6 正常系 ────────────────────────────────────────────────────────────

describe('parseCidr - IPv6 正常系', () => {
  describe('2001:db8::/32 の各フィールド', () => {
    const r = parseCidr('2001:db8::/32');

    it('version = 6', () => expect(r.version).toBe(6));
    it('networkAddress = "2001:db8::"', () => expect(r.networkAddress).toBe('2001:db8::'));
    it('broadcastAddress = null (IPv6)', () => expect(r.broadcastAddress).toBeNull());
    it('subnetMask = null', () => expect(r.subnetMask).toBeNull());
    it('wildcardMask = null', () => expect(r.wildcardMask).toBeNull());
    it('firstHost = networkAddress', () => expect(r.firstHost).toBe(r.networkAddress));
    it('totalCount = 2^96', () => expect(r.totalCount).toBe(1n << 96n));
    it('usableHostCount = totalCount (控除なし)', () =>
      expect(r.usableHostCount).toBe(r.totalCount));
  });

  describe('::1/128 (ループバック)', () => {
    const r = parseCidr('::1/128');

    it('networkAddress = "::1"', () => expect(r.networkAddress).toBe('::1'));
    it('totalCount = 1n', () => expect(r.totalCount).toBe(1n));
    it('firstHost = lastHost = "::1"', () => {
      expect(r.firstHost).toBe('::1');
      expect(r.lastHost).toBe('::1');
    });
  });

  describe('::/0 (全 IPv6 空間)', () => {
    const r = parseCidr('::/0');

    it('totalCount = 2^128', () => expect(r.totalCount).toBe(1n << 128n));
    it('networkAddress = "::"', () => expect(r.networkAddress).toBe('::'));
  });

  it('prefix 省略時は /128 とみなす', () => {
    const r = parseCidr('::1');
    expect(r.prefixLength).toBe(128);
    expect(r.totalCount).toBe(1n);
  });
});

// ─── IPv6 formatIpv6 圧縮の往復テスト ─────────────────────────────────────

describe('IPv6 formatIpv6 - RFC 5952 圧縮の往復確認', () => {
  it('2001:0db8:0000:0000:0000:0000:0000:0001 → "2001:db8::1"', () => {
    const r = parseCidr('2001:0db8:0000:0000:0000:0000:0000:0001/128');
    expect(r.networkAddress).toBe('2001:db8::1');
  });

  it('fe80:0000:0000:0000:0202:b3ff:fe1e:8329 → "fe80::202:b3ff:fe1e:8329"', () => {
    const r = parseCidr('fe80:0000:0000:0000:0202:b3ff:fe1e:8329/64');
    expect(r.networkAddress).toBe('fe80::');
  });

  it(':: (全ゼロ) → "::"', () => {
    const r = parseCidr('::/128');
    expect(r.networkAddress).toBe('::');
  });

  it('::ffff:192.168.1.1 (IPv4 mapped) をパースできる', () => {
    const r = parseCidr('::ffff:192.168.1.1/128');
    expect(r.version).toBe(6);
    // アドレスに ffff が含まれ、最後の 32bit は IPv4 のビット列
    expect(r.totalCount).toBe(1n);
  });

  it('2001:db8:: の :: は末尾の連続ゼロを圧縮したもの', () => {
    // 2001:0db8 の後ろ 6 グループが全ゼロ → 最長圧縮
    const r = parseCidr('2001:db8:0:0:0:0:0:0/32');
    expect(r.networkAddress).toBe('2001:db8::');
  });
});

// ─── binaryNetwork フォーマット固定値確認 ───────────────────────────────────

describe('parseCidr - binaryNetwork フォーマット', () => {
  it('IPv4 /24: オクテット区切り 32 ビット文字列', () => {
    const r = parseCidr('192.168.1.0/24');
    expect(r.binaryNetwork).toBe('11000000.10101000.00000001.00000000');
  });

  it('IPv4 /0: 全ゼロビット', () => {
    const r = parseCidr('0.0.0.0/0');
    expect(r.binaryNetwork).toBe('00000000.00000000.00000000.00000000');
  });

  it('IPv6 /32: prefix 部分のビット + ".../32" 形式', () => {
    const r = parseCidr('2001:db8::/32');
    expect(r.binaryNetwork).toMatch(/^[01]{32}\.\.\.\/32$/);
  });

  it('IPv6 /128: 全ビット + ".../128" 形式', () => {
    const r = parseCidr('::1/128');
    expect(r.binaryNetwork).toMatch(/^[01]{128}\.\.\.\/128$/);
  });
});
