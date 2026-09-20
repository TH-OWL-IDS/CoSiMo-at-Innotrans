import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Send } from "lucide-react";
import {
  SURVEY_BLOCKS,
  SURVEY_ITEMS,
  SURVEY_VERSION,
  type Locale,
  type SurveyBlock,
  type SurveyItemId,
  type SurveySubmission,
} from "@cosimo/shared";
import { Brand, Button, cn } from "@cosimo/ui";
import ScaleItem from "./ScaleItem";
import { STRINGS } from "./i18n";
import { KEYS, read, remove, responseId, write } from "./storage";
import { ensureStartToken, submitSurvey } from "./submit";

/**
 * The questionnaire — one scrolling page: intro, the four blocks, the
 * privacy notice, consent, submit. Language from `?lang=`, else the
 * browser, else German; the toggle writes it back to the URL and to
 * <html lang>. Answers are kept as a draft per tab so a reload or a
 * locked phone loses nothing; a submission that fails on the network is
 * retried by the visitor or, once, automatically.
 */

type Answers = Partial<Record<SurveyItemId, number>>;
type Phase = "form" | "sending" | "done" | "already";

function initialLang(): Locale {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "de" || q === "en") return q;
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

function readDraft(): Answers {
  try {
    const raw = read(KEYS.draft);
    return raw ? (JSON.parse(raw) as Answers) : {};
  } catch {
    return {};
  }
}

const BLOCK_ORDER: SurveyBlock[] = ["umux", "attrakdiff", "utaut", "bi"];

