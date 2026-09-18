# apps/kiosk — the native iPad app

A Vite + React SPA wrapped with Capacitor into a native iOS app
(bundle id `johannes.homann.cosimo.kiosk`, portrait-locked, fullscreen,
never sleeps). It is deliberately a *thin client*: all intelligence lives in
the realtime service; the app renders CoSiMo and forwards input.

What the rider sees (`useSeat` + `SeatView`) lives in **`packages/seat-ui`**
and is shared with the browser [emulator](emulator.md); this app adds only
what the iPad has — HID input, the cabin-LAN actuator, server-URL and
calibration persistence, the setup screen. **Change rider-facing UI in
seat-ui**, so both stay identical.

## The panel UI

The iPad sits behind a physical panel with exactly two cutouts. Everything
outside them renders pitch black (invisible, no light bleed):

- **The circle** — CoSiMo's world. Face-and-voice-first: the animated face
  plus a short phase hint; reply *text* is progressive disclosure — only
  when the profile's `showText` accommodation is on does the layout flip to
  a small face above a **running transcript** (deaf / text-first riders).
  Also hosts a "connecting…" note (there is no consent screen — the privacy notice is signage at the cab). The circle is
  **display-only** — talking runs exclusively over the physical talk button
  (hold to speak; pressing while CoSiMo talks silences it instantly —
  barge-in); touch does nothing by design. Text scale, speech
  rate, reduce-motion and the UI language all follow the active profile's
  accommodations, live.
- **The slit** — at rest a rotating strip (status · line · next station ·
  mic hint, `TelemetryStrip`); while the talk button is held the rider's
  voice as a line (`SlitWave`) with the live dictation small underneath,
  anchored at its end so a long sentence runs out to the left; then
  subtitles (`showText`), a Ja/Nein card, or the rider's settings menu
  (`SlitSettings`: Textgröße · Lautstärke · Stimme · Farbe — CoSiMo looks
  down at it while it is open).

### Calibration

The panel never aligns pixel-perfect with hardcoded positions. Cutout
geometry (circle x/y/diameter, slit x/y/w/h/corner-radius, all in % of
screen) is the `PanelLayout` type from seat-ui; `src/config/panelLayout.ts`
persists it per device via Capacitor Preferences, and it is edited in the
hidden operator screen — which
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
3. a non-native load of the bundle defaults to same-origin. (There is no
   browser dev server — the [emulator](emulator.md) is the browser seat.)

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
- **`l`** — light button, one press = the next light scene (`light:set
  {scene:"next"}`; the hub cycles Standard → Gemütlich → Hell).
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

## Styling

The app imports `@cosimo/ui/styles.css` (Tailwind v4 tokens, self-hosted
fonts) like the other apps — but only the **operator-only** surfaces use
it: the setup screen (`ServerSetup`) and the hidden test console wear the
console's white CI. The rider-facing `SeatView` comes from
`packages/seat-ui`, takes its colours from the persona schemes and stays
in the system font (`apps/kiosk/src/index.css` overrides the body font).
Tailwind v4 needs WebKit 16.4+ (cascade layers, `@property`), so the iOS
deployment target is **17.0** (`ios/App/Podfile`, `project.pbxproj`) —
the iPad minis at the stand run iOS 17/18.

## Seat position (Sitzplatz)

The hidden setup screen carries a **Sitzplatz** picker (1 = front … 4 =
rear, "keiner" = unset), stored per device like the panel calibration and
sent in the socket `hello`. The hub uses it to pick the seat's reading-lamp
playback (PB 49-52 on the LPU-2); an unset seat keeps its lamp simulated.
Set it once per iPad at build-up.

## Voice input — three modes

`usePushToTalk` picks the first available mode on each press:

1. **Server STT** (`status.serverStt`, Deepgram): record via MediaRecorder,
   upload, hub transcribes. The primary path — works in app and emulator.
2. **Native dictation** (app only): Apple `SFSpeechRecognizer` via
   `@capacitor-community/speech-recognition`, injected by the app as the
   seat-ui `NativeDictation` contract (`nativeDictation.ts`). Free,
   on-device, the fallback when the hub has no Deepgram key. Needs
   `NSSpeechRecognitionUsageDescription` (present) and one permission
   prompt per device. Partial results stream to the slit while holding.
   The plugin is patched (`patches/`, applied by pnpm on install): on-device
   recognition where the locale supports it — load German as an offline
   dictation language on each iPad (Settings → General → Keyboard →
   Dictation languages) — the dictation task hint, and an `isFinal` flag on
   partial results, so release sends the final transcript the moment it
   lands (at most 300 ms after stop, then the last partial).
3. **Web Speech** (browser only): Chrome/Safari dev fallback —
   `webkitSpeechRecognition` does not exist in WKWebView, which is why the
   native app is silent without modes 1 or 2. Interim results stream to the
   slit; the final result is sent, or the last interim if none arrives
   within 250 ms of stop (or on `onend`).

Mode 1 has no live text — the audio is transcribed after release.

All modes keep capturing for a 320 ms release grace (people let go a beat
before the last word is out); the wave stays up meanwhile.

## Build & run

```bash
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
