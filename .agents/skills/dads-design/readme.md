# デジタル庁デザインシステム — DADS

A working design system distilled from the **Digital Agency Design System (DADS) v2** — the open, MIT-licensed design system that the Government of Japan's Digital Agency (デジタル庁) publishes for building accessible, consistent public-sector websites and applications.

This project packages DADS's foundations (color, type, spacing, elevation), a set of React UI primitives, foundation specimen cards, and a full government-portal UI kit, so design agents can produce on-brand DADS interfaces and assets.

> ⚠️ This is a faithful **recreation for design tooling**, not the official package. It is not affiliated with or endorsed by デジタル庁. For production, install the official packages below.

## Sources

Everything here was built by reading the Digital Agency's own open-source repositories. Explore them for deeper fidelity:

- **Components (React):** https://github.com/digital-go-jp/design-system-example-components-react — the React + Tailwind reference implementation; the source of truth for every component's structure, states, and class logic.
- **Design tokens:** https://github.com/digital-go-jp/design-tokens — `figma/tokens.json` is the canonical source for every color, font size, line-height, radius and shadow value used here.
- **Tailwind theme plugin:** https://github.com/digital-go-jp/tailwind-theme-plugin / npm `@digital-go-jp/tailwind-theme-plugin` — maps the tokens to the `text-std-16N-170`-style utility names this system reproduces.
- **HTML reference:** https://github.com/digital-go-jp/design-system-example-components-html — the original HTML/CSS port the React components derive from.
- **Live docs & Storybook:** https://design.digital.go.jp/dads/ and https://design.digital.go.jp/dads/react/

The official npm packages were **not** installed; values were transcribed from the repos above into plain CSS custom properties so the system is dependency-free.

---

## Content fundamentals

DADS copy is **public-service Japanese**: plain, calm, and respectful, written so anyone can follow it regardless of background.

- **Language & voice.** UI copy is Japanese. The tone is polite-neutral (です・ます調) without being stiff — e.g. *「人にやさしいデジタル化を、まんなかに。」*. It addresses the citizen directly but rarely uses overt "you"; it leads with the action (*「確認画面へ進む」「この内容で申請する」*).
- **Plain language over jargon.** Procedures are named in everyday terms (*転入届、児童手当、住民票の写し*) and grouped by life event (引越し・住まい / 子育て・教育) rather than by which ministry owns them.
- **Action-first labels.** Buttons are short imperative verbs ending in する/へ進む: *申請する、検索、お問い合わせ、ホームへ戻る*. Avoid vague labels like "OK".
- **Honest, reassuring status.** Confirmations are explicit and give the user something to hold on to — a receipt number (*受付番号: 2024-0091*), what happens next, where to check. Errors say what went wrong and how to fix it, never blame.
- **Required vs optional is always explicit.** Fields carry a 必須 (required) or 任意 (optional) badge; never leave it ambiguous.
- **Casing & punctuation.** Latin acronyms stay upper-case (SDGs, DADS). Japanese full-width punctuation (、。「」（）) is used in body copy; numbers and dates are half-width, often monospaced (2024.06.01).
- **No emoji.** The brand does not use emoji in product UI. Iconography carries visual meaning instead.
- **Vibe.** Trustworthy, quiet, efficient. The opposite of marketing hype — closer to a well-run public counter than a startup landing page.

---

## Visual foundations

The DADS look is **clean, high-contrast, and accessibility-first**. Nothing decorative competes with the task.

