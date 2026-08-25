# apps/console — the live operator console

What booth staff have open on a phone or spare iPad during the show. One
header — the wordmark **CoSiMo × MonoCab-Logo** (`Brand` from
`@cosimo/ui`; CoSiMo and the × in Schoolbell, the hand-written face font),
separated from the content by a hairline — and five views (the view switcher is a hamburger on the header's right; open, a full-width panel slides out from beneath the header; the active tab survives a reload
via the URL hash):

- **Übersicht** — one card per dependency in a four-column grid (two on a
  tablet): status word + dot, a sentence on what it means for the demo
  right now, and live facts read from the socket state and the log stream
  — **Verbindungen** (hub host, kiosk count, console count — the individual
  consoles with RTT and health in its tooltip — last check; then one line
  per *kiosk*: id, last ping RTT, link health ok/langsam/antwortet nicht/
  getrennt, a "polling" chip when the socket never upgraded, "· Session"
  on an active seat; a "Jetzt prüfen" button triggers the hub's link check
  on demand), LLM (provider · model,
  fallback, mean thinking time, last turn), STT/TTS (path, mean duration,
  last result, time to first audio), CMS (reachable since when, profile count, and the hub's resolved
  **operator routing** from `host:config` — config source CMS/env-defaults
  and when it loaded, LLM provider · model · route, fallback, STT and TTS
  routes, LPU-2 address + mapped controls, Payload admin link),
  light (actuations ok/failed, last one), network, and the mode (Live vs
  Demo, turns, errors, active fault). A down service gets a red card
  border. The operations live under Sessions › Betrieb. The menu carries no
  fault dot — the cards are the indicator.
- **Fahrzeug** — the MonoCab itself: the CI line drawing centred, live
  speed above it, destination/direction beneath, a fault banner with cause
  and countdown when a disruption is active, and stat tiles (position,
  next stop + ETA, delay, battery bar, doors, passengers as seat glyphs —
  red = live CoSiMo seat, ink = simulated, hollow = free). Below: the
  journey controls (pause/resume, weak battery) and the ⚠ fault buttons.
- **Sessions** — one card per active seat: live face + phase, persona
  picker (the manual stand-in for an NFC tap), accommodation chips, stored
  memories, cabin toggles, the last exchange, reset, and **inspect** 🔍 —
  the exact system prompt that seat would use right now plus its full turn
  log with tool calls, results and latencies. Idle seats appear as chips;
  the tab label shows the active-seat count.
- **Logs** — the structured debug stream (see below). The persona pickers are built from
`host:personas`, pushed by the hub — no CMS query.

## Styling

Tailwind v4 utilities on the `@cosimo/ui` tokens (white MonoCab CI, Source
Code Pro, self-hosted fonts — see [packages/ui/README.md](../packages/ui/README.md)).
The view switcher is a hand-rolled slide-down panel (Esc / outside click close it), the seat inspector a Radix
`Dialog` (focus trap, Esc, scrim). Only data-driven values remain inline:
diagram node positions, the battery fill, the log grid template.

## Page lock

The page sits behind a password (`apps/console/src/Lock.tsx`): a SHA-256
hash in the bundle, the unlock remembered in localStorage per device. To
change it, replace `HASH` with `printf 'new-password' | shasum -a 256`.
This keeps visitors who find the URL out of the operator controls — but
**the socket is still unauthenticated**: anyone who connects as
`role: "host"` can reset seats, wherever the page is served from. The
real fix is a host token checked by the hub on `hello`. Add it before the
fair.

## Where it connects

Resolution order mirrors the kiosk: `?server=https://…` in the URL (remembered
in localStorage; `?server=` clears it) → the build-time `VITE_REALTIME_URL` →
same-origin (the Vite dev proxy to `:6101`). The prod image bakes the ws- host;
the realtime CORS list must include the origin (prod overlay adds `https://$COSIMO_CONSOLE_DOMAIN`, dev allows `localhost:6102`).

## Run

```bash
pnpm --filter @cosimo/console dev         # :6102, socket proxied to :6101
# prod: part of docker-compose.prod.yml → console-cosimo.homannjohannes.de
```
