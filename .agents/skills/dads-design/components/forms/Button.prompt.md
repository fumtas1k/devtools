Primary action button — use for the main call-to-action; pick `variant` by emphasis and `size` by density.

```jsx
<Button variant="solid-fill" size="md">申請する</Button>
<Button variant="outline" size="md">戻る</Button>
<Button variant="text" size="sm">キャンセル</Button>
```

- `variant`: `solid-fill` (primary, blue-900 fill), `outline` (secondary), `text` (tertiary, underlined).
- `size`: `lg` (56px) · `md` (48px) · `sm` (36px) · `xs` (28px).
- Pass `href` to render an `<a>` styled as a button. `disabled` sets `aria-disabled`.
- Hover adds an underline; the dual yellow/black focus ring is built in.
