import { Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import type { PersonaBroadcast } from "@cosimo/shared";
import { Button, Card, cn } from "@cosimo/ui";
import { Bullets, H3, Kbd, Note, P, Say, Section, Steps, SubNav, Table } from "./doc";
import type { Tab } from "./tabs";

/**
 * The Demo view — the cheat sheet for the people showing CoSiMo to
 * visitors. Not a technical page: what CoSiMo is, how a visitor operates
 * the seat, what to say to make it shine, which card tells which story,
 * what it cannot do, and the three moves when something sticks. The card
 * table reads the live profiles, so it never goes stale.
 */

const NAV = [
  { id: "d-kurz", label: "In Kürze" },
  { id: "d-bedienung", label: "Bedienung" },
  { id: "d-sagen", label: "Sag mal …" },
  { id: "d-karten", label: "Karten" },
  { id: "d-zeigen", label: "Vorführen" },
  { id: "d-grenzen", label: "Grenzen" },
  { id: "d-hakt", label: "Wenn es hakt" },
];

/** The story per seeded rider — what to tell a visitor before the card goes on. */
const STORY: Record<string, string> = {
  alex: "Alex, 68, hört und tastet, sieht wenig — bekommt jede Option laut genannt und jede Aktion laut bestätigt.",
  noa: "Noa, 25, liest lieber mit — Text im Schlitz, dunkles kontrastreiches Schema, ruhiges Gesicht, leise ruhige Stimme, knappe Antworten.",
  luca: "Luca, 42, braucht einfache Abläufe — Schritt für Schritt, eine Sache pro Antwort, warme langsame Stimme, nur die Grundfunktionen.",
  sam: "Sam, 33, pendelt und spricht Englisch — CoSiMo begrüßt und antwortet auf Englisch, nur der nächste Halt und die Zeit, keine Rückfragen.",
};

const THEME_LABEL: Record<string, string> = { weiss: "Weiß", dunkel: "Dunkel", blau: "Blau", gruen: "Grün", gelb: "Gelb", rosa: "Rosa", grau: "Grau" };

/** What a visitor sees change when this profile is active — derived from the accommodations. */
function visible(p: PersonaBroadcast): string {
  const a = p.accommodations;
  const out: string[] = [];
  if (a.language === "en") out.push("spricht Englisch");
  if (a.theme && a.theme !== "weiss") out.push(`Farbe ${THEME_LABEL[a.theme] ?? a.theme}`);
  if (a.showText) out.push("Text im Schlitz");
  if (a.textSize && a.textSize !== "l") out.push("kleinere Schrift");
  if (a.reduceMotion) out.push("ruhiges Gesicht");
  if (a.speechRate && a.speechRate < 1) out.push("spricht langsamer");
  if (a.speechRate && a.speechRate > 1) out.push("spricht schneller");
  if (a.volume != null && a.volume < 1) out.push("leiser");
  if (a.voiceGender === "male") out.push("männliche Stimme");
  if (a.voiceTone && a.voiceTone !== "neutral") out.push(`Stimmung ${a.voiceTone}`);
  if (a.character && a.character !== "face") out.push(`Gestalt ${a.character}`);
  return out.length ? out.join(" · ") : "wie Standard";
}

function style(p: PersonaBroadcast): string {
  const t = p.traits;
  if (!t) return "—";
  const parts: string[] = [];
  parts.push(t.modality === "audio-first" ? "hört" : t.modality === "visual-first" ? "sieht" : "beides");
  parts.push(t.pace === "step-by-step" ? "Schritt für Schritt" : t.pace === "brisk" ? "zügig" : "normales Tempo");
  parts.push(t.verbosity === "terse" ? "knapp" : t.verbosity === "explanatory" ? "erklärend" : "normal lang");
  if (t.confirmation === "every-step") parts.push("bestätigt jede Aktion");
  if (t.initiative === "leads") parts.push("schlägt den nächsten Schritt vor");
  if (t.scope === "basics") parts.push("nur Grundfunktionen");
  return parts.join(" · ");
}

export default function DemoPage({ c, go }: { c: CosimoState; go: (t: Tab) => void }) {
  const riders = c.personas.filter((p) => p.persona !== "default");
  const scenes = c.light?.scenes.map((s) => s.label).filter(Boolean) ?? ["Standard", "Gemütlich", "Hell"];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-4xl font-black">Das kann CoSiMo</h1>
          <p className="m-0 max-w-[68ch] text-base text-mute">
            Der Spickzettel für alle, die Besuchern CoSiMo zeigen. Zum Ausdrucken oder auf dem Handy.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="print-hide" onClick={() => window.print()}>
          <Printer size={14} /> Drucken
        </Button>
      </div>
      <SubNav items={NAV} />

      {/* ─────────────────────────── In Kürze ─────────────────────────── */}
      <Section id="d-kurz" title="In Kürze">
        <Note>
          <b>CoSiMo ist ein Begleiter, der im MonoCab mitfährt.</b> Er hört zu, wenn man die Taste hält, antwortet mit Stimme und Gesicht, weiß, wo die Fahrt gerade ist, schaltet das Licht in der Kabine und stellt sich auf den Fahrgast ein — größer schreiben, langsamer sprechen, andere Stimme, andere Farbe. Mit einer Karte erkennt er, wer da sitzt, begrüßt mit Namen und merkt sich Wünsche.
        </Note>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="gap-1"><b>Eine Kabine, vier Sitze.</b><span className="text-sm text-mute">Jeder Sitz führt sein eigenes Gespräch. Die Fahrt und das Licht teilen sich alle.</span></Card>
          <Card className="gap-1"><b>Gesicht statt Bildschirm.</b><span className="text-sm text-mute">Kein Touch, kein Menü zum Suchen. Sprechen, hören, sehen wie es reagiert.</span></Card>
          <Card className="gap-1"><b>Für Inklusion gebaut.</b><span className="text-sm text-mute">Text für Menschen, die nicht hören. Stimme für Menschen, die nicht sehen. Einfache Schritte für alle, die es brauchen.</span></Card>
        </div>
        <P className="text-sm text-mute">Datenschutz, falls gefragt: Gespräche werden für die Forschung aufgezeichnet, der Hinweis hängt an der Kabine. Es werden nur Einstellungen gespeichert, nie Diagnosen. Ohne Karte ist der Sitz anonym und vergisst alles beim Zurücksetzen.</P>
      </Section>

      {/* ─────────────────────────── Bedienung ─────────────────────────── */}
      <Section id="d-bedienung" title="Bedienung am Sitz" lead="Der Kreis ist nur zum Anschauen. Alles läuft über die Tasten neben dem Panel und den Schlitz darunter.">
        <Table
          head={["Was", "Wie", "Was passiert"]}
          rows={[
            ["Sprechen", <><b>Sprechtaste halten</b>, reden, loslassen</>, "Im Schlitz erscheint die Welle; nach dem Loslassen denkt CoSiMo (Punkt am Rand) und antwortet."],
            ["Unterbrechen", "Sprechtaste drücken, während CoSiMo redet", "CoSiMo verstummt sofort und hört zu."],
            ["Nochmal hören", "↻ im Schlitz tippen (8 s nach der Antwort) oder „Sag das nochmal“", "Die letzte Antwort wird wiederholt."],
            ["Vorstellen", <><b>Info-Taste</b> einmal drücken</>, "CoSiMo erklärt selbst, was es kann."],
            ["Licht", <><b>Licht-Taste</b> einmal drücken</>, `Nächste Szene: ${scenes.join(" → ")}.`],
            ["Karte", "NFC-Karte auf den Leser legen", "Der Sitz wechselt zum Profil und CoSiMo begrüßt mit Namen — auch mitten im Satz."],
            ["Einstellen", "„Kannst du dich anpassen?“ sagen — oder im Schlitz das Menü nutzen", "Textgröße · Lautstärke · Stimme · Farbe · Gestalt · Licht; jeder Tipp wirkt sofort, CoSiMo bestätigt in der neuen Einstellung."],
            ["Ja / Nein", "Chip im Schlitz tippen", "Erscheint nur, wenn CoSiMo eine Rückfrage stellt; 20 s lang."],
          ]}
        />
        <P className="text-sm text-mute">Ohne Tasten (Emulator, Test): Tastatur <Kbd>s</Kbd> halten = sprechen, <Kbd>i</Kbd> = Info, <Kbd>l</Kbd> = Licht, <Kbd>[</Kbd> Chip-ID <Kbd>⏎</Kbd> = Karte.</P>
        <Note tone="warn">Die Taste erst nach dem letzten Wort loslassen, nicht davor. Und nicht in den Kreis tippen — der reagiert absichtlich nicht (nur die Augen folgen dem Finger).</Note>
      </Section>

      {/* ─────────────────────────── Sag mal … ─────────────────────────── */}
      <Section id="d-sagen" title="Sag mal …" lead="Sätze, die zuverlässig etwas zeigen. Deutsch oder Englisch — CoSiMo antwortet in der Sprache, in der man spricht.">
        <H3>Die Fahrt</H3>
        <P className="text-sm text-mute">CoSiMo kennt die Fahrt live: Ort, Tempo, jeden kommenden Halt mit Ankunftszeit, Richtung, Verspätung, Störung. Die Linie ist die Begatalbahn (Lemgo-Lüttfeld → Barntrup), simuliert, hin und zurück.</P>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Wo sind wir gerade?" en="Where are we right now?" />
          <Say de="Wann kommt der nächste Halt?" en="When is the next stop?" />
          <Say de="Wie schnell fahren wir?" en="How fast are we going?" />
          <Say de="Welche Halte kommen noch?" en="Which stops are still ahead?" />
          <Say de="Warum stehen wir?" en="Why are we stopped?" note="wirkt am besten mit einer Störung, siehe Vorführen" />
          <Say de="Sind wir pünktlich?" en="Are we on time?" />
          <Say de="Wie viele Leute sind an Bord?" en="How many people are on board?" />
          <Say de="Ich möchte in Barntrup aussteigen." en="I'd like to get off at Barntrup." note="CoSiMo merkt den Haltewunsch vor — die Kabine fährt in der Demo nicht wirklich" />
        </div>

        <H3>Das Licht</H3>
        <P className="text-sm text-mute">Ein Licht für die ganze Kabine, alle Sitze teilen es. Drei Szenen ({scenes.join(", ")}) und Aus; „heller“ und „dunkler“ dimmen die aktuelle Szene stufenweise.</P>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Mach das Licht gemütlich." en="Make the light cosy." />
          <Say de="Mach es hell." en="Make it bright." />
          <Say de="Etwas dunkler bitte." en="A bit darker, please." />
          <Say de="Licht aus." en="Lights off." />
          <Say de="Mach das Licht an." en="Turn the light on." note="ist es schon an, sagt CoSiMo das, statt zu schalten" />
          <Say de="Mach die Lichtlinien auf 40 Prozent." en="Set the light lines to 40 percent." note="einzelne Gruppen: Lichtlinien, Deckenpaneel, Boden" />
        </div>

        <H3>Anpassen</H3>
        <P className="text-sm text-mute">Alles, was die Darstellung betrifft, geht per Stimme. Die Änderung wirkt sofort auf diesem Sitz; mit Karte bleibt sie gespeichert.</P>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Sprich bitte langsamer." en="Please speak more slowly." />
          <Say de="Etwas leiser bitte." en="A little quieter, please." />
          <Say de="Zeig mir den Text." en="Show me the text." note="der Schlitz zeigt Untertitel, das Gesicht wird kleiner" />
          <Say de="Mach den Text größer." en="Make the text bigger." />
          <Say de="Eine männliche Stimme bitte." en="A male voice, please." />
          <Say de="Eine tiefere Stimme." en="A deeper voice." note="CoSiMo wählt aus dem Stimmenkatalog" />
          <Say de="Sprich freundlicher." en="Sound warmer." note="Stimmung: neutral · warm · ruhig · lebhaft" />
          <Say de="Stell auf grün." en="Switch to green." note="Weiß · Dunkel · Blau · Grün · Gelb · Rosa · Grau" />
          <Say de="Zeig lieber das Knäuel." en="Show the blob instead." note="Gestalt: Gesicht · Knäuel · Kreis · Linie" />
          <Say de="Sprich Englisch mit mir." en="Speak German with me." />
          <Say de="Welche Stimmen gibt es?" en="Which voices are there?" note="öffnet das Menü im Schlitz" />
          <Say de="Ich sehe nicht gut." en="I can't see well." note="CoSiMo entscheidet selbst, welche Einstellungen helfen" />
        </div>

        <H3>Merken — nur mit Karte</H3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Merk dir, dass ich immer in Barntrup aussteige." en="Remember that I always get off at Barntrup." />
          <Say de="Was weißt du über mich?" en="What do you know about me?" />
          <Say de="Vergiss das wieder." en="Forget that." />
          <Say de="Merk dir, dass ich es gern gemütlich habe." en="Remember that I like it cosy." note="beim nächsten Auflegen der Karte weiß CoSiMo es noch" />
        </div>

        <H3>Einfach so</H3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Say de="Wer bist du?" en="Who are you?" />
          <Say de="Was kannst du?" en="What can you do?" />
          <Say de="Danke!" en="Thanks!" note="CoSiMo freut sich sichtbar" />
        </div>
      </Section>

      {/* ─────────────────────────── Karten ─────────────────────────── */}
      <Section id="d-karten" title="Die Karten" lead="Jede Karte ist ein Fahrgast mit einem Profil. Auflegen: CoSiMo begrüßt mit Namen, in der Sprache des Profils, und der Sitz stellt sich um. Das ist die stärkste Vorführung.">
        {riders.length === 0 ? (
          <P className="text-mute">Noch keine Profile vom Hub erhalten — sobald die Konsole verbunden ist, stehen sie hier.</P>
        ) : (
          <Table
            head={["Karte", "Die Geschichte", "Sichtbar anders", "Gesprächsstil"]}
            rows={riders.map((p) => [
              <><span className="text-base">{p.label || p.persona}</span><br /><span className="font-normal text-mute">{STORY[p.persona] ? `Chip ${p.persona.toUpperCase()}1` : "Chip-ID im CMS"}</span></>,
              STORY[p.persona] ?? "—",
              visible(p),
              style(p),
            ])}
          />
        )}
        <Bullets
          items={[
            <>Nach dem Auflegen etwas sagen, das den Stil zeigt: bei <b>Sam</b> “When is the next stop?” (ein englischer Satz, fertig), bei <b>Luca</b> „Mach das Licht gemütlich“ (Schritt, Bestätigung, Angebot für den nächsten Schritt), bei <b>Noa</b> beliebig — und auf den Text im Schlitz zeigen, bei <b>Alex</b> „Licht aus“ (wird laut bestätigt).</>,
            <>Eine <b>unbekannte Karte</b> (jede andere NFC-Karte, z. B. eine Bankkarte) bekommt eine freundliche Absage — auch ein netter Moment.</>,
            <>Karte wechseln geht jederzeit, auch mitten im Satz. Der Sitz bekommt ein frisches Gespräch; der vorige Fahrgast bleibt privat.</>,
            <>Ohne Leser: in der Konsole unter Sessions die Persona des Sitzes umstellen — dasselbe, nur ohne Karte.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Vorführen ─────────────────────────── */}
      <Section id="d-zeigen" title="Vorführ-Ideen" lead="Drei kleine Nummern, die in einer Minute zeigen, was das System kann.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="gap-2">
            <b>1 · Die Störung</b>
            <Steps items={[
              <>Konsole → Übersicht → Fahrt → <b>Signalhalt</b>.</>,
              <>Im Schlitz erscheint „Störung“, die Fahrt-Ansicht zeigt Halt.</>,
              <>Fragen: <i>„Warum stehen wir?“</i> — CoSiMo erklärt Grund und Dauer und verspricht keine Ankunft, die nicht mehr stimmt.</>,
              <>Danach <b>Störung beenden</b> (oder 45 s warten).</>,
            ]} />
          </Card>
          <Card className="gap-2">
            <b>2 · Zwei Fahrgäste, ein Sitz</b>
            <Steps items={[
              <>Karte <b>Sam</b> auflegen: CoSiMo begrüßt auf Englisch. “Next stop?” fragen — ein Satz, fertig.</>,
              <>Karte <b>Luca</b> auflegen: gelbes Farbschema, Text im Schlitz, langsame warme Stimme, Begrüßung auf Deutsch.</>,
              <>Dieselbe Frage auf Deutsch — ganz andere Antwort, Schritt für Schritt.</>,
            ]} />
          </Card>
          <Card className="gap-2">
            <b>3 · Es merkt sich was</b>
            <Steps items={[
              <>Mit Karte: <i>„Merk dir, dass ich es gern dunkel habe.“</i></>,
              <>Karte ab, Sitz zurücksetzen (Konsole) oder andere Karte.</>,
              <>Karte wieder auflegen: <i>„Was weißt du über mich?“</i></>,
            ]} />
          </Card>
        </div>
        <Bullets
          items={[
            <>Das <b>Gesicht</b>: hört zu (grüner Rand), denkt (Punkt läuft am Rand), spricht (der Mund folgt der echten Stimme), freut sich, staunt, ist traurig, wenn es nicht helfen kann. Nach zwei Minuten Ruhe schläft es ein — die Taste weckt es.</>,
            <>Auf <b>Englisch</b> fragen — CoSiMo bleibt in der Sprache des Fragenden, ohne Umschalten.</>,
            <>Die <b>Fahrt-Ansicht</b> auf dem Standbildschirm zeigt dasselbe, was CoSiMo weiß: Position, Halte, Störung, wer echt an Bord sitzt (rot).</>,
            <>Zwei Besucher an zwei Sitzen gleichzeitig: jeder hört nur sein Gespräch, beide teilen sich das Licht.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Grenzen ─────────────────────────── */}
      <Section id="d-grenzen" title="Was CoSiMo nicht kann" lead="Besser vorher sagen als hinterher erklären.">
        <Bullets
          items={[
            <><b>Nichts Fahrzeug-Echtes.</b> Türen, Halt, Tempo — die Fahrt ist eine Simulation; „Ich möchte aussteigen“ wird nur vorgemerkt.</>,
            <><b>Nur das Kabinenlicht.</b> Die drei Innenlicht-Gruppen und die Szenen. Keine Leselampe, keine Außenbeleuchtung, nichts sonst in der Kabine.</>,
            <><b>Kein Weltwissen-Versprechen.</b> Zur Fahrt und zur Kabine ist es sicher; Fragen nach dem Wetter oder Berlin beantwortet das Sprachmodell nach bestem Wissen, ohne Internet.</>,
            <><b>Hört nur bei gehaltener Taste.</b> Kein Aktivierungswort, kein Dauer-Zuhören.</>,
            <><b>Merkt sich ohne Karte nichts.</b> Anonyme Sitze vergessen alles beim Zurücksetzen; Merken braucht eine Karte mit Einwilligung.</>,
            <><b>Sprachen: Deutsch und Englisch.</b> Andere Sprachen werden nicht erkannt.</>,
            <><b>Ein Gespräch je Sitz.</b> Sitze wissen nichts voneinander — gewollt.</>,
            <><b>Ohne Internet einfacher.</b> Fällt der Uplink aus, antwortet CoSiMo mit festen Sätzen zur Fahrt und zum Licht und spricht mit der iPad-Stimme.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Wenn es hakt ─────────────────────────── */}
      <Section id="d-hakt" title="Wenn es hakt" lead="Drei Handgriffe in dieser Reihenfolge. Alles Weitere steht unter Hilfe.">
        <Steps
          items={[
            <><b>Nochmal.</b> Taste halten, deutlich sprechen, erst nach dem letzten Wort loslassen. Redet CoSiMo noch: kurz drücken, dann neu fragen.</>,
            <><b>Sitz zurücksetzen.</b> Konsole → Sessions → ↺ auf der Karte des Sitzes. Der Besucher bekommt ein frisches Gespräch, das Licht bleibt.</>,
            <><b>Demo-Modus.</b> Bleiben die Antworten aus: Konsole → Sessions → Betrieb → „Demo- / Offline-Modus“ an. CoSiMo antwortet dann mit festen Sätzen zur Fahrt und schaltet weiter das Licht. Danach wieder aus.</>,
          ]}
        />
        <div className="print-hide flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => go("sessions")}>Sessions öffnen</Button>
          <Button size="sm" variant="secondary" onClick={() => go("hilfe")}>Hilfe → Fehlersuche</Button>
        </div>
        <Note>Stimme weg, aber Antwort da? Lautstärke am iPad und im Schlitzmenü. Licht reagiert nicht? Die Demo geht weiter — CoSiMo sagt, was es tun würde. Gesicht schläft? Taste drücken.</Note>
        <P className={cn("text-sm text-mute")}>Technik erreichbar: Name und Nummer hier eintragen, bevor der Zettel gedruckt wird.</P>
      </Section>
    </div>
  );
}
