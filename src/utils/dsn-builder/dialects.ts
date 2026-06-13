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
    sample: 'mongodb+srv://admin:s3cret@cluster0.abcde.mongodb.net/app_db?retryWrites=true&w=majority',
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
