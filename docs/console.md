# apps/console — the staff console: `/host` + `/seat`

One static bundle (Vite, nginx in prod), its own service — `console-cosimo.…`
on the VPS, `:5174` locally — holding the two tools staff and developers use.
It is deliberately **not** part of the CMS: the CMS is a UI for the database
(admin + REST API) and plays no role during the show, while `/host` is the one
page that must stay up *during* the show. Both routes are socket-only clients
of the realtime hub; neither ever calls the CMS.

## `/host` — the live operator console

What booth staff have open on a phone or spare iPad. Two levels, mirroring
the state model (see [architecture.md](architecture.md)):

- **Global — the journey everyone shares:** service health (LLM, speech,
  light, network, offline-canned, server STT/TTS), live telemetry with demo
  force buttons (pause/resume the journey, drop battery to 15 %), the
  demo/offline toggle, **recover** (un-sticks every seat), persona for all
  seats at once.
- **Per seat — one card per iPad with an active visitor:** live face +
  phase, the profile (label, accommodations, stored memories), a persona
  dropdown (the manual stand-in for an NFC tap), cabin toggles (override or
  test the light path), the last utterance/reply, **reset** for the next
  visitor, and **inspect** 🔍 — the exact system prompt that seat would use
  right now plus its full turn log with tool actions, outcomes and
  latencies (the "why did CoSiMo say that?" tool).

Idle connected seats show as small chips. The persona pickers are built from
`host:personas`, pushed by the hub — no CMS query. **Unauthenticated**: anyone
who connects as `role: "host"` can reset seats, wherever the page is served
from, so the fix is a host token checked by the hub on `hello`, not a login
on the page. Add it before the fair.

## `/seat` — the seat emulator (a browser iPad)

A browser stand-in for one kiosk seat, so CoSiMo can be driven end-to-end
without an iPad, a panel, an ESP32 or the cabin. To the hub it **is** a seat:
it connects with `role: "kiosk"` through the same `useCosimoSocket`, gets a
session, a profile, consent, telemetry, streamed replies and TTS audio, and
shows up as a seat card in `/host`.

### Same pixels as the iPad

The seat's presentation lives in **`packages/seat-ui`**, shared by the native
app and the emulator:

- `useSeat(serverUrl)` — the behaviour: language resolution (profile → UI),
  consent flow, accommodation mapping (theme, text size, contrast, showText,
  reduce-motion), push-to-talk and the browser-TTS fallback.
- `SeatView` — the markup: the black stage with the circle and slit cutouts,
  the face, phase hint / running transcript, consent overlay, telemetry strip.
  `fullscreen` is true on the iPad (the stage *is* the screen) and false in a
  browser (a centred portrait frame in the iPad mini's aspect ratio).
- `PanelLayout` + defaults — the cutout geometry type; the iPad persists its
  calibrated values itself (Capacitor Preferences), the emulator uses defaults.

What stays in `apps/kiosk` is what only the iPad has: HID input (`useHidInput`),
the cabin-LAN actuator (`useCabinActuator`), server-URL/layout persistence,
the operator setup screen, Capacitor. So "works in the emulator" means the
rider-facing UI works — that is the point of sharing the component rather than
re-implementing it.

### The side panel replaces the hardware

| Hardware | Emulator |
|---|---|
| Talk button (HID `s`, hold) | **hold to talk** button, or hold **Space** |
| Info button (HID `i`) | **info** button |
| NFC reader (`[id⏎]`) | chip-id field + the five seeded cards as shortcuts |
| — | a text field (the same `chat:send` path as the kiosk's hidden test console) |
| Cabin LAN → LPU-2 | **actuation log**: every `cabin:actuate` the hub sends this seat, with its URLs |

The actuation log is the useful trick: ask CoSiMo to change the light and the
exact `GET /ajax/pbXX/…` calls appear — so the playback mapping in the CMS can
be verified from a desk, with no cabin. By default they are **logged, not
fired** (and reported `ok`, so the seat reads as healthy); tick *fire for real*
when the machine running the browser can actually reach the controller.

Voice needs a secure origin for the mic (https or localhost) plus server STT
(Deepgram) or Chrome's speech recognition — the panel says so when it can't.

## Where it connects

Both routes share one resolution order, mirroring the kiosk: `?server=https://…`
in the URL (remembered in localStorage; `?server=` clears it) → the build-time
`VITE_REALTIME_URL` → same-origin (the Vite dev proxy to `:4000`). The prod
image bakes the ws- host; the realtime CORS list must include the console's
origin (the prod overlay adds `https://$COSIMO_CONSOLE_DOMAIN`, dev allows
`localhost:5174`).

## Run

```bash
pnpm --filter @cosimo/console dev      # :5174 → /host and /seat, socket proxied to :4000
# prod: part of docker-compose.prod.yml → console-cosimo.homannjohannes.de
```
