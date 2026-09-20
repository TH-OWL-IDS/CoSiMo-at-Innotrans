# apps/form — the visitor questionnaire

A static site at `form-cosimo.homannjohannes.de` that visitors open from a
QR code after trying CoSiMo, on their own phone. Nine 7-point items, German
or English, submitted once per browser tab into the CMS collection
`survey-responses`. **Independent of the CoSiMo sessions** — no seat, no
session id, no card, nothing that links a response to a conversation.

It is the one visitor-facing surface that depends on the CMS. That is a
deliberate exception to "the CMS plays no role during the show": a
questionnaire outage costs answers, never the demo, and it is isolated
(the kiosks and the hub never touch it).

## The instrument

Defined once in `packages/shared/src/survey.ts` (`SURVEY_ITEMS`,
`SURVEY_BLOCKS`, `SURVEY_AGREE_ANCHORS`, `SURVEY_VERSION`):

| Block | Items | Scale |
|---|---|---|
| UMUX-Lite (Lewis, Utesch & Maher 2015) | „Die Funktionen von CoSiMo erfüllen meine Anforderungen." · „CoSiMo ist einfach zu benutzen." | agreement 1–7 |
| AttrakDiff mini (Hassenzahl & Monk 2010), pragmatic quality + attractiveness | „CoSiMo ist …" verwirrend–übersichtlich · kompliziert–einfach · unberechenbar–voraussagbar · unpraktisch–praktisch · hässlich–schön | word pair 1–7 |
| UTAUT attitude toward using (Venkatesh et al. 2003) | „Die Nutzung von CoSiMo ist eine … Idee." schlechte–gute | word pair 1–7 |
| Behavioral intention (TAM2, Venkatesh & Davis 2000) | „Vorausgesetzt, ich hätte Zugang zu CoSiMo, beabsichtige ich, es zu nutzen." | agreement 1–7 |

„Das System" reads as „CoSiMo" throughout; AttrakDiff's „schlecht–gut" was
dropped as a near twin of the UTAUT item. All items are required (decided
2026-09-20); consent is the only thing the server enforces.

**Changing an item** = bump `SURVEY_VERSION`, adjust the hand-written field
in `apps/cms/src/collections/SurveyResponses.ts` (the `satisfies
Record<SurveyItemId, Field>` makes a mismatch a type error), and ship a
Payload migration. Old rows keep their version, so the analysis can tell.

## Data flow

```
phone ── GET  /api/survey-start ──▶ nginx (form) ──▶ cms   token = HMAC(open time)
phone ── POST /api/survey-responses ▶ nginx (form) ──▶ cms   hook validates, stamps, flags
```

- **Same-origin, no CORS.** `apps/form/nginx.conf` proxies exactly those two
  paths to the `cms` container (resolved at request time via Docker DNS —
  a literal `proxy_pass` would 502 forever after a cms restart) and answers
  404 for everything else under `/api/`. Dev: the Vite proxy forwards
  `/api` to `:6100`. The CMS `cors` list is untouched.
- **Once per tab.** The page mints a random `responseId` into
  `sessionStorage` and reuses it on reload; the CMS field is `unique`, so a
  second POST from the same tab is refused. After a success the tab holds a
  done-marker and shows only the thank-you. A new QR scan opens a new tab
  and may answer again — chosen knowingly; the unique id is the real guard.
  Every storage access is wrapped (Lockdown Mode, blocked cookies and some
  in-app browsers throw) with an in-memory fallback.
- **The honest timer.** `GET /api/survey-start` (root endpoint,
  `surveyToken.ts`) returns the open time signed with `SURVEY_TOKEN_SECRET`
  (falls back to `PAYLOAD_SECRET`). The submit carries it in
  `x-cosimo-start`; the collection hook checks signature and age. Missing,
  forged, older than two hours or younger than 20 s → the row is **flagged
  `suspect`** with a reason, never rejected (a fast honest visitor must not
  lose their answers; junk is filtered in the export). No honeypot: the
  submit is JSON, a hidden form field would catch nothing.
