Data table — quickest path is the `columns` + `rows` shorthand; rows highlight on hover.

```jsx
<Table
  caption="申請状況"
  columns={['申請番号', '種別', '状態']}
  rows={[
    ['2024-0012', '転入届', '完了'],
    ['2024-0031', '印鑑登録', '受付中'],
  ]}
/>
```

- For complex tables (row headers, colspans), pass `<thead>/<tbody>` as children instead.
