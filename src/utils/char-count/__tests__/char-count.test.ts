import { describe, it, expect } from 'vitest';
import {
  countUtf16Length,
  countCodePoints,
  countGraphemes,
  countGraphemesNoNewline,
  countGraphemesNoWhitespace,
  countWeightedWidth,
} from '@/utils/char-count/chars';
import {
  checkUtf8,
  checkUtf8Bmp,
  checkUtf16,
  checkSjis,
  checkEucJp,
} from '@/utils/char-count/encodings';
import { analyzeLines } from '@/utils/char-count/lines';
import { twitterWeight, blueskyCount, extractUrlRanges } from '@/utils/char-count/sns';
import {
  countGenkoSheets,
  countParagraphs,
  countReadingMinutes,
  countEnglishWords,
} from '@/utils/char-count/manuscript';
import { count } from '@/utils/char-count';

// ────────────────────────────────────────────────────────────
// chars
// ────────────────────────────────────────────────────────────

describe('countUtf16Length', () => {
  it('空文字は 0', () => expect(countUtf16Length('')).toBe(0));
  it('ASCII "abc" は 3', () => expect(countUtf16Length('abc')).toBe(3));
  it('日本語 "あいう" は 3', () => expect(countUtf16Length('あいう')).toBe(3));
  it('基本絵文字 "😀" は 2 (surrogate pair)', () => expect(countUtf16Length('😀')).toBe(2));
  it('家族絵文字 "👨‍👩‍👧‍👦" は 11 (4 surrogate pairs + 3 ZWJ)', () =>
    expect(countUtf16Length('👨‍👩‍👧‍👦')).toBe(11));
});

describe('countCodePoints', () => {
  it('空文字は 0', () => expect(countCodePoints('')).toBe(0));
  it('ASCII "abc" は 3', () => expect(countCodePoints('abc')).toBe(3));
  it('日本語 "あいう" は 3', () => expect(countCodePoints('あいう')).toBe(3));
  it('基本絵文字 "😀" は 1 (単一 code point)', () => expect(countCodePoints('😀')).toBe(1));
  it('CJK Ext-B "𠮷" は 1', () => expect(countCodePoints('𠮷')).toBe(1));
  it('家族絵文字 "👨‍👩‍👧‍👦" は 7 (4 人 + 3 ZWJ)', () => expect(countCodePoints('👨‍👩‍👧‍👦')).toBe(7));
  it('VS16 付き "☺️" は 2 (U+263A + U+FE0F)', () => expect(countCodePoints('☺️')).toBe(2));
});

describe('countGraphemes', () => {
  it('空文字は 0', () => expect(countGraphemes('')).toBe(0));
  it('ASCII "abc" は 3', () => expect(countGraphemes('abc')).toBe(3));
  it('日本語 "あいう" は 3', () => expect(countGraphemes('あいう')).toBe(3));
  it('基本絵文字 "😀" は 1 (grapheme cluster)', () => expect(countGraphemes('😀')).toBe(1));
  it('家族絵文字 "👨‍👩‍👧‍👦" は 1 (ZWJ sequence = 1 cluster)', () => expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1));
  it('VS16 付き "☺️" は 1', () => expect(countGraphemes('☺️')).toBe(1));
  it('CJK Ext-B "𠮷" は 1', () => expect(countGraphemes('𠮷')).toBe(1));
  it('NFD "が" (U+304B + U+3099) は 1', () => expect(countGraphemes('が')).toBe(1));
});

describe('countGraphemesNoNewline', () => {
  it('空文字は 0', () => expect(countGraphemesNoNewline('')).toBe(0));
  it('"a\\nb" は 2 (LF を除く)', () => expect(countGraphemesNoNewline('a\nb')).toBe(2));
  it('"a\\r\\nb" は 2 (CRLF を除く)', () => expect(countGraphemesNoNewline('a\r\nb')).toBe(2));
  it('"あいう\\n" は 3', () => expect(countGraphemesNoNewline('あいう\n')).toBe(3));
  it('"😀\\n😀" は 2', () => expect(countGraphemesNoNewline('😀\n😀')).toBe(2));
});

