import type { HarEntry, HarNameValue } from '@/utils/har';

interface Props {
  entry: HarEntry;
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

export function HarEntryDetail({ entry }: Props) {
  const { request, response } = entry;
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
    </div>
  );
}
