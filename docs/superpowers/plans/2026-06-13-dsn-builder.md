# DSN/接続文字列ビルダ（dsn-builder）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接続文字列（DSN）をフォーム ⇄ URI でリアルタイム双方向編集し、パスワードをマスクした共有用 URI を出力するツール `dsn-builder` を追加する。

**Architecture:** `src/utils/dsn-builder/` に純粋ロジック（自前パーサ・シリアライザ・バリデータ）を置き、`src/components/tools/DsnBuilder.tsx` が「最後に編集された側を入力源とする」双方向同期を行う。`URL` API は mongodb のカンマ区切り複数ホストを解釈できないため使わない。

**Tech Stack:** React + TypeScript + Astro（既存構成）。**新規ライブラリなし**（純粋な文字列処理のみ）。

**Spec:** `docs/superpowers/specs/2026-06-13-dsn-builder-design.md`

**遵守事項（リポジトリ規約）:**

- コミットメッセージは日本語 Conventional Commits（`feat:` / `docs:` / `test:`）
- `git add` は明示 pathspec のみ（`-A` / `.` 禁止）
- Tailwind の primitive カラークラス禁止。既存 UI コンポーネント（`InputField` / `BareInput` / `Select` / `Section` / `OutputField` / `ActionButton` / `ErrorMessage`）を使う
- コード編集直後に `node_modules/.bin/astro check` を実行
- バリデータを含むため **陽性対照テスト必須**（test-gates ルール: 不正入力が確実にエラーになることを陰性対照と別テストで assert）
- `aria-*` 属性を削除しない。`className` / `htmlFor` を使う

---

### Task 1: 型定義と方言辞書

**Files:**

- Create: `src/utils/dsn-builder/types.ts`
- Create: `src/utils/dsn-builder/dialects.ts`

- [ ] **Step 1: `types.ts` を作成**

```ts
/** 対応スキーム（TLS / SRV 亜種を含む） */
export type DsnScheme =
  | 'postgresql'
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'mongodb+srv'
  | 'redis'
  | 'rediss'
  | 'amqp'
  | 'amqps';

/** ホスト 1 件分。port は編集途中を表現できるよう文字列で保持（'' = 未指定） */
export interface DsnHost {
  host: string;
  port: string;
}

/** クエリパラメータ 1 件分（重複キーを許容するため Record ではなく配列要素） */
export interface DsnParam {
  key: string;
  value: string;
}

/** 接続文字列の正準モデル。各フィールドは percent-decode 済みの生値を保持する */
export interface DsnModel {
  scheme: DsnScheme;
  user: string;
  password: string;
  hosts: DsnHost[];
  /** パス部（PostgreSQL/MySQL/MongoDB: DB 名、Redis: DB 番号、AMQP: vhost） */
  database: string;
  params: DsnParam[];
}

export type ParseResult = { ok: true; model: DsnModel } | { ok: false; error: string };
```

- [ ] **Step 2: `dialects.ts` を作成**

サンプル DSN の percent-encode 文字は `encodeURIComponent` で安定して往復する文字（`%40` `%2F` 等）のみ使う（`!` `'` `(` `)` `*` は encodeURIComponent が素通しするため往復で表記が変わる。サンプル・テストに含めない）。

```ts
import type { DsnScheme } from './types';

export interface Dialect {
  /** 表示名 */
  label: string;
  /** 既定ポート（mongodb+srv はポート指定禁止のため null）。ポート欄の placeholder に使う */
  defaultPort: number | null;
  /** カンマ区切りの複数ホストを許可するか */
  multiHost: boolean;
  /** パス部の意味（フォームのラベルに表示） */
  pathLabel: string;
  /** パス部が整数（Redis の DB 番号）か */
  pathIsInteger: boolean;
  /** SRV レコード方式（ポート指定禁止・ホスト 1 件のみ） */
  srv: boolean;
  /** サンプル DSN（「サンプルを入力」ボタンで挿入） */
  sample: string;
}

/** スキーム Select の表示順 */
export const SUPPORTED_SCHEMES: DsnScheme[] = [
  'postgresql',
  'postgres',
  'mysql',
  'mongodb',
  'mongodb+srv',
  'redis',
  'rediss',
  'amqp',
  'amqps',
];

export const DIALECTS: Record<DsnScheme, Dialect> = {
  postgresql: {
    label: 'PostgreSQL',
    defaultPort: 5432,
    multiHost: true,
    pathLabel: 'データベース名',
    pathIsInteger: false,
    srv: false,
    sample:
      'postgresql://app_user:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require&connect_timeout=10',
  },
  postgres: {
    label: 'PostgreSQL (postgres://)',
    defaultPort: 5432,
    multiHost: true,
    pathLabel: 'データベース名',
    pathIsInteger: false,
    srv: false,
    sample: 'postgres://app_user:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require',
  },
  mysql: {
    label: 'MySQL',
    defaultPort: 3306,
    multiHost: false,
    pathLabel: 'データベース名',
    pathIsInteger: false,
    srv: false,
    sample: 'mysql://app_user:p%40ssw0rd@db.example.com:3306/app_db?charset=utf8mb4',
  },
  mongodb: {
    label: 'MongoDB',
    defaultPort: 27017,
    multiHost: true,
    pathLabel: 'データベース名',
    pathIsInteger: false,
    srv: false,
    sample:
      'mongodb://admin:s3cret@mongo1.example.com:27017,mongo2.example.com:27018/app_db?replicaSet=rs0&authSource=admin',
  },
  'mongodb+srv': {
    label: 'MongoDB (SRV)',
    defaultPort: null,
    multiHost: false,
    pathLabel: 'データベース名',
    pathIsInteger: false,
    srv: true,
    sample:
      'mongodb+srv://admin:s3cret@cluster0.abcde.mongodb.net/app_db?retryWrites=true&w=majority',
  },
  redis: {
    label: 'Redis',
    defaultPort: 6379,
    multiHost: false,
    pathLabel: 'DB 番号',
    pathIsInteger: true,
    srv: false,
    sample: 'redis://default:s3cret@cache.example.com:6379/0',
  },
  rediss: {
    label: 'Redis (TLS)',
    defaultPort: 6379,
    multiHost: false,
    pathLabel: 'DB 番号',
    pathIsInteger: true,
    srv: false,
    sample: 'rediss://default:s3cret@cache.example.com:6379/0',
  },
  amqp: {
    label: 'AMQP (RabbitMQ)',
    defaultPort: 5672,
    multiHost: false,
    pathLabel: 'vhost',
    pathIsInteger: false,
    srv: false,
    sample: 'amqp://guest:guest@mq.example.com:5672/%2Fproduction?heartbeat=30',
  },
  amqps: {
    label: 'AMQP (TLS)',
    defaultPort: 5671,
    multiHost: false,
    pathLabel: 'vhost',
    pathIsInteger: false,
    srv: false,
    sample: 'amqps://guest:guest@mq.example.com:5671/%2Fproduction?heartbeat=30',
  },
};
```

