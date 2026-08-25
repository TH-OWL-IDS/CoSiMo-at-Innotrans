# Implementation Plan: Tailwind v4 + `packages/ui` design system (console first)

Date: 2026-08-25 · Planning inputs: tooling analysis (build/monorepo/Docker/WebKit) + UI analysis (token & component inventory, a11y) — both from internal agents; no Codex/Gemini wrapper on this machine.

## Task type
- [x] Frontend + build tooling (Claude executes; explicit user consent to go ahead in the invocation)

## Goal
Replace the console's ~170 inline `style={{}}` objects and three hand-copied palettes with Tailwind v4 utilities on top of a shared token/component package, keeping the visual result identical (white MonoCab CI, Source Code Pro, Schoolbell wordmark) while adding the interaction states and accessibility the console lacks. Other apps adopt the same package later, incrementally.

## Decisions (resolved from the two analyses)
| Question | Decision | Why |
|---|---|---|
| Framework | Tailwind **4.3.3** via `@tailwindcss/vite` (no PostCSS, no config file) | CSS-first `@theme`, Vite-native, hover gated to `(hover:hover)` by default (phones/iPads) |
| Where tokens live | `packages/ui/src/styles.css` (`@import "tailwindcss"`, `@source`, `@font-face`, `@theme`) — consumed as **source** like every other workspace package (`main: ./src/index.ts`) | matches repo convention; no build step |
| Fonts | move to `packages/ui/src/fonts/`, relative `url()` in styles.css → Vite emits hashed `/assets/*.woff2` in every consuming app | only option that works for console, emulator, journey **and** the Capacitor kiosk without per-app copies |
| Semantic colours | plain `@theme` (not `inline`) so utilities emit `var(--color-*)` | journey can override with an unlayered `:root {}` for its dark palette |
| Headless primitives | **Radix primitives** (`@radix-ui/react-dropdown-menu`, `react-dialog`, `react-popover`) — stable 1.x | Base UI is `1.0.0-rc.0`; a show-critical console gets stable deps |
| Preflight | full `@import "tailwindcss"` from the start; fix diffs during the file-by-file conversion (the whole console converts in this pass) | avoids a second "switch preflight on" migration |
| Native `<select>` | keep native | iOS picker is the right touch UX; add labels instead |
| Scope of this execution | `packages/ui` + `apps/console` end-to-end (+ Dockerfile), docs | emulator/journey are 4-line follow-ups; kiosk needs a native rebuild + device test → separate change |

## Token set (`@theme`)
- Colours: `bg #fff`, `ink #181817`, `mute #6b6b6b`, `line #e4e4e4`, `line-strong #d9d9d9`, `line-soft #f0f0f0`, `well #f6f6f6`, `well-raised #fafafa`, `accent #e40041`, `ok #1a7f37`, `warn #b45309`, `warn-soft #fff8f0`. Folded: #f7f7f7→well-raised, #eee/#e9e9e9→line, #c9c9c9→line-strong, #8a8a8a→mute, #0969da→ink.
- Fonts: `mono` (Source Code Pro stack), `wordmark` (Schoolbell), `sans` (system-ui, for journey later).
- Radius: xs 2, sm 6, md 8, lg 10, xl 12, 2xl 18. Shadows: `card`, `node`, `float` (menu+popover merged), `drawer`. Text: 2xs 10.5, xs 11, sm 12, md 13, base 14, lg 15, xl 16, 2xl 18. Tracking `caps` 1px. Opacity ladder (documented, not tokens): 40/55/70/85.

## Shared components (`packages/ui/src/components`, cva + `cn()`)
Button (variant default/secondary/primary/on/ghost · size xs/sm/md/lg · icon) · Card (active) · Eyebrow (size) · Dot (state, size) · Chip (size, interactive, active) · StatTile · Field/Select (size, tone, aria-invalid) · CodeChip (tone) · Banner (tone) · Meter · SeatGlyph · KeyValue. Console-only: Brand, ServiceRow.

## Interaction states (restrained)
hover `bg-well` / `border-line-strong`; `focus-visible` 2px **ink** outline offset 2 (accent means down/live here); active `bg-line-soft`; disabled `opacity-45` (fixes the invisible-disabled export button); `motion-reduce:transition-none`.

## Steps
1. **Scaffold `packages/ui`** — package.json (exports `.` + `./styles.css`), tsconfig (copy of seat-ui), `src/styles.css`, `src/cn.ts`, `src/index.ts`, fonts moved with `git mv`. Deps: tailwindcss, cva, clsx, tailwind-merge@3, radix primitives. → `pnpm --filter @cosimo/ui typecheck` green.
2. **Wire the console** — add `@cosimo/ui`, `@tailwindcss/vite`; `vite.config.ts` plugin; `index.css` → `@import "@cosimo/ui/styles.css"` + `overscroll-behavior`; delete `public/fonts` + nginx `/fonts/` block; Dockerfile `COPY packages/ui/package.json` + `COPY packages/ui`. → build emits `dist/assets/*.woff2`.
3. **Components** — write the cva components listed above in `packages/ui`.
4. **Convert console files in order**: Brand → Lock → HostConsole shell + Übersicht → Fahrzeug → Sessions/SeatCard → TabMenu (Radix DropdownMenu) → InspectorDrawer (Radix Dialog: focus trap, Esc, scroll lock, scrim) → LogView (single `--log-grid` var, `data-level`/`data-band`, keyboard-reachable rows, labelled selects) → DiagramView (chrome only; all positional pixels stay inline; SVG untouched).
5. **A11y fixes en route** — labels on selects/search, sr-only text for the red badge, Lock focus ring, un-nest the kiosk `role=button`s, `aria-expanded` on log rows.
6. **Docs** — AGENTS.md repo shape (five packages, Dockerfile COPY rule), docs/console.md (fonts, styling), new short `packages/ui/README.md` (tokens, opacity ladder, how to add a component).
7. **Verify** — `pnpm -r --no-bail typecheck`, `pnpm --filter @cosimo/console build`, `docker compose build console` (proves COPY list); screenshots of the 5 views + lock via a headless browser against the local hub if one can be started, else build-only.

## Key files
| File | Op | Description |
|---|---|---|
| packages/ui/** | Add | tokens, fonts, cn, components |
| apps/console/{package.json,vite.config.ts,src/index.css,Dockerfile,nginx.conf} | Modify | wiring; drop public/fonts |
| apps/console/src/{Brand,Lock,HostConsole,LogView,DiagramView}.tsx | Modify | inline styles → utilities/components; Radix for menu/drawer |
| AGENTS.md, docs/console.md, packages/ui/README.md | Modify/Add | conventions |
| apps/{emulator,journey}/… , apps/kiosk/… | Later | same 4 edits each; kiosk raises iOS target 14→17 + device test |

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Preflight changes native `button/select/pre/h1/details` looks | every element gets explicit classes in the same pass; check `<details>` marker, select arrow, h1 margin |
| Tailwind doesn't scan symlinked workspace packages | central `@source` lines in `packages/ui/src/styles.css` (realpath-resolved, works in Docker) |
| Docker build misses the new package | Dockerfile COPY lines + `docker compose build console` as the gate |
| Kiosk WebKit < 16.4 breaks `@property`/layers | kiosk not in this pass; when it is, raise deployment target to 17 and test on the show iPads |
| Concurrent uncommitted work in packages/client·shared·realtime (streaming TTS) | this change touches none of those files; never stash |
| No visual diff possible | try headless Chromium against the local hub; otherwise build + careful per-file review |

## SESSION_ID
- CODEX_SESSION: n/a (wrapper not installed)
- GEMINI_SESSION: n/a