export default function App() {
  const [lang, setLang] = useState<Locale>(initialLang);
  const s = STRINGS[lang];
  const [answers, setAnswers] = useState<Answers>(readDraft);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>(() => (read(KEYS.done) ? "already" : "form"));
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<{ kind: "network" | "rejected"; detail?: string } | null>(null);
  const tokenRef = useRef<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Language → <html lang> (screen readers pick the voice from it) and the URL.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === "de" ? "CoSiMo Befragung" : "CoSiMo Survey";
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState(null, "", url);
  }, [lang]);

  // The timer starts when the tab first opens; the token rides along.
  useEffect(() => {
    if (!read(KEYS.startedAt)) write(KEYS.startedAt, String(Date.now()));
    void ensureStartToken().then((t) => { tokenRef.current = t; });
  }, []);

  // Draft per tab.
  useEffect(() => {
    write(KEYS.draft, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    if (phase === "done" || phase === "already") doneRef.current?.focus();
  }, [phase]);

  const answered = SURVEY_ITEMS.filter((i) => answers[i.id] != null).length;
  const missing = useMemo(() => SURVEY_ITEMS.filter((i) => answers[i.id] == null).map((i) => i.id), [answers]);
  const indexOf = (id: SurveyItemId) => SURVEY_ITEMS.findIndex((i) => i.id === id) + 1;

  const send = async () => {
    setAttempted(true);
    setError(null);
    if (missing.length > 0 || !consent) {
      // focus the summary so a screen reader hears it; scroll the first gap into view
      requestAnimationFrame(() => {
        alertRef.current?.focus();
        const first = missing[0];
        if (first) document.getElementById(`item-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setPhase("sending");
    const started = Number(read(KEYS.startedAt) ?? Date.now());
    const durationSec = Math.max(0, Math.round((Date.now() - started) / 1000));
    const body = {
      ...(answers as Record<SurveyItemId, number>),
      responseId: responseId(),
      lang,
      consent: true as const,
      durationSec,
    } satisfies SurveySubmission;
    const token = tokenRef.current ?? (await ensureStartToken());
    const result = await submitSurvey(body, token);
    if (result.ok) {
      write(KEYS.done, new Date().toISOString());
      remove(KEYS.draft);
      setPhase("done");
      return;
    }
    setError({ kind: result.kind, detail: result.detail });
    setPhase("form");
  };

  // One automatic retry after a network failure — the hall's Wi-Fi blinks.
  useEffect(() => {
    if (error?.kind !== "network") return;
    const t = setTimeout(() => { void send(); }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (phase === "done" || phase === "already") {
    const done = phase === "done";
    return (
      <Shell lang={lang} onLang={setLang} s={s}>
        <section className="flex flex-col items-center gap-4 rounded-xl border border-line bg-white px-5 py-10 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-ink text-white"><Check size={28} /></span>
          <h1 ref={doneRef} tabIndex={-1} className="m-0 text-2xl font-black focus:outline-none">{done ? s.thanksTitle : s.alreadyTitle}</h1>
          <p className="m-0 max-w-[40ch] text-base leading-relaxed">{done ? s.thanks : s.already}</p>
        </section>
      </Shell>
    );
  }

  let n = 0;
  return (
    <Shell lang={lang} onLang={setLang} s={s}>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-2xl font-black">{s.title}</h1>
        <p className="m-0 text-base leading-relaxed">{s.intro}</p>
      </header>

      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="flex flex-col gap-8"
      >
        {BLOCK_ORDER.map((b) => {
          const block = SURVEY_BLOCKS[b];
          const items = SURVEY_ITEMS.filter((i) => i.block === b);
          const hint = items[0]?.kind === "agree" ? s.agreeHint : s.scaleHint;
          return (
            <section key={b} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-lg font-bold">{block.title[lang]}</h2>
                {block.stem && <p className="m-0 text-base text-mute">{block.stem[lang]}</p>}
                <p className="m-0 text-sm text-mute">{hint}</p>
              </div>
              {items.map((item) => {
                n += 1;
                return (
                  <ScaleItem
                    key={item.id}
                    item={item}
                    index={n}
                    lang={lang}
                    s={s}
                    value={answers[item.id]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [item.id]: v }))}
                    invalid={attempted && answers[item.id] == null}
                  />
                );
              })}
            </section>
          );
        })}

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-well p-4">
          <h2 className="m-0 text-lg font-bold">{s.privacyTitle}</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {s.privacy.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 text-base leading-snug", attempted && !consent ? "border-2 border-accent" : "border-line")}>
            <input
              type="checkbox"
              className="mt-0.5 size-6 shrink-0 accent-ink"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={attempted && !consent ? true : undefined}
              required
            />
            <span>{s.consent}</span>
          </label>
        </section>

        {/* the summary of what is missing, focused after a failed attempt */}
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className={cn("flex flex-col gap-2 rounded-xl border-2 border-accent bg-white p-4 focus:outline-none", !(attempted && (missing.length > 0 || !consent)) && "hidden")}
        >
          <div className="flex items-center gap-2 text-base font-bold"><CircleAlert size={18} className="text-accent" /> {s.missingTitle}</div>
          {missing.length > 0 && (
            <p className="m-0 text-base">
              {s.missing(missing.length)}{" "}
              <a href={`#item-${missing[0]}`} className="text-accent underline" onClick={(e) => { e.preventDefault(); document.getElementById(`item-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                {s.jump} {indexOf(missing[0]!)}
              </a>
            </p>
          )}
          {!consent && <p className="m-0 text-base">{s.missingConsent}</p>}
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-warn bg-warn-soft p-4">
            <div className="flex items-center gap-2 text-base font-bold text-warn"><CircleAlert size={18} /> {s.errorTitle}</div>
            <p className="m-0 text-base">{error.kind === "network" ? s.errorNetwork : s.errorRejected}</p>
            {error.detail && <p className="m-0 text-sm text-mute">{error.detail}</p>}
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <span className="text-sm tabular-nums text-mute" aria-live="polite">{s.progress(answered, SURVEY_ITEMS.length)}</span>
          <Button type="submit" variant="primary" size="lg" className="min-h-12 text-lg" disabled={phase === "sending"}>
            {phase === "sending" ? s.sending : error ? s.retry : s.submit} <Send size={18} />
          </Button>
        </div>
      </form>
    </Shell>
  );
}

/** Header with the wordmark and the language toggle; the page column; the version line. */
function Shell({ lang, onLang, s, children }: { lang: Locale; onLang: (l: Locale) => void; s: (typeof STRINGS)["de"]; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col gap-6 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Brand size={34} />
        <div role="group" aria-label={s.lang} className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["de", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={lang === l}
              onClick={() => onLang(l)}
              className={cn("focus-ring min-h-10 cursor-pointer border-0 px-3 text-sm font-semibold uppercase", lang === l ? "bg-ink text-white" : "bg-white text-mute")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {children}
      <p className="m-0 text-center text-xs text-mute">{s.version} {SURVEY_VERSION}</p>
    </main>
  );
}
