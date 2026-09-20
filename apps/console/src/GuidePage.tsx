import { Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import type { PersonaBroadcast } from "@cosimo/shared";
import { Button, Card, cn } from "@cosimo/ui";
import { Bullets, Kbd, Note, P, Say, Section, Steps, SubNav, Table } from "./doc";
import type { Tab } from "./tabs";

/**
 * The Begleiten view — for the two people who accompany visitors at the
 * cab (not engineers). Written for reading on a phone between two visitors:
 * short sentences, large type (the `doc-large` wrapper scales the tokens),
 * the system font instead of the console's monospace. What CoSiMo is, how
 * the seat works, who the four riders on the cards are, four scenarios to
 * play through step by step, sentences that always work, what it cannot
 * do, what to do when it sticks. The rider rows read the live profiles so
 * the list can never be stale; the stories are written here.
 */

const NAV = [
  { id: "g-was", label: "Was ist CoSiMo" },
  { id: "g-sitz", label: "Der Sitz" },
  { id: "g-karten", label: "Die Fahrgäste" },
  { id: "g-szenarien", label: "Szenarien" },
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
            Für alle, die Besuchern CoSiMo zeigen. Alles Wichtige auf einer Seite: was es ist, wie man es bedient, wer die vier Fahrgäste auf den Karten sind, und vier kleine Szenen zum Vorführen.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="print-hide" onClick={() => window.print()}>
          <Printer size={14} /> Drucken
        </Button>
      </div>
      <SubNav items={NAV} />

      {/* ─────────────────────────── Was ist CoSiMo ─────────────────────────── */}
      <Section id="g-was" title="Was ist CoSiMo?">
        <Note>
          <b>CoSiMo ist ein Begleiter, der im MonoCab mitfährt.</b> Man hält eine Taste gedrückt und spricht mit ihm. Er antwortet mit Stimme und Gesicht. Er weiß, wo die Fahrt gerade ist, kann das Licht in der Kabine ändern und stellt sich auf den Fahrgast ein: langsamer sprechen, größer schreiben, eine andere Stimme.
        </Note>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="gap-1.5"><b>Eine Kabine, vier Sitze.</b><span className="text-base text-mute">Jeder Sitz führt sein eigenes Gespräch. Die Fahrt und das Licht sind für alle gleich.</span></Card>
          <Card className="gap-1.5"><b>Er hört nur, wenn die Taste gedrückt ist.</b><span className="text-base text-mute">Kein Mithören, kein Aktivierungswort.</span></Card>
          <Card className="gap-1.5"><b>Mit Karte erkennt er den Fahrgast.</b><span className="text-base text-mute">Er begrüßt mit Namen, stellt sich um und merkt sich Wünsche.</span></Card>
        </div>
        <P className="text-base text-mute">Warum das Ganze: CoSiMo soll zeigen, wie ein Fahrzeug Menschen mit ganz verschiedenen Bedürfnissen begleiten kann. Menschen, die nicht gut sehen. Menschen, die nicht gut hören. Menschen, die einfache Schritte brauchen.</P>
      </Section>

      {/* ─────────────────────────── Der Sitz ─────────────────────────── */}
      <Section id="g-sitz" title="So bedient man den Sitz" lead="Neben dem Panel sind drei Tasten und ein Kartenleser. Der Bildschirm selbst reagiert nicht auf Berührung, das ist so gewollt.">
        <Table
          head={["Was", "Wie", "Was passiert"]}
          rows={[
            [<b>Sprechen</b>, <>Die <b>Sprechtaste</b> gedrückt halten, reden, erst nach dem letzten Wort loslassen.</>, "Im Schlitz erscheint eine Welle. Nach dem Loslassen denkt CoSiMo kurz und antwortet."],
            [<b>Unterbrechen</b>, "Die Sprechtaste drücken, während CoSiMo redet.", "CoSiMo verstummt sofort und hört wieder zu."],
            [<b>Vorstellen</b>, <>Die <b>Info-Taste</b> einmal drücken.</>, "CoSiMo erklärt selbst, was es kann. Ein guter Anfang."],
            [<b>Licht</b>, <>Die <b>Licht-Taste</b> einmal drücken.</>, `Die nächste Lichtszene: ${scenes.join(" → ")}.`],
            [<b>Karte</b>, "Eine Karte auf den Leser legen.", "Der Sitz wird zu diesem Fahrgast. CoSiMo begrüßt ihn mit Namen."],
          ]}
        />
        <Note tone="warn">Der häufigste Fehler: die Taste zu früh loslassen. Erst zu Ende sprechen, dann loslassen.</Note>
        <P className="text-base text-mute">Zum Testen ohne Tasten, etwa im Browser: <Kbd>s</Kbd> halten = sprechen, <Kbd>i</Kbd> = Info, <Kbd>l</Kbd> = Licht.</P>
      </Section>

      {/* ─────────────────────────── Die Fahrgäste ─────────────────────────── */}
      <Section id="g-karten" title="Die vier Fahrgäste auf den Karten" lead="Jede Karte steht für einen erfundenen Fahrgast. Legt man sie auf, verhält sich CoSiMo so, wie es für diesen Menschen richtig ist. Das ist die stärkste Vorführung.">
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

      {/* ─────────────────────────── Szenarien ─────────────────────────── */}
      <Section id="g-szenarien" title="Vier Szenen zum Vorführen" lead="Jede dauert etwa eine Minute. Die Sätze in Anführungszeichen spricht der Besucher oder du.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="gap-3">
            <span className="text-xl font-black">1 · Die Fahrt</span>
            <P className="text-base text-mute">Ohne Karte. Zeigt, dass CoSiMo weiß, wo wir sind.</P>
            <Steps items={[
              <>Taste halten: <b>„Wo sind wir gerade?“</b> CoSiMo nennt den Ort und den nächsten Halt.</>,
              <><b>„Wann kommen wir in Barntrup an?“</b> CoSiMo nennt die Minuten.</>,
              <>Jemand mit der Konsole drückt unter Übersicht → Fahrt auf <b>Signalhalt</b>. Im Schlitz erscheint „Störung“.</>,
              <><b>„Warum stehen wir?“</b> CoSiMo erklärt den Halt und wie lange er dauert.</>,
            ]} />
          </Card>
          <Card className="gap-3">
            <span className="text-xl font-black">2 · Das Licht</span>
            <P className="text-base text-mute">Ohne Karte. Alle in der Kabine sehen die Änderung.</P>
            <Steps items={[
              <><b>„Mach das Licht gemütlich.“</b> Das Licht wird warm und dunkler.</>,
              <><b>„Etwas heller bitte.“</b> Es wird stufenweise heller.</>,
              <><b>„Licht aus.“</b> Dann <b>„Mach das Licht wieder an.“</b></>,
              <>Zum Schluss die <b>Licht-Taste</b> drücken: die nächste Szene, ganz ohne Worte.</>,
            ]} />
          </Card>
          <Card className="gap-3">
            <span className="text-xl font-black">3 · Zwei Fahrgäste, ein Sitz</span>
            <P className="text-base text-mute">Zeigt, wie unterschiedlich CoSiMo sein kann.</P>
            <Steps items={[
              <>Karte <b>Sam</b> auflegen. CoSiMo begrüßt auf Englisch.</>,
              <><b>“When is the next stop?”</b> Ein Satz, fertig.</>,
              <>Karte <b>Luca</b> auflegen. Gelbes Schema, Text im Schlitz, langsame warme Stimme.</>,
              <><b>„Mach das Licht gemütlich.“</b> CoSiMo macht es, bestätigt es und bietet den nächsten Schritt an.</>,
            ]} />
          </Card>
          <Card className="gap-3">
            <span className="text-xl font-black">4 · Anpassen und Merken</span>
            <P className="text-base text-mute">Mit Karte. Zeigt, dass CoSiMo sich auf einen Menschen einstellt.</P>
            <Steps items={[
              <>Karte <b>Noa</b> auflegen. Die Antworten stehen als Text im Schlitz.</>,
              <><b>„Sprich bitte langsamer.“</b> Dann <b>„Stell auf blau.“</b> Beides passiert sofort.</>,
              <><b>„Merk dir, dass ich es gern hell habe.“</b> CoSiMo bestätigt.</>,
              <>Karte abnehmen, eine andere Karte auflegen, dann Noa wieder. <b>„Was weißt du über mich?“</b> CoSiMo weiß es noch.</>,
            ]} />
          </Card>
        </div>
        <Note>Dazwischen lohnt ein Blick auf das <b>Gesicht</b>: Es hört zu, denkt nach, spricht, freut sich, staunt. Nach zwei Minuten Ruhe schläft es ein. Die Taste weckt es wieder.</Note>
      </Section>

      {/* ─────────────────────────── Sätze ─────────────────────────── */}
      <Section id="g-saetze" title="Sätze, die immer funktionieren" lead="Deutsch oder Englisch. CoSiMo antwortet in der Sprache, in der man spricht.">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Wo sind wir gerade?" en="Where are we right now?" />
          <Say de="Wann kommt der nächste Halt?" en="When is the next stop?" />
          <Say de="Wie schnell fahren wir?" en="How fast are we going?" />
          <Say de="Warum stehen wir?" en="Why are we stopped?" />
          <Say de="Mach das Licht gemütlich." en="Make the light cosy." />
          <Say de="Etwas dunkler bitte." en="A bit darker, please." />
          <Say de="Sprich bitte langsamer." en="Please speak more slowly." />
          <Say de="Zeig mir den Text." en="Show me the text." />
          <Say de="Eine männliche Stimme bitte." en="A male voice, please." />
          <Say de="Stell auf grün." en="Switch to green." />
          <Say de="Was kannst du?" en="What can you do?" />
          <Say de="Danke!" en="Thanks!" />
        </div>
      </Section>

      {/* ─────────────────────────── Grenzen ─────────────────────────── */}
      <Section id="g-nicht" title="Was CoSiMo nicht kann" lead="Besser vorher sagen als hinterher erklären.">
        <Bullets
          items={[
            <><b>Die Fahrt ist simuliert.</b> Türen, Halt, Tempo sind nicht echt. „Ich möchte aussteigen“ wird nur vorgemerkt.</>,
            <><b>Nur das Kabinenlicht.</b> Keine Leselampe, nichts sonst in der Kabine.</>,
            <><b>Kein Lexikon.</b> Zur Fahrt und zur Kabine weiß es Bescheid. Bei anderen Fragen antwortet es nach bestem Wissen, ohne Internet.</>,
            <><b>Nur Deutsch und Englisch.</b></>,
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
        <Card className={cn("gap-1.5 border-dashed")}>
          <b>Technik erreichbar</b>
          <span className="text-base text-mute">Name und Telefonnummer hier eintragen, bevor die Seite gedruckt wird.</span>
        </Card>
      </Section>
    </div>
  );
}