describe('countWeightedWidth', () => {
  it('空文字は 0', () => expect(countWeightedWidth('')).toBe(0));
  it('ASCII 1 文字 "a" は 0.5', () => expect(countWeightedWidth('a')).toBe(0.5));
  it('ASCII 4 文字 "abcd" は 2', () => expect(countWeightedWidth('abcd')).toBe(2));
  it('半角スペースは 0.5', () => expect(countWeightedWidth(' ')).toBe(0.5));
  it('日本語 1 文字 "あ" は 1', () => expect(countWeightedWidth('あ')).toBe(1));
  it('日本語 3 文字 "あいう" は 3', () => expect(countWeightedWidth('あいう')).toBe(3));
  it('半角カタカナ "ｱ" は 0.5', () => expect(countWeightedWidth('ｱ')).toBe(0.5));
  it('半角カタカナ "ｱｲｳ" は 1.5', () => expect(countWeightedWidth('ｱｲｳ')).toBe(1.5));
  it('絵文字 "😀" は 1 (全角扱い)', () => expect(countWeightedWidth('😀')).toBe(1));
  it('混在 "aあ" は 1.5 (0.5 + 1)', () => expect(countWeightedWidth('aあ')).toBe(1.5));
  it('混在 "Hello世界" は 4.5 (5×0.5 + 2×1)', () =>
    expect(countWeightedWidth('Hello世界')).toBe(4.5));
  it('ASCII と全角スペース "a　b" は 2 (0.5 + 1 + 0.5)', () =>
    expect(countWeightedWidth('a　b')).toBe(2));
  // 制御文字は ASCII 印刷可能 (U+0020-U+007E) の範囲外なので 1 として扱う
  it('改行を含む "a\\nb" は 2 (a 0.5 + LF 1 + b 0.5)', () =>
    expect(countWeightedWidth('a\nb')).toBe(2));
  it('タブ "\\t" 単独は 1 (制御文字は全角扱い)', () => expect(countWeightedWidth('\t')).toBe(1));
  // 結合文字シーケンス (NFD): 書記素単位で先頭 code point のみ判定するため ASCII base が支配的
  // ソース上の char 混入による曖昧化を防ぐため escape sequence で明示
  it('NFD 形式 (e + U+0301) は 0.5 (ASCII base 文字扱い)', () =>
    expect(countWeightedWidth('\u0065\u0301')).toBe(0.5));
  // NFC 形式 "é" (U+00E9 単一 code point) は ASCII 範囲外で 1
  it('NFC 形式 "é" (U+00E9) は 1 (Latin-1 領域)', () =>
    expect(countWeightedWidth('\u00e9')).toBe(1));
});

describe('countGraphemesNoWhitespace', () => {
  it('空文字は 0', () => expect(countGraphemesNoWhitespace('')).toBe(0));
  it('"a b" は 2 (半角スペースを除く)', () => expect(countGraphemesNoWhitespace('a b')).toBe(2));
  it('"a　b" は 2 (全角スペースを除く)', () => expect(countGraphemesNoWhitespace('a　b')).toBe(2));
  it('"a\\tb" は 2 (タブを除く)', () => expect(countGraphemesNoWhitespace('a\tb')).toBe(2));
  it('改行も除く: "a\\nb" は 2', () => expect(countGraphemesNoWhitespace('a\nb')).toBe(2));
  it('"あいう" は 3 (空白なし)', () => expect(countGraphemesNoWhitespace('あいう')).toBe(3));
});

// ────────────────────────────────────────────────────────────
// encodings
// ────────────────────────────────────────────────────────────

describe('checkUtf8', () => {
  it('空文字: ok=true, bytes=0', () => {
    const r = checkUtf8('');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(0);
    expect(r.failedCount).toBe(0);
  });
  it('ASCII "abc": ok=true, bytes=3', () => {
    const r = checkUtf8('abc');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(3);
  });
  it('日本語 "あいう": ok=true, bytes=9', () => {
    const r = checkUtf8('あいう');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(9);
  });
  it('絵文字 "😀": ok=true, bytes=4', () => {
    const r = checkUtf8('😀');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(4);
  });
  it('家族絵文字 "👨‍👩‍👧‍👦": ok=true, bytes=25', () => {
    const r = checkUtf8('👨‍👩‍👧‍👦');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(25);
  });
});

