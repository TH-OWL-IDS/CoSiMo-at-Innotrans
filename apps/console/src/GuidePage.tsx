import { Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import type { PersonaBroadcast } from "@cosimo/shared";
import { Button, Card } from "@cosimo/ui";
import { Bullets, H3, Note, P, Say, Section, Steps, SubNav, Table } from "./doc";
import { LangToggle, picker, useDocLang } from "./docLang";
import { CardIcon, InfoIcon, LightIcon, PanelKey, TalkIcon } from "./PanelIcons";
import type { Tab } from "./tabs";

/**
 * The Begleiten view — the run-sheet for the two people who accompany
 * visitors at the cab (not engineers), German or English on the page.
 * Written for reading on a phone between two visitors: short sentences,
 * large type (the `doc-large` wrapper scales the tokens), the system font.
 * The flow of one short showcase, how the seat works (with the panel's own
 * symbols), who the four riders on the cards are, sentences that always
 * work, what CoSiMo cannot do, what to do when it sticks. The rider rows
 * read the live profiles so the list can never be stale.
 */

/** Who the four riders are, in plain words — beside the live profile row. */
const RIDERS: Record<string, { who: [string, string]; changes: [string, string]; say: string; note?: [string, string] }> = {
  alex: {
    who: ["68 Jahre. Sieht sehr wenig, orientiert sich über Hören und Tasten.", "68 years old. Sees very little, gets around by hearing and touch."],
    changes: ["CoSiMo zeigt nichts an, sondern sagt alles laut. Jede Aktion wird hörbar bestätigt.", "CoSiMo shows nothing, it says everything aloud. Every action is confirmed audibly."],
    say: "Mach das Licht aus.",
  },
  noa: {
    who: ["25 Jahre. Liest lieber mit, mag es ruhig und kontrastreich.", "25 years old. Prefers to read along, likes it calm and high-contrast."],
    changes: ["Die Antworten erscheinen als Text im Schlitz. Dunkles Farbschema, ruhiges Gesicht, leise ruhige Stimme, kurze Antworten.", "Replies appear as text in the slit. Dark colour scheme, calm face, quiet calm voice, short replies."],
    say: "Wann kommt der nächste Halt?",
  },
  luca: {
    who: ["42 Jahre. Nutzt Technik selten, braucht einfache, klare Schritte.", "42 years old. Rarely uses technology, needs simple, clear steps."],
    changes: ["Gelbes Farbschema, Text im Schlitz, langsame warme Stimme. Eine Sache pro Antwort, nach jedem Schritt eine Rückmeldung, nur die Grundfunktionen.", "Yellow colour scheme, text in the slit, slow warm voice. One thing per reply, feedback after every step, basics only."],
    say: "Mach das Licht gemütlich.",
  },
  sam: {
    who: ["33 Jahre. Pendelt täglich, will es schnell, spricht Englisch.", "33 years old. Commutes daily, wants it quick, speaks English."],
    changes: ["Begrüßung und Antworten auf Englisch, männliche Stimme, ein Satz und fertig, keine Rückfragen.", "Greeting and replies in English, male voice, one sentence and done, no follow-up questions."],
    say: "When is the next stop?",
    note: ["auf Englisch fragen", "ask in English"],
  },
};

const ORDER = ["alex", "noa", "luca", "sam"];

/** A group of sentences: German first, the English twin small beneath. */
function Sentences({ title, items }: { title: string; items: [string, string, string?][] }) {
  return (
    <div className="flex flex-col gap-2">
      <H3 className="mt-0">{title}</H3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map(([de, en, note]) => <Say key={de} de={de} en={en} note={note} />)}
      </div>
    </div>
  );
}

