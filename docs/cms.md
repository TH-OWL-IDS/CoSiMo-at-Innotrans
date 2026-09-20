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
  **accommodations** (preferred language, theme, text size, audio,
  speech rate, show-text, reduce-motion, input), and CoSiMo-written
  **memories**. No presets — `default` is the clean plate new riders are
  copied from (a `copyFrom` hook snapshots accommodations + brief on create).
  Public read; writes admin-only **plus the realtime service via the internal
  key** (accommodation + memory write-back). Full model:
  [personas.md](personas.md).
- **knowledge** („Wissen") — the fact sheet behind „Was ist das MonoCab?":
  one row per topic (MonoCab | CoSiMo) and fact (`title`, `body`, `order`,
  `active`), public read, admin-only writes. The realtime service reads the
  active rows in order every 15 s and rides them into the system prompt as
  „## Über das MonoCab und CoSiMo" (grouped by topic, capped at 6000
  characters, whole entries only) together with the rule to answer ONLY
  from them and to refer to the stand's staff otherwise. Seeded from
  `@cosimo/shared` knowledge.ts when empty (the 2026-09-20 fact list checked
  by the project); empty = those defaults.
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
- **survey-responses** — the anonymous visitor questionnaire
  ([form.md](form.md)). The one publicly *writable* collection: `create`
  is open but a hook rebuilds every document from scratch (known keys
  only, integers 1–7, consent or 403, version stamped, start-token check →
  `suspect`); operators read, admins delete, nothing is updated. A root
  endpoint `/api/survey-start` issues the signed start token.
- **The config globals** (admin group „Operations“, since 2026-09-18 five
  instead of one `operator-config`): **agent-config** — the core system
  prompt (`systemPrompt`; empty = built-in default, the rider section is
  always appended in code — the seed replaces a stored copy that still
  names a retired tool such as `set_cabin_control`, since that is a stale
  default, not an edit), plus the seat texts: the **info button's question**
  (`infoQuestionDe` / `infoQuestionEn` — the seat sends `info:ask`, the hub
  asks this as a text turn) and the **guest hello** lines
  (`guestHelloDe` / `guestHelloEn`, one per line, one picked at random,
  TTS only); empty = the built-in defaults in `@cosimo/shared` `prompt.ts`,
  live within the config's 15 s TTL, no device rebuild; **llm-config** — provider (`anthropic` |
  `openai-compatible`), base URL, model, fallback, generation parameters,
  **Tool-Zwang** (off by default: the model decides when to call a tool;
  on: clear light / settings / memory sentences get the matching tool
  forced in the first step);
  **speech-config** — STT and TTS endpoints, models, the default voice ids;
  **voices** — the voice catalog (per language, order = defaults);
  **cabin-config** — the LPU-2's address on the cabin LAN (as the *iPads*
  see it — they place the calls), the playback map (catalog key → playback)
  and the three **light scenes** (saved from the console). The realtime
  service reads all five on one TTL and merges them; the seed fills each
  one it finds empty. URLs and model names only — **API keys never live in
  the CMS** (they'd be readable in the admin and land in every DB backup).

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
Postgres automatically — **prod does not**. Prod applies committed Payload
migrations (`src/migrations/`) at container boot (`pnpm run migrate` before
`next start`, see the Dockerfile CMD), so every schema change must ship one:

```bash
cd apps/cms
DATABASE_URI=postgres://cosimo:cosimo_dev@localhost:5432/cosimo \
PAYLOAD_SECRET=dev-secret npx payload migrate:create <name>
```

Commit the generated `.ts` + `.json` pair. Forgetting this bricks prod
reads of the touched table: on 2026-08-24 a new `tts.voiceIdMale` field
made every operator-config read fail → the hub silently fell back to env
defaults (wrong LLM). The prod DB was baselined that day (the initial
migration is marked applied in `payload_migrations`; Payload's push-mode
`dev` marker row was removed).

**The Docker image must be rebuilt for schema/code
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
