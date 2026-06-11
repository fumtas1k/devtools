/**
 * Worker オフロード判断ベンチ用のフィクスチャ生成ヘルパー（offload.bench.ts から import）。
 */

/**
 * 幅広配列: N 要素オブジェクト配列（mask の EMAIL/IP/PHONE_JP を含む）
 * mask 計測用フィクスチャも兼ねる。
 */
export function makeWideArray(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    email: `user${i}@example.com`,
    ip: `192.168.${(i >> 8) & 255}.${i & 255}`,
    phone: `090-${String(i % 10000).padStart(4, '0')}-1234`,
    tags: ['alpha', 'beta', i % 3 === 0 ? 'gamma' : 'delta'],
    meta: { even: i % 2 === 0, score: i * 1.5 },
    secret_token: `tok_${i.toString(36)}`, // SECRET キー
  }));
}

/**
 * 深いネスト: 深さ D の入れ子オブジェクト（buildTree / generateTypeScript を圧迫）
 */
export function makeDeepNest(depth: number): unknown {
  let obj: unknown = { value: 'leaf' };
  for (let i = depth - 1; i >= 0; i--) {
    obj = { level: i, child: obj };
  }
  return obj;
}

/**
 * 文字列過多: mask パターン（EMAIL / JWT / IP / PHONE_JP）を大量に含む配列
 */
export function makeMaskHeavy(n: number): unknown[] {
  // 本物に近いがダミーの JWT ヘッダ
  const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXyR7aX0iLCJpYXQiOjE2MDAwMDAwMDB9.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    contact: `user${i}@corp.example.jp`,
    server_ip: `10.0.${(i >> 8) & 255}.${i & 255}`,
    session_token: fakeJwt,
    phone: `03-${String(i % 10000).padStart(4, '0')}-5678`,
    note: `送信元 192.168.1.${i % 256} / user${i % 100}@test.example.com`,
  }));
}

/**
 * クエリ対象: jmespath が広く走査する構造（users 配列 + ネスト orders）
 */
export function makeQueryTarget(n: number): unknown {
  return {
    users: Array.from({ length: n }, (_, i) => ({
      id: i,
      name: `user${i}`,
      active: i % 2 === 0,
      profile: { age: 20 + (i % 50), city: `city_${i % 20}` },
      orders: Array.from({ length: 3 }, (_, j) => ({
        orderId: `ord_${i}_${j}`,
        total: (i + j) * 99.9,
        items: [`item_a`, `item_b`],
      })),
    })),
    meta: { total: n, page: 1 },
  };
}
