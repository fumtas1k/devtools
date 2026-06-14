/**
 * secret-scrubber 検出ルール定義。
 * 各ルールは正規表現・バリデータ・優先度・マスクグループを持つ。
 */

import { shannonEntropy } from './entropy';
import { makeUrlCredentialRegex } from './url-credential';

export type ScrubCategory =
  | 'API_KEY'
  | 'PRIVATE_KEY'
  | 'CREDENTIAL'
  | 'JWT'
  | 'EMAIL'
  | 'IP'
  | 'PHONE_JP'
  | 'CREDIT_CARD'
  | 'HIGH_ENTROPY';

/** カテゴリの日本語ラベル */
export const CATEGORY_LABEL: Record<ScrubCategory, string> = {
  API_KEY: 'APIキー',
  PRIVATE_KEY: '秘密鍵',
  CREDENTIAL: '認証情報',
  JWT: 'JWT',
  EMAIL: 'メール',
  IP: 'IPアドレス',
  PHONE_JP: '電話番号',
  CREDIT_CARD: 'カード番号',
  HIGH_ENTROPY: '高エントロピー',
};

export const SCRUB_CATEGORIES: ScrubCategory[] = [
  'API_KEY',
  'PRIVATE_KEY',
  'CREDENTIAL',
  'JWT',
  'EMAIL',
  'IP',
  'PHONE_JP',
  'CREDIT_CARD',
  'HIGH_ENTROPY',
];

/** デフォルトの有効/無効状態（全カテゴリ ON） */
export const DEFAULT_ENABLED: Record<ScrubCategory, boolean> = {
  API_KEY: true,
  PRIVATE_KEY: true,
  CREDENTIAL: true,
  JWT: true,
  EMAIL: true,
  IP: true,
  PHONE_JP: true,
  CREDIT_CARD: true,
  HIGH_ENTROPY: true,
};

/** 全カテゴリ 0 の件数オブジェクトを返す（手書きリテラルの重複・drift 防止） */
export function emptyCounts(): Record<ScrubCategory, number> {
  return Object.fromEntries(SCRUB_CATEGORIES.map((c) => [c, 0])) as Record<ScrubCategory, number>;
}

export interface ScrubRule {
  id: string;
  category: ScrubCategory;
  /** マッチ全体か、指定グループのみをマスクするか（キー名・URLホストを残す用途） */
  maskGroup?: number;
  pattern: RegExp;
  /** 追加検証（バリデーション通過時のみマスク） */
  validate?: (match: string) => boolean;
  /** 高い優先度を持つルールが同じ範囲で衝突したとき優先される（数値大=優先） */
  priority: number;
}

/**
 * IPv4 アドレスの各オクテットが 0〜255 であることを検証する。
 * json-formatter/mask.ts の isValidIpv4 と同等ロジック。
 */
function isValidIpv4(s: string): boolean {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => Number(p) <= 255);
}

/**
 * Luhn アルゴリズムでクレジットカード番号を検証する。
 * json-formatter/mask.ts の luhnOk と同等ロジック。
 */
