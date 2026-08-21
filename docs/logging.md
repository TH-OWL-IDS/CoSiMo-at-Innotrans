# The debug log — every turn, every tool call, live

A structured event stream from the realtime service: one `LogEvent` per
meaningful step (`packages/shared/src/log.ts`), pushed live to the
[operator console](console.md)'s **Log** tab, kept in a ring buffer for
late joiners, and written to daily NDJSON files that survive restarts.

It is the **debugging** record. The consent-gated `sessions` collection in
the CMS is the **research** record. Different obligations, different stores
— the debug log never goes through Payload, and the research data never
carries debug noise.

## The events

The per-seat **turn number** is the join key: one turn, N events. A typical
voice turn that switches the light on reads:

```
stt.result      142 chars in 610 ms (38 kB audio/webm)
turn.start      voice · de · anthropic/claude-opus-4-8 · "Mach bitte das Licht an"
llm.step        step 0: 0 chars, tools set_cabin_control · 820 ms
cabin.actuate   interior-light {"on":true} → http://10.0.0.50/ajax/pb01/in=100
tool.call       set_cabin_control({"control":"interior-light","on":true}) → ok: … · 3 ms
cabin.result    interior-light ok                       ← the seat reporting back
llm.step        step 1: 24 chars, no tools · 640 ms
tts.done        24 chars → 31 kB in 380 ms
turn.end        ok · 2470 ms (stt 610, llm 1460, tts 380) · 1 tool · happy · "Ich schalte das Licht an."
```

| Kind | When | Carries |
|---|---|---|
| `seat.connect` / `seat.disconnect` | a kiosk seat says hello / drops (host consoles are not logged — they are the observer) | role |
| `consent` | the visitor decides | consent |
| `nfc.scan` | a card is tapped | chip id, resolved profile (or null → warn) |
| `persona.switch` | a seat's profile changes | profile, by `nfc` / `host` / `boot` |
| `turn.start` | a user turn is accepted | text, modality, lang, profile, consent, llm provider+model (null = canned), history length |
| `stt.result` | Deepgram answered | chars, duration, audio size/mime (0 chars → warn) |
| `llm.step` | one generation step finished | step no., streamed chars, tool names, duration |
| `tool.call` | a tool ran | name, **input**, **result text**, ok, duration (error → warn) |
| `cabin.actuate` | the hub handed URLs to a seat | control, change, the exact URLs |
| `cabin.result` | the seat reported back | control, ok, error (failure → warn) |
| `tts.done` | ElevenLabs answered | chars, bytes, duration |
| `turn.end` | the turn settled | outcome, reply, emotion, total latency, **timings** (stt/llm/tts), tool count, error message |
| `host.action` | an operator did something | action + args |

Levels: `debug` (stt/llm/tts timing), `info` (the rest), `warn` (a failed tool
or actuation, an unknown card, empty STT), `error` (a turn that errored).

## Where it lives

1. **Ring buffer** (`LOG_BUFFER`, default 5 000) in the realtime process. A
   host console receives it as a replay on connect (`host:log` with
   `replay: true`), then live events one by one. `host:log:replay { since }`
   re-requests it after a reconnect.
2. **Daily NDJSON files** — `LOG_DIR/cosimo-YYYY-MM-DD.ndjson` (default
   `apps/realtime/logs/`, mounted as `./logs` in compose), one JSON object
   per line, pruned after `LOG_KEEP_DAYS` (14). Greppable, `jq`-able,
   importable anywhere. The file keeps full text; the streamed copy
   truncates long fields (tool results, replies) at 2 000 chars.
3. **The console's Log tab** — live tail with pause (freezes the view, keeps
   buffering), filters by seat / session / kind / minimum level / free text,
   "turns only" preset, rows grouped visually per turn, click a row for the
   raw JSON, **export** the current filter as NDJSON.

The per-seat **inspector** (🔍 on a seat card) shows the same turns from the
recorder's side: every `actions[]` entry with result and duration, the error
message, and the live system prompt.

## Transcripts and GDPR

Visitor and CoSiMo text **is** logged, by decision, for the development
phase. `LOG_TRANSCRIPTS=false` is the one switch: it blanks `turn.start.text`
and `turn.end.reply` in both the file and the stream while keeping everything
mechanical (tools, actuations, timings, errors). Flip it before the fair if
the research consent text does not cover debug logging; the `sessions`
collection stays consent-gated regardless.

## Rules

- **Anything a turn does must emit a LogEvent.** A new tool, a new
  actuator, a new fallback path — add the event (and its `kind`, in shared)
  in the same change. If it isn't in the log, it didn't happen.
- `logger.log()` never throws and never awaits: disk trouble degrades to
  buffer + socket, a slow host socket is Socket.IO's problem. Do not put the
  live path behind it.
- Don't log the system prompt per turn (it is long and the inspector shows
  it on demand) and don't log audio.

## Key files

| File | Role |
|---|---|
| `packages/shared/src/log.ts` | `LogEvent` — the discriminated union of kinds |
| `apps/realtime/src/log/logger.ts` | ring buffer + NDJSON writer + host fan-out |
| `apps/realtime/src/hub.ts` | host subscription, seat/consent/persona/cabin/host events |
| `apps/realtime/src/agent/agent.ts` | turn.start / llm.step / tool.call / tts.done / turn.end |
| `apps/realtime/src/index.ts` | stt.result, nfc.scan |
| `packages/client/src/useCosimoSocket.ts` | `logs`, `clearLogs`, `replayLogs` |
| `apps/console/src/LogView.tsx` | the Log tab |
