# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)** — it is the canonical agent guide for this
repo and links the per-system docs in [docs/](docs/) (architecture, kiosk
app, realtime service, CMS, face engine, hardware protocol, deployment).

The short version:

- pnpm monorepo: `apps/kiosk` (native iPad app) · `apps/realtime`
  (Socket.IO hub + agent) · `apps/cms` (Payload + Postgres) · shared
  contract in `packages/shared`, face engine in `packages/face`, socket
  hook in `packages/client`. Treat the three apps as separate systems.
- Verification gate: `pnpm -r --no-bail typecheck` must stay green.
- Per-seat vs global state is the core invariant; protocol changes start in
  `packages/shared`; API keys are env-only; every feature needs a
  CMS-down/LLM-down fallback; hub handlers must never throw through.
- Ports: 3001 cms · 4000 realtime · 5173 kiosk dev. Port 3000 belongs to an
  unrelated project — never kill it.
