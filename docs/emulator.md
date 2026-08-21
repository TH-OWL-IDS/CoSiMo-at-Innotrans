# apps/emulator — the seat emulator (a browser iPad)

A browser stand-in for one kiosk seat, so CoSiMo can be driven end-to-end
without an iPad, a panel, an ESP32 or the cabin. To the hub it **is** a seat:
it connects with `role: "kiosk"` through the same `useCosimoSocket`, gets a
session, a profile, consent, telemetry, streamed replies and TTS audio, and
shows up as a seat card in the [host console](console.md). Its own static
service — `seat-cosimo.…` on the VPS, `:5175` locally — separate from the
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
same-origin (the Vite dev proxy to `:4000`). The prod image bakes the ws- host;
the realtime CORS list must include the origin (prod overlay adds `https://$COSIMO_SEAT_DOMAIN`, dev allows `localhost:5175`).

## Run

```bash
pnpm --filter @cosimo/emulator dev     # :5175, socket proxied to :4000
# prod: part of docker-compose.prod.yml → seat-cosimo.homannjohannes.de
```
