import { Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import { DEFAULT_INFO_QUESTION, type PersonaBroadcast } from "@cosimo/shared";
import { Button, cn } from "@cosimo/ui";
import { Bullets, Note, P, Section, Steps, SubNav, Table } from "./doc";
import { LangToggle, picker, useDocLang, type DocLang } from "./docLang";
import { CardIcon, InfoIcon, LightIcon, PanelKey, TalkIcon } from "./PanelIcons";

/**
 * The Begleiten view — the run-sheet for the two people who accompany
 * visitors at the cab (not engineers), German or English on the page,
 * compact enough for a phone and one printed sheet. The flow of one short
 * showcase, how the seat works (with the panel's own symbols), who the four
 * riders on the cards are, sentences that always work as plain lists, what
 * CoSiMo cannot do, what to do when it sticks — and the console's address
 * with its password, so the operations are one tap away.
 */

/** The console and its password — printed on purpose (decided 2026-09-21):
 *  the page itself sits behind that lock, and the sheet lies at the booth. */
const CONSOLE_URL = "https://console-cosimo.homannjohannes.de";
const CONSOLE_PASSWORD = "innotrans26";
const JOURNEY_URL = "https://journey-cosimo.homannjohannes.de";
const FORM_URL = "https://form-cosimo.homannjohannes.de";

/** Who the four riders are, in plain words — beside the live profile row. */
const RIDERS: Record<string, { who: [string, string]; changes: [string, string]; say: string; note?: [string, string] }> = {
  alex: {
    who: ["68, sieht sehr wenig, orientiert sich über Hören und Tasten.", "68, sees very little, gets around by hearing and touch."],
    changes: ["Zeigt nichts an, sagt alles laut, bestätigt jede Aktion hörbar.", "Shows nothing, says everything aloud, confirms every action audibly."],
    say: "Mach das Licht aus.",
  },
  noa: {
    who: ["25, liest lieber mit, mag es ruhig und kontrastreich.", "25, prefers to read along, likes it calm and high-contrast."],
    changes: ["Text im Schlitz, dunkles Schema, ruhiges Gesicht, leise ruhige Stimme, kurze Antworten.", "Text in the slit, dark scheme, calm face, quiet calm voice, short replies."],
    say: "Wann kommt der nächste Halt?",
  },
  luca: {
    who: ["42, nutzt Technik selten, braucht einfache, klare Schritte.", "42, rarely uses technology, needs simple, clear steps."],
    changes: ["Gelbes Schema, Text im Schlitz, langsame warme Stimme, eine Sache pro Antwort, nur Grundfunktionen.", "Yellow scheme, text in the slit, slow warm voice, one thing per reply, basics only."],
    say: "Mach das Licht gemütlich.",
  },
  sam: {
    who: ["33, pendelt täglich, will es schnell, spricht Englisch.", "33, commutes daily, wants it quick, speaks English."],
    changes: ["Begrüßung und Antworten auf Englisch, männliche Stimme, ein Satz und fertig.", "Greeting and replies in English, male voice, one sentence and done."],
    say: "When is the next stop?",
    note: ["auf Englisch fragen", "ask in English"],
  },
};

const ORDER = ["alex", "noa", "luca", "sam"];

/** A compact group of sentences: one line each, German bold, English muted, a note if any. */
function Sentences({ title, items, lang }: { title: string; items: [string, string, [string, string]?][]; lang: DocLang }) {
  const t = picker(lang);
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 text-base font-bold">{title}</h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map(([de, en, note]) => (
          <li key={de} className="flex flex-wrap items-baseline gap-x-3 border-b border-line-soft py-1 text-base leading-snug last:border-b-0">
            <span className="font-semibold">„{de}“</span>
            <span className="text-mute">“{en}”</span>
            {note && <span className="text-sm text-mute">· {t(note[0], note[1])}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GuidePage({ c }: { c: CosimoState }) {
  const [lang, setLang] = useDocLang();
  const t = picker(lang);
  const live = new Map(c.personas.filter((p) => p.persona !== "default").map((p) => [p.persona, p] as [string, PersonaBroadcast]));
  const riders = [...ORDER.filter((k) => live.size === 0 || live.has(k)), ...[...live.keys()].filter((k) => !ORDER.includes(k))];
  const scenes = c.light?.scenes.map((s) => s.label).filter(Boolean) ?? ["Standard", "Gemütlich", "Hell"];
  // The info button's real question, as the CMS has it right now (else the built-in default).
  const infoQ = c.hostConfig?.infoQuestion ?? DEFAULT_INFO_QUESTION;

  const NAV = [
    { id: "g-ablauf", label: t("Ablauf", "The flow") },
    { id: "g-sitz", label: t("Der Sitz", "The seat") },
    { id: "g-karten", label: t("Die Karten", "The cards") },
    { id: "g-saetze", label: t("Sätze", "Sentences") },
    { id: "g-nicht", label: t("Grenzen", "Limits") },
    { id: "g-hakt", label: t("Wenn es hakt", "When it sticks") },
  ];

  return (
    <div className="doc-large flex flex-col gap-8 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-4xl font-black">{t("Begleiten", "Accompanying")}</h1>
          <p className="m-0 max-w-[60ch] text-base leading-relaxed text-mute">
            {t("Die Anleitung für ein kurzes Showcase mit Besuchern.", "The guide for a short showcase with visitors.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} onChange={setLang} />
          <Button size="sm" variant="secondary" className="print-hide" onClick={() => window.print()}>
            <Printer size={14} /> {t("Drucken", "Print")}
          </Button>
        </div>
      </div>
      <SubNav items={NAV} />

      {/* ─────────────────────────── Ablauf ─────────────────────────── */}
      <Section id="g-ablauf" title={t("Ablauf mit einem Besucher", "The flow with one visitor")} lead={t("Drei bis fünf Minuten. Der Besucher sitzt, du stehst daneben und gibst die Sätze vor.", "Three to five minutes. The visitor sits, you stand beside them and suggest the sentences.")}>
        <Steps
          items={[
            <><b>{t("Hinsetzen, Taste zeigen.", "Sit down, show the button.")}</b> <PanelKey icon={<TalkIcon />} /> {t("„Halten Sie die Sprechtaste gedrückt, sprechen Sie, lassen Sie erst nach dem letzten Wort los.“", "“Hold the talk button, speak, let go only after the last word.”")}</>,
            <><b>{t("Info-Taste drücken.", "Press the info button.")}</b> <PanelKey icon={<InfoIcon />} /> {t("CoSiMo beantwortet damit diese Frage:", "CoSiMo then answers this question:")} <i>„{infoQ[lang]}“</i></>,
            <><b>{t("Zur Fahrt fragen lassen.", "Let them ask about the journey.")}</b> {t("„Wo sind wir gerade?“ oder „Wann kommt der nächste Halt?“", "“Where are we right now?” or “When is the next stop?”")}</>,
            <><b>{t("Das Licht ändern lassen.", "Let them change the light.")}</b> {t("„Mach das Licht gemütlich.“ Alle in der Kabine sehen es. Dann „Etwas heller“ oder „Licht aus“.", "“Make the light cosy.” Everyone in the cabin sees it. Then “A bit brighter” or “Lights off”.")}</>,
            <><b>{t("Eine Karte auflegen.", "Put a card on the reader.")}</b> <PanelKey icon={<CardIcon />} /> {t("CoSiMo begrüßt mit Namen und verhält sich anders: Sam auf Englisch, Noa mit Text im Schlitz, Luca Schritt für Schritt. Dieselbe Frage nochmal stellen lassen.", "CoSiMo greets by name and behaves differently: English for Sam, text in the slit for Noa, step by step for Luca. Have them ask the same question again.")}</>,
            <><b>{t("Anpassen lassen.", "Let them adjust it.")}</b> {t("„Sprich bitte langsamer.“ „Zeig mir den Text.“ „Stell auf grün.“", "“Please speak more slowly.” “Show me the text.” “Switch to green.”")}</>,
            <><b>{t("Zum MonoCab fragen lassen.", "Let them ask about the MonoCab.")}</b> {t("„Was ist das MonoCab?“ oder „Wie bleibt die Kabine aufrecht?“", "“What is the MonoCab?” or “How does the cabin stay upright?”")}</>,
            <><b>{t("QR-Code zeigen.", "Show the QR code.")}</b> {t("Der Fragebogen dauert zwei Minuten und ist anonym.", "The questionnaire takes two minutes and is anonymous.")}</>,
            <><b>{t("Karte abnehmen, nächster Besucher.", "Take the card off, next visitor.")}</b> {t("Redet CoSiMo noch vom Vorigen: in der Konsole unter Sessions den Sitz zurücksetzen.", "If CoSiMo still talks about the previous one: reset the seat in the console under Sessions.")}</>,
          ]}
        />
        <Note>{t("Wenig Zeit: Info-Taste, eine Frage zur Fahrt, einmal das Licht.", "Short on time: info button, one journey question, the light once.")}</Note>
      </Section>

      {/* ─────────────────────────── Der Sitz ─────────────────────────── */}
      <Section id="g-sitz" title={t("So bedient man den Sitz", "How the seat works")} lead={t("Drei Tasten und ein Kartenleser neben dem Panel. Der Bildschirm reagiert nicht auf Berührung, das ist gewollt.", "Three buttons and a card reader beside the panel. The screen does not react to touch, by design.")}>
        <Table
          head={[t("Was", "What"), t("Wie", "How"), t("Was passiert", "What happens")]}
          rows={[
            [<PanelKey icon={<TalkIcon />}>{t("Sprechen", "Talk")}</PanelKey>, t("Gedrückt halten, reden, nach dem letzten Wort loslassen.", "Hold, speak, let go after the last word."), t("Welle im Schlitz, dann denkt CoSiMo kurz und antwortet.", "A wave in the slit, then CoSiMo thinks briefly and answers.")],
            [<PanelKey icon={<TalkIcon />}>{t("Unterbrechen", "Interrupt")}</PanelKey>, t("Drücken, während CoSiMo redet.", "Press while CoSiMo is speaking."), t("CoSiMo verstummt sofort und hört zu.", "CoSiMo falls silent at once and listens.")],
            [<PanelKey icon={<InfoIcon />}>{t("Info", "Info")}</PanelKey>, t("Einmal drücken.", "Press once."), <>{t("CoSiMo beantwortet: ", "CoSiMo answers: ")}<i>„{infoQ[lang]}“</i></>],
            [<PanelKey icon={<LightIcon />}>{t("Licht", "Light")}</PanelKey>, t("Einmal drücken.", "Press once."), t(`Nächste Szene: ${scenes.join(" → ")}.`, `Next scene: ${scenes.join(" → ")}.`)],
            [<PanelKey icon={<CardIcon />}>{t("Karte", "Card")}</PanelKey>, t("Karte auf den Leser legen.", "Put a card on the reader."), t("Der Sitz wird zu diesem Fahrgast, CoSiMo begrüßt ihn mit Namen.", "The seat becomes this rider, CoSiMo greets them by name.")],
            [<b>{t("Nochmal hören", "Hear it again")}</b>, t("↻ im Schlitz tippen, kurz nach der Antwort.", "Tap ↻ in the slit, shortly after the reply."), t("CoSiMo wiederholt die letzte Antwort.", "CoSiMo repeats the last reply.")],
          ]}
        />
        <Note tone="warn">{t("Häufigster Fehler: die Taste zu früh loslassen.", "Most common mistake: letting go of the button too early.")}</Note>
      </Section>

      {/* ─────────────────────────── Die Karten ─────────────────────────── */}
      <Section id="g-karten" title={t("Die vier Karten", "The four cards")} lead={t("Jede Karte ist ein erfundener Fahrgast. Aufgelegt, verhält sich CoSiMo so, wie es für diesen Menschen richtig ist.", "Each card is a fictional rider. On the reader, CoSiMo behaves the way that is right for this person.")}>
        <ul className="m-0 flex list-none flex-col p-0">
          {riders.map((key) => {
            const p = live.get(key);
            const r = RIDERS[key];
            const name = p?.label || key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <li key={key} className="flex flex-col gap-0.5 border-b border-line-soft py-2 text-base leading-snug last:border-b-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-black">{name}</span>
                  <span className="text-sm text-mute">{t("Karte", "Card")} {key.toUpperCase()}1</span>
                </div>
                {r ? (
                  <>
                    <span>{t(r.who[0], r.who[1])}</span>
                    <span className="text-mute">{t(r.changes[0], r.changes[1])}</span>
                    <span>{t("Sag: ", "Say: ")}<b>„{r.say}“</b>{r.note && <span className="text-sm text-mute"> · {t(r.note[0], r.note[1])}</span>}</span>
                  </>
                ) : (
                  <span className="text-mute">{t("Profil aus dem CMS", "Profile from the CMS")} · {p?.accommodations.language === "en" ? t("Englisch", "English") : t("Deutsch", "German")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <P className="text-sm text-mute">
          {t("Eine fremde Karte lehnt CoSiMo freundlich ab. Karten können jederzeit gewechselt werden, auch mitten im Satz. Ohne Karte ist der Sitz „Standard“: neutral, deutsch, ohne Namen, merkt sich nichts.", "A foreign card is politely declined. Cards can be swapped any time, even mid-sentence. Without a card the seat is “Standard”: neutral, German, no name, remembers nothing.")}
        </P>
      </Section>

      {/* ─────────────────────────── Sätze ─────────────────────────── */}
      <Section id="g-saetze" title={t("Sätze, die immer funktionieren", "Sentences that always work")} lead={t("Deutsch oder Englisch — CoSiMo antwortet in der Sprache, in der man spricht.", "German or English — CoSiMo answers in the language it is spoken to.")}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
          <Sentences lang={lang} title={t("Zur Fahrt", "About the journey")} items={[
            ["Wo sind wir gerade?", "Where are we right now?"],
            ["Wann kommt der nächste Halt?", "When is the next stop?"],
            ["Wann kommen wir in Barntrup an?", "When do we arrive in Barntrup?"],
            ["Wie schnell fahren wir?", "How fast are we going?"],
            ["Welche Halte kommen noch?", "Which stops are still ahead?"],
            ["Sind wir pünktlich?", "Are we on time?"],
            ["Wohin fahren wir?", "Where are we going?"],
            ["Wie viele Leute sind an Bord?", "How many people are on board?"],
            ["Sind die Türen offen?", "Are the doors open?"],
            ["Warum stehen wir?", "Why are we stopped?", ["bei einer Störung aus der Konsole", "while a fault runs from the console"]],
            ["Ich möchte in Barntrup aussteigen.", "I'd like to get off at Barntrup.", ["wird vorgemerkt", "is noted"]],
          ]} />
          <Sentences lang={lang} title={t("Zum Licht", "About the light")} items={[
            ["Mach das Licht gemütlich.", "Make the light cosy."],
            ["Mach es hell.", "Make it bright."],
            ["Mach das Licht an.", "Turn the light on."],
            ["Licht aus.", "Lights off."],
            ["Etwas dunkler bitte.", "A bit darker, please."],
            ["Etwas heller bitte.", "A bit brighter, please."],
            ["Mach das Licht wärmer.", "Make the light warmer."],
            ["Mach die Lichtlinien auf 40 Prozent.", "Set the light lines to 40 percent."],
            ["Ist das Licht an?", "Is the light on?"],
          ]} />
          <Sentences lang={lang} title={t("Zum Anpassen", "About adjusting")} items={[
            ["Sprich bitte langsamer.", "Please speak more slowly."],
            ["Sprich bitte schneller.", "Please speak faster."],
            ["Etwas leiser bitte.", "A little quieter, please."],
            ["Etwas lauter bitte.", "A little louder, please."],
            ["Zeig mir den Text.", "Show me the text.", ["Untertitel im Schlitz", "subtitles in the slit"]],
            ["Mach den Text größer.", "Make the text bigger."],
            ["Eine männliche Stimme bitte.", "A male voice, please."],
            ["Eine weibliche Stimme bitte.", "A female voice, please."],
            ["Eine tiefere Stimme.", "A deeper voice."],
            ["Sprich freundlicher.", "Sound warmer."],
            ["Sprich ruhiger.", "Sound calmer."],
            ["Stell auf grün.", "Switch to green.", ["auch blau, gelb, rosa, dunkel, grau, weiß", "also blue, yellow, pink, dark, grey, white"]],
            ["Zeig lieber das Knäuel.", "Show the blob instead.", ["auch Kreis, Linie, Gesicht", "also circle, line, face"]],
            ["Sprich Englisch mit mir.", "Speak German with me."],
            ["Welche Stimmen gibt es?", "Which voices are there?", ["öffnet das Menü im Schlitz", "opens the menu in the slit"]],
            ["Ich sehe nicht gut.", "I can't see well.", ["CoSiMo wählt selbst, was hilft", "CoSiMo picks what helps"]],
            ["Ich höre nicht gut.", "I can't hear well."],
          ]} />
          <div className="flex flex-col gap-5">
            <Sentences lang={lang} title={t("Zum MonoCab und zu CoSiMo", "About the MonoCab and CoSiMo")} items={[
              ["Was ist das MonoCab?", "What is the MonoCab?"],
              ["Wie bleibt die Kabine aufrecht?", "How does the cabin stay upright?"],
              ["Wer entwickelt das MonoCab?", "Who develops the MonoCab?"],
              ["Wann fährt das MonoCab richtig?", "When will the MonoCab run for real?"],
              ["Was bedeutet CoSiMo?", "What does CoSiMo stand for?"],
              ["Für wen bist du gemacht?", "Who are you made for?"],
              ["Was kannst du?", "What can you do?"],
              ["Wer bist du?", "Who are you?"],
            ]} />
            <Sentences lang={lang} title={t("Mit Karte", "With a card")} items={[
              ["Merk dir, dass ich immer in Barntrup aussteige.", "Remember that I always get off at Barntrup."],
              ["Merk dir, dass ich es gern gemütlich habe.", "Remember that I like it cosy."],
              ["Was weißt du über mich?", "What do you know about me?"],
              ["Vergiss das wieder.", "Forget that."],
            ]} />
            <Sentences lang={lang} title={t("Einfach so", "Just like that")} items={[
              ["Hallo!", "Hello!"],
              ["Sag das nochmal.", "Say that again."],
              ["Danke!", "Thanks!", ["CoSiMo freut sich sichtbar", "CoSiMo visibly smiles"]],
              ["Tschüss!", "Bye!"],
            ]} />
          </div>
        </div>
      </Section>

      {/* ─────────────────────────── Grenzen ─────────────────────────── */}
      <Section id="g-nicht" title={t("Was CoSiMo nicht kann", "What CoSiMo cannot do")}>
        <Bullets
          items={[
            <><b>{t("Die Fahrt ist simuliert.", "The journey is simulated.")}</b> {t("Türen, Halt, Tempo sind nicht echt; „Ich möchte aussteigen“ wird nur vorgemerkt.", "Doors, stops, speed are not real; “I'd like to get off” is only noted.")}</>,
            <><b>{t("Nur das Kabinenlicht.", "Only the cabin light.")}</b> {t("Keine Leselampe, nichts sonst.", "No reading lamp, nothing else.")}</>,
            <><b>{t("Kein Lexikon.", "Not an encyclopedia.")}</b> {t("Fahrt, MonoCab und sich selbst kennt es; bei allem anderen verweist es ans Standpersonal.", "It knows the journey, the MonoCab and itself; for anything else it refers to the booth staff.")}</>,
            <><b>{t("Nur Deutsch und Englisch.", "German and English only.")}</b> {t("Hört nur bei gedrückter Taste. Ohne Karte merkt es sich nichts.", "Listens only while the button is held. Without a card it remembers nothing.")}</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Wenn es hakt ─────────────────────────── */}
      <Section id="g-hakt" title={t("Wenn es hakt", "When it sticks")} lead={t("Drei Handgriffe, in dieser Reihenfolge. Danach die Technik holen.", "Three moves, in this order. Then get the technician.")}>
        <Steps
          items={[
            <><b>{t("Nochmal.", "Again.")}</b> {t("Taste halten, deutlich sprechen, nach dem letzten Wort loslassen. Redet CoSiMo noch: kurz drücken, neu fragen.", "Hold the button, speak clearly, let go after the last word. If CoSiMo is still talking: press briefly, ask again.")}</>,
            <><b>{t("Sitz zurücksetzen.", "Reset the seat.")}</b> {t("Konsole → Sessions → ↺ bei diesem Sitz. Der Besucher bekommt ein frisches Gespräch.", "Console → Sessions → ↺ on this seat. The visitor gets a fresh conversation.")}</>,
            <><b>{t("Demo-Modus einschalten.", "Switch on demo mode.")}</b> {t("Konsole → Sessions → Betrieb → „Demo- / Offline-Modus“. CoSiMo antwortet dann mit festen Sätzen. Danach wieder aus.", "Console → Sessions → Betrieb → “Demo- / Offline-Modus”. CoSiMo then answers with fixed sentences. Switch it off afterwards.")}</>,
          ]}
        />
        <div className={cn("flex flex-col gap-1.5 rounded-lg border border-line bg-well px-4 py-3 text-base leading-relaxed")}>
          <div>
            <b>{t("Konsole", "Console")}:</b> <a href={CONSOLE_URL} className="text-accent underline">{CONSOLE_URL.replace("https://", "")}</a>
            {" · "}<b>{t("Passwort", "Password")}:</b> <span className="font-mono">{CONSOLE_PASSWORD}</span>
          </div>
          <span className="text-mute">{t("Dort: Sitze zurücksetzen, Demo-Modus, eine Störung der Fahrt auslösen (Übersicht → Fahrt), das Licht schalten, und unter Hilfe die Fehlersuche für die Technik.", "There: reset seats, demo mode, trigger a journey fault (Übersicht → Fahrt), switch the light, and under Hilfe the troubleshooting for the technicians.")}</span>
          <span className="text-mute">
            {t("Fahrt-Ansicht für den Standbildschirm: ", "Journey view for the booth screen: ")}<a href={JOURNEY_URL} className="text-accent underline">{JOURNEY_URL.replace("https://", "")}</a>
            {" · "}{t("Fragebogen (QR): ", "Questionnaire (QR): ")}<a href={FORM_URL} className="text-accent underline">{FORM_URL.replace("https://", "")}</a>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg border border-dashed border-line px-4 py-3 text-base">
          <b>{t("Technik erreichbar", "Technician on call")}</b>
          <span className="text-mute">{t("Name und Telefonnummer hier eintragen, bevor die Seite gedruckt wird.", "Write name and phone number here before printing.")}</span>
        </div>
      </Section>
    </div>
  );
}