- **Color.** Blue is the single brand ("Key") color; `blue-900` (#0017c1) drives every primary action, `blue-1000` powers links, `blue-1200` is the pressed state. Ten further primitive hues (cyan, green, lime, yellow, orange, red, magenta, purple, light-blue) each span a 13-step ramp (50→1200) but are used **sparingly** — for chips, tags, data and status, never as page decoration. Neutrals are a true-gray "Solid Gray" ramp; `solid-gray-536` (#767676) is the documented AA-contrast floor on white. Semantic colors come in two-step pairs (success / error / warning) so a fill and its text both clear contrast.
- **Type.** Noto Sans JP (sans) and Noto Sans Mono (code). The scale is organised into five intents: **Display** (48–64px hero), **Standard** (the everyday 16–45px UI/body scale), **Dense** (compact tables/forms), **Oneline** (buttons & single-line labels, 100% line-height), and **Mono**. Body text runs long line-heights (170–175%) for Japanese legibility; only Bold (700) and Normal (400) weights are used. Tokens encode size+weight+line-height together, e.g. `std-16N-170`.
- **Spacing & layout.** A 4px base grid. Generous whitespace, single-column reading measures (~760px for forms), centered max-width containers (~1160px). Layout is calm and predictable — content over chrome.
- **Corners & cards.** Radii are restrained: 8px for controls (buttons, inputs, selects), 12px for cards, full for pills/avatars. Cards are white with a 1px `solid-gray-100` border and a soft elevation; they lift one elevation step on hover.
- **Elevation.** Eight shadow levels, each a **pair** of drop shadows (a soft ambient 10%-black + a tighter key 30%-black) — subtle, never glowy. Used for raised cards, menus, and dialogs.
- **Borders.** Fields use a 1px `solid-gray-600` border that darkens to black on hover; read-only fields switch to a **dashed** border; errors switch to `error-1` red. Dividers are `solid-gray-420`.
- **The focus indicator (signature).** Every interactive element shows the same dual ring on keyboard focus: a 2px yellow (`yellow-300`) band wrapped by a 4px solid-black outline with a 2px offset. It is deliberately loud and must never be removed — it is the heart of DADS accessibility.
- **Backgrounds.** Mostly flat white or `solid-gray-50`. The one permitted gradient is a quiet `blue-50 → white` hero wash. No textures, no patterns, no photographic full-bleed behind text.
- **States.** Hover = darker fill **plus an underline** on buttons/links (color alone is never the only signal); press = the next-darker shade; disabled = `solid-gray-300` fill with `solid-gray-50` text and no pointer events. Solid buttons carry a 4px *double* transparent border — a DADS detail that yields a crisp inner edge.
- **Motion.** Minimal and functional. Short (~0.08–0.15s) ease transitions on background and the accordion chevron rotation. No bounces, no parallax, no infinite loops. Respect `prefers-reduced-motion`.
- **Imagery.** When photos appear (news/carousel banners) they are bright, warm, and informative; they never sit behind body text. Iconography does the heavy lifting.

---

## Iconography

- **Style.** Solid (filled) glyphs on a 24×24 grid, single-color via `currentColor` so they inherit text color and the focus treatment. Simple, geometric, legible at small sizes — matching the Material-style line of the official set.
- **Source.** The official components ship icons as **inline SVG `<path>`s** inside each component (chevrons, the external-link mark, banner status icons, the accordion caret), not as an icon font or sprite. This system follows the same approach: icons are inline SVG drawn from the official path data where reused (select chevron, breadcrumb caret, accordion caret, external-link glyph), so they stay dependency-free and tint with `currentColor`.
- **No emoji, no unicode-glyph icons.** Meaning is carried by drawn SVG, never by emoji or text symbols.
- **If you need a broader set:** match the official feel with a **solid/filled** icon library at the same optical weight (e.g. Material Symbols – Filled). Flag any substitution to the user, and keep `currentColor` + 24px grid.
- **Brand mark.** `assets/favicon.svg` is a simple blue+magenta stacked-bars mark used in the demo lockups. The real デジタル庁 wordmark is a government identity — the lockups here pair this placeholder mark with a `デジタル庁 / DIGITAL AGENCY` text wordmark. **Swap in the official logo** before any real-world use.

---

## What's in here (index)

**Root**
- `styles.css` — the single entry point consumers link. `@import`-only.
- `readme.md` — this guide. `SKILL.md` — Agent-Skill manifest.

**`tokens/`** — `colors.css` · `typography.css` (type scale + `text-*` utility classes) · `spacing.css` (spacing, radius, elevation, focus ring) · `fonts.css` (Noto Sans JP/Mono) · `base.css` (resets + focus).

**`components/`** — React primitives + a shared `components.css` (shipped via `styles.css`). Namespace: `window.DADS_952a55`.
- `forms/` — **Button, Input, Select, Checkbox, Radio, Textarea, Label**
- `feedback/` — **NotificationBanner, StatusBadge**
- `navigation/` — **Accordion, Breadcrumbs**
- `data-display/` — **ChipLabel, Table**
- Each directory has a `*.card.html` thumbnail registered to the **Components** group.

**`guidelines/`** — foundation specimen cards for the Design System tab: color (key/neutral/semantic/accents/usage), type (display/headings/body/dense-mono), spacing (scale/radius/elevation), brand (logo/focus).

**`ui_kits/gov-portal/`** — interactive government online-services portal (home, services, FAQ, 3-step application). See its `README.md`.

**`assets/`** — `favicon.svg` (brand mark) and `img/` (sample banner photography).

## Using it

Link the stylesheet and use the tokens / classes directly, or consume the React components from the compiled bundle:

```html
<link rel="stylesheet" href="styles.css" />
```
```jsx
const { Button, Input, NotificationBanner } = window.DADS_952a55;
<Button variant="solid-fill" size="md">申請する</Button>
```

## Caveats

- **Fonts** load from Google Fonts (Noto Sans JP / Noto Sans Mono). For production, self-host `.woff2` and replace `tokens/fonts.css` with real `@font-face` rules.
- **Logo** is a placeholder mark — replace with the official デジタル庁 identity.
- Values are transcribed from the open token repo; cross-check against the latest `figma/tokens.json` if precision matters.
