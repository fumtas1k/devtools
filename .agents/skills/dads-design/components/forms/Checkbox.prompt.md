Checkbox with an optional inline label — the blue-900 check mark uses a clip-path glyph.

```jsx
<Checkbox defaultChecked>利用規約に同意する</Checkbox>
<Checkbox isError>必須項目です</Checkbox>
```

- Pass label text as children; omit children for a bare box.
- `isError` turns the box red; `disabled` greys it out.
