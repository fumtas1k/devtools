import { useState, useCallback } from 'react';
import { useClampedInput } from '@/hooks/useClampedInput';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { ActionButton } from '@/components/ui/ActionButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { downloadText } from '@/utils/download';
import { generateRecords, generationSignature } from '@/utils/dummy-personal-data/generate';
import { toCsv, toJson } from '@/utils/dummy-personal-data/serialize';
import { FIELD_DEFS, REQUIRED_FIELDS } from '@/utils/dummy-personal-data/types';
import type { FieldKey, PersonRecord } from '@/utils/dummy-personal-data/types';

const PREVIEW_LIMIT = 20;
const MAX_COUNT = 3000;

type SepValue = 'half' | 'full' | 'none';
const SEP_MAP: Record<SepValue, string> = { half: ' ', full: '　', none: '' };

type Format = 'csv' | 'json';

export function DummyPersonalDataTool() {
  const {
    value: count,
    inputStr: countInput,
    handleChange: onCount,
    handleBlur: onCountBlur,
  } = useClampedInput(100, 1, MAX_COUNT);
  const {
    value: ageMin,
    inputStr: ageMinInput,
    handleChange: onAgeMin,
    handleBlur: onAgeMinBlur,
  } = useClampedInput(20, 0, 120);
  const {
    value: ageMax,
    inputStr: ageMaxInput,
    handleChange: onAgeMax,
    handleBlur: onAgeMaxBlur,
  } = useClampedInput(80, 0, 120);
  const [sep, setSep] = useState<SepValue>('half');
  const [format, setFormat] = useState<Format>('csv');
  const [selected, setSelected] = useState<Set<FieldKey>>(
    () => new Set(FIELD_DEFS.map((f) => f.key))
  );
  const [records, setRecords] = useState<PersonRecord[]>([]);
  const [seqId, setSeqId] = useState(false);
  const [unique, setUnique] = useState(false);
  // 直近の「生成」時点の生成条件署名。null は未生成。
  const [lastGenSig, setLastGenSig] = useState<string | null>(null);

  const fields = FIELD_DEFS.filter((f) => selected.has(f.key)).map((f) => f.key);

  // 現在の生成条件署名。生成後にこれが lastGenSig と乖離したらプレビューは stale（要再生成）。
  const currentSig = generationSignature({
    count,
    ageMin,
    ageMax,
    separator: SEP_MAP[sep],
    unique,
  });
  const isStale = records.length > 0 && lastGenSig !== null && currentSig !== lastGenSig;

  const toggleField = useCallback((key: FieldKey) => {
    if (REQUIRED_FIELDS.includes(key)) return; // 氏名は常時 ON
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const generate = useCallback(() => {
    const lo = Math.min(ageMin, ageMax);
    const hi = Math.max(ageMin, ageMax);
    setRecords(generateRecords(count, { ageMin: lo, ageMax: hi, separator: SEP_MAP[sep], unique }));
    setLastGenSig(generationSignature({ count, ageMin, ageMax, separator: SEP_MAP[sep], unique }));
  }, [count, ageMin, ageMax, sep, unique]);

  const download = useCallback(() => {
    if (records.length === 0) return;
    if (format === 'csv') {
      downloadText(toCsv(records, fields, seqId), 'dummy-personal-data.csv', 'text/csv');
    } else {
      downloadText(toJson(records, fields, seqId), 'dummy-personal-data.json', 'application/json');
    }
  }, [records, fields, format, seqId]);

  const preview = records.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-6">
      <NotificationBanner variant="warning" title="架空のテストデータです">
        生成される氏名・住所・電話番号・メールアドレスはすべて開発／検証用の架空データであり、実在の個人・連絡先ではありません。電話番号・携帯番号は形式的に生成したもので、実在を保証しません。
      </NotificationBanner>

      {/* 生成条件（変更後は「生成」を押すまでプレビューに反映されない） */}
      <section className="space-y-4">
        <div>
          <p className="body-emphasis text-default">生成条件</p>
          <p className="caption text-muted">
            変更したら「生成」を押し直すとプレビューに反映されます。
          </p>
        </div>

        {/* 出力件数・年齢範囲 */}
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div>
            <label htmlFor="dpd-count" className="body-emphasis text-default block mb-1">
              出力する人数
            </label>
            <input
              id="dpd-count"
              type="number"
              min={1}
              max={MAX_COUNT}
              value={countInput}
              onChange={(e) => onCount(e.target.value)}
              onBlur={onCountBlur}
              className="rounded-lg px-3 py-2 caption w-32 border border-input bg-default text-default"
            />
            <p className="caption text-muted mt-1">1〜{MAX_COUNT}人</p>
          </div>
          <div>
            <p className="body-emphasis text-default mb-1">年齢範囲</p>
            <div className="flex items-center gap-2">
              <input
                id="dpd-age-min"
                aria-label="年齢下限"
                type="number"
                min={0}
                max={120}
                value={ageMinInput}
                onChange={(e) => onAgeMin(e.target.value)}
                onBlur={onAgeMinBlur}
                className="rounded-lg px-3 py-2 caption w-20 border border-input bg-default text-default"
              />
              <span className="caption text-muted">歳 〜</span>
              <input
                id="dpd-age-max"
                aria-label="年齢上限"
                type="number"
                min={0}
                max={120}
                value={ageMaxInput}
                onChange={(e) => onAgeMax(e.target.value)}
                onBlur={onAgeMaxBlur}
                className="rounded-lg px-3 py-2 caption w-20 border border-input bg-default text-default"
              />
              <span className="caption text-muted">歳</span>
            </div>
          </div>
        </div>

        {/* 氏名区切り */}
        <div>
          <p className="body-emphasis text-default mb-1">氏名の区切り</p>
          <ToggleGroup<SepValue>
            options={[
              { value: 'half', label: '半角スペース' },
              { value: 'full', label: '全角スペース' },
              { value: 'none', label: 'なし' },
            ]}
            value={sep}
            onChange={setSep}
            ariaLabel="氏名の区切り"
          />
        </div>

        {/* 一意化（要再生成） */}
        <ToggleChips<'unique'>
          legend="一意化"
          options={[{ value: 'unique', label: 'メール・電話番号を一意化' }]}
          selected={() => unique}
          onToggle={() => setUnique((p) => !p)}
        />
      </section>

      {/* 出力の見せ方（プレビューに即時反映・生成し直し不要） */}
      <section className="space-y-4">
        <div>
          <p className="body-emphasis text-default">出力の見せ方</p>
          <p className="caption text-muted">
            プレビューに即時反映されます（生成し直しは不要です）。
          </p>
        </div>

        {/* 出力項目 */}
        <ToggleChips<FieldKey>
          legend="出力する項目"
          options={FIELD_DEFS.map((f) => ({
            value: f.key,
            label: f.label,
            disabled: REQUIRED_FIELDS.includes(f.key),
            title: REQUIRED_FIELDS.includes(f.key) ? '氏名は常に出力されます' : undefined,
          }))}
          selected={(v) => selected.has(v)}
          onToggle={toggleField}
        />

        {/* 連番列（即時反映） */}
        <ToggleChips<'seqId'>
          legend="追加する列"
          options={[{ value: 'seqId', label: '連番ID列 (No.)' }]}
          selected={() => seqId}
          onToggle={() => setSeqId((p) => !p)}
        />
      </section>

      {/* 出力形式・操作 */}
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup<Format>
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
            value={format}
            onChange={setFormat}
            ariaLabel="出力形式"
          />
          <ActionButton variant="primary" onClick={generate}>
            生成
          </ActionButton>
          <DownloadButton
            onClick={download}
            label="ダウンロード"
            variant="secondary"
            disabled={records.length === 0}
          />
        </div>
        {/* 未反映インジケータ。ライブ領域は常時 DOM に置き、内容挿入で SR が読み上げる。
            role="status" は付けない（既存プレビューの status と衝突して E2E が壊れるため）。 */}
        <div aria-live="polite" aria-atomic="true" className={isStale ? 'mt-2' : undefined}>
          {isStale && (
            <ChipLabel tone="info">生成条件が変更されました。再生成してください</ChipLabel>
          )}
        </div>
      </div>

      {/* プレビュー */}
      {records.length > 0 && (
        <div className="rounded-lg border border-default overflow-hidden">
          <span role="status" aria-live="polite" className="sr-only">
            {`${records.length}件のダミー個人データを生成しました`}
          </span>
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-subtle border-b border-default">
            <span className="body-emphasis text-default">
              {records.length} 件（先頭 {Math.min(PREVIEW_LIMIT, records.length)} 件を表示）
            </span>
          </div>
          <div className="overflow-x-auto bg-default">
            <table className="w-full caption text-default border-collapse">
              <thead>
                <tr className="bg-subtle">
                  {seqId && (
                    <th
                      scope="col"
                      className="text-left px-3 py-2 border-b border-default whitespace-nowrap"
                    >
                      No.
                    </th>
                  )}
                  {fields.map((k) => (
                    <th
                      key={k}
                      scope="col"
                      className="text-left px-3 py-2 border-b border-default whitespace-nowrap"
                    >
                      {FIELD_DEFS.find((f) => f.key === k)!.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    {seqId && (
                      <td className="px-3 py-2 border-b border-default whitespace-nowrap">
                        {i + 1}
                      </td>
                    )}
                    {fields.map((k) => (
                      <td key={k} className="px-3 py-2 border-b border-default whitespace-nowrap">
                        {r[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
