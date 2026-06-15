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

  it('ポート 0 を拒否する', () => {
    const result = parseDsn('postgresql://u:p@host:0/db');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ポート');
  });

  it('先頭ゼロのポート（01）を拒否する', () => {
    expect(parseDsn('postgresql://u:p@host:01/db').ok).toBe(false);
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

  it('JDBC でも範囲外ポートを拒否する（検証経路が jdbc を素通りしない）', () => {
    const result = parseDsn('jdbc:postgresql://host:99999/db?user=u&password=p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ポート');
  });

  it('JDBC でも不正な percent-encoding を拒否する', () => {
    expect(parseDsn('jdbc:mysql://host:3306/db?user=u&password=p%ZZ').ok).toBe(false);
  });

  it('未対応の JDBC サブスキーム（jdbc:oracle）を拒否する', () => {
    const result = parseDsn('jdbc:oracle://host:1521/SID');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('未対応のスキーム');
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

describe('JDBC（PostgreSQL / MySQL）', () => {
  it('jdbc:postgresql の credential を ?user=&password= から専用フィールドへ移す', () => {
    const model = mustParse(
      'jdbc:postgresql://db.example.com:5432/app_db?user=app_user&password=p%40ss%2Fw0rd&sslmode=require'
    );
    expect(model.scheme).toBe('jdbc:postgresql');
    expect(model.user).toBe('app_user');
    expect(model.password).toBe('p@ss/w0rd'); // percent-decode 済み
    expect(model.hosts).toEqual([{ host: 'db.example.com', port: '5432' }]);
    expect(model.database).toBe('app_db');
    // user / password は params から除去され、残りのみ保持する
    expect(model.params).toEqual([{ key: 'sslmode', value: 'require' }]);
  });

  it('jdbc:mysql も同様に credential を抽出する', () => {
    const model = mustParse(
      'jdbc:mysql://db.example.com:3306/app_db?user=root&password=secret&useSSL=true'
    );
    expect(model.scheme).toBe('jdbc:mysql');
    expect(model.user).toBe('root');
    expect(model.password).toBe('secret');
    expect(model.params).toEqual([{ key: 'useSSL', value: 'true' }]);
  });

  it('credential を userinfo でなく query property として再構成する', () => {
    const model: DsnModel = {
      scheme: 'jdbc:postgresql',
      user: 'app',
      password: 'p@ss/w0rd',
      hosts: [{ host: 'db.example.com', port: '5432' }],
      database: 'app_db',
      params: [{ key: 'sslmode', value: 'require' }],
    };
    expect(serializeDsn(model)).toBe(
      'jdbc:postgresql://db.example.com:5432/app_db?user=app&password=p%40ss%2Fw0rd&sslmode=require'
    );
  });

  it('複数ホスト（フェイルオーバ）を受理する', () => {
    const model = mustParse('jdbc:postgresql://a.example.com:5432,b.example.com:5432/app_db');
    expect(model.hosts).toEqual([
      { host: 'a.example.com', port: '5432' },
      { host: 'b.example.com', port: '5432' },
    ]);
  });

  it('maskDsn は password プロパティのみ **** に置換する', () => {
    const model = mustParse(
      'jdbc:mysql://db.example.com:3306/app_db?user=root&password=secret&useSSL=true'
    );
    expect(maskDsn(model)).toBe(
      'jdbc:mysql://db.example.com:3306/app_db?user=root&password=****&useSSL=true'
    );
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