describe('checkUtf8Bmp (utf8mb3)', () => {
  it('空文字: ok=true, bytes=0', () => {
    const r = checkUtf8Bmp('');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(0);
  });
  it('ASCII "abc": ok=true, bytes=3', () => {
    const r = checkUtf8Bmp('abc');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(3);
  });
  it('日本語 "あいう": ok=true, bytes=9 (全 BMP)', () => {
    const r = checkUtf8Bmp('あいう');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(9);
  });
  it('VS16 付き "☺️": ok=true (U+263A + U+FE0F 共に BMP)', () => {
    const r = checkUtf8Bmp('☺️');
    expect(r.ok).toBe(true);
  });
  it('"😀" (SMP): ok=false, failedCount=1', () => {
    const r = checkUtf8Bmp('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
    expect(r.failedCount).toBe(1);
  });
  it('"𠮷" (CJK Ext-B, SMP): ok=false', () => {
    const r = checkUtf8Bmp('𠮷');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBe(1);
  });
  it('家族絵文字: ok=false, failedCount=4 (4 つの SMP 絵文字)', () => {
    const r = checkUtf8Bmp('👨‍👩‍👧‍👦');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBe(4);
  });
  it('"あい😀う": ok=false, failedCount=1 (他 3 文字は BMP)', () => {
    const r = checkUtf8Bmp('あい😀う');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBe(1);
  });
});

describe('checkUtf16', () => {
  it('空文字: ok=true, bytes=0', () => {
    const r = checkUtf16('');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(0);
  });
  it('"abc": ok=true, bytes=6', () => {
    const r = checkUtf16('abc');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(6);
  });
  it('"あいう": ok=true, bytes=6', () => {
    const r = checkUtf16('あいう');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(6);
  });
  it('"😀": ok=true, bytes=4 (surrogate pair = 2 units × 2 bytes)', () => {
    const r = checkUtf16('😀');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(4);
  });
});

describe('checkSjis', () => {
  it('空文字: ok=true, bytes=0', () => {
    const r = checkSjis('');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(0);
    expect(r.failedCount).toBe(0);
  });
  it('ASCII "abc": ok=true, bytes=3', () => {
    const r = checkSjis('abc');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(3);
  });
  it('日本語 "あいう": ok=true, bytes=6', () => {
    const r = checkSjis('あいう');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(6);
  });
  it('半角カナ "ｱ": ok=true, bytes=1', () => {
    const r = checkSjis('ｱ');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(1);
  });
  it('"😀" (SMP): ok=false', () => {
    const r = checkSjis('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
    expect(r.failedCount).toBeGreaterThanOrEqual(1);
  });
  it('"𠮷" (CJK Ext-B): ok=false', () => {
    const r = checkSjis('𠮷');
    expect(r.ok).toBe(false);
  });
  it('家族絵文字: ok=false', () => {
    const r = checkSjis('👨‍👩‍👧‍👦');
    expect(r.ok).toBe(false);
  });
  it('"あい😀う": ok=false (絵文字 1 文字が不可)', () => {
    const r = checkSjis('あい😀う');
    expect(r.ok).toBe(false);
  });
});

describe('checkEucJp', () => {
  it('空文字: ok=true, bytes=0', () => {
    const r = checkEucJp('');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(0);
  });
  it('ASCII "abc": ok=true, bytes=3', () => {
    const r = checkEucJp('abc');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(3);
  });
  it('日本語 "あいう": ok=true, bytes=6', () => {
    const r = checkEucJp('あいう');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(6);
  });
  it('"😀": ok=false', () => {
    const r = checkEucJp('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 陽性対照テスト: エンコーディング検知器が違反を確実に捕捉する
//
// 注: 陰性対照 (正常系 green) だけでは検知能力ゼロとの区別がつかない。
// これらのテストを旧実装に当てると必ず fail する設計にしている。
// 参考: PR #233 applyProductionCsp 空回り事故 / docs/decisions.md「陽性対照」
// ────────────────────────────────────────────────────────────

describe('[陽性対照] checkUtf8Bmp: SMP 文字 (UTF-8 で 4 byte 必要) を確実に不可検知する', () => {
  it('基本絵文字 "😀" (U+1F600, SMP) → ok=false かつ failedCount>=1', () => {
    const r = checkUtf8Bmp('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
    expect(r.failedCount).toBeGreaterThanOrEqual(1);
  });
  it('CJK Ext-B "𠮷" (U+20BB7, SMP) → ok=false', () => {
    const r = checkUtf8Bmp('𠮷');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBeGreaterThanOrEqual(1);
  });
  it('家族絵文字 "👨‍👩‍👧‍👦" (4 SMP 絵文字) → ok=false かつ failedCount=4', () => {
    const r = checkUtf8Bmp('👨‍👩‍👧‍👦');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBe(4);
  });
  it('BMP 文字中に SMP が混在 "あい😀う" → ok=false / BMP 文字は failedCount に含まない', () => {
    const r = checkUtf8Bmp('あい😀う');
    expect(r.ok).toBe(false);
    expect(r.failedCount).toBe(1);
  });
  it('全文字 BMP なら ok=false にならない (陽性対照が過検知しないことも確認)', () => {
    const r = checkUtf8Bmp('あいう漢字ABC');
    expect(r.ok).toBe(true);
    expect(r.failedCount).toBe(0);
  });
});

describe('[陽性対照] checkSjis: SJIS 表現不能文字を確実に不可検知する', () => {
  it('"😀" → ok=false / bytes は null (? 置換後 byte 数を出さない)', () => {
    const r = checkSjis('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
  });
  it('"𠮷" (CJK Ext-B) → ok=false', () => {
    const r = checkSjis('𠮷');
    expect(r.ok).toBe(false);
  });
  it('"あい😀う" → ok=false (他の BMP 文字が正常でも全体は不可)', () => {
    const r = checkSjis('あい😀う');
    expect(r.ok).toBe(false);
  });
  it('SJIS 全対応文字なら ok=false にならない (過検知なし)', () => {
    const r = checkSjis('あいうabc');
    expect(r.ok).toBe(true);
  });
});

describe('[陽性対照] checkEucJp: EUC-JP 表現不能文字を確実に不可検知する', () => {
  it('"😀" → ok=false / bytes は null', () => {
    const r = checkEucJp('😀');
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeNull();
  });
  it('"𠮷" (CJK Ext-B) → ok=false', () => {
    const r = checkEucJp('𠮷');
    expect(r.ok).toBe(false);
  });
  it('EUC-JP 対応文字は ok=false にならない (過検知なし)', () => {
    const r = checkEucJp('あいうabc');
    expect(r.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// lines
// ────────────────────────────────────────────────────────────

describe('analyzeLines', () => {
  it('空文字: total=0, newline=none', () => {
    const r = analyzeLines('');
    expect(r.total).toBe(0);
    expect(r.newline).toBe('none');
    expect(r.counts.lf).toBe(0);
    expect(r.counts.crlf).toBe(0);
    expect(r.counts.cr).toBe(0);
  });
  it('改行なし "abc": total=1, newline=none', () => {
    const r = analyzeLines('abc');
    expect(r.total).toBe(1);
    expect(r.newline).toBe('none');
  });
  it('"a\\nb\\nc": total=3, newline=lf, lf=2', () => {
    const r = analyzeLines('a\nb\nc');
    expect(r.total).toBe(3);
    expect(r.newline).toBe('lf');
    expect(r.counts.lf).toBe(2);
    expect(r.counts.crlf).toBe(0);
  });
  it('"a\\r\\nb": total=2, newline=crlf', () => {
    const r = analyzeLines('a\r\nb');
    expect(r.total).toBe(2);
    expect(r.newline).toBe('crlf');
    expect(r.counts.crlf).toBe(1);
    expect(r.counts.lf).toBe(0);
  });
  it('"a\\rb": total=2, newline=cr', () => {
    const r = analyzeLines('a\rb');
    expect(r.total).toBe(2);
    expect(r.newline).toBe('cr');
    expect(r.counts.cr).toBe(1);
  });
  it('"a\\nb\\r\\nc": total=3, newline=mixed', () => {
    const r = analyzeLines('a\nb\r\nc');
    expect(r.total).toBe(3);
    expect(r.newline).toBe('mixed');
    expect(r.counts.lf).toBe(1);
    expect(r.counts.crlf).toBe(1);
  });
  it('末尾改行 "a\\n": total=1 (末尾空行を数えない)', () => {
    const r = analyzeLines('a\n');
    expect(r.total).toBe(1);
  });
  it('"a\\n\\nb": nonEmpty=2 (空行 1 つ除く)', () => {
    const r = analyzeLines('a\n\nb');
    expect(r.total).toBe(3);
    expect(r.nonEmpty).toBe(2);
  });
  it('"あいう\\n𠮷𠮷": longestGraphemes=3 (1 行目 3 grapheme、2 行目 2 grapheme)', () => {
    const r = analyzeLines('あいう\n𠮷𠮷');
    expect(r.longestGraphemes).toBe(3);
  });
  it('"😀\\nabc": longestGraphemes=3 (2 行目 abc が最長)', () => {
    const r = analyzeLines('😀\nabc');
    expect(r.longestGraphemes).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────
// sns
// ────────────────────────────────────────────────────────────

describe('extractUrlRanges', () => {
  it('URL なし: 空配列', () => {
    expect(extractUrlRanges('hello world')).toEqual([]);
  });
  it('URL 単体: range 1 件、開始 0 / 終了 文字数', () => {
    const result = extractUrlRanges('https://example.com');
    expect(result).toEqual([{ start: 0, end: 19 }]);
  });
  it('文中の URL: 周囲のテキストを含めない range', () => {
    const result = extractUrlRanges('see https://example.com here');
    expect(result).toEqual([{ start: 4, end: 23 }]);
  });
  it('末尾句読点を URL から除外: "https://example.com." → "https://example.com"', () => {
    const result = extractUrlRanges('https://example.com.');
    expect(result).toEqual([{ start: 0, end: 19 }]);
  });
  it('連続する 2 URL: 両方 range 化', () => {
    const result = extractUrlRanges('https://a.com https://b.com');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 0, end: 13 });
    expect(result[1]).toEqual({ start: 14, end: 27 });
  });
});

describe('twitterWeight', () => {
  // 既存の基本ケース (挙動不変)
  it('空文字は 0', () => expect(twitterWeight('')).toBe(0));
  it('ASCII 1 文字は weight 1', () => expect(twitterWeight('a')).toBe(1));
  it('ASCII 10 文字は weight 10', () => expect(twitterWeight('abcdefghij')).toBe(10));
  it('日本語 1 文字は weight 2', () => expect(twitterWeight('あ')).toBe(2));
  it('日本語 5 文字は weight 10', () => expect(twitterWeight('あいうえお')).toBe(10));
  it('絵文字 "😀" は weight 2 (U+1F600 > U+10FF)', () => expect(twitterWeight('😀')).toBe(2));
  it('ASCII と日本語の混在: "abc あ" → 3+1+2=6', () => expect(twitterWeight('abc あ')).toBe(6));

  // 新仕様: URL 検知
  it('URL 単体は 23 weighted (短縮 t.co 換算)', () =>
    expect(twitterWeight('https://example.com')).toBe(23));
  it('長い URL も 23 weighted', () =>
    expect(twitterWeight('https://very-long-domain-name.example.com/path/to/resource?q=1')).toBe(
      23
    ));
  it('URL + テキスト: "Check https://example.com out" → 6 + 23 + 4 = 33', () =>
    expect(twitterWeight('Check https://example.com out')).toBe(33));
  it('URL 末尾の句読点 "." は URL に含めない: "see https://example.com." → 4 + 23 + 1 = 28', () =>
    expect(twitterWeight('see https://example.com.')).toBe(28));
  it('http:// も対象: "http://a.com" → 23', () => expect(twitterWeight('http://a.com')).toBe(23));
  it('URL 内の日本語ドメインは現状の簡易 regex で扱う (typical https? のみ正確)', () =>
    expect(twitterWeight('https://example.com/日本')).toBe(23));

  // 新仕様: trim
  it('前後空白は trim される: "  hello  " → 5', () => expect(twitterWeight('  hello  ')).toBe(5));
  it('前後空白のみは 0', () => expect(twitterWeight('   ')).toBe(0));
  it('全角空白も trim される: "　hello　" → 5', () => expect(twitterWeight('　hello　')).toBe(5));

  // 新仕様: weight-1 ranges (一般句読点)
  it('em-dash "—" (U+2014) は weight 1', () => expect(twitterWeight('—')).toBe(1));
  it('prime "′" (U+2032) は weight 1', () => expect(twitterWeight('′')).toBe(1));
  it('zero-width joiner (U+200D) は weight 1', () => expect(twitterWeight('‍')).toBe(1));
  it('horizontal ellipsis "…" (U+2026) は weight 2 (0x2010-201F 範囲外)', () =>
    expect(twitterWeight('…')).toBe(2));
  it('範囲外の punctuation "★" (U+2605) は weight 2', () => expect(twitterWeight('★')).toBe(2));

  // 範囲境界
  it('weight-1 範囲上限 U+10FF は weight 1', () => expect(twitterWeight('ჿ')).toBe(1));
  it('U+1100 (Hangul Jamo, 0x10FF 直後) は weight 2', () => expect(twitterWeight('ᄀ')).toBe(2));
  it('U+2020 (range 3 と range 4 の間隙) は weight 2', () => expect(twitterWeight('†')).toBe(2));

  // 連続 URL
  it('連続する 2 URL: "https://a.com https://b.com" → 23 + 1 + 23 = 47', () =>
    expect(twitterWeight('https://a.com https://b.com')).toBe(47));

  // 内部空白は trim 対象外
  it('内部空白は保持: "a  b" → 4', () => expect(twitterWeight('a  b')).toBe(4));

  // 改行
  it('改行 LF "a\\nb" → 3 (LF は U+0A、weight 1)', () => expect(twitterWeight('a\nb')).toBe(3));
});

describe('blueskyCount', () => {
  it('空文字は 0', () => expect(blueskyCount('')).toBe(0));
  it('"abc" は 3', () => expect(blueskyCount('abc')).toBe(3));
  it('"あいう" は 3', () => expect(blueskyCount('あいう')).toBe(3));
  it('絵文字 "😀" は 1 (grapheme cluster)', () => expect(blueskyCount('😀')).toBe(1));
  it('家族絵文字は 1', () => expect(blueskyCount('👨‍👩‍👧‍👦')).toBe(1));
});

// ────────────────────────────────────────────────────────────
// manuscript
// ────────────────────────────────────────────────────────────

describe('countGenkoSheets', () => {
  it('空文字は 0', () => expect(countGenkoSheets('')).toBe(0));
  it('400 grapheme (改行なし) は 1 枚', () => {
    const s = 'あ'.repeat(400);
    expect(countGenkoSheets(s)).toBe(1);
  });
  it('401 grapheme は 2 枚', () => {
    const s = 'あ'.repeat(401);
    expect(countGenkoSheets(s)).toBe(2);
  });
  it('改行は字数に含めない: "あ\\n" × 400 は 1 枚', () => {
    const s = 'あ\n'.repeat(400); // 改行 400 + あ 400 = あ 400 のみカウント
    expect(countGenkoSheets(s)).toBe(1);
  });
  it('1 grapheme は 1 枚', () => expect(countGenkoSheets('あ')).toBe(1));
});

describe('countParagraphs', () => {
  it('空文字は 0', () => expect(countParagraphs('')).toBe(0));
  it('空白のみは 0', () => expect(countParagraphs('   ')).toBe(0));
  it('1 段落 (改行なし) は 1', () => expect(countParagraphs('あいう')).toBe(1));
  it('"a\\n\\nb\\n\\nc" は 3 段落', () => expect(countParagraphs('a\n\nb\n\nc')).toBe(3));
  it('"a\\n\\n\\nb" (3連改行) は 2 段落', () => expect(countParagraphs('a\n\n\nb')).toBe(2));
  it('前後の空行は段落数に含めない: "\\n\\na\\n\\n" は 1', () =>
    expect(countParagraphs('\n\na\n\n')).toBe(1));
  it('CR 単独 "a\\r\\rb" は 2 段落 (Mac 旧式改行)', () =>
    expect(countParagraphs('a\r\rb')).toBe(2));
  it('CR 4 連 "a\\r\\r\\r\\rb" は 2 段落', () => expect(countParagraphs('a\r\r\r\rb')).toBe(2));
  it('CRLF 空行 "a\\r\\n\\r\\nb" は 2 段落', () => expect(countParagraphs('a\r\n\r\nb')).toBe(2));
  it('LF 直後の lone CR "a\\n\\rb" は 2 段落 (lone CR を空行として扱う)', () =>
    expect(countParagraphs('a\n\rb')).toBe(2));
  it('CR のみ "\\r\\r" は 0 段落 (本文なし)', () => expect(countParagraphs('\r\r')).toBe(0));
});

describe('countReadingMinutes', () => {
  it('空文字は 1 (最小 1 分)', () => expect(countReadingMinutes('')).toBe(1));
  it('600 grapheme は 1 分', () => {
    const s = 'あ'.repeat(600);
    expect(countReadingMinutes(s)).toBe(1);
  });
  it('601 grapheme は 2 分', () => {
    const s = 'あ'.repeat(601);
    expect(countReadingMinutes(s)).toBe(2);
  });
  it('1 grapheme は 1 分 (最小保証)', () => expect(countReadingMinutes('あ')).toBe(1));
});

describe('countEnglishWords', () => {
  it('空文字は 0', () => expect(countEnglishWords('')).toBe(0));
  it('日本語のみは 0', () => expect(countEnglishWords('あいうえお')).toBe(0));
  it('"Hello world" は 2', () => expect(countEnglishWords('Hello world')).toBe(2));
  it('"Hello, world!" は 2 (記号は単語境界)', () =>
    expect(countEnglishWords('Hello, world!')).toBe(2));
  it('日本語との混在: "Hello あ world" は 2', () =>
    expect(countEnglishWords('Hello あ world')).toBe(2));
  it('"abc123" は 0: "1" が word char のため \\b[a-zA-Z]+\\b が "abc" の末尾にマッチしない', () =>
    expect(countEnglishWords('abc123')).toBe(0));
});

// ────────────────────────────────────────────────────────────
// count (facade) — integration
// ────────────────────────────────────────────────────────────

describe('count (integration)', () => {
  it('空文字: 全項目 0 または "none"', () => {
    const r = count('');
    expect(r.chars.utf16Length).toBe(0);
    expect(r.chars.graphemes).toBe(0);
    expect(r.bytes.utf8.bytes).toBe(0);
    expect(r.bytes.utf8Bmp.ok).toBe(true);
    expect(r.lines.total).toBe(0);
    expect(r.lines.newline).toBe('none');
    expect(r.sns.twitterWeight).toBe(0);
    expect(r.manuscript.genkoSheets).toBe(0);
    expect(r.meta.inputLength).toBe(0);
    expect(r.meta.truncated).toBe(false);
  });

  it('"😀": DB 互換性チェック — utf8mb3 と SJIS は不可', () => {
    const r = count('😀');
    expect(r.chars.utf16Length).toBe(2);
    expect(r.chars.codePoints).toBe(1);
    expect(r.chars.graphemes).toBe(1);
    expect(r.bytes.utf8.ok).toBe(true);
    expect(r.bytes.utf8.bytes).toBe(4);
    expect(r.bytes.utf8Bmp.ok).toBe(false);
    expect(r.bytes.utf8Bmp.failedCount).toBe(1);
    expect(r.bytes.sjis.ok).toBe(false);
  });

  it('"☺️" (U+263A + U+FE0F): utf8mb3 は ok (BMP)、graphemes=1', () => {
    const r = count('☺️');
    expect(r.chars.codePoints).toBe(2);
    expect(r.chars.graphemes).toBe(1);
    expect(r.bytes.utf8Bmp.ok).toBe(true);
  });

  it('"あいう": utf8=9 byte, sjis=6 byte, utf8mb3 ok', () => {
    const r = count('あいう');
    expect(r.bytes.utf8.bytes).toBe(9);
    expect(r.bytes.sjis.ok).toBe(true);
    expect(r.bytes.sjis.bytes).toBe(6);
    expect(r.bytes.utf8Bmp.ok).toBe(true);
  });

  it('1MB 超入力で meta.truncated=false (処理は継続)', () => {
    const s = 'a'.repeat(1_000_001);
    const r = count(s);
    expect(r.meta.truncated).toBe(false);
    expect(r.meta.inputLength).toBe(1_000_001);
    expect(r.meta.large).toBe(true);
    // encoding-japanese の 1M 文字 round-trip が支配的で 5s デフォルトを超えるため延長
  }, 30_000);
});