- [ ] **Step 3: 型チェックとコミット**

Run: `node_modules/.bin/astro check`
Expected: エラー 0（既存分の警告は対象外）

```bash
git add src/utils/dsn-builder/types.ts src/utils/dsn-builder/dialects.ts
git commit -m "feat: dsn-builder の型定義とスキーム方言辞書を追加"
```

---

### Task 2: パーサ・バリデータ・シリアライザ（TDD）

**Files:**

- Test: `src/utils/__tests__/dsn-builder.test.ts`
- Create: `src/utils/dsn-builder/validate.ts`
- Create: `src/utils/dsn-builder/parse.ts`
- Create: `src/utils/dsn-builder/serialize.ts`
- Create: `src/utils/dsn-builder/index.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/__tests__/dsn-builder.test.ts` を以下の内容で作成する。陽性対照（不正入力がエラーになる）は陰性対照と別の `describe` に分離する（test-gates ルール）。

```ts
import { describe, expect, it } from 'vitest';
import { DIALECTS, SUPPORTED_SCHEMES } from '@/utils/dsn-builder/dialects';
import { parseDsn } from '@/utils/dsn-builder/parse';
import { maskDsn, serializeDsn } from '@/utils/dsn-builder/serialize';
import { validateModel } from '@/utils/dsn-builder/validate';
import type { DsnModel } from '@/utils/dsn-builder/types';

/** parse 成功を前提にモデルを取り出すヘルパ */
function mustParse(uri: string): DsnModel {
  const result = parseDsn(uri);
  if (!result.ok) throw new Error(`parse に失敗: ${result.error}`);
  return result.model;
}

describe('parseDsn: 正常系（陰性対照）', () => {
  it('PostgreSQL の基本形を分解する', () => {
    const model = mustParse(
      'postgresql://app_user:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require'
    );
    expect(model.scheme).toBe('postgresql');
    expect(model.user).toBe('app_user');
    expect(model.password).toBe('p@ss/w0rd'); // percent-decode 済み
    expect(model.hosts).toEqual([{ host: 'db.example.com', port: '5432' }]);
    expect(model.database).toBe('app_db');
    expect(model.params).toEqual([{ key: 'sslmode', value: 'require' }]);
  });

  it('mongodb のカンマ区切り複数ホストを分解する', () => {
    const model = mustParse(
      'mongodb://admin:s3cret@mongo1.example.com:27017,mongo2.example.com:27018/app_db?replicaSet=rs0'
    );
    expect(model.hosts).toEqual([
      { host: 'mongo1.example.com', port: '27017' },
      { host: 'mongo2.example.com', port: '27018' },
    ]);
  });

  it('amqp の vhost（%2F）を decode する', () => {
    const model = mustParse('amqp://guest:guest@mq.example.com:5672/%2Fproduction');
    expect(model.database).toBe('/production');
  });

  it('redis の DB 番号パスを受理する', () => {
    const model = mustParse('redis://default:s3cret@cache.example.com:6379/0');
    expect(model.database).toBe('0');
  });

  it('IPv6 ブラケットホストを分解する', () => {
    const model = mustParse('redis://[::1]:6379/0');
    expect(model.hosts).toEqual([{ host: '::1', port: '6379' }]);
  });

  it('userinfo・ポート・パス・クエリ省略形を受理する', () => {
    const model = mustParse('redis://localhost');
    expect(model.user).toBe('');
    expect(model.password).toBe('');
    expect(model.hosts).toEqual([{ host: 'localhost', port: '' }]);
    expect(model.database).toBe('');
    expect(model.params).toEqual([]);
  });

  it('全方言のサンプル DSN がパースできる', () => {
    for (const scheme of SUPPORTED_SCHEMES) {
      const result = parseDsn(DIALECTS[scheme].sample);
      expect(result.ok, `${scheme} の sample がパース失敗`).toBe(true);
    }
  });
});

describe('parseDsn: 陽性対照（不正入力を必ずエラーにする）', () => {
  it('未対応スキームを拒否しエラーに対応一覧を含める', () => {
    const result = parseDsn('oracle://user:pass@host:1521/SID');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('未対応のスキーム');
  });

  it('スキーム区切りがない入力を拒否する', () => {
    const result = parseDsn('ただのテキスト');
    expect(result.ok).toBe(false);
  });

  it('mongodb+srv のポート指定を拒否する', () => {
    const result = parseDsn('mongodb+srv://u:p@cluster0.example.net:27017/db');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ポート');
  });

  it('mongodb+srv の複数ホストを拒否する', () => {
    const result = parseDsn('mongodb+srv://u:p@a.example.net,b.example.net/db');
    expect(result.ok).toBe(false);
  });

  it('複数ホスト非対応スキーム（mysql）のカンマ区切りを拒否する', () => {
    const result = parseDsn('mysql://u:p@a.example.com,b.example.com/db');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('複数ホスト');
  });

  it('範囲外ポートを拒否する', () => {
    const result = parseDsn('postgresql://u:p@host:99999/db');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ポート');
  });

  it('非数値ポートを拒否する', () => {
    expect(parseDsn('postgresql://u:p@host:abc/db').ok).toBe(false);
  });

  it('redis の非整数 DB 番号を拒否する', () => {
    const result = parseDsn('redis://localhost:6379/mydb');
    expect(result.ok).toBe(false);
  });

  it('不正な percent-encoding を拒否する', () => {
    expect(parseDsn('postgresql://u:p%ZZ@host/db').ok).toBe(false);
  });

  it('カンマ前後の空ホストを拒否する', () => {
    expect(parseDsn('mongodb://a.example.com,,b.example.com/db').ok).toBe(false);
  });
});

describe('serializeDsn / ラウンドトリップ', () => {
  it('記号入りパスワードを percent-encode して往復が一致する', () => {
    const uri =
      'postgresql://app_user:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require&connect_timeout=10';
    expect(serializeDsn(mustParse(uri))).toBe(uri);
  });

  it('全方言のサンプル DSN が文字列レベルで往復一致する', () => {
    for (const scheme of SUPPORTED_SCHEMES) {
      const sample = DIALECTS[scheme].sample;
      expect(serializeDsn(mustParse(sample)), `${scheme} の往復不一致`).toBe(sample);
    }
  });

  it('IPv6 ホストをブラケット付きで再構成する', () => {
    const uri = 'redis://[::1]:6379/0';
    expect(serializeDsn(mustParse(uri))).toBe(uri);
  });

  it('パラメータの順序を保持する', () => {
    const uri = 'mongodb://h.example.com/db?b=2&a=1';
    expect(serializeDsn(mustParse(uri))).toBe(uri);
  });
});

describe('maskDsn', () => {
  it('パスワードを **** に置換する', () => {
    const model = mustParse('postgresql://app:s3cret@db.example.com:5432/app_db');
    expect(maskDsn(model)).toBe('postgresql://app:****@db.example.com:5432/app_db');
  });

  it('パスワードが無ければそのまま', () => {
    const model = mustParse('redis://localhost:6379/0');
    expect(maskDsn(model)).toBe('redis://localhost:6379/0');
  });
});

describe('validateModel: 陽性対照（フォーム編集起因の不整合）', () => {
  const base: DsnModel = {
    scheme: 'postgresql',
    user: '',
    password: '',
    hosts: [{ host: 'localhost', port: '' }],
    database: '',
    params: [],
  };

  it('mongodb+srv でポート入力をエラーにする', () => {
    expect(
      validateModel({
        ...base,
        scheme: 'mongodb+srv',
        hosts: [{ host: 'c.example.net', port: '27017' }],
      })
    ).not.toBeNull();
  });

  it('複数ホスト中の空ホスト行をエラーにする', () => {
    expect(
      validateModel({
        ...base,
        scheme: 'mongodb',
        hosts: [
          { host: 'a.example.com', port: '' },
          { host: '', port: '' },
        ],
      })
    ).not.toBeNull();
  });

  it('正常モデルは null（陰性対照）', () => {
    expect(validateModel(base)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test -- dsn-builder`
