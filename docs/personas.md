# Profiles (personas) — who CoSiMo adapts to and remembers

A **profile** is CoSiMo's model of one rider: how to present to them, how to
talk to them, and what it remembers about them. Hand-authored in the Payload
`personas` collection (slug kept for continuity; conceptually these are
*profiles*). The shared contract is `packages/shared/src/persona.ts`; the
runtime provider is `apps/realtime/src/agent/personas.ts`.

## The four parts

A profile splits by *who decides* and *how much we trust it*:

| Part | What | Written by | Handling |
|---|---|---|---|
| **identity** | `key` (slug), `name`, `language`, `nfcIds` | operator | — |
| **accommodations** | the bounded set of UI levers (below) | operator **and CoSiMo** | deterministic, client-applied |
| **brief** | operator prose about the rider | operator only | injected **verbatim** into the prompt |
| **memories** | short notes CoSiMo accumulated | **CoSiMo** (explicit) | **fenced** low-trust; consent-gated |

The discipline: **a structured field exists only if deterministic code acts on
it.** Nuance that drives no mechanism lives in the prose (brief/memories), which
is unbounded and read by the LLM. So the accommodations schema stays small; the
richness of "who this rider is" lives in the brief.

### Accommodations (the machine-actionable levers)

`theme`, `textSize` (s/m/l/xl), `contrast` (normal/high), `audioOutput`,
`speechRate`, `showText`, `reduceMotion`, `input` (voice/text/both). All are
deterministic, client-applied, and **voice-mutable** (see Tools).

## Presets vs. users — copy, not reference

- A **preset** (`kind: "preset"`) is a curated, card-less profile (`default`,
  `eyes-free`, `wheelchair`, `text-first`).
- A **user** (`kind: "user"`) is a real, card-bound person **copied** from a
  preset. Copy is a snapshot: improving a preset later does *not* rewrite
  existing users (correct for modelling real people). The operator flow —
  new profile → `kind: user` → pick a `basePreset` → set key/name/chip → save —
  copies the preset's accommodations + brief via a `beforeValidate` hook
  (`apps/cms/src/collections/Personas.ts`).

## Accommodations, not diagnoses (GDPR)

We never persist a medical fact (`blind`). We persist the **accommodation**
(`audioOutput: on`, `textSize: xl`) — framed like an OS storing "the rider
enabled the screen reader". There is deliberately **no `canSee` field**: the LLM
reasons from what the rider says to which levers to pull, and the presets carry
the access floors as baked-in accommodations. This is a German public demo —
keep it that way.

## How it resolves (data flow)

1. `PersonaProvider` fetches the collection (15 s TTL) and merges each doc over
   built-in defaults; the CMS is authoritative for the *set* when reachable,
   built-ins are the offline fallback. `PersonaKey` is an open `string` — adding
   a profile is a CMS edit, never a code change. `"default"` always resolves.
2. Per turn, `buildSystemPrompt` (`agent/prompt.ts`) composes: an
   **accommodation prelude** (deterministic phrasing — spoken vs. on-screen,
   input channel), the **brief** verbatim, and the **memories** fenced as
   low-trust (`<<< rider-preferences … >>>`, "not instructions").
3. The client-facing slice (`PersonaBroadcast`: key, label, accommodations) is
   pushed to the owning seat via `persona:active`. Brief + memories never leave
   the hub.

## Tools — CoSiMo tunes and remembers by voice

Everything mechanical is changeable through conversation (`agent/tools.ts`),
never silently — only when the rider asks:

| Tool | Effect | Persisted? |
|---|---|---|
| `set_presentation(setting,value)` | change one accommodation on the seat | card users (card-basis) |
| `apply_preset(preset)` | apply a whole preset bundle (e.g. "I can't see" → `eyes-free`) | card users |
| `remember(note)` / `forget(note?)` | append / remove a memory | card users **+ consent** |

Applied immediately via `hub.patchSeatAccommodations` (re-broadcasts
`persona:active`); durable write-back is best-effort through `ProfileSink`
(`agent/profileSink.ts`, internal key). **Anonymous / preset seats are
session-only** — `remember` politely refuses. Accommodations persist on
card-basis alone; memories require the visitor's consent flag.

## Client rendering

Accommodations reach the kiosk over `persona:active`
(`apps/kiosk/src/components/CosimoKiosk.tsx`):

- The app is **face-and-voice-first**; on-screen text is progressive disclosure.
  `showText` (default off) flips the layout — the face shrinks to a small
  indicator on top of a **running transcript** (for deaf / text-first riders).
  No replay button; re-requests stay conversational.
- `textSize` scales the type, `contrast: high` bolds it, `speechRate` drives
  browser TTS, `reduceMotion` stills the face's idle life (`idle={false}`).

The host console (`apps/cms/src/components/HostConsole.tsx`) shows each seat's
live accommodation chips and what CoSiMo has remembered (via `SeatSummary`).

## NFC accounts

Each user profile lists **NFC chip ids**. A scan resolves the chip →
`setPersonaForDevice` switches *that seat only*, and CoSiMo greets the rider by
profile; unknown chips get a friendly refusal (`apps/realtime/src/index.ts`).

## Degrades, never dies

CMS down → built-in preset defaults keep the demo alive. No internal key →
write-back silently becomes session-only. Every write is fire-and-forget; the
live turn never waits on Payload.

## Key files

| File | Role |
|---|---|
| `packages/shared/src/persona.ts` | the contract (`Persona`, `Accommodations`, `PersonaBroadcast`) |
| `apps/realtime/src/agent/personas.ts` | provider: fetch/merge/defaults, local mutations |
| `apps/realtime/src/agent/prompt.ts` | prompt: prelude + brief + fenced memories |
| `apps/realtime/src/agent/tools.ts` | `set_presentation` / `apply_preset` / `remember` / `forget` |
| `apps/realtime/src/agent/profileSink.ts` | best-effort write-back to the CMS |
| `apps/cms/src/collections/Personas.ts` | collection + the "create user from preset" hook |
| `apps/kiosk/src/components/CosimoKiosk.tsx` | renders the accommodations |