- **The hook rebuilds the document** (`beforeValidate`): only known keys,
  every item an integer 1–7, `lang` de/en, `responseId` 8–64 url-safe
  chars, `formVersion` stamped server-side, `durationSec` (client-measured,
  metadata) clamped. `consent !== true` → 403, nothing stored.
- **Nothing is ever updated**; operators read, admins delete.
- **Degrades.** A network failure keeps the draft in the tab, tells the
  visitor, retries once automatically after 4 s and on the button. A 5xx
  counts as network. A duplicate `responseId` rotates the id and retries
  once.

## Privacy

Anonymous by construction: no IP (nginx `access_log off` on the API
locations — the notice promises it), no user agent, no session link, no
name. The Art. 13 notice (`apps/form/src/i18n.ts`) names the controller
(TH OWL, project CoSiMo), the purpose, what is stored and what is not, that
and that a response cannot be attributed and therefore not deleted after
submission. `CONTACT` in `i18n.ts` adds a contact line when set (empty = no
line, the user's choice). Whether the institution wants an ethics vote for
a visitor survey is outside this repo.

## Look

The form imports `@cosimo/ui` for the CI (tokens, fonts, `Brand`) but
deliberately overrides its operator tuning in `apps/form/src/index.css`: a
17 px body (below 16 px iOS Safari zooms every input), the system sans
instead of the monospace, a visible focus ring (the console switched it
off for its touch surface), 44 px scale dots, anchors above the row so
seven dots fit a 360 px phone, a 760 px column on larger screens, a hairline
between the blocks instead of headings (the AttrakDiff stem „CoSiMo ist …"
is the heading of each word-pair card). Real `<input type="radio">` inside
`<fieldset>/<legend>` with an `aria-label` per number carrying its meaning
— VoiceOver announces "Stimme zu, 6 von 7". Do not "fix" the overrides back
to the console look.

## Run

```bash
pnpm --filter @cosimo/form dev        # :6105, /api proxied to the cms on :6100
docker compose up -d postgres cms     # the API it needs
# prod: ./start.sh form   → 127.0.0.1:6225, Cloudflare form-cosimo.… → localhost:6225
```

Try the hook without the page:

```bash
curl -s -X POST localhost:6100/api/survey-responses -H 'content-type: application/json' \
  -d '{"responseId":"test12345678","lang":"de","consent":true,"umuxCapabilities":5,"umuxEase":6,"adConfusingClear":5,"adComplicatedSimple":6,"adUnpredictablePredictable":4,"adImpracticalPractical":5,"adUglyAttractive":6,"utautAttitude":6,"biIntend":5,"durationSec":90}'
```

## Export

```bash
pnpm --filter @cosimo/cms survey:export > antworten.csv          # dev
docker compose exec cms pnpm survey:export /tmp/antworten.csv    # VPS, then docker cp
```

Semicolon-separated, UTF-8 BOM (German Excel), columns ordered by the
instrument, `suspect`/`suspectReason` at the end for filtering. The admin
list (Research → Survey Responses) shows the same rows.

## The console

The hub probes the form like the other static sites (`SERVICE_URL_FORM`,
`COSIMO_FORM_DOMAIN`) and the Übersicht's Services card lists it with a
restart button — its outage is otherwise silent.

## Key files

| File | Role |
|---|---|
| `packages/shared/src/survey.ts` | the instrument: items, blocks, anchors, version, submission shape |
| `apps/cms/src/collections/SurveyResponses.ts` | the collection, access, the validating hook |
| `apps/cms/src/collections/surveyToken.ts` | start token: issue, verify, the root endpoint |
| `apps/cms/src/scripts/exportSurvey.ts` | CSV export |
| `apps/form/src/App.tsx` · `ScaleItem.tsx` · `i18n.ts` · `storage.ts` · `submit.ts` | the page |
| `apps/form/nginx.conf` | the two proxied paths, rate limit, no access log |