Expected: FAIL（`parse.ts` 等が存在しないため import エラー）

- [ ] **Step 3: `validate.ts` を実装**

```ts
import { DIALECTS } from './dialects';
import type { DsnModel } from './types';

/**
 * モデル単位のバリデーション。問題なければ null、あれば日本語メッセージを返す。
 * パース結果とフォーム編集結果の両方に適用される単一の検証点。
 * 注: ホスト 1 件のみで空欄は「未入力（編集途中）」として許容する。
 */
export function validateModel(model: DsnModel): string | null {
  const dialect = DIALECTS[model.scheme];

  if (model.hosts.length > 1 && !dialect.multiHost) {
    return `${model.scheme} は複数ホストに対応していません`;
  }
  if (model.hosts.length > 1 && model.hosts.some((h) => h.host === '')) {
    return 'ホストが空の行があります';
  }
  if (dialect.srv && model.hosts.some((h) => h.port !== '')) {
    return `${model.scheme} ではポートを指定できません（SRV レコードで解決されます）`;
  }
  for (const { port } of model.hosts) {
    if (port === '') continue;
    if (!/^\d+$/.test(port) || Number(port) > 65535) {
      return `ポートは 0〜65535 の整数で指定してください: ${port}`;
    }
  }
  if (dialect.pathIsInteger && model.database !== '' && !/^\d+$/.test(model.database)) {
    return `${dialect.pathLabel}は整数で指定してください: ${model.database}`;
  }
  return null;
}
```

