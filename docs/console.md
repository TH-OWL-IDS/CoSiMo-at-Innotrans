# apps/console — the live operator console

What booth staff have open on a phone or spare iPad during the show. One
header — the wordmark **CoSiMo × MonoCab-Logo** (`Brand` from
`@cosimo/ui`; CoSiMo and the × in Schoolbell, the hand-written face font),
separated from the content by a hairline — and drei views (the view switcher is a hamburger on the header's right; open, a full-width panel slides out from beneath the header; the active tab survives a reload
via the URL hash):

- **Übersicht** — one card per dependency in a three-column grid (two on a
  tablet): status word + dot, a sentence on what it means for the demo
  right now, and live facts read from the socket state and the log stream
  — **Verbindungen** (the count of consoles that answered the last ping,
  each one with RTT and health in its tooltip; then one line per real
  kiosk, emulator seat and journey view (the client says what it is on
  `hello`: `kind`): id, last ping RTT, link health ok/langsam/antwortet nicht/
  getrennt, a "polling" chip when the socket never upgraded, "· Session"
  on an active seat; each row has a log button (jumps to Logs filtered to that device)
  and a ↺ that resets that device — a seat starts a fresh
  session, a journey view gets the reload panel; nothing is
  disconnected; a
  "Jetzt prüfen" button triggers the hub's link check on demand; "Alles zurücksetzen" gives every seat a fresh session
  and tells every other console to reload — those show a blocking
  "Konsole neu laden" panel with a reload button), LLM (provider · model,
  fallback, mean thinking time, last turn), STT/TTS (path, mean duration,
  last result, time to first audio), CMS (reachable since when, profile count, and the hub's resolved
  **operator routing** from `host:config` — config source CMS/env-defaults
  and when it loaded, LLM provider · model · route, fallback, STT and TTS
  routes, LPU-2 address + mapped controls, Payload admin link),
  light (actuations ok/failed, last one), and network. A down service
  gets a red card border. (The Live/Demo toggle lives under Sessions ›
  Betrieb, the active fault on Fahrzeug, errors on the Logs badge.) The operations live under Sessions › Betrieb. The menu carries no
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
The same hash is the **hub token**: the console sends it on `hello`, the
hub compares it with the SHA-256 of its `HOST_TOKEN` and refuses the
connection (`host:unauthorized` → the page locks again) or, for other
host-role clients such as the journey view, refuses every `host:*`
command. With `HOST_TOKEN` unset (dev) every console is accepted and the
hub warns at boot. Set `HOST_TOKEN` in `.env.prod` to the same password.

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

## Console cap

The hub allows at most **3** consoles at once (`MAX_HOST_CONSOLES`). A
fourth evicts the oldest: it gets `host:evicted`, shows a "Konsole
ersetzt" panel and is disconnected; reloading it takes a slot back from
the then-oldest. Forgotten tabs therefore can't pile up. Only real consoles count (`kind:
"console"`); journey views are host-role too but are listed as their own
rows and never evicted.


> 2026-08-31: the light panel got a **Kabine** row at the top — the cabin-scoped controls (shared interior light, later scenes/dimmers/flash, rendered per kind: toggle, slider, scene chips, flash button) read from `host:seats.cabin` and switch via `host:overrideLight` with `on`/`level`/`scene`/`flash`. Seat rows keep only seat-scoped controls (Leselampe). The routes list shows scope and one URL preview per action.

> 2026-09-18 (latest+2): every card carries an I/O switch (shows and switches on/off; the card body only opens the settings), and the **Weitere Leuchten** are part of the scene too — a scene row in the CMS covers every fixture; moving one makes the cabin "frei", Szene speichern takes all of them. They stay staff-only (not in the slit menu, not for set_light).
>
> 2026-09-18 (latest+1): a second card row **Weitere Leuchten** — Außenlicht, Kopfstützen, Signallicht, Leselampen — for the lights outside the scenes; a card opens its settings beneath (on/off · brightness · cold/warm; the signal light with RGB + the exclusive red modes; the four reading lamps as rows), driven through the hub's rig state (`host:rig`).
>
> 2026-09-18 (latest): the Licht view is four cards — the three scenes and **Alles aus** — nothing else above the light log. Tapping a scene card switches the cabin (`light:set`) and opens the scene's settings beneath: the three groups (Lichtlinien · Deckenpaneel · Boden) with on/off, brightness and cold/warm, every move applied to the cabin at once; the cabin is then "frei" and the panel offers **Szene speichern** (`host:scene-save`, the cabin's levels into the CMS) and **verwerfen**; the name field renames (keepLevels). The rig rows and the Blackout/Release/Hello buttons are gone from the page (the hub still serves `host:rig` / `host:light` for the kiosk operator menu).
>
> 2026-09-18 (later): the Licht view opened with the **scene bar** — the three scenes (a preview of their three groups as bars: length = brightness, tint = warm/cold) plus Aus; a tile switches the cabin (`light:set`), the fixture rows below always show what is lit; moving a slider on Lichtlinien / Deckenpaneel / Boden makes the cabin "frei" and the last scene's tile offers **speichern** (the cabin's levels become the scene — `host:scene-save`, written to the CMS) and **verwerfen**; the pencil renames. No rider rows any more (no reading lamp in the cabin).
>
> 2026-09-18: the Licht card is only a door: **Lichtsteuerung** switches to the **Licht** view (`#licht`, `LightPage.tsx`, also in the tab menu) — the installer's control page (MESO `lighting-test.html`) rebuilt on our stack: one row per fixture (`RIG_FIXTURES`, shared rig.ts) with toggle · intensity · CW/WW bias, RGB sliders and the four exclusive modes on the signal light; address and playback numbers from the CMS (unmapped = greyed, "nicht im CMS"); `host:rig` → the hub keeps every fixture's state (`host:rig-state` to all consoles), builds the URLs (levels 0–100 → 0–255) and routes them to an iPad; each row shows the last outcome; beneath the rig the light's own log (every cabin.* event in the full LogView, filter + export). The rider-facing rows (Kabine / Sitze) sit above the rig.
>
> 2026-08-28: the Licht card carries a **Steuern** button instead of a health badge. It opens the light panel: one row per connected seat (iPad or emulator, with persona/free) plus an "alle Sitze" row, each with an Innenlicht and a Leselampe toggle (`host:overrideLight`); the LPU-2 path state is in the panel's title. The card's facts read the seats' controls, not the host's own dummy `cabin:state`.

> 2026-08-27: the Fahrzeug and Diagramm views were removed; the console has Übersicht · Sessions · Logs. Sessions shows one full-width card per active seat — configuration left, the whole conversation (rebuilt from the log stream) right. The wordmark links to Übersicht.
