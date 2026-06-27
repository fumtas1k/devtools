import { describe, it, expect } from 'vitest';
import { parseDdl } from '../ddl-er-diagram';

describe('parseDdl', () => {
  it('単一テーブルのカラム・型・NULL可否・PKを抽出する', async () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL, bio TEXT);';
    const { model, errors } = await parseDdl(sql, 'postgresql');
    expect(errors).toEqual([]);
    expect(model.tables).toHaveLength(1);
    const users = model.tables[0];
    expect(users.name).toBe('users');
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'name', 'bio']);
    const id = users.columns[0];
    expect(id.type).toBe('INT');
    expect(id.isPrimaryKey).toBe(true);
    expect(id.nullable).toBe(false);
    const name = users.columns[1];
    expect(name.type).toBe('VARCHAR(255)');
    expect(name.nullable).toBe(false);
    expect(users.columns[2].nullable).toBe(true); // bio は NOT NULL なし
  });

  it('テーブル制約のFOREIGN KEYからリレーションを抽出する', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE posts (id INT PRIMARY KEY, user_id INT NOT NULL,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    expect(model.relations).toEqual([
      { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
    const fk = model.tables[1].columns.find((c) => c.name === 'user_id');
    expect(fk?.isForeignKey).toBe(true);
  });

  it('列定義内のREFERENCESからリレーションを抽出する（MySQLバッククォート）', async () => {
    const sql =
      'CREATE TABLE `users` (`id` INT PRIMARY KEY);\n' +
      'CREATE TABLE `posts` (`id` INT, `user_id` INT REFERENCES `users`(`id`));';
    const { model } = await parseDdl(sql, 'mysql');
    expect(model.relations).toEqual([
      { fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
  });

  it('テーブル制約のPRIMARY KEYを各カラムに反映する', async () => {
    const sql = 'CREATE TABLE t (id INT, code VARCHAR(10), PRIMARY KEY (id, code));';
    const { model } = await parseDdl(sql, 'mysql');
    const cols = model.tables[0].columns;
    expect(cols.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true);
    expect(cols.find((c) => c.name === 'code')?.isPrimaryKey).toBe(true);
  });

  it('構文エラー時はthrowせずerrorsに格納する', async () => {
    const { model, errors } = await parseDdl('CREATE TABLE', 'mysql');
    expect(model.tables).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBeTruthy();
  });

  it('FK参照先が未定義テーブルの場合は警告を出し描画は継続する', async () => {
    const sql = 'CREATE TABLE posts (id INT, user_id INT REFERENCES users(id));';
    const { model, errors } = await parseDdl(sql, 'postgresql');
    expect(model.tables).toHaveLength(1);
    expect(errors.some((e) => /users/.test(e.message))).toBe(true);
  });
});
