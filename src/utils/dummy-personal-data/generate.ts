import {
  SURNAMES,
  GIVEN_NAMES,
  ADDRESSES,
} from './dictionaries';
import type { Gender, PersonRecord } from './types';

/** 配列から 1 要素をランダム選択 */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** min〜max（両端含む）の整数乱数 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 任意桁のランダム数字文字列 */
export function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(randomInt(0, 9));
  return s;
}

export interface PickedName {
  name: string; // 漢字（区切り適用済み）
  kana: string; // 読み（同じ区切り適用済み）
  surnameRomaji: string;
  givenRomaji: string;
}

/** 性別に応じた氏名を生成。separator は姓名の区切り（'' / ' ' / '　'） */
export function pickName(gender: Gender, separator: string): PickedName {
  const sei = pickRandom(SURNAMES);
  // その他・不明は男女どちらの名でも可
  const pool =
    gender === 'その他・不明' ? GIVEN_NAMES : GIVEN_NAMES.filter((g) => g.gender === gender);
  const mei = pickRandom(pool);
  return {
    name: `${sei.kanji}${separator}${mei.kanji}`,
    kana: `${sei.yomi}${separator}${mei.yomi}`,
    surnameRomaji: sei.romaji,
    givenRomaji: mei.romaji,
  };
}

/**
 * 氏名（漢字）と読みが辞書のペアと整合するか検証する（テスト用ガード）。
 * 区切り文字（半角/全角スペース）を除去してから、姓・名それぞれが
 * 同一辞書エントリのペアであることを確認する。
 */
export function isConsistentName(name: string, kana: string): boolean {
  const stripSep = (s: string) => s.replace(/[\s　]/g, '');
  const n = stripSep(name);
  const k = stripSep(kana);
  for (const sei of SURNAMES) {
    if (!n.startsWith(sei.kanji) || !k.startsWith(sei.yomi)) continue;
    const restN = n.slice(sei.kanji.length);
    const restK = k.slice(sei.yomi.length);
    if (GIVEN_NAMES.some((mei) => mei.kanji === restN && mei.yomi === restK)) return true;
  }
  return false;
}

/** birth 時点から today 時点の満年齢を計算 */
export function computeAge(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * [ageMin, ageMax] の年齢を持つ生年月日を生成する。
 * 「today - age 年」を基準日とし、そこから 0〜364 日さかのぼることで、
 * 次の誕生日に到達しない範囲（＝満年齢が age のまま）の日付を作る。
 */
export function pickBirthday(
  ageMin: number,
  ageMax: number,
  today: Date
): { date: Date; age: number } {
  const age = randomInt(ageMin, ageMax);
  const base = new Date(today.getFullYear() - age, today.getMonth(), today.getDate());
  const daysBack = randomInt(0, 364);
  const date = new Date(base.getTime() - daysBack * 86400000);
  return { date, age: computeAge(date, today) };
}

/** YYYY年MM月DD日 書式（月日ゼロ埋め） */
export function formatBirthday(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}年${mm}月${dd}日`;
}

export interface PickedAddress {
  postalCode: string; // NNN-NNNN
  address: string;
  phone: string; // 固定電話
}

/** 住所・郵便番号・固定電話を整合させて生成 */
export function pickAddress(): PickedAddress {
  const e = pickRandom(ADDRESSES);
  const postalCode = `${e.zip.slice(0, 3)}-${e.zip.slice(3)}`;
  const address = `${e.pref}${e.city}${randomInt(1, 5)}丁目${randomInt(1, 20)}-${randomInt(1, 30)}`;
  // 固定電話: 全体 10 桁（先頭 0 含む）。末尾 4 桁を加入者番号、市外局番との
  // 残り桁を市内局番として 3 分割（areaCode-middle-last）。
  const subscriberLen = 10 - e.areaCode.length; // 例 03→8, 045→7, 0258→6
  const lastLen = 4;
  const middleLen = subscriberLen - lastLen;
  const middle = randomDigits(middleLen);
  const last = randomDigits(lastLen);
  const phone = `${e.areaCode}-${middle}-${last}`;
  return { postalCode, address, phone };
}

/** 実在しない確度の高い携帯番号を生成（090-0XXX-XXXX / 070-0XXX-XXXX） */
export function pickMobile(): string {
  const prefix = pickRandom(['090', '070']);
  const rest = '0' + randomDigits(7); // 第4桁を 0 固定（音声携帯の割当対象外）
  return `${prefix}-${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/**
 * 携帯番号が「実在しない確度の高い帯」かを検証する（テスト用ガード）。
 * 条件: 11 桁・先頭 090 または 070・第 4 桁が 0。
 * 0800（フリーダイヤル）/ 0600（FMC）/ C≠0 の実在音声携帯帯は false。
 */
export function isNonExistentMobile(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const prefix = digits.slice(0, 3);
  if (prefix !== '090' && prefix !== '070') return false;
  return digits[3] === '0';
}

const EMAIL_DOMAINS = ['example.com', 'example.jp', 'example.net', 'example.org'];

/** ローマ字姓名からメールアドレスを生成（example.* 予約ドメイン） */
export function pickEmail(surnameRomaji: string, givenRomaji: string): string {
  const seps = ['.', '_', ''];
  const local = `${surnameRomaji}${pickRandom(seps)}${givenRomaji}${pickRandom(['', String(randomInt(1, 99))])}`;
  return `${local}@${pickRandom(EMAIL_DOMAINS)}`;
}

export interface GenerateOptions {
  ageMin: number;
  ageMax: number;
  separator: string; // 氏名区切り
}

/** 性別を確率的に決定（男/女 ≒ 各 49%、その他・不明 ≒ 2%） */
function pickGender(): Gender {
  const r = Math.random();
  if (r < 0.49) return '男';
  if (r < 0.98) return '女';
  return 'その他・不明';
}

/** 1 レコード生成 */
export function generateRecord(opts: GenerateOptions, today: Date = new Date()): PersonRecord {
  const gender = pickGender();
  const nm = pickName(gender, opts.separator);
  const bd = pickBirthday(opts.ageMin, opts.ageMax, today);
  const addr = pickAddress();
  return {
    name: nm.name,
    kana: nm.kana,
    gender,
    birthday: formatBirthday(bd.date),
    age: String(bd.age),
    postalCode: addr.postalCode,
    address: addr.address,
    phone: addr.phone,
    mobile: pickMobile(),
    email: pickEmail(nm.surnameRomaji, nm.givenRomaji),
  };
}

/** count 件を生成 */
export function generateRecords(
  count: number,
  opts: GenerateOptions,
  today: Date = new Date()
): PersonRecord[] {
  const out: PersonRecord[] = [];
  for (let i = 0; i < count; i++) out.push(generateRecord(opts, today));
  return out;
}
