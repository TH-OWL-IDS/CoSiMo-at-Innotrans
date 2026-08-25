# @cosimo/ui — tokens and components for the browser apps

The MonoCab / CoSiMo CI as one stylesheet plus a handful of React
components. Consumed as source (no build), like every other workspace
package. Used by `apps/console`, `apps/journey`, `apps/emulator` (side
panel). The kiosk / `packages/seat-ui` are rider-facing and take their
colours from the persona schemes — they don't use this package (yet).

## Wiring an app

```ts
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [react(), tailwindcss()] });
```
```css
/* src/index.css — the only CSS entry */
@import "@cosimo/ui/styles.css";
```
`package.json`: `"@cosimo/ui": "workspace:*"`, dev `tailwindcss` +
`@tailwindcss/vite`. Dockerfiles must `COPY packages/ui/package.json` and
`COPY packages/ui` like the other workspace packages.

## Tokens (`src/styles.css`, `@theme`)

| Group | Tokens |
|---|---|
| colour | `bg` `ink` `mute` `line` `line-strong` (controls) `line-soft` (dividers) `well` (sunken) `well-raised` `accent` (CI red — also *down* / *live*) `ok` `warn` `warn-soft` |
| font | `mono` (Source Code Pro, body) · `wordmark` (Schoolbell) · `sans` |
| text | `2xs` 10.5 · `xs` 11 · `sm` 12 · `md` 13 · `base` 14 · `lg` 15 · `xl` 16 · `2xl` 18 · `4xl` 30 |
| radius | `xs` 2 · `sm` 6 · `md` 8 · `lg` 10 · `xl` 12 · `2xl` 18 · `full` |
| shadow | `card` `node` `float` (menus, popovers) `drawer` |
| z | `sticky` `popover` `header` `menu` `drawer` |

Use them as utilities (`bg-well`, `text-mute`, `rounded-lg`,
`shadow-float`) or as variables (`var(--color-ink)`) where a value is data
— SVG strokes, computed pixels. Colours are *not* `inline`, so an app with
another palette overrides `:root { --color-bg: … }` after the import.

Opacity on ink is the "secondary text" mechanism (it dims icons too). Stick
to the ladder **40 · 55 · 70 · 85**.

Fonts are self-hosted in `src/fonts/` and referenced relatively — Vite
emits them as hashed `/assets/*.woff2` in every app. Nothing loads from
Google during the show.

## Interaction vocabulary

`focus-ring` (custom utility): 2px **ink** outline on `:focus-visible` —
red means *down* or *live* in this CI, never *focused*. Hover is
`bg-well` / `border-line-strong`; disabled is `opacity-45`. Hover styles
only apply on devices that hover (Tailwind v4 default), so phones/iPads
don't get sticky hover states.

## Components (`src/components`)

`Brand` (CoSiMo × logo) · `Button` (variant default/secondary/primary/on/
ghost/outline · size xs/sm/md/lg · icon · tone accent/warn) · `Card`
(active) · `Eyebrow` (size sm/xs/2xs) · `Dot` (state ok/warn/down) · `Chip`
+ `ChipButton` (aria-pressed drives the look) · `StatTile` · `Input` /
`Select` (size, tone surface/well; selects stay native) · `CodeChip` (tone
error) · `Banner` (tone warn) · `Meter` · `SeatGlyph` (live/taken/free) ·
`KeyValue`.

Variants are `class-variance-authority`; `cn()` merges classes with
`tailwind-merge`. Add a component when the same look appears in a second
app or a third place; keep one-off layout as utilities in the app.

Accessible widgets (menus, dialogs) use Radix primitives — the console's
view switcher (`DropdownMenu`) and inspector drawer (`Dialog`). Apps that
use them add the `@radix-ui/react-*` package to their own dependencies
(pnpm's `node_modules` are isolated).