function luhnOk(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * UUID 形式（8-4-4-4-12 の hex）を検出する正規表現。
 * HIGH_ENTROPY から除外するために使う。
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** すべての検出ルール（priority 降順に使われる）。 */
export const SCRUB_RULES: ScrubRule[] = [
  // ── API_KEY ──────────────────────────────────────────────────────────────
  {
    id: 'AWS_ACCESS_KEY',
    category: 'API_KEY',
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    priority: 90,
  },
  {
    id: 'GITHUB_TOKEN',
    category: 'API_KEY',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
    priority: 90,
  },
  {
    id: 'GITHUB_FINE_PAT',
    category: 'API_KEY',
    pattern: /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/g,
    priority: 90,
  },
  {
    id: 'GITLAB_PAT',
    category: 'API_KEY',
    pattern: /\bglpat-[\w-]{20,}\b/g,
    priority: 90,
  },
  {
    id: 'SLACK_TOKEN',
    category: 'API_KEY',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    priority: 90,
  },
  {
    id: 'STRIPE_KEY',
    category: 'API_KEY',
    pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    priority: 90,
  },
  {
    id: 'GOOGLE_API_KEY',
    category: 'API_KEY',
    pattern: /\bAIza[\w-]{35}\b/g,
    priority: 90,
  },
  {
    id: 'SENDGRID_KEY',
    category: 'API_KEY',
    pattern: /\bSG\.[\w-]{16,32}\.[\w-]{16,64}\b/g,
    priority: 90,
  },
  {
    id: 'ANTHROPIC_KEY',
    category: 'API_KEY',
    // OPENAI_KEY より priority 上にすることで sk-ant- を確実にキャッチする
    pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g,
    priority: 92,
  },
  {
    id: 'OPENAI_KEY',
    category: 'API_KEY',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
    priority: 91,
  },
  {
    id: 'NPM_TOKEN',
    category: 'API_KEY',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    priority: 90,
  },

  // ── PRIVATE_KEY ───────────────────────────────────────────────────────────
  {
    id: 'PRIVATE_KEY_PEM',
    category: 'PRIVATE_KEY',
    // 非貪欲で BEGIN 〜 END ブロック全体をマスク
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    priority: 95,
  },

  // ── CREDENTIAL ────────────────────────────────────────────────────────────
  // maskGroup ルールは d フラグ必須（exec 結果の indices からグループの正確な位置を取るため。
  // indexOf による位置探索はキー名と値が同一文字列のとき値側を取り違えて漏えいする）
  {
    id: 'CREDENTIAL_ASSIGN',
    category: 'CREDENTIAL',
    // キー名は残し、値部分のみマスク（グループ 1）。日本語キー名・全角コロン/イコール・JSON 形式にも対応
    pattern:
      /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|credential|パスワード|シークレット|トークン|秘密鍵|認証キー)(?:["'])?\s*[:=：＝]\s*['"]?([^\s'",;]{6,})/dgi,
    maskGroup: 1,
    priority: 80,
  },
  {
    id: 'CREDENTIAL_URL',
    category: 'CREDENTIAL',
    // URL 認証情報: パスワード部（グループ 2）のみマスク。共有ビルダーで sanitize.ts と一本化。
    // 自由テキスト走査では scheme を必須にして非 URL 断片の誤検出を防ぐ（requireScheme: true）。
    pattern: makeUrlCredentialRegex({ flags: 'dgi', requireScheme: true }),
    maskGroup: 2,
    priority: 80,
  },
  {
    id: 'CREDENTIAL_AUTH_HEADER',
    category: 'CREDENTIAL',
    // Authorization / x-api-key ヘッダ: トークン部（グループ 1）のみマスク
    pattern:
      /(?:authorization|x-api-key)\s*:\s*(?:bearer|basic|token)?\s*([A-Za-z0-9._~+/=-]{8,})/dgi,
    maskGroup: 1,
    priority: 80,
  },

  // ── JWT ───────────────────────────────────────────────────────────────────
  {
    id: 'JWT_TOKEN',
    category: 'JWT',
    pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
    priority: 85,
  },

  // ── EMAIL ─────────────────────────────────────────────────────────────────
  {
    id: 'EMAIL',
    category: 'EMAIL',
    // ドメインは「.+セグメント」の繰り返しで終端し、文末ピリオドを巻き込まない
    pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    priority: 60,
  },

  // ── IP ────────────────────────────────────────────────────────────────────
  {
    id: 'IPV4',
    category: 'IP',
    pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
    validate: isValidIpv4,
    priority: 50,
  },

  // ── PHONE_JP ──────────────────────────────────────────────────────────────
  {
    id: 'PHONE_JP_HYPHEN',
    category: 'PHONE_JP',
    // ハイフン必須でログ中の誤検出を抑制
    pattern: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g,
    priority: 55,
  },
  {
    id: 'PHONE_JP_INTL',
    category: 'PHONE_JP',
    pattern: /\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g,
    priority: 55,
  },

  // ── CREDIT_CARD ───────────────────────────────────────────────────────────
  {
    id: 'CREDIT_CARD',
    category: 'CREDIT_CARD',
    pattern: /\b\d(?:[ -]?\d){12,15}\b/g,
    validate: luhnOk,
    priority: 65,
  },

  // ── HIGH_ENTROPY ──────────────────────────────────────────────────────────
  // 他ルールより priority が低いため、上のルールが既にカバーした範囲は除外される
  {
    id: 'HIGH_ENTROPY_BASE64',
    category: 'HIGH_ENTROPY',
    // base64 風（標準・URL-safe 混在）
    pattern: /\b[A-Za-z0-9+/=_-]{24,}\b/g,
    validate: (s) => {
      // UUID 形式は除外（識別子の可能性が高い）
      if (UUID_RE.test(s)) return false;
      // Shannon エントロピー ≥ 4.0 bits/char を要求
      return shannonEntropy(s) >= 4.0;
    },
    priority: 10,
  },
  {
    id: 'HIGH_ENTROPY_HEX',
    category: 'HIGH_ENTROPY',
    // hex はアルファベット種が少ない（最大 4 bits/char）ため base64 より低い閾値
    pattern: /\b[0-9a-f]{32,}\b/gi,
    validate: (s) => shannonEntropy(s) >= 3.0,
    priority: 10,
  },
];
