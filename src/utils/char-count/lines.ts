import type { LineStats } from './types';
import { countGraphemes } from './chars';

export function analyzeLines(s: string): LineStats {
  if (s.length === 0) {
    return {
      total: 0,
      nonEmpty: 0,
      longestGraphemes: 0,
      newline: 'none',
      counts: { lf: 0, crlf: 0, cr: 0 },
    };
  }

  const crlfCount = (s.match(/\r\n/g) ?? []).length;
  const lfTotal = (s.match(/\n/g) ?? []).length;
  const crTotal = (s.match(/\r/g) ?? []).length;
  const lfCount = lfTotal - crlfCount;
  const crCount = crTotal - crlfCount;

  const kinds = [lfCount, crlfCount, crCount].filter((n) => n > 0).length;
  let newline: LineStats['newline'] = 'none';
  if (kinds > 1) newline = 'mixed';
  else if (lfCount > 0) newline = 'lf';
  else if (crlfCount > 0) newline = 'crlf';
  else if (crCount > 0) newline = 'cr';

  // 末尾改行のみの空文字列は行数に含めない
  const parts = s.split(/\r\n|\r|\n/);
  const lines = parts[parts.length - 1] === '' ? parts.slice(0, -1) : parts;
  const total = lines.length;

  const nonEmpty = lines.filter((l) => l.trim().length > 0).length;
  const longestGraphemes = lines.reduce((max, l) => Math.max(max, countGraphemes(l)), 0);

  return {
    total,
    nonEmpty,
    longestGraphemes,
    newline,
    counts: { lf: lfCount, crlf: crlfCount, cr: crCount },
  };
}
