import { describe, it, expect } from 'vitest';
import { parseDdl, toMermaid, toSvg } from '../ddl-er-diagram';

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

  it('複合外部キーは列ごとにリレーションを生成し各列をFKにする', async () => {
    const sql = `
      CREATE TABLE a (x INT, y INT, PRIMARY KEY (x, y));
      CREATE TABLE b (x INT, y INT,
        CONSTRAINT fk FOREIGN KEY (x, y) REFERENCES a(x, y));`;
    const { model } = await parseDdl(sql, 'mysql');
    expect(model.relations).toEqual([
      { fromTable: 'b', fromColumn: 'x', toTable: 'a', toColumn: 'x' },
      { fromTable: 'b', fromColumn: 'y', toTable: 'a', toColumn: 'y' },
    ]);
    const b = model.tables.find((t) => t.name === 'b')!;
    expect(b.columns.find((c) => c.name === 'x')?.isForeignKey).toBe(true);
    expect(b.columns.find((c) => c.name === 'y')?.isForeignKey).toBe(true);
  });

  it('型修飾子（UNSIGNED 等）を型表記に含める', async () => {
    const sql = 'CREATE TABLE t (a INT UNSIGNED, b BIGINT UNSIGNED ZEROFILL);';
    const { model } = await parseDdl(sql, 'mysql');
    const cols = model.tables[0].columns;
    expect(cols.find((c) => c.name === 'a')?.type).toBe('INT UNSIGNED');
    expect(cols.find((c) => c.name === 'b')?.type).toBe('BIGINT UNSIGNED ZEROFILL');
  });
});

