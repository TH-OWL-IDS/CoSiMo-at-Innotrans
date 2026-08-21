# apps/cms — Payload CMS (a UI for the database)

Payload 3 on Next.js 15 with Postgres. It owns everything *authored or
persisted* and is **never in the live path** — the realtime service reads it
on short TTLs and works from built-in defaults when it's down. It plays no
role during the show: if it is down, the demo runs on, the kiosks run on, the
operator console runs on.

The frontend surface is just the admin: `/` redirects to `/admin` (the
Payload login). There is no other page — the operator console is
[apps/console](console.md), visitors use the native kiosk app.

## Collections & globals

- **personas** — rider profiles: identity (`key`, `label`, `name`, **NFC chip
  ids**), an operator **brief** (verbatim prompt), structured
  **accommodations** (preferred language, theme, text size, contrast, audio,
  speech rate, show-text, reduce-motion, input), and CoSiMo-written
  **memories**. No presets — `default` is the clean plate new riders are
  copied from (a `copyFrom` hook snapshots accommodations + brief on create).
  Public read; writes admin-only **plus the realtime service via the internal
  key** (accommodation + memory write-back). Full model:
  [personas.md](personas.md).
- **route-config (global)** — the line the journey simulation drives: stops
  in order (bilingual names, seconds of travel from the previous stop,
  dwell seconds), cruise speed, capacity, notes. The realtime service
  simulates the MonoCab riding it end-to-end and back, forever; telemetry
  (speed, location, ETAs, doors) is derived, not authored. Editing the
  route restarts the journey at the first stop. Public read.
  Gotcha: array-row fields must never be named `id` (collides with
  Payload's internal row PK — this is why stops use `stopId`).
- **sessions** — the research dataset. Written by the realtime service
  (turn transcripts, tool actions, emotions, latency, consent, modality),
  read-only in the admin. Consent gates *recording*, not conversing.
- **operator-config (global)** — live-editable operations: the agent's **core
  system prompt** (`agent.systemPrompt`; empty = built-in default — the rider
  section is always appended in code) and endpoint routing: LLM provider
  (`anthropic` | `openai-compatible`) + base URL + model, STT/TTS base URLs
  and voice, plus **Kabine**: the LPU-2's address on the cabin LAN (as the
  *iPads* see it — they place the calls) and which playback drives which cabin
  control. URLs and model names only — **API keys never live in the CMS**
  (they'd be readable in the admin and land in every DB backup).

## Seeding

`pnpm seed` (in `apps/cms`) fills the profiles (clean plate + mockup
riders) and the simulation route, per-document idempotent (safe to re-run,
safe on the VPS). Local run needs the DB reachable:

```bash
DATABASE_URI=postgres://cosimo:cosimo_dev@localhost:5432/cosimo pnpm seed
```

The seed personas mirror the realtime service's built-in defaults, so CMS
editing starts from the same baseline the fallbacks provide.

## Schema changes

After editing collections/globals: `pnpm generate:types` (regenerates
`payload-types.ts`, which is gitignored). Dev mode pushes schema changes to
Postgres automatically. **The Docker image must be rebuilt for schema/code
changes to reach the container** — and the Dockerfile copies workspace
packages explicitly, so a new `packages/*` dependency must be added to the
Dockerfile's COPY list or the build silently ships stale behavior.

## Next.js specifics

Workspace packages ship TS source, not builds — every `@cosimo/*` package
the CMS imports must be listed in `transpilePackages` in `next.config.mjs`.
The webpack `extensionAlias` mapping exists because shared packages use ESM
`.js` import specifiers that resolve to `.ts` sources.

## Host console

Moved to [apps/console](console.md) — it is a socket-only client of the
realtime hub and never needed the CMS. The CMS no longer depends on
`@cosimo/client` or `NEXT_PUBLIC_REALTIME_URL`.
