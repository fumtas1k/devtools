import { scrubText, SCRUB_CATEGORIES } from '@/utils/secret-scrubber';
import { refs } from './shared';
const categories = Object.fromEntries(SCRUB_CATEGORIES.map((key) => [key, true])) as Parameters<
  typeof scrubText
>[1];
export function createMask(secrets: Set<string>): (value: string) => string {
  const values = [...secrets].filter(Boolean);
  const secretPattern = values.length
    ? new RegExp(
        values
          .sort((a, b) => b.length - a.length)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|'),
        'g'
      )
    : null;
  const cache = new Map<string, string>();
  const safe = (s: string) => {
    const cached = cache.get(s);
    if (cached !== undefined) return cached;
    let out = s;
    if (secretPattern) out = out.replace(secretPattern, '[マスク]');
    out = out.replace(refs, (_, name: string) => '${' + name + '}');
    if (/\$\{(?![A-Za-z_][A-Za-z0-9_]*\})/.test(out)) out = '[未対応の式]';
    if (secretPattern) out = out.replace(secretPattern, '[マスク]');
    const result = scrubText(out, categories).output;
    cache.set(s, result);
    return result;
  };
  return safe;
}
