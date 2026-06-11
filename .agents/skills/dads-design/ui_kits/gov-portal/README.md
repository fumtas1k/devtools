# Gov Portal — UI kit

A high-fidelity, click-through recreation of a **government online-services portal** built entirely from DADS primitives. It is a *demonstration surface*, not a real service.

## Screens & flow

`index.html` mounts a small router (`App`) with four routes:

| Route | File | What it shows |
|---|---|---|
| `home` | `Home.jsx` | Hero with search, a maintenance `NotificationBanner`, life-event service cards, and a news list using `ChipLabel`. |
| `services` | `Services.jsx` | Procedures `Table` + FAQ built from `Accordion`, with `Breadcrumbs`. |
| `help` | `Services.jsx` (`mode="help"`) | FAQ-only view. |
| `apply` | `Apply.jsx` | A 3-step online application: **入力 → 確認 → 完了**, using `Input`, `Select`, `Radio`, `Checkbox`, `Textarea`, `Label`, `Button`, and `NotificationBanner` for validation. |

`Chrome.jsx` provides the shared `Header` (utility bar + nav + login button) and `Footer`.

## How it's wired

- Each `*.jsx` is a separate Babel script that exports its components to `window` (`Object.assign(window, { … })`), because Babel scripts don't share scope.
- All primitives come from the compiled bundle: `const { Button, Input, … } = window.DADS_952a55`.
- Layout uses the `.kit-container` width wrapper and inline styles that reference DADS CSS custom properties — no Tailwind, no extra dependencies.

## Try it

Open `index.html`, search from the hero, browse 手続き一覧, then run an application end-to-end. Submitting without checking the agreement box triggers the error banner; completing the flow shows the success state with a receipt number.