describe('toMermaid', () => {
  it('erDiagramで始まりテーブル属性とリレーションを出力する', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL);
      CREATE TABLE posts (id INT PRIMARY KEY, user_id INT,
        CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    const out = toMermaid(model);
    expect(out.startsWith('erDiagram')).toBe(true);
    expect(out).toContain('users {');
    expect(out).toContain('posts {');
    // PK/FK マーカー
    expect(out).toMatch(/INT id PK/);
    expect(out).toMatch(/INT user_id FK/);
    // リレーション行（posts が users を参照）
    expect(out).toContain('posts }o--|| users : "user_id"');
  });

  it('型の括弧やスペースをMermaid属性名として安全な形に整形する', async () => {
    const sql = 'CREATE TABLE t (amount DECIMAL(10,2));';
    const { model } = await parseDdl(sql, 'postgresql');
    const out = toMermaid(model);
    // Mermaid 属性の型トークンに空白や ( ) を残さない（_ 等へ置換）
    expect(out).not.toMatch(/DECIMAL\(10,2\)/);
    expect(out).toContain('amount');
  });

  it('リレーションラベルの二重引用符を除去してMermaid構文の破壊を防ぐ', () => {
    // fromColumn に " を含む（識別子に引用符が紛れたケース）
    const model = {
      tables: [
        {
          name: 'a',
          columns: [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isForeignKey: false },
          ],
        },
        {
          name: 'b',
          columns: [
            { name: 'q', type: 'INT', nullable: true, isPrimaryKey: false, isForeignKey: true },
          ],
        },
      ],
      relations: [{ fromTable: 'b', fromColumn: 'q"x', toTable: 'a', toColumn: 'id' }],
    };
    const out = toMermaid(model);
    const relLine = out.split('\n').find((l) => l.includes('}o--||'))!;
    // 生の " がラベル内に残っていない（残ると "q"x" でラベルが途中終端し構文が壊れる）
    expect(relLine).not.toContain('q"x');
    // ラベルはちょうど 1 組の二重引用符で囲まれている（開閉が崩れていない）
    expect((relLine.match(/"/g) ?? []).length).toBe(2);
    // 列名の中身（引用符以外）は保持される（" は空白へ置換）
    expect(relLine).toContain('q x');
  });
});

describe('toSvg', () => {
  it('有効な SVG ルート要素と xmlns を含む', async () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255));';
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('テーブル名とカラム名が SVG テキストに含まれる', async () => {
    const sql = 'CREATE TABLE orders (order_id INT PRIMARY KEY, amount DECIMAL(10,2));';
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    expect(svg).toContain('orders');
    expect(svg).toContain('order_id');
    expect(svg).toContain('amount');
  });

  // 陰性対照（CSP クリーン確認）: style= 属性・<style> 要素が含まれない
  it('style= 属性を含まない（CSP 準拠・陰性対照）', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255));
      CREATE TABLE posts (id INT, user_id INT,
        CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    expect(svg).not.toContain('style=');
    expect(svg).not.toMatch(/<style[\s>]/);
  });

  // 陽性対照: SVG が実際に描画内容（presentation 属性）を持つことを確認し、
  // 「空文字列 or 空 SVG を返せば陰性対照が全部通る」誤実装を排除する
  it('presentation 属性（fill / stroke 等）を含む（陽性対照: 実描画の確認）', async () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255));';
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    // テーブルカードの背景 rect には fill が必須
    expect(svg).toMatch(/fill="/);
    // カード枠線には stroke が必須
    expect(svg).toMatch(/stroke="/);
    // テキスト要素が存在すること
    expect(svg).toContain('<text');
  });

  // 陰性対照: 悪意ある識別子が生 HTML タグとして出力されない
  it('テーブル名の特殊文字をエスケープする（XSS 防止・陰性対照）', async () => {
    const model = {
      tables: [
        {
          name: '<script>alert(1)</script>',
          columns: [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isForeignKey: false },
          ],
        },
      ],
      relations: [],
    };
    const svg = toSvg(model);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('</script>');
  });

  // 陽性対照: エスケープ後の文字列が実際に SVG に含まれることを確認し、
  // 「テーブル名を丸ごと除外する」逃げ実装を排除する
  it('テーブル名がエスケープされた形で SVG に含まれる（陽性対照: エスケープ動作の確認）', async () => {
    const model = {
      tables: [
        {
          name: '<table>&"name"',
          columns: [
            { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true, isForeignKey: false },
          ],
        },
      ],
      relations: [],
    };
    const svg = toSvg(model);
    // エスケープ後の文字が存在すること（どれか一つでも）
    expect(svg).toMatch(/&lt;|&amp;|&quot;/);
  });

  it('リレーションがある場合 <path が出力される', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE posts (id INT, user_id INT,
        CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    // リレーション線は <path で描画される
    expect(svg).toContain('<path ');
  });

  // 陽性対照: リレーションラベルの前に白背景 rect が出力されることを確認する
  it('リレーションがある場合、ラベル <text の直前に白背景 <rect fill="#ffffff" が出力される（可読性ポリッシュ）', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE posts (id INT, user_id INT,
        CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users(id));`;
    const { model } = await parseDdl(sql, 'postgresql');
    const svg = toSvg(model);
    // 白背景 rect が存在すること（陽性対照）
    expect(svg).toContain('fill="#ffffff"');
    // ラベル <rect は <text の直前に現れる（rect → text の順で出力される）
    const rectIdx = svg.lastIndexOf('<rect');
    const textIdx = svg.lastIndexOf('<text');
    // ラベル <text より前に白背景 rect が存在すること
    expect(rectIdx).toBeLessThan(textIdx);
    // style= が混入していないこと（CSP 陰性対照と整合する）
    expect(svg).not.toContain('style=');
  });

  it('参照先が存在しないリレーションは関係線（<path）を描かずスキップする', async () => {
    const sql = 'CREATE TABLE posts (id INT, user_id INT REFERENCES ghost_table(id));';
    const { model, errors } = await parseDdl(sql, 'postgresql');
    // ghost_table が存在しないため警告が出る
    expect(errors.some((e) => /ghost_table/.test(e.message))).toBe(true);
    // 参照先テーブルがないのでリレーション <path はなし（内部の <line は別物）
    const svg = toSvg(model);
    expect(svg).not.toContain('<path ');
  });

  it('テーブルが 0 件でも有効な SVG を返す', () => {
    const svg = toSvg({ tables: [], relations: [] });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});
