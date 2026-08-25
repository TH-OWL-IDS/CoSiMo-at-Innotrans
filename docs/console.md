# apps/console — the live operator console

What booth staff have open on a phone or spare iPad during the show. One
header — the MonoCab logo and the word **Konsole**, separated from the
content by a hairline — and four views (the active tab survives a reload
via the URL hash):

- **Übersicht** — every dependency as a row with a status dot and a detail
  sentence: hub connection (+ device counts), LLM (provider · model, and
  "Fallback aktiv" when the probe switched brains), STT, TTS, light,
  network, and the mode (Live vs Demo). The operations that belong next to
  a red dot live here too: recover, the demo/offline toggle, persona for
  all seats. The tab label carries a red dot whenever something is down.
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
