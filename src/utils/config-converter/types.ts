export type ConfigFormat = 'json' | 'yaml' | 'toml' | 'dotenv';

export interface ConvertResult {
  output: string;
  /** コメントが落ちた等のベストエフォート警告 (空配列なら警告なし) */
  warnings: string[];
}
