Single-line text input — pair with a `<Label>` and optional support/error text.

```jsx
<Input blockSize="lg" placeholder="example@digital.go.jp" />
<Input blockSize="md" isError defaultValue="不正な値" />
```

- `blockSize`: `lg` (56px) · `md` (48px) · `sm` (40px).
- `isError` sets `aria-invalid` and the red border; read-only renders a dashed border.