- [ ] **Step 4: `parse.ts` を実装**

```ts
import { DIALECTS, SUPPORTED_SCHEMES } from './dialects';
import { validateModel } from './validate';
import type { DsnHost, DsnModel, DsnParam, DsnScheme, ParseResult } from './types';

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** decodeURIComponent の安全版（不正な percent-encoding は null を返す） */
function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** `host[:port]`（IPv6 は `[...]` ブラケット）を分解する。形式不正は null */
function splitHostPort(raw: string): { host: string; port: string } | null {
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end < 0) return null;
    const host = raw.slice(1, end);
    const rest = raw.slice(end + 1);
    if (rest === '') return { host, port: '' };
    if (!rest.startsWith(':')) return null;
    return { host, port: rest.slice(1) };
  }
  const colon = raw.indexOf(':');
  if (colon < 0) return { host: raw, port: '' };
  return { host: raw.slice(0, colon), port: raw.slice(colon + 1) };
}

/**
 * 接続文字列を DsnModel に分解する。
 * `URL` API は mongodb のカンマ区切り複数ホストを解釈できないため自前で分解する。
 * 構文: `scheme://[userinfo@]authority[/path][?query]`
 */
export function parseDsn(input: string): ParseResult {
  const uri = input.trim();

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(uri);
  if (!schemeMatch) {
    return fail('「スキーム://」で始まる接続文字列を入力してください');
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (!(scheme in DIALECTS)) {
    return fail(`未対応のスキームです: ${scheme}（対応: ${SUPPORTED_SCHEMES.join(' / ')}）`);
  }

  const rest = uri.slice(schemeMatch[0].length);
  const qIdx = rest.indexOf('?');
  const queryStr = qIdx >= 0 ? rest.slice(qIdx + 1) : '';
  const beforeQuery = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  const slashIdx = beforeQuery.indexOf('/');
  const authorityRaw = slashIdx >= 0 ? beforeQuery.slice(0, slashIdx) : beforeQuery;
  const pathRaw = slashIdx >= 0 ? beforeQuery.slice(slashIdx + 1) : '';

  // userinfo（パスワード中の raw `@` は RFC 3986 で禁止のため lastIndexOf で安全に分割できる）
  const atIdx = authorityRaw.lastIndexOf('@');
  const userinfoRaw = atIdx >= 0 ? authorityRaw.slice(0, atIdx) : '';
  const hostsRaw = atIdx >= 0 ? authorityRaw.slice(atIdx + 1) : authorityRaw;

  let user = '';
  let password = '';
  if (userinfoRaw !== '') {
    const colon = userinfoRaw.indexOf(':');
    const userRaw = colon >= 0 ? userinfoRaw.slice(0, colon) : userinfoRaw;
    const passRaw = colon >= 0 ? userinfoRaw.slice(colon + 1) : '';
    const decodedUser = safeDecode(userRaw);
    const decodedPass = safeDecode(passRaw);
    if (decodedUser === null || decodedPass === null) {
      return fail('ユーザー情報の percent-encoding が不正です');
    }
    user = decodedUser;
    password = decodedPass;
  }

  // hosts（authority 全体が空のときは「未入力」として空ホスト 1 件にする）
  let hosts: DsnHost[];
  if (hostsRaw === '') {
    hosts = [{ host: '', port: '' }];
  } else {
    hosts = [];
    for (const part of hostsRaw.split(',')) {
      if (part === '') return fail('ホストの区切り（,）の前後が空です');
      const hp = splitHostPort(part);
      if (hp === null) return fail(`ホストの形式が不正です: ${part}`);
      const host = safeDecode(hp.host);
      if (host === null) return fail('ホストの percent-encoding が不正です');
      hosts.push({ host, port: hp.port });
    }
  }

  const database = safeDecode(pathRaw);
  if (database === null) return fail('パス部の percent-encoding が不正です');

  const params: DsnParam[] = [];
  if (queryStr !== '') {
    for (const pair of queryStr.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      const key = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
      const value = safeDecode(eq >= 0 ? pair.slice(eq + 1) : '');
      if (key === null || value === null) {
        return fail('クエリパラメータの percent-encoding が不正です');
      }
      params.push({ key, value });
    }
  }

  const model: DsnModel = { scheme: scheme as DsnScheme, user, password, hosts, database, params };
  const validationError = validateModel(model);
  if (validationError !== null) return fail(validationError);
  return { ok: true, model };
}
```

- [ ] **Step 5: `serialize.ts` を実装**

```ts
import type { DsnModel } from './types';

/**
 * userinfo / パス / クエリ用の percent-encode。
 * encodeURIComponent は区切り記号（: @ / ? # & = ,）をすべてエンコードするため DSN 構成要素として安全。
 */
function enc(raw: string): string {
  return encodeURIComponent(raw);
}

/** IPv6 アドレス（コロン含有ホスト）はブラケットで囲む */
function formatHost(host: string, port: string): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return port === '' ? h : `${h}:${port}`;
}

interface SerializeOptions {
  /** パスワードを **** に置換する（共有用マスク） */
  maskPassword?: boolean;
}

