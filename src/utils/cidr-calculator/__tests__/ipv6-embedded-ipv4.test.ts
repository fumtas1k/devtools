import { describe, expect, it } from 'vitest';
import { parseCidr } from '@/utils/cidr-calculator';
import { parseIpv6 } from '@/utils/cidr-calculator/ipv6';

describe('IPv4 埋め込み IPv6', () => {
  it('省略なしの IPv4 末尾を 128 ビット値として解釈する（回帰の陽性対照）', () => {
    const address = parseIpv6('2001:db8:0:0:0:0:192.168.1.1');
    expect(address).toBe(0x20010db80000000000000000c0a80101n);
    expect(address).toBe(parseIpv6('2001:db8::c0a8:101'));
    expect(address).not.toBe(parseIpv6('::ffff:192.168.1.1'));
    expect(parseCidr('2001:db8:0:0:0:0:192.168.1.1/128').networkAddress).toBe('2001:db8::c0a8:101');
  });

  it('圧縮ありと通常の IPv6 も正しく解釈する', () => {
    expect(parseIpv6('2001:db8::192.168.1.1')).toBe(0x20010db80000000000000000c0a80101n);
    expect(parseIpv6('::ffff:192.168.1.1')).toBe(0xffffc0a80101n);
    expect(parseIpv6('2001:db8:0:0:0:0:c0a8:101')).toBe(0x20010db80000000000000000c0a80101n);
  });
});

describe('IPv4 埋め込み IPv6 の不正入力（バリデーションの陽性対照）', () => {
  it.each([
    '2001:db8:0:0:0:192.168.1.1',
    '2001:db8:0:0:0:0:0:192.168.1.1',
    '2001:db8:0:0:0:0:256.168.1.1',
    '2001:db8:0:0:0:0:192.168.1',
    '2001:db8:0:0:0:0:192.168.01.1',
    '2001:db8:0:0:192.168.1.1:0:0',
    '2001:db8:0:0:0:0:192.168.1.1::',
    '2001:db8:0:0:0:0::192.168.1.1',
  ])('%s を拒否する', (input) => {
    expect(() => parseIpv6(input)).toThrow();
  });
});
