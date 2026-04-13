import { useState } from 'react';

/**
 * 数値入力フィールド用フック。
 * 入力中は文字列のまま保持し、blur 時に min/max でクランプして確定する。
 */
export function useClampedInput(initial: number, min: number, max: number) {
  const [value, setValue] = useState(initial);
  const [inputStr, setInputStr] = useState(String(initial));

  const handleChange = (raw: string) => {
    setInputStr(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= min && n <= max) setValue(n);
  };

  const handleBlur = () => {
    const n = parseInt(inputStr, 10);
    if (isNaN(n) || n < min) {
      setValue(min);
      setInputStr(String(min));
    } else if (n > max) {
      setValue(max);
      setInputStr(String(max));
    } else {
      setValue(n);
      setInputStr(String(n));
    }
  };

  return { value, inputStr, handleChange, handleBlur };
}
