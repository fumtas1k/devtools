import { describe, it, expect } from 'vitest';
import { splitSubnet } from '@/utils/cidr-calculator';

// ─── 正常系 ──────────────────────────────────────────────────────────────────

describe('splitSubnet - IPv4 正常系', () => {
  describe('192.168.1.0/24 を /26 に分割（4 件）', () => {
    const subnets = splitSubnet('192.168.1.0/24', 26);

    it('4 件返す', () => expect(subnets).toHaveLength(4));

    it('0番目 networkAddress = 192.168.1.0', () =>
      expect(subnets[0].networkAddress).toBe('192.168.1.0'));
    it('0番目 broadcastAddress = 192.168.1.63', () =>
      expect(subnets[0].broadcastAddress).toBe('192.168.1.63'));
    it('0番目 prefixLength = 26', () => expect(subnets[0].prefixLength).toBe(26));

    it('1番目 networkAddress = 192.168.1.64', () =>
      expect(subnets[1].networkAddress).toBe('192.168.1.64'));
    it('1番目 broadcastAddress = 192.168.1.127', () =>
      expect(subnets[1].broadcastAddress).toBe('192.168.1.127'));

    it('2番目 networkAddress = 192.168.1.128', () =>
      expect(subnets[2].networkAddress).toBe('192.168.1.128'));
    it('2番目 broadcastAddress = 192.168.1.191', () =>
      expect(subnets[2].broadcastAddress).toBe('192.168.1.191'));

    it('3番目 networkAddress = 192.168.1.192', () =>
      expect(subnets[3].networkAddress).toBe('192.168.1.192'));
    it('3番目 broadcastAddress = 192.168.1.255', () =>
      expect(subnets[3].broadcastAddress).toBe('192.168.1.255'));
  });

  describe('192.168.1.0/24 を /25 に分割（2 件）', () => {
    const subnets = splitSubnet('192.168.1.0/24', 25);

    it('2 件返す', () => expect(subnets).toHaveLength(2));
    it('0番目 networkAddress = 192.168.1.0', () =>
      expect(subnets[0].networkAddress).toBe('192.168.1.0'));
    it('1番目 networkAddress = 192.168.1.128', () =>
      expect(subnets[1].networkAddress).toBe('192.168.1.128'));
  });

  it('ホストビットが立っている入力でも networkAddress 起点で分割する', () => {
    // 192.168.1.100/24 → networkAddress は 192.168.1.0
    const subnets = splitSubnet('192.168.1.100/24', 26);
    expect(subnets).toHaveLength(4);
    expect(subnets[0].networkAddress).toBe('192.168.1.0');
  });
});

describe('splitSubnet - IPv6 正常系', () => {
  describe('2001:db8::/32 を /34 に分割（4 件）', () => {
    const subnets = splitSubnet('2001:db8::/32', 34);

    it('4 件返す', () => expect(subnets).toHaveLength(4));

    it('各サブネットの prefixLength = 34', () => {
      for (const s of subnets) {
        expect(s.prefixLength).toBe(34);
      }
    });

    it('0番目 networkAddress = 2001:db8::', () =>
      expect(subnets[0].networkAddress).toBe('2001:db8::'));
    it('1番目 networkAddress = 2001:db8:4000::', () =>
      expect(subnets[1].networkAddress).toBe('2001:db8:4000::'));
    it('2番目 networkAddress = 2001:db8:8000::', () =>
      expect(subnets[2].networkAddress).toBe('2001:db8:8000::'));
    it('3番目 networkAddress = 2001:db8:c000::', () =>
      expect(subnets[3].networkAddress).toBe('2001:db8:c000::'));

    it('IPv6 は broadcastAddress = null', () => {
      for (const s of subnets) {
        expect(s.broadcastAddress).toBeNull();
      }
    });
  });
});

// ─── 陽性対照: ガード・バリデータが確実に違反を throw することを確認 ──────────

describe('splitSubnet - ガードの陽性対照（意図的な違反で throw を確認）', () => {
  it('newPrefix <= base.prefixLength (等値) で throw する', () => {
    expect(() => splitSubnet('192.168.1.0/24', 24)).toThrow(
      '分割先 prefix は元の prefix より大きくする必要があります'
    );
  });

  it('newPrefix < base.prefixLength (小さい) で throw する', () => {
    expect(() => splitSubnet('192.168.1.0/24', 16)).toThrow(
      '分割先 prefix は元の prefix より大きくする必要があります'
    );
  });

  it('IPv4 で newPrefix > 32（範囲外）で throw する', () => {
    expect(() => splitSubnet('192.168.1.0/24', 33)).toThrow();
  });

  it('IPv6 で newPrefix > 128（範囲外）で throw する', () => {
    expect(() => splitSubnet('2001:db8::/32', 129)).toThrow();
  });

  it('上限 1024 超（/8 を /24 に分割 = 65536 件）で throw する', () => {
    expect(() => splitSubnet('10.0.0.0/8', 24)).toThrow('分割数が多すぎます');
  });

  it('非整数（1.5）の newPrefix で throw する', () => {
    expect(() => splitSubnet('192.168.1.0/24', 1.5)).toThrow(
      '分割先 prefix は整数で指定してください'
    );
  });

  it('不正な CIDR 入力は parseCidr のエラーを伝播する', () => {
    expect(() => splitSubnet('not-a-cidr', 26)).toThrow();
  });
});
