# packages/face + packages/client — the face engine and the socket hook

(The seat *around* the face — stage, cutouts, transcript, consent — is
`packages/seat-ui`, see [emulator.md](emulator.md).)

## packages/face

CoSiMo's hand-drawn scribble face, ported from the CoSiMo-mockup project
(the richer version — the earlier in-CMS port was a reduced copy and is
gone). SVG strokes traced from the original ballpoint artwork, wobbled into
pen-like lines by a turbulence filter (`ScribbleCanvas`). Single stroke
pass — an offset "overdraw" retrace used to add sketchiness, but WKWebView
renders the displacement filter weakly and it read as a hard double image
on the iPads, so it's gone everywhere.

### How animation works

Every expression is a **flat record of numbers** (`FaceParams` in
`states.ts`: eye openness, brow lift/slant/curve, mouth width/curve/open,
gaze, tilt). Because all poses share the same parameter space, any two can
be tweened (`useTweenedParams`, rAF ease-out) — no SVG path-command
mismatches, and ambient motion composes with expression morphs instead of
fighting them.

On top of the tweened pose, `faceAmbient` layers idle life from a continuous
clock (`useAmbientClock`): breathing, slow sway/bob, wandering gaze with
saccades, per-eye blink jitter with occasional double-blinks, brow
micro-lifts, and a 2.5D head turn (features slide + compress + roll). All
oscillators rest at exactly the pose when the clock is 0, so disabling idle
gives the pure expression.

**Speaking:** two tiers. With server TTS playing, the mouth follows the
**actual voice**: the client samples the clip through a Web Audio analyser
and passes a `mouthDrive` getter — the loudness envelope opens the mouth
(emphasis pops, pauses close it) and spectral brightness widens it (bright
"iii" vs round "ooo"). Without an analysable stream (browser-TTS fallback)
the mouth falls back to the procedural cadence — a syllable-rate oscillator
with a word-level swell and pause gating. Both only while the emotion is
`"speaking"`, which is gated by real playback (see below).

The emotion vocabulary (`FaceEmotion`) lives in `@cosimo/shared`, not here —
the realtime service chooses emotions, the face renders them; one shared
type keeps them in lockstep. Color theming comes via `currentColor` + the
`ColorScheme` list (`schemes.ts`); personas select schemes by id.

## packages/client

`useCosimoSocket(serverUrl, role)` — the one hook every client uses (kiosk
and host console). Wraps the Socket.IO connection and exposes CoSiMo's live
state: connection, emotion, phase, streaming reply, telemetry, per-seat
cabin state, persona, seat summaries (hosts), plus all actions (send text,
push-to-talk lifecycle, utterance upload, NFC registration, consent, host
controls).

**The mouth-sync trick lives here:** `faceEmotion = speaking ? "speaking" :
emotion`, where `speaking` flips on/off from **actual audio playback events**
(server TTS `<audio>` element, or browser speechSynthesis callbacks). The
server's emotion says what CoSiMo feels; playback timing says when the mouth
moves. Server and client stay decoupled, and the lips match the voice even
with variable TTS latency. On top of the timing, `getMouthDrive()` exposes
the playing clip's live loudness + brightness (Web Audio `AnalyserNode`,
attack/release-smoothed) so the face can shape the mouth to the voice; the
AudioContext is unlocked on the consent/talk gestures (WKWebView rule).

Empty `serverUrl` means same-origin (the Vite dev proxy). The hook
regenerates a session id when the host resets the seat (`session:reset` →
`resetNonce` bump so the kiosk can re-show the consent screen).
