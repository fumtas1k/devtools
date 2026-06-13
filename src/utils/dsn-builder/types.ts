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
