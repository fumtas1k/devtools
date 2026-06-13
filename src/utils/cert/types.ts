/** 入力から検出した1件分の DER エンコード済み証明書候補 */
export interface DerCandidate {
  /** DER バイト列 */
  der: Uint8Array;
  /** 由来形式（表示・デバッグ用） */
  source: 'pem' | 'der' | 'pkcs7';
}

export interface DetectResult {
  kind: 'pem' | 'der' | 'pkcs7' | 'pkcs12' | 'empty' | 'unknown';
  candidates: DerCandidate[];
  /** PKCS#12 等の未対応形式を検出したときの理由（UI で別issue誘導に使う） */
  unsupported?: 'pkcs12';
}
