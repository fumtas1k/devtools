import { describe, it, expect } from 'vitest';
import {
  calcGtin14CheckDigit,
  validateGtin14Input,
  buildBwipText,
  escapeHtml,
  injectCompositeText,
  AI_DEFS,
  type AiCode,
} from '@/utils/gs1-databar';

// ────────────────────────────────────────────
// AI_DEFS: isVariableLength
// ────────────────────────────────────────────
// ... (omitted existing tests for brevity in reasoning, will include all in actual tool call)
describe('AI_DEFS isVariableLength', () => {
  it('固定長AI (17, 11, 15) は isVariableLength=false', () => {
    const fixedAis = ['17', '11', '15'];
    for (const ai of fixedAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be fixed-length`).toBe(false);
    }
  });

  it('可変長AI (10, 21) は isVariableLength=true', () => {
    const variableAis = ['10', '21'];
    for (const ai of variableAis) {
      const def = AI_DEFS.find((d) => d.ai === ai);
      expect(def?.isVariableLength, `AI ${ai} should be variable-length`).toBe(true);
    }
  });
});

// ────────────────────────────────────────────
// calcGtin14CheckDigit
// ────────────────────────────────────────────
describe('calcGtin14CheckDigit', () => {
  it('0498700000001 → チェックディジット 7', () => {
    // 左から: 0×3 4×1 9×3 8×1 7×3 0×1 0×3 0×1 0×3 0×1 0×3 0×1 1×3
    // = 0+4+27+8+21+0+0+0+0+0+0+0+3 = 63; check=(10-3)%10=7
    const r = calcGtin14CheckDigit('0498700000001');
    expect(r.checkDigit).toBe(7);
    expect(r.fullGtin).toBe('04987000000017');
  });

  it('0000000000000 → チェックディジット 0', () => {
    const r = calcGtin14CheckDigit('0000000000000');
    expect(r.checkDigit).toBe(0);
    expect(r.fullGtin).toBe('00000000000000');
  });

  it('0100000000001 → チェックディジット 5', () => {
    // 0×3+1×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+0×3+0×1+1×3
    // = 0+1+0+0+0+0+0+0+0+0+0+0+3 = 4; check=(10-4)=6... let's recalc
    // positions: i=0(0×3=0) i=1(1×1=1) i=2(0×3=0) i=3(0×1=0) i=4(0×3=0)
    //            i=5(0×1=0) i=6(0×3=0) i=7(0×1=0) i=8(0×3=0) i=9(0×1=0)
    //            i=10(0×3=0) i=11(0×1=0) i=12(1×3=3) sum=4
    // check=(10-4)%10=6
    const r = calcGtin14CheckDigit('0100000000001');
    expect(r.checkDigit).toBe(6);
    expect(r.fullGtin).toBe('01000000000016');
  });

  it('先頭0のGTIN-14: 0012345678901 → 正しいチェックディジット', () => {
    // 0×3+0×1+1×3+2×1+3×3+4×1+5×3+6×1+7×3+8×1+9×3+0×1+1×3
    // = 0+0+3+2+9+4+15+6+21+8+27+0+3 = 98; check=(10-8)%10=2
    const r = calcGtin14CheckDigit('0012345678901');
    expect(r.checkDigit).toBe(2);
    expect(r.fullGtin).toBe('00123456789012');
  });
});

// ────────────────────────────────────────────
// validateGtin14Input
// ────────────────────────────────────────────
describe('validateGtin14Input', () => {
  it('空文字はエラーなし', () => {
    expect(validateGtin14Input('')).toBe('');
  });

  it('正しい13桁の先頭0はエラーなし', () => {
    expect(validateGtin14Input('0498700000001')).toBe('');
  });

  it('正しい13桁の先頭1はエラーなし', () => {
    expect(validateGtin14Input('1234567890123')).toBe('');
  });

  it('数字以外はエラー', () => {
    expect(validateGtin14Input('049870000000a')).toBe('数字のみ入力してください');
  });

  it('桁数不足はエラー', () => {
    expect(validateGtin14Input('0498700')).toContain('13桁');
  });

  it('桁数超過はエラー', () => {
    expect(validateGtin14Input('04987000000011')).toContain('13桁');
  });

  it('先頭桁が2以上はエラー', () => {
    expect(validateGtin14Input('2498700000001')).toContain('0 または 1');
    expect(validateGtin14Input('9498700000001')).toContain('0 または 1');
  });
});

// ────────────────────────────────────────────
// buildBwipText
// ────────────────────────────────────────────
describe('buildBwipText', () => {
  it('合成フィールドなし → linear部のみ', () => {
    const result = buildBwipText('04987000000017', []);
    expect(result).toBe('(01)04987000000017');
  });

  it('空値のフィールドは除外される', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '' },
      { ai: '10' as AiCode, value: '' },
    ]);
    expect(result).toBe('(01)04987000000017');
  });

  it('1つのAIフィールド', () => {
    const result = buildBwipText('04987000000017', [{ ai: '17' as AiCode, value: '231231' }]);
    expect(result).toBe('(01)04987000000017|(17)231231');
  });

  it('複数のAIフィールド', () => {
    const result = buildBwipText('04987000000017', [
      { ai: '17' as AiCode, value: '231231' },
      { ai: '10' as AiCode, value: 'ABC123' },
    ]);
    expect(result).toBe('(01)04987000000017|(17)231231(10)ABC123');
  });

  it('値の前後スペースはトリムされる', () => {
    const result = buildBwipText('04987000000017', [{ ai: '10' as AiCode, value: '  ABC  ' }]);
    expect(result).toBe('(01)04987000000017|(10)ABC');
  });
});

// ────────────────────────────────────────────
// escapeHtml
// ────────────────────────────────────────────
describe('escapeHtml', () => {
  it('特殊文字をエスケープする', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('通常の文字列はそのまま', () => {
    expect(escapeHtml('ABC123')).toBe('ABC123');
    expect(escapeHtml('231231')).toBe('231231');
  });

  it('混合文字列を正しくエスケープする', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });
});

// ────────────────────────────────────────────
// injectCompositeText
// ────────────────────────────────────────────
describe('injectCompositeText', () => {
  const mockSvg =
    '<svg width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" /></svg>';

  it('テキストをエスケープして挿入する', () => {
    const payload = '</text><script>alert(1)</script><text>';
    const result = injectCompositeText(mockSvg, payload);

    expect(result).not.toContain(payload);
    expect(result).toContain('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;text&gt;');
  });

  it('エスケープ後の文字数ではなく、元の文字数で幅を計算する', () => {
    // & が 5 つある場合、エスケープ後は 25 文字になるが、描画幅は 5 文字分であるべき
    const longPayload = '&&&&&'; // エスケープ後: &amp;&amp;&amp;&amp;&amp; (25 chars)
    const result = injectCompositeText(mockSvg, longPayload);

    // 18 * 0.6 = 10.8 (charW)
    // 5 * 10.8 + 16 (padding) = 54 + 16 = 70 (estimatedTextW)
    // newW = max(100, 70) = 100
    // もし 25 文字で計算すると 25 * 10.8 + 16 = 270 + 16 = 286 になるはず
    const vbMatch = result.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const width = parseFloat(vbMatch![1]);
    expect(width).toBeLessThan(200); // 286 より明らかに小さいことを確認
    expect(width).toBe(100);
  });

  it('テキストが空の場合は元の SVG を返す', () => {
    const result = injectCompositeText(mockSvg, '');
    expect(result).toBe(mockSvg);
  });

  it('viewBox が存在しない場合は元の SVG を返す', () => {
    const noVbSvg = '<svg width="100" height="100"><rect /></svg>';
    const result = injectCompositeText(noVbSvg, 'test');
    expect(result).toBe(noVbSvg);
  });

  it('caller が raw HTML を渡しても sink が escape する (sink-side escape contract)', () => {
    // caller responsibility ではなく callee 側で escape する設計契約の回帰防止。
    // 旧実装 (caller 側 escape) では二重 escape で &amp;amp; が残る事故につながる。
    const rawHtml = 'A & B & C';
    const result = injectCompositeText(mockSvg, rawHtml);
    // sink 側で escape されているため &amp; に変換されていること
    expect(result).toContain('A &amp; B &amp; C');
    // 二重 escape されていないこと (&amp;amp; が残らないこと)
    expect(result).not.toContain('&amp;amp;');
  });
});