export default function GuidePage({ c, go }: { c: CosimoState; go: (t: Tab) => void }) {
  const [lang, setLang] = useDocLang();
  const t = picker(lang);
  const live = new Map(c.personas.filter((p) => p.persona !== "default").map((p) => [p.persona, p] as [string, PersonaBroadcast]));
  const riders = [...ORDER.filter((k) => live.has(k) || !c.personas.length), ...[...live.keys()].filter((k) => !ORDER.includes(k))];
  const scenes = c.light?.scenes.map((s) => s.label).filter(Boolean) ?? ["Standard", "Gemütlich", "Hell"];
  const n = (de: string, en: string): string | undefined => t(de, en);

  const NAV = [
    { id: "g-ablauf", label: t("Ablauf", "The flow") },
    { id: "g-sitz", label: t("Der Sitz", "The seat") },
    { id: "g-karten", label: t("Die Karten", "The cards") },
    { id: "g-saetze", label: t("Sätze", "Sentences") },
    { id: "g-nicht", label: t("Grenzen", "Limits") },
    { id: "g-hakt", label: t("Wenn es hakt", "When it sticks") },
  ];

  return (
    <div className="doc-large flex flex-col gap-12 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-4xl font-black">{t("Begleiten", "Accompanying")}</h1>
          <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-mute">
            {t(
              "Die Anleitung für ein kurzes Showcase mit Besuchern: der Ablauf, die Bedienung, die vier Karten, und Sätze, die immer funktionieren.",
              "The guide for a short showcase with visitors: the flow, the controls, the four cards, and sentences that always work.",
            )}
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
      <Section
        id="g-ablauf"
        title={t("Ablauf mit einem Besucher", "The flow with one visitor")}
        lead={t("Etwa drei bis fünf Minuten. Der Besucher sitzt, du stehst daneben und gibst die Sätze vor.", "About three to five minutes. The visitor sits, you stand beside them and suggest the sentences.")}
      >
        <Steps
          items={[
            <><b>{t("Hinsetzen und die Taste zeigen.", "Sit down, show the button.")}</b> <PanelKey icon={<TalkIcon />} /> {t("„Halten Sie die Sprechtaste gedrückt, sprechen Sie, und lassen Sie erst nach dem letzten Wort los.“", "“Hold the talk button, speak, and let go only after the last word.”")}</>,
            <><b>{t("Info-Taste drücken.", "Press the info button.")}</b> <PanelKey icon={<InfoIcon />} /> {t("CoSiMo stellt sich selbst vor und sagt, was es kann. Das ist der Einstieg.", "CoSiMo introduces itself and says what it can do. That is the opener.")}</>,
            <><b>{t("Zur Fahrt fragen lassen.", "Let them ask about the journey.")}</b> {t("„Wo sind wir gerade?“ oder „Wann kommt der nächste Halt?“ CoSiMo antwortet aus der laufenden Fahrt.", "“Where are we right now?” or “When is the next stop?” CoSiMo answers from the running journey.")}</>,
            <><b>{t("Das Licht ändern lassen.", "Let them change the light.")}</b> {t("„Mach das Licht gemütlich.“ Alle in der Kabine sehen es. Danach „Etwas heller“ oder „Licht aus“.", "“Make the light cosy.” Everyone in the cabin sees it. Then “A bit brighter” or “Lights off”.")}</>,
            <><b>{t("Eine Karte auflegen.", "Put a card on the reader.")}</b> <PanelKey icon={<CardIcon />} /> {t("CoSiMo begrüßt den Fahrgast mit Namen und verhält sich anders: bei Sam auf Englisch, bei Noa mit Text im Schlitz, bei Luca Schritt für Schritt. Dieselbe Frage nochmal stellen lassen.", "CoSiMo greets the rider by name and behaves differently: in English for Sam, with text in the slit for Noa, step by step for Luca. Have them ask the same question again.")}</>,
            <><b>{t("Anpassen lassen.", "Let them adjust it.")}</b> {t("„Sprich bitte langsamer.“ „Zeig mir den Text.“ „Stell auf grün.“ Jede Änderung passiert sofort.", "“Please speak more slowly.” “Show me the text.” “Switch to green.” Every change happens at once.")}</>,
            <><b>{t("Zum MonoCab fragen lassen.", "Let them ask about the MonoCab.")}</b> {t("„Was ist das MonoCab?“ oder „Wie bleibt die Kabine aufrecht?“ CoSiMo erklärt es.", "“What is the MonoCab?” or “How does the cabin stay upright?” CoSiMo explains.")}</>,
            <><b>{t("Zum Schluss den QR-Code zeigen.", "At the end, show the QR code.")}</b> {t("Der Fragebogen dauert zwei Minuten und ist anonym.", "The questionnaire takes two minutes and is anonymous.")}</>,
            <><b>{t("Karte abnehmen, nächster Besucher.", "Take the card off, next visitor.")}</b> {t("Wenn CoSiMo noch vom vorigen Besucher spricht: in der Konsole unter Sessions den Sitz zurücksetzen.", "If CoSiMo still talks about the previous visitor: reset the seat in the console under Sessions.")}</>,
          ]}
        />
        <Note>{t("Wenn wenig Zeit ist: Info-Taste, eine Frage zur Fahrt, einmal das Licht. Das reicht für einen Eindruck.", "Short on time: info button, one journey question, the light once. Enough for an impression.")}</Note>
      </Section>

      {/* ─────────────────────────── Der Sitz ─────────────────────────── */}
      <Section
        id="g-sitz"
        title={t("So bedient man den Sitz", "How the seat works")}
        lead={t("Neben dem Panel sind drei Tasten und ein Kartenleser, mit diesen Symbolen. Der Bildschirm selbst reagiert nicht auf Berührung, das ist so gewollt.", "Beside the panel are three buttons and a card reader, with these symbols. The screen itself does not react to touch, by design.")}
      >
        <Table
          head={[t("Was", "What"), t("Wie", "How"), t("Was passiert", "What happens")]}
          rows={[
            [<PanelKey icon={<TalkIcon />}>{t("Sprechen", "Talk")}</PanelKey>, t("Die Sprechtaste gedrückt halten, reden, erst nach dem letzten Wort loslassen.", "Hold the talk button, speak, let go only after the last word."), t("Im Schlitz erscheint eine Welle. Nach dem Loslassen denkt CoSiMo kurz und antwortet.", "A wave appears in the slit. After release CoSiMo thinks briefly and answers.")],
            [<PanelKey icon={<TalkIcon />}>{t("Unterbrechen", "Interrupt")}</PanelKey>, t("Die Sprechtaste drücken, während CoSiMo redet.", "Press the talk button while CoSiMo is speaking."), t("CoSiMo verstummt sofort und hört wieder zu.", "CoSiMo falls silent at once and listens again.")],
            [<PanelKey icon={<InfoIcon />}>{t("Vorstellen", "Introduce")}</PanelKey>, t("Die Info-Taste einmal drücken.", "Press the info button once."), t("CoSiMo erklärt selbst, was es kann.", "CoSiMo explains what it can do.")],
            [<PanelKey icon={<LightIcon />}>{t("Licht", "Light")}</PanelKey>, t("Die Licht-Taste einmal drücken.", "Press the light button once."), t(`Die nächste Lichtszene: ${scenes.join(" → ")}.`, `The next light scene: ${scenes.join(" → ")}.`)],
            [<PanelKey icon={<CardIcon />}>{t("Karte", "Card")}</PanelKey>, t("Eine Karte auf den Leser legen.", "Put a card on the reader."), t("Der Sitz wird zu diesem Fahrgast. CoSiMo begrüßt ihn mit Namen.", "The seat becomes this rider. CoSiMo greets them by name.")],
            [<b>{t("Nochmal hören", "Hear it again")}</b>, t("↻ im Schlitz tippen, kurz nach der Antwort.", "Tap ↻ in the slit, shortly after the reply."), t("CoSiMo wiederholt die letzte Antwort.", "CoSiMo repeats the last reply.")],
          ]}
        />
        <Note tone="warn">{t("Der häufigste Fehler: die Taste zu früh loslassen. Erst zu Ende sprechen, dann loslassen.", "The most common mistake: letting go of the button too early. Finish the sentence, then let go.")}</Note>
      </Section>

      {/* ─────────────────────────── Die Karten ─────────────────────────── */}
      <Section
        id="g-karten"
        title={t("Die vier Karten", "The four cards")}
        lead={t("Jede Karte steht für einen erfundenen Fahrgast. Legt man sie auf, verhält sich CoSiMo so, wie es für diesen Menschen richtig ist.", "Each card stands for a fictional rider. Put it on the reader and CoSiMo behaves the way that is right for this person.")}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {riders.map((key) => {
            const p = live.get(key);
            const r = RIDERS[key];
            const name = p?.label || key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <Card key={key} className="gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-black">{name}</span>
                  <span className="text-sm text-mute">{t("Karte", "Card")} {key.toUpperCase()}1</span>
                </div>
                {r ? (
                  <>
                    <P className="text-base"><b>{t("Wer:", "Who:")}</b> {t(r.who[0], r.who[1])}</P>
                    <P className="text-base"><b>{t("Was sich ändert:", "What changes:")}</b> {t(r.changes[0], r.changes[1])}</P>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold uppercase tracking-caps text-mute">{t("Sag zum Beispiel", "Say, for example")}</span>
                      <Say de={r.say} note={r.note ? t(r.note[0], r.note[1]) : undefined} />
                    </div>
                  </>
                ) : (
                  <P className="text-base text-mute">{t("Profil aus dem CMS", "Profile from the CMS")} · {p?.accommodations.language === "en" ? t("Englisch", "English") : t("Deutsch", "German")}.</P>
                )}
              </Card>
            );
          })}
        </div>
        <Bullets
          items={[
            <>{t("Eine ", "A ")}<b>{t("fremde Karte", "foreign card")}</b>{t(", etwa eine Bankkarte, lehnt CoSiMo freundlich ab. Auch das kann man zeigen.", ", a bank card say, is politely declined. Worth showing too.")}</>,
            t("Die Karte kann jederzeit gewechselt werden, auch mitten im Satz. Der neue Fahrgast bekommt ein frisches Gespräch.", "The card can be swapped any time, even mid-sentence. The new rider gets a fresh conversation."),
            t("Ohne Karte ist der Sitz „Standard“: neutral, deutsch, ohne Namen, merkt sich nichts.", "Without a card the seat is “Standard”: neutral, German, no name, remembers nothing."),
          ]}
        />
      </Section>

      {/* ─────────────────────────── Sätze ─────────────────────────── */}
      <Section
        id="g-saetze"
        title={t("Sätze, die immer funktionieren", "Sentences that always work")}
        lead={t("Deutsch oder Englisch. CoSiMo antwortet in der Sprache, in der man spricht.", "German or English. CoSiMo answers in the language it is spoken to.")}
      >
        <Sentences
          title={t("Zur Fahrt", "About the journey")}
          items={[
            ["Wo sind wir gerade?", "Where are we right now?"],
            ["Wann kommt der nächste Halt?", "When is the next stop?"],
            ["Wann kommen wir in Barntrup an?", "When do we arrive in Barntrup?"],
            ["Wie schnell fahren wir?", "How fast are we going?"],
            ["Welche Halte kommen noch?", "Which stops are still ahead?"],
            ["Sind wir pünktlich?", "Are we on time?"],
            ["Wohin fahren wir?", "Where are we going?"],
            ["Wie viele Leute sind an Bord?", "How many people are on board?"],
            ["Sind die Türen offen?", "Are the doors open?"],
            ["Warum stehen wir?", "Why are we stopped?", n("sinnvoll, wenn in der Konsole eine Störung läuft", "useful while a fault runs in the console")],
            ["Ich möchte in Barntrup aussteigen.", "I'd like to get off at Barntrup.", n("CoSiMo merkt es vor", "CoSiMo notes it")],
          ]}
        />
        <Sentences
          title={t("Zum Licht", "About the light")}
          items={[
            ["Mach das Licht gemütlich.", "Make the light cosy."],
            ["Mach es hell.", "Make it bright."],
            ["Mach das Licht an.", "Turn the light on."],
            ["Licht aus.", "Lights off."],
            ["Etwas dunkler bitte.", "A bit darker, please."],
            ["Etwas heller bitte.", "A bit brighter, please."],
            ["Mach das Licht wärmer.", "Make the light warmer."],
            ["Mach die Lichtlinien auf 40 Prozent.", "Set the light lines to 40 percent."],
            ["Ist das Licht an?", "Is the light on?"],
          ]}
        />
        <Sentences
          title={t("Zum Anpassen", "About adjusting")}
          items={[
            ["Sprich bitte langsamer.", "Please speak more slowly."],
            ["Sprich bitte schneller.", "Please speak faster."],
            ["Etwas leiser bitte.", "A little quieter, please."],
            ["Etwas lauter bitte.", "A little louder, please."],
            ["Zeig mir den Text.", "Show me the text.", n("Untertitel im Schlitz", "subtitles in the slit")],
            ["Mach den Text größer.", "Make the text bigger."],
            ["Eine männliche Stimme bitte.", "A male voice, please."],
            ["Eine weibliche Stimme bitte.", "A female voice, please."],
            ["Eine tiefere Stimme.", "A deeper voice."],
            ["Sprich freundlicher.", "Sound warmer."],
            ["Sprich ruhiger.", "Sound calmer."],
            ["Stell auf grün.", "Switch to green.", n("auch: blau, gelb, rosa, dunkel, grau, weiß", "also: blue, yellow, pink, dark, grey, white")],
            ["Zeig lieber das Knäuel.", "Show the blob instead.", n("auch: Kreis, Linie, Gesicht", "also: circle, line, face")],
            ["Sprich Englisch mit mir.", "Speak German with me."],
            ["Welche Stimmen gibt es?", "Which voices are there?", n("öffnet das Menü im Schlitz", "opens the menu in the slit")],
            ["Ich sehe nicht gut.", "I can't see well.", n("CoSiMo wählt selbst, was hilft", "CoSiMo picks what helps")],
            ["Ich höre nicht gut.", "I can't hear well."],
          ]}
        />
        <Sentences
          title={t("Zum MonoCab und zu CoSiMo", "About the MonoCab and CoSiMo")}
          items={[
            ["Was ist das MonoCab?", "What is the MonoCab?"],
            ["Wie bleibt die Kabine aufrecht?", "How does the cabin stay upright?"],
            ["Wer entwickelt das MonoCab?", "Who develops the MonoCab?"],
            ["Wann fährt das MonoCab richtig?", "When will the MonoCab run for real?"],
            ["Was bedeutet CoSiMo?", "What does CoSiMo stand for?"],
            ["Für wen bist du gemacht?", "Who are you made for?"],
            ["Was kannst du?", "What can you do?"],
            ["Wer bist du?", "Who are you?"],
          ]}
        />
        <Sentences
          title={t("Mit Karte", "With a card")}
          items={[
            ["Merk dir, dass ich immer in Barntrup aussteige.", "Remember that I always get off at Barntrup."],
            ["Merk dir, dass ich es gern gemütlich habe.", "Remember that I like it cosy."],
            ["Was weißt du über mich?", "What do you know about me?"],
            ["Vergiss das wieder.", "Forget that."],
          ]}
        />
        <Sentences
          title={t("Einfach so", "Just like that")}
          items={[
            ["Hallo!", "Hello!"],
            ["Sag das nochmal.", "Say that again."],
            ["Danke!", "Thanks!", n("CoSiMo freut sich sichtbar", "CoSiMo visibly smiles")],
            ["Tschüss!", "Bye!"],
          ]}
        />
      </Section>

      {/* ─────────────────────────── Grenzen ─────────────────────────── */}
      <Section id="g-nicht" title={t("Was CoSiMo nicht kann", "What CoSiMo cannot do")} lead={t("Besser vorher sagen als hinterher erklären.", "Better said beforehand than explained afterwards.")}>
        <Bullets
          items={[
            <><b>{t("Die Fahrt ist simuliert.", "The journey is simulated.")}</b> {t("Türen, Halt, Tempo sind nicht echt. „Ich möchte aussteigen“ wird nur vorgemerkt.", "Doors, stops, speed are not real. “I'd like to get off” is only noted.")}</>,
            <><b>{t("Nur das Kabinenlicht.", "Only the cabin light.")}</b> {t("Keine Leselampe, nichts sonst in der Kabine.", "No reading lamp, nothing else in the cabin.")}</>,
            <><b>{t("Kein Lexikon.", "Not an encyclopedia.")}</b> {t("Zur Fahrt, zum MonoCab und zu sich selbst weiß es Bescheid. Bei allem anderen verweist es ans Standpersonal.", "It knows the journey, the MonoCab and itself. For anything else it refers to the booth staff.")}</>,
            <><b>{t("Nur Deutsch und Englisch.", "German and English only.")}</b></>,
            <><b>{t("Hört nur bei gedrückter Taste.", "Listens only while the button is held.")}</b> {t("Kein Aktivierungswort, kein Mithören.", "No wake word, no eavesdropping.")}</>,
            <><b>{t("Ohne Karte merkt es sich nichts.", "Without a card it remembers nothing.")}</b> {t("Beim Zurücksetzen ist alles vergessen.", "A reset forgets everything.")}</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Wenn es hakt ─────────────────────────── */}
      <Section id="g-hakt" title={t("Wenn es hakt", "When it sticks")} lead={t("Drei Handgriffe, in dieser Reihenfolge. Danach die Technik holen.", "Three moves, in this order. Then get the technician.")}>
        <Steps
          items={[
            <><b>{t("Nochmal.", "Again.")}</b> {t("Taste halten, deutlich sprechen, erst nach dem letzten Wort loslassen. Redet CoSiMo noch: kurz drücken, dann neu fragen.", "Hold the button, speak clearly, let go only after the last word. If CoSiMo is still talking: press briefly, then ask again.")}</>,
            <><b>{t("Sitz zurücksetzen.", "Reset the seat.")}</b> {t("In der Konsole unter Sessions auf ↺ bei diesem Sitz. Der Besucher bekommt ein frisches Gespräch.", "In the console under Sessions, ↺ on this seat. The visitor gets a fresh conversation.")}</>,
            <><b>{t("Demo-Modus einschalten.", "Switch on demo mode.")}</b> {t("Konsole → Sessions → Betrieb → „Demo- / Offline-Modus“. CoSiMo antwortet dann mit festen Sätzen zur Fahrt und zum Licht. Danach wieder ausschalten.", "Console → Sessions → Betrieb → “Demo- / Offline-Modus”. CoSiMo then answers with fixed sentences about the journey and the light. Switch it off afterwards.")}</>,
          ]}
        />
        <div className="print-hide flex flex-wrap gap-2">
          <Button size="md" variant="secondary" onClick={() => go("sessions")}>{t("Sessions öffnen", "Open Sessions")}</Button>
          <Button size="md" variant="secondary" onClick={() => go("hilfe")}>{t("Technik: Hilfe", "Technical: Hilfe")}</Button>
        </div>
        <Card className="gap-1.5 border-dashed">
          <b>{t("Technik erreichbar", "Technician on call")}</b>
          <span className="text-base text-mute">{t("Name und Telefonnummer hier eintragen, bevor die Seite gedruckt wird.", "Write name and phone number here before printing the page.")}</span>
        </Card>
      </Section>
    </div>
  );
}
