# apps/kiosk — the native iPad app

A Vite + React SPA wrapped with Capacitor into a native iOS app
(bundle id `johannes.homann.cosimo.kiosk`, portrait-locked, fullscreen,
never sleeps). It is deliberately a *thin client*: all intelligence lives in
the realtime service; the app renders CoSiMo and forwards input.

## The panel UI

The iPad sits behind a physical panel with exactly two cutouts. Everything
outside them renders pitch black (invisible, no light bleed):

- **The circle** — CoSiMo's world. Face-and-voice-first: the animated face
  plus a short phase hint; reply *text* is progressive disclosure — only
  when the profile's `showText` accommodation is on does the layout flip to
  a small face above a **running transcript** (deaf / text-first riders).
  Also hosts the consent dialog and a "connecting…" note. The circle is
  **display-only** — talking runs exclusively over the physical talk button
  (hold to speak; pressing while CoSiMo talks silences it instantly —
  barge-in); touch does nothing by design. Text scale, contrast, speech
  rate, reduce-motion and the UI language all follow the active profile's
  accommodations, live.
- **The slit** — the telemetry strip: clock · passengers · next stop |
  speed, in bold monospace, styled after the MonoCab mockup.

### Calibration

The panel never aligns pixel-perfect with hardcoded positions. Cutout
geometry (circle x/y/diameter, slit x/y/w/h/corner-radius, all in % of
screen) lives in `src/config/panelLayout.ts`, persisted per device via
Capacitor Preferences, and is edited in the hidden operator screen — which
also has a "show outlines" toggle that draws the cutout borders for
physical alignment on mounting day.

**Operator access: hold the slit for 3 seconds.** (Not a screen corner —
corners are behind the panel.)

## Server connection

No baked localhost, no env vars on device. Resolution order in
`src/config/serverUrl.ts`:

1. stored per-device override (Capacitor Preferences),
2. the baked production default — the realtime host
   (`https://ws-cosimo.homannjohannes.de`); the kiosk is socket-only,
3. web builds default to same-origin (the Vite dev proxy forwards
   `/socket.io` to the local realtime service).

Fresh installs auto-connect; the operator screen can repoint a device (e.g.
to a dev machine) without an Xcode rebuild. Socket.IO reconnects
automatically forever — kiosks recover from Wi-Fi blips and server restarts
on their own.

## Input: ESP32 buttons + NFC (BLE HID keyboard)

The seat hardware pairs as a Bluetooth keyboard; `useHidInput.ts` parses the
global key stream:

- **`s`** — talk button, real hold semantics (keydown = start recording,
  keyup = stop). Auto-repeats ignored.
- **`i`** — info button, one press = one canned intro question to the agent.
- **NFC frames** — the reader types `[` + chip id + `Enter`. While a frame
  is open every key is swallowed (ids containing `s`/`i` can't misfire the
  buttons); stalled frames reset after 2 s. The chip id goes to the
  server raw (`nfc:register`) — the server maps it to a persona "account".

All of it is testable without hardware: focus the app (Simulator or
browser) and type on a real keyboard. Full firmware-facing spec:
[hardware.md](hardware.md).

## Voice constraints on iOS

WKWebView's `webkitSpeechRecognition` is unreliable: absent on older iOS,
and where it exists (iOS 26 simulator) it fires `onresult` continuously —
it once flooded the server with ~400 identical turns/s until the process
OOM'd (the client now guards one transcript per press, and the hub
rate-limits turns per device). For the fair, voice input **requires server
STT (Deepgram)**. The recorder path
(`usePushToTalk.ts`) uses `getUserMedia` + `MediaRecorder` and uploads the
utterance; the browser-speech path exists only for web builds. TTS plays
either server audio (ElevenLabs, preferred) or falls back to the browser's
speech synthesis. The mic permission is granted once, natively, permanently
— one of the reasons this is a native app rather than a PWA.

## Build & run

```bash
pnpm --filter @cosimo/kiosk dev   # browser dev, hot reload, port 5173
cd apps/kiosk
pnpm cap:sync                      # vite build + copy into ios/
pnpm ios:open                      # open Xcode → select iPad → Run
```

The `ios/` Xcode project is committed. Simulators need no signing; real
iPads need an Apple Developer account (paid = builds last a year).
Machine-specific: if `xcode-select` points at the CommandLineTools, prefix
cap/xcodebuild commands with
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

Kiosk-relevant `Info.plist` decisions: portrait-only + `UIRequiresFullScreen`
(without the latter, iPadOS silently ignores orientation locks), hidden
status bar, `NSMicrophoneUsageDescription`, idle timer disabled in
`AppDelegate` (the screen must never sleep).

## What the kiosk deliberately does NOT do

- No persona/content logic — the persona arrives over the socket and only
  changes theme/presentation locally.
- No interpretation of NFC ids, no CMS queries for content.
- No cabin UI — lights are voice-controlled through the agent; the seat
  receives its own cabin state and, as the only device on the cabin LAN,
  *performs* the change (`cabin:actuate` → GET → result). It is handed
  finished URLs: it decides nothing, it knows nothing about DMX.
