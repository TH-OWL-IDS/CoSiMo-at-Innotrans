# apps/emulator — the seat emulator (a browser iPad)

A browser stand-in for one kiosk seat, so CoSiMo can be driven end-to-end
without an iPad, a panel, an ESP32 or the cabin. To the hub it **is** a seat:
it connects with `role: "kiosk"` through the same `useCosimoSocket`, gets a
session, a profile, consent, telemetry, streamed replies and TTS audio, and
shows up as a seat card in the [host console](console.md). Its own static
service — `seat-cosimo.…` on the VPS, `:6103` locally — separate from the
host console because they serve different people (developers vs booth staff).

A browser stand-in for one kiosk seat, so CoSiMo can be driven end-to-end
without an iPad, a panel, an ESP32 or the cabin. To the hub it **is** a seat:
it connects with `role: "kiosk"` through the same `useCosimoSocket`, gets a
session, a profile, consent, telemetry, streamed replies and TTS audio, and
shows up as a seat card in the [host console](console.md).

## Same pixels as the iPad

The seat's presentation lives in **`packages/seat-ui`**, shared by the native
app and the emulator:

- `useSeat(serverUrl)` — the behaviour: language resolution (profile → UI),
  accommodation mapping (theme, text size, showText,
  reduce-motion), push-to-talk and the browser-TTS fallback.
- `SeatView` — the markup: the black stage with the circle and slit cutouts,
  the face, phase hint / running transcript, telemetry strip.
  `fullscreen` is true on the iPad (the stage *is* the screen) and false in a
  browser (a centred portrait frame in the iPad mini's aspect ratio).
- `PanelLayout` + defaults — the cutout geometry type; the iPad persists its
  calibrated values itself (Capacitor Preferences), the emulator uses defaults.

What stays in `apps/kiosk` is what only the iPad has: HID input (`useHidInput`),
the cabin-LAN actuator (`useCabinActuator`), server-URL/layout persistence,
the operator setup screen, Capacitor. So "works in the emulator" means the
rider-facing UI works — that is the point of sharing the component rather than
re-implementing it.

## The side panel replaces the hardware

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

Resolution order mirrors the kiosk: `?server=https://…` in the URL (remembered
in localStorage; `?server=` clears it) → the build-time `VITE_REALTIME_URL` →
same-origin (the Vite dev proxy to `:6101`). The prod image bakes the ws- host;
the realtime CORS list must include the origin (prod overlay adds `https://$COSIMO_SEAT_DOMAIN`, dev allows `localhost:6103`).

## Run

```bash
pnpm --filter @cosimo/emulator dev     # :6103, socket proxied to :6101
# prod: part of docker-compose.prod.yml → seat-cosimo.homannjohannes.de
```

## Look — and the hidden panel

The seat has the whole viewport on an **off-white ground** — no visible
iPad frame (the iPad-aspect stage is still there for the calibrated
geometry, just the same colour as the page) — and the circle and slit are
drawn **inset**, with an inner shadow and a faint halo, the way holes in a
real panel read (`SeatView surface="panel"`; the kiosk keeps `"cabin"`,
pitch black behind the physical panel). The developer panel is **hidden
behind a near-invisible handle** in the bottom-right corner and the
operator password (same SHA-256 as the console's lock, remembered per
tab): a visitor on `seat-cosimo.…` just sees the seat. Open, it is a
right-side drawer on a desktop and a bottom sheet (≤ 56 vh) on a phone, so
the face stays visible while you hold to talk; Esc or the scrim closes it.
The panel uses `@cosimo/ui` (white CI, Source Code Pro); `SeatView` itself
is untouched — rider-facing UI lives in `packages/seat-ui` and takes its
colours from the persona schemes.

## Reload keeps the seat

Device id and session id live in `sessionStorage` (per tab). A reload — or
a short socket drop — comes back as the *same* seat: the hub parks a
kiosk's state (profile, consent, session, last exchange, cabin controls)
for 10 min and restores it when the same device id says hello again, so
the conversation continues. A host reset ("Sitz zurücksetzen", "Alles
zurücksetzen") clears all of it. A new tab is a new seat.
