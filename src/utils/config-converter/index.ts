export type { ConfigFormat, ConvertResult } from './types';

import type { ConfigFormat, ConvertResult } from './types';
import { parseJson, stringifyJson } from './json';
import { parseYaml, stringifyYaml, formatYaml } from './yaml';
import { parseToml, stringifyToml } from './toml';
import { parseDotenv, stringifyDotenv } from './dotenv';

function parseFrom(text: string, format: ConfigFormat): unknown {
  switch (format) {
    case 'json':
      return parseJson(text);
    case 'yaml':
      return parseYaml(text);
    case 'toml':
      return parseToml(text);
    case 'dotenv':
      return parseDotenv(text);
  }
}

function stringifyTo(value: unknown, format: ConfigFormat): string {
  switch (format) {
    case 'json':
      return stringifyJson(value);
    case 'yaml':
      return stringifyYaml(value);
    case 'toml':
      return stringifyToml(value);
    case 'dotenv':
      return stringifyDotenv(value);
  }
}

/** 設定ファイルを指定フォーマット間で変換する */
export function convert(text: string, from: ConfigFormat, to: ConfigFormat): ConvertResult {
  const warnings: string[] = [];

  // 同一フォーマットの整形
  if (from === to) {
    if (from === 'yaml') {
      return { output: formatYaml(text), warnings: [] };
    }
    if (from === 'toml') {
      warnings.push('TOMLは整形時にコメントが失われます');
    }
    const value = parseFrom(text, from);
    const output = stringifyTo(value, to);
    return { output, warnings };
  }

  // 異なるフォーマット間の変換
  if (from === 'yaml' || from === 'toml') {
    warnings.push('コメントは変換時に失われます');
  }
  if (to === 'dotenv') {
    warnings.push('値はすべて文字列に変換されます');
  }
  if (from === 'dotenv') {
    warnings.push('値はすべて文字列として読み込まれます');
  }

  const value = parseFrom(text, from);
  const output = stringifyTo(value, to);

  return { output, warnings };
}

/** テキストのフォーマットをヒューリスティックに検出する */
export function detectFormat(text: string): ConfigFormat | null {
  const trimmed = text.trim();

  if (trimmed === '') {
    return null;
  }

  // TOML: [section] パターン — JSON の配列より先にチェック
  if (/^\[[\w.]+\]/m.test(trimmed)) {
    return 'toml';
  }

  // JSON: { または [ で始まる
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  // YAML: --- で始まる、または key: value パターンを含む
  if (trimmed.startsWith('---')) {
    return 'yaml';
  }

  // YAML: key: value パターン (TOMLの後にチェック)
  if (/^[\w-]+\s*:(\s|$)/m.test(trimmed)) {
    return 'yaml';
  }

  // dotenv: KEY=VALUE パターン
  if (/^[A-Z_][A-Z0-9_]*=.*/im.test(trimmed)) {
    return 'dotenv';
  }

  return null;
}
