export interface CaptureGroup {
  /** 1 始まりのグループ番号 */
  index: number;
  /** 名前付きグループ名（なければ undefined） */
  name?: string;
  /** マッチ値。未マッチ（省略可能グループ）のとき undefined */
  value?: string;
}

export interface RegexMatch {
  /** マッチした文字列全体 */
  value: string;
  /** マッチ開始位置（inclusive） */
  start: number;
  /** 終了位置（exclusive） */
  end: number;
  /** キャプチャグループ（1 始まり） */
  groups: CaptureGroup[];
}

export interface MatchResult {
  matches: RegexMatch[];
  /** maxLength で input を切り詰めたか */
  truncated: boolean;
}

/**
 * pattern を走査し、各キャプチャグループ番号（1 始まり）に対応する名前を返す。
 * 名前なしグループは undefined。非キャプチャ (?:) / 先読み (?=)(?!) / 後読み (?<=)(?<!) は
 * グループ番号を消費しないので含めない。\( のエスケープと [ ] 文字クラス内の括弧は無視する。
 */
function groupNames(pattern: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++; // 次の1文字をエスケープとしてスキップ
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c !== '(') continue;
    if (pattern[i + 1] !== '?') {
      names.push(undefined); // 通常のキャプチャグループ
      continue;
    }
    // (? で始まる: 名前付き (?<name> のみグループ番号を持つ。(?<= (?<! は後読みで持たない。
    if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') {
      const end = pattern.indexOf('>', i + 3);
      names.push(end === -1 ? undefined : pattern.slice(i + 3, end));
    }
    // (?: (?= (?! (?<= (?<! → グループ番号なし（何もしない）
  }
  return names;
}

function toMatch(m: RegExpExecArray, names: (string | undefined)[]): RegexMatch {
  const value = m[0];
  const start = m.index;
  const groups: CaptureGroup[] = [];
  for (let i = 1; i < m.length; i++) {
    groups.push({ index: i, name: names[i - 1], value: m[i] });
  }
  return { value, start, end: start + value.length, groups };
}

/**
 * pattern + flags を input に対してマッチ実行する（native RegExp）。
 * g なしは最初の 1 件のみ、g ありは全マッチ。空マッチ時は lastIndex を 1 進めて無限ループを防ぐ。
 * maxLength を渡すと input を先頭 maxLength 文字に切り詰めて実行し truncated=true を返す。
 * 不正な pattern / flags は `new RegExp` が throw する（呼び出し側で gate 済み前提）。
 */
export function runMatch(
  pattern: string,
  flags: string,
  input: string,
  maxLength?: number
): MatchResult {
  const truncated = maxLength !== undefined && input.length > maxLength;
  const text = truncated ? input.slice(0, maxLength) : input;
  const re = new RegExp(pattern, flags);
  const names = groupNames(pattern);
  const matches: RegexMatch[] = [];

  if (!flags.includes('g')) {
    const m = re.exec(text);
    if (m) matches.push(toMatch(m, names));
    return { matches, truncated };
  }

  const unicode = flags.includes('u');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(toMatch(m, names));
    if (m.index === re.lastIndex) {
      // 空マッチ guard: lastIndex を進めて無限ループを防ぐ。u フラグ時はコードポイント単位で
      // 進め、サロゲートペア（絵文字等）を分割して以降の位置がずれるのを防ぐ。
      const cp = unicode ? text.codePointAt(re.lastIndex) : undefined;
      re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
    }
  }
  return { matches, truncated };
}
