# apps/console — the live operator console

What booth staff have open on a phone or spare iPad during the show. Its own
static service (Vite bundle, nginx in prod) — `console-cosimo.…` on the VPS,
`:5174` locally — deliberately **not** part of the CMS: the CMS is a UI for
the database and plays no role during the show, while this is the one page
that must stay up *during* it. A socket-only client of the realtime hub; it
never calls the CMS (not even for the persona list).

What booth staff have open on a phone or spare iPad. Two levels, mirroring
the state model (see [architecture.md](architecture.md)):

- **Global — the journey everyone shares:** service health (LLM, speech,
  light, network, offline-canned, server STT/TTS), live telemetry with demo
  force buttons (pause/resume the journey, drop battery to 15 %), the
  demo/offline toggle, **recover** (un-sticks every seat), persona for all
  seats at once.
- **Per seat — one card per iPad with an active visitor:** live face +
  phase, the profile (label, accommodations, stored memories), a persona
  dropdown (the manual stand-in for an NFC tap), cabin toggles (override or
  test the light path), the last utterance/reply, **reset** for the next
  visitor, and **inspect** 🔍 — the exact system prompt that seat would use
  right now plus its full turn log with tool actions, outcomes and
  latencies (the "why did CoSiMo say that?" tool).

Idle connected seats show as small chips. The persona pickers are built from
`host:personas`, pushed by the hub — no CMS query. **Unauthenticated**: anyone
who connects as `role: "host"` can reset seats, wherever the page is served
from, so the fix is a host token checked by the hub on `hello`, not a login
on the page. Add it before the fair.

## Where it connects

Resolution order mirrors the kiosk: `?server=https://…` in the URL (remembered
in localStorage; `?server=` clears it) → the build-time `VITE_REALTIME_URL` →
same-origin (the Vite dev proxy to `:4000`). The prod image bakes the ws- host;
the realtime CORS list must include the origin (prod overlay adds `https://$COSIMO_CONSOLE_DOMAIN`, dev allows `localhost:5174`).

## Run

```bash
pnpm --filter @cosimo/console dev         # :5174, socket proxied to :4000
# prod: part of docker-compose.prod.yml → console-cosimo.homannjohannes.de
```
