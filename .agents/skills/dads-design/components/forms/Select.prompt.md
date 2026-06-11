Dropdown select — uses a native `<select>` so keyboard and mobile behaviour are correct.

```jsx
<Select blockSize="lg" defaultValue="">
  <option value="" disabled>選択してください</option>
  <option value="tokyo">東京都</option>
  <option value="osaka">大阪府</option>
</Select>
```

- `blockSize`: `lg` / `md` / `sm`. `isError` sets the error border.
