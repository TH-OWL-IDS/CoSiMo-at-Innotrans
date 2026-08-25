# The journey — simulation, faults, passengers, and `apps/journey`

The MonoCab's trip is **simulated inside the realtime service**
(`apps/realtime/src/agent/telemetry.ts`) and broadcast to every client once a
second as `telemetry:update`. It is the cabin's *global* state: every seat
sees the same journey, CoSiMo answers from it (`get_telemetry`), and the
journey view draws it. That is why it lives in the hub and not in a separate
simulator service — one owner, one clock, and nothing to fall back to when a
second process dies.

**`apps/journey`** is the picture: a static, read-only, socket-only app
(`journey-cosimo.…` on the VPS, `:6104` locally) that draws the line as a
horizontal diagram with the cab moving along it in real time — out and back.

## The simulation

The route comes from the CMS `route-config` global (refreshed every 30 s;
an edit restarts the journey at the new first stop) with the built-in
Extertalbahn as the no-CMS fallback.

- **Journey:** dwell with open doors at each stop → cruise to the next with
  accel/decel ramps → dwell … → turn around at the terminals, forever.
- **Passengers:** at every stop a share of the simulated riders alight
  (everyone at a terminal) and new ones board according to the stop's
  **Andrang** (demand, 0–5). Seats with a **live CoSiMo session** — the real
  iPads — are passengers too and are never "boarded over": `occupancy` =
  live sessions + simulated, capped at capacity. The host can still set
  occupancy; the real seats are what they are.
- **Battery:** drains per driving minute, lump-recharges at the terminals.
- **Delay:** the minutes the journey has slipped against its timetable since
  the last terminal, from holds and door faults. Resets at the terminal.

### Faults

First-class simulation state, so CoSiMo can explain them ("why are we
stopped?") and the view can show them:

| kind | effect |
|---|---|
| `signal-hold` | parks the cab between stations — speed 0, progress frozen, ETAs slip by the hold |
| `door-fault` | the doors stay open; the dwell extends by the fault |
| `slow-order` | cruise speed × 0.4 on the current leg(s) |
| `low-battery` | cruise speed × 0.55 — a gentle limp to the terminal |

Each carries a bilingual cause and a countdown (`faults[]` in telemetry), ends
on its own, and is logged (`fault.start` / `fault.end`, with `by:
scenario | host`). One fault at a time.

Two sources, both CMS-editable / host-driven without a restart:

- **The scenario** (`route-config` → *Störungs-Szenario*): rules like
  *signal-hold, every 8 min, 35 %, 45 s*. Each rule rolls its dice once per
  period; the first roll is one period after boot. This is what keeps the
  unattended booth loop lively.
- **The host** (console → *Fahrt* card): ⚠ buttons inject a fault now with
  its default duration; *Störung beheben* clears everything.

### What telemetry carries for the view

`position { stopIndex, progress 0..1, direction outbound|return, phase
dwell|drive|hold }`, `stops[]` (the whole line in outbound order),
`faults[]`, `delayMinutes`, `seats { liveSessions, simulated }` — on top of
the existing speed/location/nextStops/ETAs/battery/doors.

## `apps/journey`

- A **horizontal line**: stops left → right in outbound order; the cab drives
  right on the outbound trip and **back left on the return** — same line, the
  cab flips. The travelled part of the current trip is highlighted.
- Per stop: name, and the ETA when it is ahead (*jetzt / now* on arrival).
  The cab shows speed, open doors (green), and *Halt* in orange while held.
- A **fault banner** with cause and countdown (+ delay), status tiles for
  next stop / position / passengers / battery / delay, and a **seat row**:
  blue = a real rider (live CoSiMo seat), white = simulated, hollow = free.
- **Mobile:** the diagram keeps its scale and scrolls horizontally — a line
  stays a line. The rest reflows.
- DE/EN toggle; DE by default unless the browser is English.

It connects as a host-role client (it only listens, and it must never count
as a seat). Server resolution like the other static apps: `?server=` →
`VITE_REALTIME_URL` → same-origin dev proxy.

```bash
pnpm --filter @cosimo/journey dev       # :6104
# prod: docker-compose.prod.yml → journey-cosimo.homannjohannes.de (127.0.0.1:6224)
```

## Key files

| File | Role |
|---|---|
| `apps/realtime/src/agent/telemetry.ts` | the simulation: journey, passengers, faults, scenario |
| `packages/shared/src/telemetry.ts` | `MonoCabTelemetry`, `ActiveFault`, `FaultKind`, `HostTelemetryPatch` |
| `apps/cms/src/globals/RouteConfig.ts` | stops (+ demand), scenario rules |
| `apps/console/src/HostConsole.tsx` | the ⚠ fault buttons, fault + delay display |
| `apps/journey/src/App.tsx` | the diagram |

## Look

Since 2026-08-25 the view wears the same white MonoCab CI as the console
(`@cosimo/ui`: tokens, Source Code Pro, the CoSiMo × MonoCab wordmark in
the header). The SVG line reads the same CSS variables — the travelled
track and the cab are CI red, a hold turns the cab amber.
