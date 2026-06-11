Breadcrumbs — show where a page sits in the site hierarchy.

```jsx
<Breadcrumbs items={[
  { label: 'ホーム', href: '/' },
  { label: '手続き', href: '/services' },
  { label: '転入届' },
]} />
```

- The last item renders as `aria-current="page"`; earlier items are links separated by a chevron.