/** DsnModel から接続文字列を再構成する（percent-encode を内包） */
export function serializeDsn(model: DsnModel, options: SerializeOptions = {}): string {
  const { scheme, user, password, hosts, database, params } = model;

  let userinfo = '';
  if (user !== '' || password !== '') {
    userinfo = enc(user);
    if (password !== '') {
      userinfo += ':' + (options.maskPassword ? '****' : enc(password));
    }
    userinfo += '@';
  }

  const authority = hosts.map((h) => formatHost(h.host, h.port)).join(',');
  const path = database === '' ? '' : '/' + enc(database);
  const query =
    params.length === 0 ? '' : '?' + params.map((p) => `${enc(p.key)}=${enc(p.value)}`).join('&');

  return `${scheme}://${userinfo}${authority}${path}${query}`;
}

/** パスワードを **** に置換した共有用 URI を返す */
export function maskDsn(model: DsnModel): string {
  return serializeDsn(model, { maskPassword: true });
}
```

- [ ] **Step 6: `index.ts` を実装**

```ts
export { DIALECTS, SUPPORTED_SCHEMES } from './dialects';
export type { Dialect } from './dialects';
export { parseDsn } from './parse';
export { maskDsn, serializeDsn } from './serialize';
export { validateModel } from './validate';
export type { DsnHost, DsnModel, DsnParam, DsnScheme, ParseResult } from './types';
```

- [ ] **Step 7: テストが通ることを確認**

Run: `npm run test -- dsn-builder`
Expected: PASS（全テスト green）

Run: `node_modules/.bin/astro check`
Expected: エラー 0

- [ ] **Step 8: コミット**

```bash
git add src/utils/dsn-builder/validate.ts src/utils/dsn-builder/parse.ts src/utils/dsn-builder/serialize.ts src/utils/dsn-builder/index.ts src/utils/__tests__/dsn-builder.test.ts
git commit -m "feat: DSN パーサ・シリアライザ・バリデータを追加（陽性対照テスト同梱）"
```

---

### Task 3: UI コンポーネント・ページ・ツール登録

**Files:**

- Create: `src/components/tools/DsnBuilder.tsx`
- Create: `src/pages/tools/dsn-builder.astro`
- Modify: `src/data/tools.ts`（`toolEntries` 配列末尾にエントリ追加）
- Modify: `tests/e2e/visual-regression-pages.ts`（`PAGES` 配列に追加）

- [ ] **Step 1: `DsnBuilder.tsx` を作成**

双方向同期の設計: URI 欄編集 → `parseDsn` 成功でフォーム反映・失敗でエラー表示（フォームは直前の有効状態を維持）。フォーム編集 → `validateModel` が null なら `serializeDsn` で URI 欄を上書き。エラーは単一 state とし URI 欄直下に表示する。

```tsx
import { useMemo, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { BareInput } from '@/components/ui/BareInput';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import {
  DIALECTS,
  SUPPORTED_SCHEMES,
  maskDsn,
  parseDsn,
  serializeDsn,
  validateModel,
} from '@/utils/dsn-builder';
import type { DsnModel, DsnScheme } from '@/utils/dsn-builder';

const EMPTY_MODEL: DsnModel = {
  scheme: 'postgresql',
  user: '',
  password: '',
  hosts: [{ host: '', port: '' }],
  database: '',
  params: [],
};

/** 全フィールド未入力（初期状態相当）か。URI 欄を空にする判定に使う */
function isEmptyModel(model: DsnModel): boolean {
  return (
    model.user === '' &&
    model.password === '' &&
    model.database === '' &&
    model.params.length === 0 &&
    model.hosts.length === 1 &&
    model.hosts[0].host === '' &&
    model.hosts[0].port === ''
  );
}

const SCHEME_OPTIONS = SUPPORTED_SCHEMES.map((s) => ({
  value: s,
  label: `${s}:// — ${DIALECTS[s].label}`,
}));

export function DsnBuilderTool() {
  const [uriText, setUriText] = useState('');
  const [model, setModel] = useState<DsnModel>(EMPTY_MODEL);
  const [error, setError] = useState<string | null>(null);

  const dialect = DIALECTS[model.scheme];
  const masked = useMemo(
    () => (error === null && !isEmptyModel(model) ? maskDsn(model) : ''),
    [model, error]
  );

  // URI 欄 → フォーム
  const handleUriChange = (text: string) => {
    setUriText(text);
    if (text.trim() === '') {
      setModel(EMPTY_MODEL);
      setError(null);
      return;
    }
    const result = parseDsn(text);
    if (result.ok) {
      setModel(result.model);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  // フォーム → URI 欄
  const applyModel = (next: DsnModel) => {
    setModel(next);
    const validationError = validateModel(next);
    setError(validationError);
    if (validationError === null) {
      setUriText(isEmptyModel(next) ? '' : serializeDsn(next));
    }
  };

  const handleSampleClick = () => {
    handleUriChange(dialect.sample);
  };

  const updateHost = (index: number, host: string, port: string) => {
    const hosts = model.hosts.map((h, i) => (i === index ? { host, port } : h));
    applyModel({ ...model, hosts });
  };

  const addHost = () => {
    applyModel({ ...model, hosts: [...model.hosts, { host: '', port: '' }] });
  };

  const removeHost = (index: number) => {
    applyModel({ ...model, hosts: model.hosts.filter((_, i) => i !== index) });
  };

  const updateParam = (index: number, key: string, value: string) => {
    const params = model.params.map((p, i) => (i === index ? { key, value } : p));
    applyModel({ ...model, params });
  };

  const addParam = () => {
    applyModel({ ...model, params: [...model.params, { key: '', value: '' }] });
  };

  const removeParam = (index: number) => {
    applyModel({ ...model, params: model.params.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <InputField
        id="dsn-uri"
        label="接続 URI"
        value={uriText}
        onChange={handleUriChange}
        multiline
        rows={3}
        mono
        resize
        placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
        onSampleClick={handleSampleClick}
        error={error ?? undefined}
        hint="入力した接続文字列はブラウザ外に送信されません"
      />

      <Section title="フォーム">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-3 min-h-8">
                <label htmlFor="dsn-scheme" className="body-emphasis text-default">
                  スキーム
                </label>
              </div>
              <Select
                id="dsn-scheme"
                options={SCHEME_OPTIONS}
                value={model.scheme}
                onChange={(v: DsnScheme) => applyModel({ ...model, scheme: v })}
              />
            </div>
            <InputField
              id="dsn-user"
              label="ユーザー名"
              value={model.user}
              onChange={(v) => applyModel({ ...model, user: v })}
              mono
            />
            <InputField
              id="dsn-password"
              label="パスワード"
              value={model.password}
              onChange={(v) => applyModel({ ...model, password: v })}
              mono
              hint="記号は URI 生成時に自動で percent-encode されます"
            />
          </div>

          <fieldset className="m-0 border-0 p-0">
            <legend className="body-emphasis text-default mb-3 p-0">ホスト</legend>
            <div className="space-y-2">
              {model.hosts.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <BareInput
                    value={h.host}
                    onChange={(v) => updateHost(i, v, h.port)}
                    mono
                    aria-label={`ホスト ${i + 1}`}
                    placeholder="db.example.com"
                    className="flex-1 min-w-0"
                  />
                  <BareInput
                    value={h.port}
                    onChange={(v) => updateHost(i, h.host, v)}
                    mono
                    inputMode="numeric"
                    aria-label={`ポート ${i + 1}`}
                    placeholder={
                      dialect.defaultPort === null ? '指定不可' : String(dialect.defaultPort)
                    }
                    className="w-24 flex-none"
                  />
                  {model.hosts.length > 1 && (
                    <ActionButton
                      size="compact"
                      variant="danger"
                      onClick={() => removeHost(i)}
                      aria-label={`ホスト ${i + 1} を削除`}
                    >
                      削除
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
            {dialect.multiHost && (
              <div className="mt-2">
                <ActionButton size="compact" variant="secondary" onClick={addHost}>
                  ホストを追加
                </ActionButton>
              </div>
            )}
          </fieldset>

          <InputField
            id="dsn-database"
            label={dialect.pathLabel}
            value={model.database}
            onChange={(v) => applyModel({ ...model, database: v })}
            mono
          />

          <fieldset className="m-0 border-0 p-0">
            <legend className="body-emphasis text-default mb-3 p-0">クエリパラメータ</legend>
            <div className="space-y-2">
              {model.params.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <BareInput
                    value={p.key}
                    onChange={(v) => updateParam(i, v, p.value)}
                    mono
                    aria-label={`パラメータ名 ${i + 1}`}
                    placeholder="sslmode"
                    className="flex-1 min-w-0"
                  />
                  <BareInput
                    value={p.value}
                    onChange={(v) => updateParam(i, p.key, v)}
                    mono
                    aria-label={`パラメータ値 ${i + 1}`}
                    placeholder="require"
                    className="flex-1 min-w-0"
                  />
                  <ActionButton
                    size="compact"
                    variant="danger"
                    onClick={() => removeParam(i)}
                    aria-label={`パラメータ ${i + 1} を削除`}
                  >
                    削除
                  </ActionButton>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <ActionButton size="compact" variant="secondary" onClick={addParam}>
                パラメータを追加
              </ActionButton>
            </div>
          </fieldset>
        </div>
      </Section>

      <OutputField
        id="dsn-masked"
        label="マスク済み URI（共有用）"
        value={masked}
        rows={3}
        copyLabel="コピー"
      />
    </div>
  );
}
```

- [ ] **Step 2: `dsn-builder.astro` を作成**

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { DsnBuilderTool } from '@/components/tools/DsnBuilder';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'dsn-builder')!;
---

<ToolLayout tool={tool}>
  <DsnBuilderTool client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      データベース・ミドルウェアの接続文字列（DSN）を貼り付けると、ユーザー名・パスワード・ホスト・データベース名・クエリパラメータに分解してフォームに表示します。フォームを編集すると接続文字列にリアルタイムで反映され、記号入りパスワードの
      percent-encode
      も自動で行われます。接続文字列にはパスワードが含まれるため、すべての処理はブラウザ内で完結し、入力内容は外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">対応スキーム</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>PostgreSQL（postgresql:// / postgres://、libpq 仕様の複数ホスト対応）</li>
      <li>MySQL（mysql://）</li>
      <li>MongoDB（mongodb:// の複数ホスト、mongodb+srv:// の SRV 制約検証）</li>
      <li>Redis（redis:// / rediss://、パスの DB 番号検証）</li>
      <li>AMQP / RabbitMQ（amqp:// / amqps://、vhost の percent-encode 対応）</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>既存の接続文字列の構成要素（ホスト・DB 名・パラメータ）の確認・修正</li>
      <li>記号入りパスワードを含む接続文字列の組み立て（手動エンコードのミス防止）</li>
      <li>パスワードをマスクした共有用 URI を issue・チャットに貼る前処理</li>
    </ul>
    <h3 class="mb-2 mt-4 tool-info-heading">制限事項</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>実際の接続テストは行いません（ブラウザからは接続不可）</li>
      <li>クエリパラメータの妥当性（sslmode の値等）は検証しません</li>
      <li>JDBC 形式（jdbc:mysql://...）・SQL Server 形式（Server=...;）には対応していません</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: `src/data/tools.ts` の `toolEntries` 配列末尾にエントリを追加**

```ts
  {
    slug: 'dsn-builder',
    name: 'DSN/接続文字列ビルダ',
    description:
      '接続文字列（DSN）をフォームとURIで双方向編集します。パスワードをマスクした共有用URIも生成。PostgreSQL / MySQL / MongoDB / Redis / AMQP 対応',
    category: 'convert',
    yomi: 'でぃーえすえぬせつぞくもじれつびるだ',
  },
```

- [ ] **Step 4: `tests/e2e/visual-regression-pages.ts` の `PAGES` 配列末尾（`'/tools/clipboard-inspector'` の次）に追加**

```ts
  '/tools/dsn-builder',
```

- [ ] **Step 5: 検証**

Run: `node_modules/.bin/astro check`
Expected: エラー 0

Run: `npm run test`
Expected: PASS（`tests/meta/vrt-pages-coverage.test.ts` も green = VRT 登録漏れなし）

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/DsnBuilder.tsx src/pages/tools/dsn-builder.astro src/data/tools.ts tests/e2e/visual-regression-pages.ts
git commit -m "feat: DSN/接続文字列ビルダ（dsn-builder）の UI とページを追加"
```

---

### Task 4: E2E テスト

**Files:**

- Test: `tests/e2e/dsn-builder.spec.ts`

- [ ] **Step 1: E2E spec を作成**

ロケーターは `getByLabel` / `getByRole` のみ（属性セレクタ禁止）。陽性対照（エラー表示）を陰性対照と別テストにする。

```ts
import { test, expect } from '@playwright/test';

const PG_URI = 'postgresql://app:s3cret@db.example.com:5432/app_db?sslmode=require';

test.describe('DSN/接続文字列ビルダ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dsn-builder');
  });

  test('URI 貼り付けでフォームに分解される', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await expect(page.getByLabel('ユーザー名')).toHaveValue('app');
    await expect(page.getByLabel('パスワード')).toHaveValue('s3cret');
    await expect(page.getByLabel('ホスト 1', { exact: true })).toHaveValue('db.example.com');
    await expect(page.getByLabel('ポート 1', { exact: true })).toHaveValue('5432');
    await expect(page.getByLabel('データベース名')).toHaveValue('app_db');
    await expect(page.getByLabel('パラメータ名 1')).toHaveValue('sslmode');
    await expect(page.getByLabel('パラメータ値 1')).toHaveValue('require');
  });

  test('フォーム編集が URI に反映される（記号は percent-encode）', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await page.getByLabel('パスワード').fill('p@ss/w0rd');
    await expect(page.getByLabel('接続 URI')).toHaveValue(
      'postgresql://app:p%40ss%2Fw0rd@db.example.com:5432/app_db?sslmode=require'
    );
  });

  test('マスク済み URI が表示されコピーできる', async ({ page }) => {
    await page.getByLabel('接続 URI').fill(PG_URI);
    await expect(page.getByLabel('マスク済み URI（共有用）')).toHaveValue(
      'postgresql://app:****@db.example.com:5432/app_db?sslmode=require'
    );
  });

  test('サンプルを入力ボタンで現在スキームのサンプルが入る', async ({ page }) => {
    await page.getByRole('button', { name: 'サンプルを入力' }).click();
    await expect(page.getByLabel('接続 URI')).not.toHaveValue('');
    await expect(page.getByLabel('ホスト 1', { exact: true })).toHaveValue('db.example.com');
  });

  test('陽性対照: 未対応スキームでエラーが表示される', async ({ page }) => {
    await page.getByLabel('接続 URI').fill('oracle://user:pass@host:1521/SID');
    await expect(page.getByRole('alert')).toContainText('未対応のスキーム');
  });

  test('陽性対照: mongodb+srv にポートを指定するとエラーが表示される', async ({ page }) => {
    await page.getByLabel('接続 URI').fill('mongodb+srv://u:p@cluster0.example.net:27017/db');
    await expect(page.getByRole('alert')).toContainText('ポート');
  });

  test('mongodb 複数ホストでホスト行が追加表示される', async ({ page }) => {
    await page
      .getByLabel('接続 URI')
      .fill('mongodb://admin:s3cret@mongo1.example.com:27017,mongo2.example.com:27018/app_db');
    await expect(page.getByLabel('ホスト 2', { exact: true })).toHaveValue('mongo2.example.com');
    await expect(page.getByLabel('ポート 2', { exact: true })).toHaveValue('27018');
  });
});
```

注: `getByLabel('ホスト 1')` は `aria-label="ホスト 1 を削除"` のボタンと部分一致しうるため `{ exact: true }` を必ず付ける。

- [ ] **Step 2: E2E を実行**

Run: `npm run test:e2e -- dsn-builder`
Expected: PASS（preview ビルド経由で起動される。全件 green）

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/dsn-builder.spec.ts
git commit -m "test: dsn-builder の E2E テストを追加（陽性対照含む）"
```

---

### Task 5: ドキュメント更新

**Files:**

- Modify: `README.md`（ツール一覧）
- Modify: `SPEC.md`（2.3, 2.4, 4, 5, 9 章）
- Modify: `docs/tools.md`（技術解説）
- Modify: `docs/decisions.md`（設計判断）

- [ ] **Step 1: `README.md` のツール一覧に追加**

既存ツールの行形式（表 or リスト。ファイルを読んで形式を踏襲）で以下を追加:

- 名前: `DSN/接続文字列ビルダ`、slug: `dsn-builder`
- 説明: 接続文字列（DSN）をフォームと URI で双方向編集。パスワードをマスクした共有用 URI も生成（PostgreSQL / MySQL / MongoDB / Redis / AMQP）

- [ ] **Step 2: `SPEC.md` を更新**

各章を読み、既存ツールの記載粒度を踏襲して追加する:

- 2.3 章（ライブラリ）: dsn-builder は**追加ライブラリなし**（純粋な文字列処理）。記載対象があれば「なし」と明記
- 2.4 章(ディレクトリ構成): `src/utils/dsn-builder/` と `DsnBuilder.tsx` / `dsn-builder.astro` を追記
- 4 章・5 章: ツール一覧・機能説明に dsn-builder を追加
- 9 章: フェーズ・タスクのチェックリストに完了として追加

- [ ] **Step 3: `docs/tools.md` に技術解説セクションを追加**

既存セクションの構成（仕組み・準拠仕様・制限）を踏襲して以下の内容で追加:

```markdown
## DSN/接続文字列ビルダ（dsn-builder）

### 仕組み

- `scheme://[userinfo@]authority[/path][?query]` を自前パーサで分解する。`URL` API は
  mongodb のカンマ区切り複数ホスト（`host1:27017,host2:27018`）を解釈できないため使用しない
- userinfo・パス・クエリは percent-decode してフォームに表示し、URI 生成時に
  `encodeURIComponent` で再エンコードする（パスワード中の `@ : /` 等の手動エンコード不要）
- スキーム方言辞書（`src/utils/dsn-builder/dialects.ts`）が既定ポート・複数ホスト可否・
  パス部の意味（DB 名 / DB 番号 / vhost）・SRV 制約を定義する
- パスワードを `****` に置換した共有用 URI を常時導出する（同期不要の純粋関数）

### 準拠仕様

- RFC 3986（URI 構文・percent-encoding）
- libpq 接続 URI（PostgreSQL 複数ホスト）・MongoDB Connection String・RabbitMQ URI Specification

### 制限事項

- 実接続テストは不可（ブラウザの制約）
- クエリパラメータの意味的妥当性（sslmode の値等）は検証しない
- 過剰エンコードされた入力（例: `%41` = `A`）は decode → 再 encode で正規化される
- JDBC / ADO.NET（`Server=...;`）形式は対象外
```

- [ ] **Step 4: `docs/decisions.md` に設計判断を追記**

既存エントリの番号形式（`[NNN]`）に従い、末尾に追加:

```markdown
- dsn-builder は `URL` API ではなく自前パーサを採用。`URL` API は mongodb のカンマ区切り
  複数ホストを解釈できず（authority 全体が hostname 扱いで失敗）、非特殊スキームの挙動差も
  ブラウザ間で残るため。パース・シリアライズ・バリデーションを `src/utils/dsn-builder/` の
  純関数に分離し、フォーム/URI 双方の編集が単一の `validateModel` を通る設計とした。
  新規ライブラリ追加なし。バリデータを含むため陽性対照テストを同梱（test-gates 準拠）。
```

- [ ] **Step 5: コミット**

```bash
git add README.md SPEC.md docs/tools.md docs/decisions.md
git commit -m "docs: dsn-builder のドキュメント（README / SPEC / tools / decisions）を更新"
```

---

### Task 6: 最終検証

- [ ] **Step 1: 整形チェック**

Run: `npm run format:check`
Expected: PASS。差分が出たら `npm run format` → 該当ファイルのみ `git add <files>` → `git commit -m "style: prettier 整形"`

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0

- [ ] **Step 3: ユニットテスト全件**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: E2E 全件**

Run: `npm run test:e2e`
Expected: PASS（VRT の新ページ baseline は CI の `Update Visual Regression Baseline` workflow で生成するため、`/tools/dsn-builder` の snapshot 不在で fail する場合は VRT のみ許容。それ以外の fail は修正必須）

- [ ] **Step 5: 完了報告**

完了報告は項目別チェックリスト形式で行う（Task 1〜6 それぞれについて 実装 / スキップ理由 を明示。テストコマンドの実行結果を原文で添付）。

---

## 自己レビュー結果

- Spec coverage: 5 スキーム（Task 1 dialects）/ 双方向同期（Task 3）/ マスク URI（Task 2 maskDsn + Task 3 OutputField）/ 陽性対照（Task 2, 4）/ VRT 登録（Task 3）/ ドキュメント義務（Task 5）— 全要件にタスクあり
- プレースホルダ: なし（README/SPEC のみ「既存形式踏襲」だが挿入内容は明記済み）
- 型整合: `DsnModel` / `validateModel` / `serializeDsn(model, options)` / `maskDsn` のシグネチャは全タスクで一致
