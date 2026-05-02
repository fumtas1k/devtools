// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClampedInput } from '@/hooks/useClampedInput';

describe('useClampedInput', () => {
  describe('初期値', () => {
    it('initial 値で value と inputStr が初期化される', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));
      expect(result.current.value).toBe(5);
      expect(result.current.inputStr).toBe('5');
    });
  });

  describe('handleChange — 入力中の挙動', () => {
    it('範囲内の値を入力すると value が即時更新される', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('7');
      });

      expect(result.current.inputStr).toBe('7');
      expect(result.current.value).toBe(7);
    });

    it('min と等しい値を入力すると value が更新される', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('1');
      });

      expect(result.current.value).toBe(1);
    });

    it('max と等しい値を入力すると value が更新される', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('10');
      });

      expect(result.current.value).toBe(10);
    });

    it('範囲外（max 超）の文字列を入力すると inputStr は更新されるが value は前の値のまま', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('99');
      });

      expect(result.current.inputStr).toBe('99');
      // 範囲外なので value は更新されない
      expect(result.current.value).toBe(5);
    });

    it('範囲外（min 未満）の文字列を入力すると inputStr は更新されるが value は前の値のまま', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('0');
      });

      expect(result.current.inputStr).toBe('0');
      expect(result.current.value).toBe(5);
    });

    it('非数値文字を入力すると inputStr は更新されるが value は前の値のまま', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('abc');
      });

      expect(result.current.inputStr).toBe('abc');
      expect(result.current.value).toBe(5);
    });
  });

  describe('handleBlur — フォーカスを外したときのクランプ確定', () => {
    it('範囲内の入力は blur 後もそのままの値になる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('8');
      });
      act(() => {
        result.current.handleBlur();
      });

      expect(result.current.value).toBe(8);
      expect(result.current.inputStr).toBe('8');
    });

    it('max 超の入力は blur 後に max にクランプされる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('99');
      });
      act(() => {
        result.current.handleBlur();
      });

      expect(result.current.value).toBe(10);
      expect(result.current.inputStr).toBe('10');
    });

    it('min 未満の入力は blur 後に min にクランプされる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('0');
      });
      act(() => {
        result.current.handleBlur();
      });

      expect(result.current.value).toBe(1);
      expect(result.current.inputStr).toBe('1');
    });

    it('非数値の入力は blur 後に min にクランプされる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('abc');
      });
      act(() => {
        result.current.handleBlur();
      });

      expect(result.current.value).toBe(1);
      expect(result.current.inputStr).toBe('1');
    });

    it('空文字列の入力は blur 後に min にクランプされる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('');
      });
      act(() => {
        result.current.handleBlur();
      });

      expect(result.current.value).toBe(1);
      expect(result.current.inputStr).toBe('1');
    });
  });

  describe('文字列→数値変換', () => {
    it('小数点付き入力は parseInt で切り捨てられる', () => {
      const { result } = renderHook(() => useClampedInput(5, 1, 10));

      act(() => {
        result.current.handleChange('3.9');
      });
      act(() => {
        result.current.handleBlur();
      });

      // parseInt('3.9', 10) = 3
      expect(result.current.value).toBe(3);
      expect(result.current.inputStr).toBe('3');
    });
  });
});
