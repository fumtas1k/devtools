import { DIALECTS } from './dialects';
import type { DsnModel } from './types';

/**
 * モデル単位のバリデーション。問題なければ null、あれば日本語メッセージを返す。
 * パース結果とフォーム編集結果の両方に適用される単一の検証点。
 * 注: ホスト 1 件のみで空欄は「未入力（編集途中）」として許容する。
 */
export function validateModel(model: DsnModel): string | null {
  const dialect = DIALECTS[model.scheme];

  if (model.hosts.length > 1 && !dialect.multiHost) {
    return `${model.scheme} は複数ホストに対応していません`;
  }
  if (model.hosts.length > 1 && model.hosts.some((h) => h.host === '')) {
    return 'ホストが空の行があります';
  }
  if (dialect.srv && model.hosts.some((h) => h.port !== '')) {
    return `${model.scheme} ではポートを指定できません（SRV レコードで解決されます）`;
  }
  for (const { port } of model.hosts) {
    if (port === '') continue;
    // 1〜65535 のみ許可。先頭ゼロ（01 等）・0・非数値・範囲外を拒否する
    if (!/^[1-9]\d*$/.test(port) || Number(port) > 65535) {
      return `ポートは 1〜65535 の整数で指定してください: ${port}`;
    }
  }
  if (dialect.pathIsInteger && model.database !== '' && !/^\d+$/.test(model.database)) {
    return `${dialect.pathLabel}は整数で指定してください: ${model.database}`;
  }
  return null;
}
