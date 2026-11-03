import { parseConfig } from './parse';
import { createMask } from './display';
import { inspectServers } from './checks';
export type Finding = {
  ruleId: string;
  serverId: string;
  pointer: string;
  reason: string;
  advice: string;
};
export type DisplayServer = {
  id: string;
  name: string;
  transport: string;
  command?: string;
  args: string[];
  destination?: string;
  envKeys: string[];
  headerKeys: string[];
  references: string[];
};
export type InspectionResult =
  { ok: false; error: string } | { ok: true; findings: Finding[]; servers: DisplayServer[] };

const invalid: InspectionResult = {
  ok: false,
  error: '対応していない形式、または制限を超えた入力です。形式とサイズを確認してください。',
};
export function inspectMcpConfig(input: string): InspectionResult {
  const parsed = parseConfig(input);
  if (!parsed) return invalid;
  const result = inspectServers(parsed.entries, createMask(parsed.secrets));
  return result ? { ok: true, ...result } : invalid;
}
