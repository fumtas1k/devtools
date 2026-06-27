/** 出力フィールドのキー */
export type FieldKey =
  | 'name'
  | 'kana'
  | 'gender'
  | 'birthday'
  | 'age'
  | 'postalCode'
  | 'address'
  | 'phone'
  | 'mobile'
  | 'email';

/** 1 人分の生成レコード（全フィールドを文字列で保持） */
export type PersonRecord = Record<FieldKey, string>;

/** UI のチェック・CSV ヘッダで使う日本語ラベル（表示順を兼ねる） */
export const FIELD_DEFS: { key: FieldKey; label: string }[] = [
  { key: 'name', label: '氏名' },
  { key: 'kana', label: 'フリガナ' },
  { key: 'gender', label: '性別' },
  { key: 'birthday', label: '生年月日' },
  { key: 'age', label: '年齢' },
  { key: 'postalCode', label: '郵便番号' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'mobile', label: '携帯電話番号' },
  { key: 'email', label: 'メールアドレス' },
];

/** 氏名は常に出力する（OFF 不可） */
export const REQUIRED_FIELDS: FieldKey[] = ['name'];

/** 性別の値 */
export type Gender = '男' | '女' | 'その他・不明';

/** 氏名辞書エントリ */
export interface NameEntry {
  kanji: string;
  yomi: string; // ひらがな
  romaji: string; // ヘボン式・小文字
}

/** 名（given name）は性別タグを持つ */
export interface GivenNameEntry extends NameEntry {
  gender: '男' | '女';
}

/** 住所辞書エントリ（郵便番号・都道府県・市区町村・固定電話の市外局番が整合） */
export interface AddressEntry {
  zip: string; // 7 桁ハイフンなし
  pref: string;
  city: string;
  areaCode: string; // 先頭 0 を含む（例 "03", "045", "0258"）
}
