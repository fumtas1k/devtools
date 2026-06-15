import { useMemo } from 'react';
import type { HarEntry, HarNameValue } from '@/utils/har';
import { computeWaterfall } from '@/utils/har';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';

interface Props {
  entry: HarEntry | null | undefined;
}

function NameValueTable({ rows, label }: { rows: HarNameValue[]; label: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 mt-3 font-medium">{label}</h4>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="w-1/3 break-all px-2 py-1 font-mono text-muted">{r.name}</td>
              <td className="break-all px-2 py-1 font-mono">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PHASE_LABEL: Record<string, string> = {
  blocked: '待機(blocked)',
  dns: 'DNS',
  connect: '接続(connect)',
  ssl: 'TLS(ssl)',
  send: '送信(send)',
  wait: '待ち(wait)',
  receive: '受信(receive)',
};

const PHASE_CLASS: Record<string, string> = {
  blocked: 'har-phase-blocked',
  dns: 'har-phase-dns',
  connect: 'har-phase-connect',
  ssl: 'har-phase-ssl',
  send: 'har-phase-send',
  wait: 'har-phase-wait',
  receive: 'har-phase-receive',
};

/** 詳細パネルのタイミング内訳（フェーズ名・色チップ・ms・ミニバー）。 */
function TimingBreakdown({ entry }: { entry: HarEntry }) {
  // 単一エントリのフェーズ分解には computeWaterfall を再利用する（ssl 控除等を一元化）。
  const model = useMemo(() => computeWaterfall([entry]), [entry]);
  const row = model.rows[0];
  const dynClassName = useDynamicStyleSheet((className) => {
    if (!row || !row.hasTimeline) return '';
    return row.segments
      .map(
        (seg, j) =>
          `.${className} [data-har-mini="${j}"] { --mini-width: ${(seg.widthRatio * 100).toFixed(4)}%; }`
      )
      .join('\n');
  });

  if (!row || !row.hasTimeline || row.segments.length === 0) return null;

  // PHASE_ORDER 順に並べる（segments は既にこの順）。
  return (
    <div className={dynClassName}>
      <h4 className="mb-1 mt-3 font-medium">タイミング</h4>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {row.segments.map((seg, j) => (
            <tr key={seg.phase} className="align-middle">
              <td className="whitespace-nowrap px-2 py-1">
                <span className={cx('har-chip', PHASE_CLASS[seg.phase])} aria-hidden="true" />{' '}
                {PHASE_LABEL[seg.phase] ?? seg.phase}
              </td>
              <td className="whitespace-nowrap px-2 py-1 text-right font-mono">
                {Math.round(seg.ms)} ms
              </td>
              <td className="w-1/2 px-2 py-1">
                <span className="har-mini-track">
                  <span className={cx('har-mini-fill', PHASE_CLASS[seg.phase])} data-har-mini={j} />
                </span>
              </td>
            </tr>
          ))}
          <tr className="align-middle font-medium">
            <td className="px-2 py-1">合計</td>
            <td className="px-2 py-1 text-right font-mono">{Math.round(row.totalMs)} ms</td>
            <td className="px-2 py-1" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function HarEntryDetail({ entry }: Props) {
  const request = entry?.request;
  const response = entry?.response;

  // 手編集・切り詰めた HAR では request/response を欠く entry がありうる。
  // 直接参照すると TypeError でクラッシュするためプレースホルダでガードする（issue #681）。
  if (!request || typeof request !== 'object' || !response || typeof response !== 'object') {
    return (
      <div className="rounded border border-default p-4 text-muted">
        このエントリは request / response を欠くため詳細を表示できません。
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded border border-default p-4">
      <div>
        <h3 className="font-medium">リクエスト</h3>
        <p className="break-all font-mono text-sm">
          {request.method} {request.url}
        </p>
        <NameValueTable rows={request.headers} label="ヘッダ" />
        <NameValueTable rows={request.queryString} label="クエリ文字列" />
        <NameValueTable rows={request.cookies} label="Cookie" />
        {request.postData?.text != null && (
          <div>
            <h4 className="mb-1 mt-3 font-medium">POST ボディ</h4>
            <pre className="overflow-x-auto rounded bg-subtle p-2 hint-xs">
              {request.postData.text}
            </pre>
          </div>
        )}
      </div>
      <div>
        <h3 className="font-medium">
          レスポンス（{response.status} {response.statusText ?? ''}）
        </h3>
        <NameValueTable rows={response.headers} label="ヘッダ" />
        <NameValueTable rows={response.cookies} label="Cookie" />
        {response.content?.text != null && (
          <div>
            <h4 className="mb-1 mt-3 font-medium">ボディ</h4>
            <pre className="overflow-x-auto rounded bg-subtle p-2 hint-xs">
              {response.content.text}
            </pre>
          </div>
        )}
      </div>
      <TimingBreakdown entry={entry} />
    </div>
  );
}
