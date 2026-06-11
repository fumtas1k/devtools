Page-level alert — announce status, validation summaries, or system notices.

```jsx
<NotificationBanner type="error" title="送信できませんでした">
  入力内容に誤りがあります。赤色の項目をご確認ください。
</NotificationBanner>
<NotificationBanner type="success" bannerStyle="color-chip" title="申請が完了しました" />
```

- `type`: `info1` (blue), `info2` (grey), `success` (green), `warning` (yellow), `error` (red).
- `bannerStyle`: `standard` (3px border) or `color-chip` (thin border + thick inset left bar).
