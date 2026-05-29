export type TypeNode =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'object'; fields: Map<string, { type: TypeNode; optional: boolean }> }
  | { kind: 'array'; element: TypeNode }
  | { kind: 'union'; members: TypeNode[] }
  | { kind: 'unknown' };

/** パース済み JS 値から型を推論する（配列は全要素マージ）。 */
export function inferType(value: unknown): TypeNode {
  if (value === null) return { kind: 'primitive', name: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', element: { kind: 'unknown' } };
    return { kind: 'array', element: unionOf(value.map(inferType)) };
  }
  if (typeof value === 'object') {
    const fields = new Map<string, { type: TypeNode; optional: boolean }>();
    for (const [k, v] of Object.entries(value)) {
      fields.set(k, { type: inferType(v), optional: false });
    }
    return { kind: 'object', fields };
  }
  if (value === undefined) return { kind: 'unknown' };
  const t = typeof value; // string | number | boolean
  return { kind: 'primitive', name: t as 'string' | 'number' | 'boolean' };
}

type ObjectType = Extract<TypeNode, { kind: 'object' }>;

function mergeObjects(a: ObjectType, b: ObjectType): ObjectType {
  const fields = new Map<string, { type: TypeNode; optional: boolean }>();
  const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);
  for (const k of keys) {
    const fa = a.fields.get(k);
    const fb = b.fields.get(k);
    if (fa && fb) {
      fields.set(k, { type: unionOf([fa.type, fb.type]), optional: fa.optional || fb.optional });
    } else {
      const f = (fa ?? fb)!;
      fields.set(k, { type: f.type, optional: true }); // どちらかで欠ける → optional
    }
  }
  return { kind: 'object', fields };
}

/**
 * 複数の型を 1 つにまとめる。object 同士・array 同士はマージ、
 * primitive は名前で重複除去、混在は union にする。
 */
function unionOf(types: TypeNode[]): TypeNode {
  const flat: TypeNode[] = [];
  for (const t of types) {
    if (t.kind === 'union') flat.push(...t.members);
    else if (t.kind !== 'unknown') flat.push(t);
  }
  const objects = flat.filter((t): t is ObjectType => t.kind === 'object');
  const arrays = flat.filter((t): t is Extract<TypeNode, { kind: 'array' }> => t.kind === 'array');
  const prims = flat.filter(
    (t): t is Extract<TypeNode, { kind: 'primitive' }> => t.kind === 'primitive'
  );

  const result: TypeNode[] = [];
  if (objects.length > 0) result.push(objects.reduce(mergeObjects));
  if (arrays.length > 0)
    result.push({ kind: 'array', element: unionOf(arrays.map((a) => a.element)) });
  const seen = new Set<string>();
  for (const p of prims) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      result.push(p);
    }
  }

  if (result.length === 0) return { kind: 'unknown' };
  if (result.length === 1) return result[0];
  return { kind: 'union', members: result };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

function pascalCase(key: string): string {
  const parts = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return /^[A-Za-z]/.test(name) ? name : `Type${name}`;
}

/** TypeScript 型定義を生成する。ネスト object は別 interface に切り出す。 */
export function generateTypeScript(value: unknown, rootName = 'Root'): string {
  const interfaces: string[] = [];
  const used = new Set<string>();

  function uniqueName(base: string): string {
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    return name;
  }

  // node を型式の文字列にする。object は interface を登録して名前を返す。
  function ref(node: TypeNode, suggested: string): string {
    switch (node.kind) {
      case 'primitive':
        return node.name;
      case 'unknown':
        return 'unknown';
      case 'union':
        return node.members.map((m) => ref(m, suggested)).join(' | ');
      case 'array': {
        const elem = ref(node.element, `${suggested}Item`);
        return /[ |]/.test(elem) ? `(${elem})[]` : `${elem}[]`;
      }
      case 'object': {
        const name = uniqueName(suggested);
        const lines: string[] = [];
        for (const [k, f] of node.fields) {
          const fieldType = ref(f.type, pascalCase(k)); // 子 interface を先に push
          const key = IDENT.test(k) ? k : JSON.stringify(k);
          lines.push(`  ${key}${f.optional ? '?' : ''}: ${fieldType};`);
        }
        const body =
          lines.length === 0
            ? `interface ${name} {}`
            : `interface ${name} {\n${lines.join('\n')}\n}`;
        interfaces.push(body); // 親は子の後に push（子→親の順）
        return name;
      }
    }
  }

  const root = inferType(value);
  if (root.kind === 'object') {
    ref(root, rootName); // interfaces に root を最後に積む
    return interfaces.join('\n\n');
  }
  const rootExpr = ref(root, rootName);
  const decl = `type ${rootName} = ${rootExpr};`;
  return interfaces.length > 0 ? `${interfaces.join('\n\n')}\n\n${decl}` : decl;
}
