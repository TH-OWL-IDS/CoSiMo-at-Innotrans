# Profiles (personas) — who CoSiMo adapts to and remembers

A **profile** is CoSiMo's model of one rider: how to present to them, how to
talk to them, and what it remembers about them. Authored in the Payload
`personas` collection (slug kept for continuity; conceptually these are
*profiles*). The shared contract is `packages/shared/src/persona.ts`; the
runtime provider is `apps/realtime/src/agent/personas.ts`.

## The four parts

A profile splits by *who decides* and *how much we trust it*:

| Part | What | Written by | Handling |
|---|---|---|---|
| **identity** | `key` (slug), `label`, `name`, `nfcIds` | operator | — |
| **accommodations** | the bounded set of UI levers (below) | operator **and CoSiMo** | deterministic, client-applied |
| **brief** | operator prose about the rider | operator only | injected **verbatim** into the prompt |
| **memories** | short notes CoSiMo accumulated | **CoSiMo** (explicit) | **fenced** low-trust; consent-gated |

The discipline: **a structured field exists only if deterministic code acts on
it.** Nuance that drives no mechanism lives in the prose (brief/memories), which
is unbounded and read by the LLM. So the accommodations schema stays small; the
richness of "who this rider is" lives in the brief.

### Accommodations (the machine-actionable levers)

`language` (de/en — the rider's preferred language), `theme`, `textSize`
(s/m/l/xl), `contrast` (normal/high), `audioOutput`, `speechRate`, `showText`,
`reduceMotion`, `input` (voice/text/both). All are deterministic,
client-applied, and **voice-mutable** (see Tools).

Language note: **personal profiles have *a* language; shared non-personal
content stays bilingual** (`Record<Locale, …>` for telemetry, cabin labels,
consent). A rider's `label` is their name — no translation. The profile
language drives the prompt ("reply in …"), the NFC greeting, and the kiosk's
default UI language.

## One clean plate, no presets

There is deliberately **no preset/bundle concept**. Every profile is a rider;
`default` is the shared **clean plate** — the neutral profile a walk-up
(no card) seat runs, and the template new riders are **copied** from (a
`copyFrom` relationship snapshots accommodations + brief on create; later edits
to the source do not propagate). The operator flow: new profile → pick
`copyFrom: default` → set key/name/chip → save, then tailor. The clean plate is
never mutated by a session.

When something big changes about a rider ("I can't see anymore"), there is no
bundle to apply — **the LLM decides fine-grained which specific levers this
rider needs** (given the brief and memories) and sets each one via
`set_presentation`, confirming briefly.

## Accommodations, not diagnoses (GDPR)

We never persist a medical fact (`blind`). We persist the **accommodation**
(`audioOutput: on`, `textSize: xl`) — framed like an OS storing "the rider
enabled the screen reader". There is deliberately **no `canSee` field**: the
LLM reasons from what the rider says to which levers to pull. This is a German
public demo — keep it that way.

## How it resolves (data flow)

1. `PersonaProvider` fetches the collection (15 s TTL); the CMS is
   authoritative for the *set* when reachable, the built-in clean plate is the
   offline fallback. `PersonaKey` is an open `string` — adding a profile is a
   CMS edit, never a code change. `"default"` always resolves.
2. Per turn, `buildSystemPrompt` (`agent/prompt.ts`) composes: the **core
   prompt** (CMS-editable via the operator-config global's
   `agent.systemPrompt`; empty = built-in `DEFAULT_CORE_PROMPT`), then the
   rider section — name + **brief** verbatim, a deterministic **accommodation
   prelude** (spoken vs. read, input channel, preferred language), and the
   **memories** fenced as low-trust (`<<< rider-preferences … >>>`, "not
   instructions"). The rider section is always code-built so an operator edit
   can't drop it.
3. The client-facing slice (`PersonaBroadcast`: key, label, accommodations) is
   pushed to the owning seat via `persona:active`. Brief + memories never leave
   the hub.

## Tools — CoSiMo tunes and remembers by voice

Everything mechanical is changeable through conversation (`agent/tools.ts`),
never silently — only when the rider asks:

| Tool | Effect | Persisted? |
|---|---|---|
| `set_presentation(setting,value)` | change one accommodation on the seat (validated per field) | card-bound riders (card-basis) |
| `remember(note)` / `forget(note?)` | append / remove a memory note | card-bound riders **+ consent** |

Applied immediately via `hub.patchSeatAccommodations` (re-broadcasts
`persona:active`); durable write-back is best-effort through `ProfileSink`
(`agent/profileSink.ts`, internal key). **Anonymous seats (the clean plate) are
session-only** — `remember` politely refuses, and `default` is never written
back. Accommodations persist on card-basis alone; memories require the
visitor's consent flag.

## Client rendering

Accommodations reach the kiosk over `persona:active`
(`apps/kiosk/src/components/CosimoKiosk.tsx`):

- The app is **face-and-voice-first**; on-screen text is progressive
  disclosure. `showText` (default off) flips the layout — the face shrinks to a
  small indicator on top of a **running transcript** (for deaf / text-first
  riders). No replay button; re-requests stay conversational ("say that
  again").
- `textSize` scales the type, `contrast: high` bolds it, `speechRate` drives
  browser TTS, `reduceMotion` stills the face's idle life (`idle={false}`),
  `language` sets the seat's UI default.

The host console (`apps/cms/src/components/HostConsole.tsx`) builds its persona
pickers from the live CMS set (`host:personas`) and shows each seat's label.

## NFC accounts

Each rider profile lists **NFC chip ids**. A scan resolves the chip →
`setPersonaForDevice` switches *that seat only*, and CoSiMo greets the rider by
name **in their own preferred language**; unknown chips get a friendly refusal
(`apps/realtime/src/index.ts`). A card tap also barges in on any running turn.
The seed ships five mockup riders with typeable chips (`ANNA1`, `BRUNO1`,
`CLARA1`, `DAVID1`, `EMIL1`) — simulate a scan by typing `[` + chip id +
`Enter` into a focused kiosk, or via a socket `nfc:register`.

## Degrades, never dies

CMS down → the built-in clean plate keeps every seat working. No internal key →
write-back silently becomes session-only. Every write is fire-and-forget; the
live turn never waits on Payload.

## Key files

| File | Role |
|---|---|
| `packages/shared/src/persona.ts` | the contract (`Persona`, `Accommodations`, `PersonaBroadcast`) |
| `apps/realtime/src/agent/personas.ts` | provider: fetch/merge/clean-plate fallback, local mutations |
| `apps/realtime/src/agent/prompt.ts` | prompt: CMS-editable core + prelude + brief + fenced memories |
| `apps/realtime/src/agent/tools.ts` | `set_presentation` / `remember` / `forget` |
| `apps/realtime/src/agent/profileSink.ts` | best-effort write-back to the CMS |
| `apps/cms/src/collections/Personas.ts` | collection + the `copyFrom` create hook |
| `apps/cms/src/seed.ts` | clean plate + the five mockup riders |
| `apps/kiosk/src/components/CosimoKiosk.tsx` | renders the accommodations |
