import { Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import type { PersonaBroadcast } from "@cosimo/shared";
import { Button, Card } from "@cosimo/ui";
import { Bullets, H3, Kbd, Note, P, Say, Section, Steps, SubNav, Table } from "./doc";
import type { Tab } from "./tabs";

/**
 * The Begleiten view — the run-sheet for the two people who accompany
 * visitors at the cab (not engineers). Written for reading on a phone
 * between two visitors: short sentences, large type (the `doc-large`
 * wrapper scales the tokens), the system font instead of the console's
 * monospace. The flow of one short showcase, how the seat works, who the
 * four riders on the cards are, sentences that always work, what CoSiMo
 * cannot do, what to do when it sticks. The rider rows read the live
 * profiles so the list can never be stale; the stories are written here.
 */

const NAV = [
  { id: "g-ablauf", label: "Ablauf" },
  { id: "g-sitz", label: "Der Sitz" },
  { id: "g-karten", label: "Die Karten" },
  { id: "g-saetze", label: "Sätze" },
  { id: "g-nicht", label: "Grenzen" },
  { id: "g-hakt", label: "Wenn es hakt" },
];

/** Who the four riders are, in plain words — beside the live profile row. */
const RIDERS: Record<string, { who: string; changes: string; say: string; sayEn?: string }> = {
  alex: {
    who: "68 Jahre. Sieht sehr wenig, orientiert sich über Hören und Tasten.",
    changes: "CoSiMo zeigt nichts an, sondern sagt alles laut. Jede Aktion wird hörbar bestätigt.",
    say: "Mach das Licht aus.",
  },
  noa: {
    who: "25 Jahre. Liest lieber mit, mag es ruhig und kontrastreich.",
    changes: "Die Antworten erscheinen als Text im Schlitz. Dunkles Farbschema, ruhiges Gesicht, leise ruhige Stimme, kurze Antworten.",
    say: "Wann kommt der nächste Halt?",
  },
  luca: {
    who: "42 Jahre. Nutzt Technik selten, braucht einfache, klare Schritte.",
    changes: "Gelbes Farbschema, Text im Schlitz, langsame warme Stimme. Eine Sache pro Antwort, nach jedem Schritt eine Rückmeldung, nur die Grundfunktionen.",
    say: "Mach das Licht gemütlich.",
  },
  sam: {
    who: "33 Jahre. Pendelt täglich, will es schnell, spricht Englisch.",
    changes: "Begrüßung und Antworten auf Englisch, männliche Stimme, ein Satz und fertig, keine Rückfragen.",
    say: "When is the next stop?",
    sayEn: "auf Englisch fragen",
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
  const live = new Map(c.personas.filter((p) => p.persona !== "default").map((p) => [p.persona, p] as [string, PersonaBroadcast]));
  const riders = [...ORDER.filter((k) => live.has(k) || !c.personas.length), ...[...live.keys()].filter((k) => !ORDER.includes(k))];
  const scenes = c.light?.scenes.map((s) => s.label).filter(Boolean) ?? ["Standard", "Gemütlich", "Hell"];

  return (
    <div className="doc-large flex flex-col gap-12 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-4xl font-black">Begleiten</h1>
          <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-mute">
            Die Anleitung für ein kurzes Showcase mit Besuchern: der Ablauf, die Bedienung, die vier Karten, und Sätze, die immer funktionieren.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="print-hide" onClick={() => window.print()}>
          <Printer size={14} /> Drucken
        </Button>
      </div>
      <SubNav items={NAV} />

      {/* ─────────────────────────── Ablauf ─────────────────────────── */}
      <Section id="g-ablauf" title="Ablauf mit einem Besucher" lead="Etwa drei bis fünf Minuten. Der Besucher sitzt, du stehst daneben und gibst die Sätze vor.">
        <Steps
          items={[
            <><b>Hinsetzen und die Taste zeigen.</b> „Halten Sie die Sprechtaste gedrückt, sprechen Sie, und lassen Sie erst nach dem letzten Wort los.“</>,
            <><b>Info-Taste drücken.</b> CoSiMo stellt sich selbst vor und sagt, was es kann. Das ist der Einstieg.</>,
            <><b>Zur Fahrt fragen lassen.</b> „Wo sind wir gerade?“ oder „Wann kommt der nächste Halt?“ CoSiMo antwortet aus der laufenden Fahrt.</>,
            <><b>Das Licht ändern lassen.</b> „Mach das Licht gemütlich.“ Alle in der Kabine sehen es. Danach „Etwas heller“ oder „Licht aus“.</>,
            <><b>Eine Karte auflegen.</b> CoSiMo begrüßt den Fahrgast mit Namen und verhält sich anders: bei Sam auf Englisch, bei Noa mit Text im Schlitz, bei Luca Schritt für Schritt. Dieselbe Frage nochmal stellen lassen.</>,
            <><b>Anpassen lassen.</b> „Sprich bitte langsamer.“ „Zeig mir den Text.“ „Stell auf grün.“ Jede Änderung passiert sofort.</>,
            <><b>Zum MonoCab fragen lassen.</b> „Was ist das MonoCab?“ oder „Wie bleibt die Kabine aufrecht?“ CoSiMo erklärt es.</>,
            <><b>Zum Schluss den QR-Code zeigen.</b> Der Fragebogen dauert zwei Minuten und ist anonym.</>,
            <><b>Karte abnehmen, nächster Besucher.</b> Wenn CoSiMo noch vom vorigen Besucher spricht: in der Konsole unter Sessions den Sitz zurücksetzen.</>,
          ]}
        />
        <Note>Wenn wenig Zeit ist: Info-Taste, eine Frage zur Fahrt, einmal das Licht. Das reicht für einen Eindruck.</Note>
      </Section>

      {/* ─────────────────────────── Der Sitz ─────────────────────────── */}
      <Section id="g-sitz" title="So bedient man den Sitz" lead="Neben dem Panel sind drei Tasten und ein Kartenleser. Der Bildschirm selbst reagiert nicht auf Berührung, das ist so gewollt.">
        <Table
          head={["Was", "Wie", "Was passiert"]}
          rows={[
            [<b>Sprechen</b>, <>Die <b>Sprechtaste</b> gedrückt halten, reden, erst nach dem letzten Wort loslassen.</>, "Im Schlitz erscheint eine Welle. Nach dem Loslassen denkt CoSiMo kurz und antwortet."],
            [<b>Unterbrechen</b>, "Die Sprechtaste drücken, während CoSiMo redet.", "CoSiMo verstummt sofort und hört wieder zu."],
            [<b>Vorstellen</b>, <>Die <b>Info-Taste</b> einmal drücken.</>, "CoSiMo erklärt selbst, was es kann."],
            [<b>Licht</b>, <>Die <b>Licht-Taste</b> einmal drücken.</>, `Die nächste Lichtszene: ${scenes.join(" → ")}.`],
            [<b>Karte</b>, "Eine Karte auf den Leser legen.", "Der Sitz wird zu diesem Fahrgast. CoSiMo begrüßt ihn mit Namen."],
            [<b>Nochmal hören</b>, "↻ im Schlitz tippen, kurz nach der Antwort.", "CoSiMo wiederholt die letzte Antwort."],
          ]}
        />
        <Note tone="warn">Der häufigste Fehler: die Taste zu früh loslassen. Erst zu Ende sprechen, dann loslassen.</Note>
        <P className="text-base text-mute">Zum Testen ohne Tasten, etwa im Browser: <Kbd>s</Kbd> halten = sprechen, <Kbd>i</Kbd> = Info, <Kbd>l</Kbd> = Licht.</P>
      </Section>

      {/* ─────────────────────────── Die Karten ─────────────────────────── */}
      <Section id="g-karten" title="Die vier Karten" lead="Jede Karte steht für einen erfundenen Fahrgast. Legt man sie auf, verhält sich CoSiMo so, wie es für diesen Menschen richtig ist.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {riders.map((key) => {
            const p = live.get(key);
            const r = RIDERS[key];
            const name = p?.label || key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <Card key={key} className="gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-black">{name}</span>
                  <span className="text-sm text-mute">Karte {key.toUpperCase()}1</span>
                </div>
                {r ? (
                  <>
                    <P className="text-base"><b>Wer:</b> {r.who}</P>
                    <P className="text-base"><b>Was sich ändert:</b> {r.changes}</P>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold uppercase tracking-caps text-mute">Sag zum Beispiel</span>
                      <Say de={r.say} note={r.sayEn} />
                    </div>
                  </>
                ) : (
                  <P className="text-base text-mute">Profil aus dem CMS · Sprache {p?.accommodations.language === "en" ? "Englisch" : "Deutsch"}.</P>
                )}
              </Card>
            );
          })}
        </div>
        <Bullets
          items={[
            <>Eine <b>fremde Karte</b>, etwa eine Bankkarte, lehnt CoSiMo freundlich ab. Auch das kann man zeigen.</>,
            <>Die Karte kann jederzeit gewechselt werden, auch mitten im Satz. Der neue Fahrgast bekommt ein frisches Gespräch.</>,
            <>Ohne Karte ist der Sitz „Standard“: neutral, deutsch, ohne Namen, merkt sich nichts.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Sätze ─────────────────────────── */}
      <Section id="g-saetze" title="Sätze, die immer funktionieren" lead="Deutsch oder Englisch. CoSiMo antwortet in der Sprache, in der man spricht.">
        <Sentences
          title="Zur Fahrt"
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
            ["Warum stehen wir?", "Why are we stopped?", "sinnvoll, wenn in der Konsole eine Störung läuft"],
            ["Ich möchte in Barntrup aussteigen.", "I'd like to get off at Barntrup.", "CoSiMo merkt es vor"],
          ]}
        />
        <Sentences
          title="Zum Licht"
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
          title="Zum Anpassen"
          items={[
            ["Sprich bitte langsamer.", "Please speak more slowly."],
            ["Sprich bitte schneller.", "Please speak faster."],
            ["Etwas leiser bitte.", "A little quieter, please."],
            ["Etwas lauter bitte.", "A little louder, please."],
            ["Zeig mir den Text.", "Show me the text.", "Untertitel im Schlitz"],
            ["Mach den Text größer.", "Make the text bigger."],
            ["Eine männliche Stimme bitte.", "A male voice, please."],
            ["Eine weibliche Stimme bitte.", "A female voice, please."],
            ["Eine tiefere Stimme.", "A deeper voice."],
            ["Sprich freundlicher.", "Sound warmer."],
            ["Sprich ruhiger.", "Sound calmer."],
            ["Stell auf grün.", "Switch to green.", "auch: blau, gelb, rosa, dunkel, grau, weiß"],
            ["Zeig lieber das Knäuel.", "Show the blob instead.", "auch: Kreis, Linie, Gesicht"],
            ["Sprich Englisch mit mir.", "Speak German with me."],
            ["Welche Stimmen gibt es?", "Which voices are there?", "öffnet das Menü im Schlitz"],
            ["Ich sehe nicht gut.", "I can't see well.", "CoSiMo wählt selbst, was hilft"],
            ["Ich höre nicht gut.", "I can't hear well."],
          ]}
        />
        <Sentences
          title="Zum MonoCab und zu CoSiMo"
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
          title="Mit Karte"
          items={[
            ["Merk dir, dass ich immer in Barntrup aussteige.", "Remember that I always get off at Barntrup."],
            ["Merk dir, dass ich es gern gemütlich habe.", "Remember that I like it cosy."],
            ["Was weißt du über mich?", "What do you know about me?"],
            ["Vergiss das wieder.", "Forget that."],
          ]}
        />
        <Sentences
          title="Einfach so"
          items={[
            ["Hallo!", "Hello!"],
            ["Sag das nochmal.", "Say that again."],
            ["Danke!", "Thanks!", "CoSiMo freut sich sichtbar"],
            ["Tschüss!", "Bye!"],
          ]}
        />
      </Section>

      {/* ─────────────────────────── Grenzen ─────────────────────────── */}
      <Section id="g-nicht" title="Was CoSiMo nicht kann" lead="Besser vorher sagen als hinterher erklären.">
        <Bullets
          items={[
            <><b>Die Fahrt ist simuliert.</b> Türen, Halt, Tempo sind nicht echt. „Ich möchte aussteigen“ wird nur vorgemerkt.</>,
            <><b>Nur das Kabinenlicht.</b> Keine Leselampe, nichts sonst in der Kabine.</>,
            <><b>Kein Lexikon.</b> Zur Fahrt, zum MonoCab und zu sich selbst weiß es Bescheid. Bei allem anderen verweist es ans Standpersonal.</>,
            <><b>Nur Deutsch und Englisch.</b></>,
            <><b>Hört nur bei gedrückter Taste.</b> Kein Aktivierungswort, kein Mithören.</>,
            <><b>Ohne Karte merkt es sich nichts.</b> Beim Zurücksetzen ist alles vergessen.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Wenn es hakt ─────────────────────────── */}
      <Section id="g-hakt" title="Wenn es hakt" lead="Drei Handgriffe, in dieser Reihenfolge. Danach die Technik holen.">
        <Steps
          items={[
            <><b>Nochmal.</b> Taste halten, deutlich sprechen, erst nach dem letzten Wort loslassen. Redet CoSiMo noch: kurz drücken, dann neu fragen.</>,
            <><b>Sitz zurücksetzen.</b> In der Konsole unter Sessions auf ↺ bei diesem Sitz. Der Besucher bekommt ein frisches Gespräch.</>,
            <><b>Demo-Modus einschalten.</b> Konsole → Sessions → Betrieb → „Demo- / Offline-Modus“. CoSiMo antwortet dann mit festen Sätzen zur Fahrt und zum Licht. Danach wieder ausschalten.</>,
          ]}
        />
        <div className="print-hide flex flex-wrap gap-2">
          <Button size="md" variant="secondary" onClick={() => go("sessions")}>Sessions öffnen</Button>
          <Button size="md" variant="secondary" onClick={() => go("hilfe")}>Technik: Hilfe</Button>
        </div>
        <Card className="gap-1.5 border-dashed">
          <b>Technik erreichbar</b>
          <span className="text-base text-mute">Name und Telefonnummer hier eintragen, bevor die Seite gedruckt wird.</span>
        </Card>
      </Section>
    </div>
  );
}
