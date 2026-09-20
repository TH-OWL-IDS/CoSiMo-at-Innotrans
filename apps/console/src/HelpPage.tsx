import { useMemo } from "react";
import { CircleAlert, CircleCheck, Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import { Button, Card, Chip, Dot, cn } from "@cosimo/ui";
import { Bullets, C, Code, H3, Kbd, Note, P, Section, Steps, SubNav, Symptom, Table, Term } from "./doc";
import { diagnose, has } from "./diagnose";
import SystemDiagram from "./SystemDiagram";
import type { Tab } from "./tabs";

/**
 * The Hilfe view — the technical page for the booth staff: how the system
 * is built, how a stand is set up, the morning routine, and a troubleshooting
 * list that reads the hub's live state (`diagnose`) so the entry that
 * applies right now says so. Written for someone who did not build CoSiMo
 * but has to keep it running for a day.
 */

const NAV = [
  { id: "aufbau", label: "Aufbau" },
  { id: "einrichten", label: "Einrichten" },
  { id: "morgen", label: "Morgenroutine" },
  { id: "fehlersuche", label: "Fehlersuche" },
  { id: "logs", label: "Logs lesen" },
  { id: "begriffe", label: "Begriffe" },
];

export default function HelpPage({ c, go, showLogsFor }: { c: CosimoState; go: (t: Tab) => void; showLogsFor: (deviceId: string) => void }) {
  const f = useMemo(() => diagnose(c), [c.status, c.hostConfig, c.devices, c.telemetry, c.light, c.services, c.logs.length, c.connected]);
  const toUebersicht = { label: "Übersicht", onClick: () => go("uebersicht") };
  const toLicht = { label: "Licht", onClick: () => go("licht") };
  const toSessions = { label: "Sessions", onClick: () => go("sessions") };
  const toLogs = { label: "Logs", onClick: () => go("logs") };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-4xl font-black">Hilfe</h1>
          <p className="m-0 max-w-[68ch] text-base text-mute">
            Wie CoSiMo gebaut ist, wie der Stand eingerichtet wird und was zu tun ist, wenn etwas nicht geht. Die Fehlersuche liest den Zustand des Hubs mit — was gerade zutrifft, ist markiert.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="print-hide" onClick={() => window.print()}>
          <Printer size={14} /> Drucken
        </Button>
      </div>
      <SubNav items={NAV} />

      <Note className="print-hide flex flex-wrap items-center justify-between gap-3">
        <span><b>Du begleitest Besucher?</b> Dann ist die Seite „Begleiten“ die richtige: was CoSiMo ist, die Karten, vier Szenen zum Vorführen. Diese Seite hier ist für die Technik.</span>
        <Button size="sm" variant="secondary" onClick={() => go("begleiten")}>Begleiten öffnen</Button>
      </Note>

      {/* ─────────────────────────── Aufbau ─────────────────────────── */}
      <Section id="aufbau" title="Aufbau" lead="Vier Sitze, ein Hub, ein CMS, ein paar Dienste im Internet — und ein Lichtcontroller, den nur die iPads erreichen.">
        <SystemDiagram />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="gap-2">
            <H3 className="mt-0">Die Sitze</H3>
            <P>Vier iPad minis, je hinter einem Panel mit zwei Ausschnitten: dem <b>Kreis</b> für das Gesicht und dem <b>Schlitz</b> für Fahrtinfos, Untertitel, Ja/Nein-Karte und das Einstellungsmenü. Alles außerhalb bleibt schwarz. Neben dem Panel sitzen die physischen Tasten (ein ESP32, der sich als Bluetooth-Tastatur koppelt) und der NFC-Leser.</P>
            <P>Die App ist bewusst dumm: sie schickt Audio, Tastendrücke und Chip-IDs roh zum Hub und zeigt, was zurückkommt. Nur eines tut sie selbst: sie feuert die Licht-URLs ins Kabinen-LAN, weil sie das einzige Gerät ist, das dort hängt.</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">Der Hub</H3>
            <P>Ein Node-Prozess auf dem VPS (<C>apps/realtime</C>, Host <C>ws-cosimo</C>). Er hält jede Verbindung, führt den Agenten (Sprachmodell mit Werkzeugen), simuliert die Fahrt, kennt die Lichtszenen und schreibt das Log. Alles, was <i>gerade</i> passiert, passiert hier.</P>
            <P>Er unterscheidet <b>global</b> (die Fahrt: Ort, Tempo, Halte, Störung — an alle) und <b>pro Sitz</b> (das Gespräch, das Profil, das Gesicht — nur an das eine iPad). Sitze hören einander nie.</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">Das CMS</H3>
            <P>Payload auf Postgres (<C>cms-cosimo</C>, Login unter <C>/admin</C>). Hält die Profile mit ihren Chip-IDs, die Route der Simulation, die aufgezeichneten Sessions und fünf Konfigurations-Globals: Agent (Kern-Prompt), LLM (Modell, Route, Fallback), Sprache (STT/TTS-Routen), Stimmen (Katalog) und Kabine (LPU-2-Adresse, Playbacks, Szenen).</P>
            <P>Es ist <b>nie im Live-Pfad</b>: der Hub liest es alle 15 s und fährt mit dem letzten Stand oder eingebauten Defaults weiter, wenn es weg ist. API-Schlüssel stehen nie im CMS, nur in der Umgebung des Hubs.</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">Die Dienste</H3>
            <P><b>Deepgram</b> hört (Server-STT), <b>ElevenLabs</b> spricht (Server-TTS, satzweise gestreamt). Das <b>Gehirn</b> ist ein Qwen-Modell auf dem GX10, das der Hub über Tailscale erreicht; fällt es aus, springt automatisch der <b>Fallback</b> ein (Claude), wenn einer konfiguriert ist. Fällt beides aus oder das Internet, antwortet CoSiMo <b>vorgefertigt</b> — aus Skripten, die die Fahrtdaten kennen und das Licht schalten können.</P>
          </Card>
        </div>
        <H3>Wer wo erreichbar ist</H3>
        <Table
          head={["Was", "Öffentlich (Cloudflare)", "Im Container", "Lokal (Dev)"]}
          rows={[
            ["Hub / WebSocket", "ws-cosimo.homannjohannes.de", "127.0.0.1:6221", ":6101"],
            ["CMS (Admin + API)", "cms-cosimo.homannjohannes.de", "127.0.0.1:6220", ":6100"],
            ["Diese Konsole", "console-cosimo.homannjohannes.de", "127.0.0.1:6222", ":6102"],
            ["Sitz-Emulator (Browser-iPad)", "seat-cosimo.homannjohannes.de", "127.0.0.1:6223", ":6103"],
            ["Fahrt-Ansicht (Standbildschirm)", "journey-cosimo.homannjohannes.de", "127.0.0.1:6224", ":6104"],
            ["Befragung (QR-Code am Ausgang)", "form-cosimo.homannjohannes.de", "127.0.0.1:6225", ":6105"],
            ["LPU-2 (Lichtcontroller)", "— nur Kabinen-LAN", "Adresse im CMS → Kabine", "—"],
          ]}
        />
        <H3>Was ausfallen darf</H3>
        <Table
          head={["Fällt aus", "Was passiert", "Was der Besucher merkt"]}
          rows={[
            ["CMS", "Profile, Route, Konfig aus Cache/Defaults; Sessions werden nicht gespeichert; Merken geht nicht", "nichts"],
            ["Gehirn (GX10)", "Fallback-Modell übernimmt, sonst vorgefertigte Antworten", "nichts, bzw. kürzere Antworten"],
            ["Internet am Hub", "vorgefertigte Antworten, Systemstimme statt ElevenLabs, Diktat auf dem iPad", "einfachere Antworten, andere Stimme"],
            ["Deepgram", "iPad diktiert selbst (Apple, offline Deutsch)", "etwas schlechtere Erkennung"],
            ["ElevenLabs", "iPad spricht mit der Systemstimme", "andere Stimme"],
            ["LPU-2 / Ethernet", "Licht bleibt in der Standalone-Szene; Zustand „degradiert“", "Licht reagiert nicht"],
            ["Hub", "alles steht — die iPads zeigen „Verbindung wird hergestellt …“ und verbinden von selbst neu", "kein CoSiMo"],
          ]}
        />
      </Section>

      {/* ─────────────────────────── Einrichten ─────────────────────────── */}
      <Section id="einrichten" title="Einrichten" lead="Einmal beim Aufbau, je iPad ein paar Minuten. Alles davon steht im versteckten Einrichtungsbildschirm der App.">
        <Note>Einrichtung öffnen: <b>den Schlitz drei Sekunden gedrückt halten.</b> Bildschirmecken sind hinter dem Panel unerreichbar.</Note>
        <H3>Je iPad</H3>
        <Steps
          items={[
            <>App „CoSiMo Kiosk“ starten. Beim ersten Start fragt sie nach dem Mikrofon und später nach dem lokalen Netzwerk — <b>beides erlauben</b>.</>,
            <><b>Server-Adresse</b>: <C>https://ws-cosimo.homannjohannes.de</C> ist eingebaut. Nur ändern, wenn ein Entwickler-Hub gemeint ist.</>,
            <><b>Sitzplatz</b> 1 bis 4 wählen (1 = vorn, 4 = hinten). Die Konsole zeigt die Nummer in der Verbindungsliste.</>,
            <><b>Panel-Kalibrierung</b>: „Umrisse anzeigen“ an, die Werte für Kreis und Schlitz in Prozent anpassen, bis die Umrisse mit den Ausschnitten fluchten, speichern, Umrisse wieder aus.</>,
            <><b>Schaustellung</b> nur auf Sitzen, die kein Besucher erreicht: das Gesicht spielt dann stumm und endlos, die Tasten sind aus. Nur dieser Schalter beendet es.</>,
            <><b>Tasten koppeln</b>: iPad-Einstellungen → Bluetooth → <C>CoSiMo-Seat-n</C>. Test: Sprechtaste halten → im Schlitz erscheint die Welle. Info-Taste → CoSiMo stellt sich vor. Licht-Taste → nächste Szene.</>,
            <><b>Kabinen-LAN</b>: USB-C-Ethernet-Adapter anschließen. Statische IP im Netz der LPU-2, <b>Router-Feld leer lassen</b> (keine Default-Route, sonst verliert das iPad den Hub). Test: Einrichtung → Licht (Standpersonal) → „LPU-2 testen“; das Ergebnis steht in der Konsole unter System-Logs.</>,
            <><b>Kiosk-Modus</b>: Geführter Zugriff an, automatische Sperre aus. Für den Diktat-Fallback: Einstellungen → Allgemein → Tastatur → Diktiersprachen → Deutsch offline laden.</>,
          ]}
        />
        <H3>Kabine und Licht</H3>
        <Steps
          items={[
            <>Im CMS unter <b>Kabine</b> die LPU-2-Adresse eintragen — so, wie die <i>iPads</i> sie sehen — und die Playback-Zuordnung prüfen. Kein Neustart nötig, der Hub liest es nach 15 s.</>,
            <>In der Konsole unter <b>Licht</b> die Szene „Standard“ wählen. Ändert sich das Licht in der Kabine, ist die Kette iPad → LAN → LPU-2 in Ordnung; die Karte zeigt das Ergebnis je Leuchte.</>,
            <>Der Hub setzt Szene 1 von selbst, sobald das erste echte iPad verbindet. Ein „Alle Sitze zurücksetzen“ fasst das Licht bewusst nicht an.</>,
          ]}
        />
        <H3>Konsole und Standbildschirm</H3>
        <Bullets
          items={[
            <>Diese Konsole: <C>console-cosimo.homannjohannes.de</C>, Passwort = <C>HOST_TOKEN</C> aus <C>.env.prod</C>. Höchstens <b>drei</b> Konsolen gleichzeitig; die vierte löst die älteste ab. Die zuletzt offene Ansicht bleibt in der Adresse (<C>#sessions</C>).</>,
            <>Fahrt-Ansicht für den Standbildschirm: <C>journey-cosimo.homannjohannes.de</C>. Sie hört nur mit und zählt nicht als Sitz.</>,
            <>Sitz-Emulator für Tests ohne iPad: <C>seat-cosimo.homannjohannes.de</C>. Er ist für den Hub ein echter Sitz und taucht in Sessions auf — nach dem Test zurücksetzen.</>,
            <>Backup-Uplink: einen 5G-Router bereithalten. Die Messe-WLANs sind der häufigste Ausfallgrund; die iPads brauchen nur den Weg zum Hub.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Morgenroutine ─────────────────────────── */}
      <Section id="morgen" title="Morgenroutine" lead="Zehn Minuten vor Öffnung, einmal durch die Übersicht — von oben nach unten.">
        <LiveChecklist c={c} f={f} />
        <Steps
          items={[
            <><b>Verbindungen</b>: alle vier Sitze mit Sitznummer, Status „ok“, Transport <i>websocket</i>. Kein „polling“, kein „antwortet nicht“. „Jetzt prüfen“ misst sofort.</>,
            <><b>Services</b>: alle sechs Zeilen ok — auch die Befragung, deren Ausfall sonst niemand bemerkt.</>,
            <><b>LLM</b>: healthy, kein „Fallback aktiv“. „Testen“ drücken — eine Antwort unter drei Sekunden ist normal.</>,
            <><b>Sprechen (TTS)</b>: Pfad „ElevenLabs (Server)“. Eine Stimme antippen und anhören.</>,
            <><b>Hören (STT)</b>: Pfad „Deepgram (Server)“. „Testen“ schickt einen gesprochenen Satz durch die Erkennung.</>,
            <><b>CMS</b>: erreichbar, Konfig „aus dem CMS“, LPU-2 mit Adresse und gemappten Playbacks.</>,
            <><b>Licht</b>: Szene „Standard“ setzen und in die Kabine schauen.</>,
            <><b>Fahrt</b>: läuft, keine Störung, nicht pausiert. Fahrt-Ansicht auf dem Standbildschirm öffnen.</>,
            <><b>Sessions → Betrieb</b>: „Alle Sitze zurücksetzen“. Demo-/Offline-Modus <b>aus</b>.</>,
            <><b>Probelauf</b> an einem Sitz: Taste halten, „Wo sind wir gerade?“ — Antwort mit Ort und nächstem Halt. Dann „Mach das Licht gemütlich“ — das Licht wechselt.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Fehlersuche ─────────────────────────── */}
      <Section id="fehlersuche" title="Fehlersuche" lead="Symptom, dann prüfen, dann beheben. Was gerade zutrifft, ist rot markiert — die Liste oben ist der aktuelle Befund.">
        <Findings f={f} />

        <H3>Verbindung</H3>
        <Symptom
          id="s-ipad-fehlt"
          title="Ein iPad fehlt in den Verbindungen"
          live={has(f, "no-kiosks", "device-lost")}
          check={<>Läuft die App im Vordergrund? Ist das iPad im WLAN? Steht im Kreis „Verbindung wird hergestellt …“? Einrichtung (Schlitz 3 s) → stimmt die Server-Adresse?</>}
          fix={<>WLAN neu verbinden oder App neu starten. Die App verbindet von selbst wieder; die Session bleibt zehn Minuten geparkt und läuft dann weiter. Steckt ein Ethernet-Kabel: Router-Feld der Ethernet-Einstellung leeren (siehe Einrichten).</>}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-stale"
          title="Ein Gerät steht auf „antwortet nicht“, hat aber gerade noch etwas getan"
          live={has(f, "device-stale")}
          check={<>Der Socket ist offen, aber zwei Pings blieben unbeantwortet. Bei einem iPad meist eine alte App-Version; bei einer Konsole ein eingefrorener Tab.</>}
          fix={<>App auf dem iPad beenden und neu starten; ist es nach jedem Start wieder „antwortet nicht“, braucht das iPad einen neuen App-Build. Browser-Tab neu laden.</>}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-polling"
          title="Ein Gerät zeigt „polling“"
          live={has(f, "device-polling")}
          check={<>Der WebSocket kam nicht zustande, Socket.IO fällt auf HTTP-Polling zurück. Es funktioniert, aber träge und mit mehr Aussetzern. Typisch für Gäste-WLANs mit Proxy.</>}
          fix={<>Anderes Netz (5G-Router). Auf dem VPS prüfen, dass der Cloudflare-Tunnel für den ws-Host WebSockets erlaubt.</>}
          go={[toUebersicht]}
        />

        <H3>Hören und Sprechen</H3>
        <Symptom
          id="s-hoert-nicht"
          title="CoSiMo hört nichts — beim Halten der Taste erscheint keine Welle"
          check={<>Ist der ESP32 gekoppelt (Bluetooth-Einstellungen)? Hat die App die Mikrofon-Berechtigung? Test ohne Hardware: eine Bluetooth-Tastatur anschließen und <Kbd>s</Kbd> halten.</>}
          fix={<>ESP32 aus- und einschalten, neu koppeln. Mikrofon: iPad-Einstellungen → CoSiMo Kiosk → Mikrofon an. Erscheint die Welle, aber keine Antwort: nächster Punkt.</>}
        />
        <Symptom
          id="s-leer"
          title="Welle da, aber CoSiMo reagiert nicht oder sagt „nicht verstanden“"
          live={has(f, "no-server-stt")}
          check={<>Logs → letzter <C>stt.result</C>: 0 Zeichen heißt, die Aufnahme war leer oder zu leise. Übersicht → Hören: steht der Pfad auf „Deepgram (Server)“? Wenn nicht, diktiert das iPad lokal — dann muss Deutsch als Offline-Diktiersprache geladen sein.</>}
          fix={<>Näher ans Mikrofon, die Taste erst nach dem letzten Wort loslassen (die App nimmt 0,3 s nach). Fehlt Server-STT: <C>DEEPGRAM_API_KEY</C> in <C>.env.prod</C>, Hub neu starten. Test: „Testen“ auf der Hören-Karte.</>}
          go={[toUebersicht, toLogs]}
        />
        <Symptom
          id="s-stimme"
          title="Keine Stimme, oder die falsche (Systemstimme)"
          live={has(f, "no-server-tts")}
          check={<>Übersicht → Sprechen: Pfad „ElevenLabs (Server)“? Wenn „Systemstimme auf dem iPad“: der Hub hat keinen ElevenLabs-Schlüssel oder die Route ist kaputt. Lautstärke im Schlitzmenü und am iPad prüfen (Seitentasten).</>}
          fix={<><C>ELEVENLABS_API_KEY</C> und <C>ELEVENLABS_VOICE_ID</C> in <C>.env.prod</C>; <b>nie</b> eine Zeile wie <C>ELEVENLABS_MODEL=</C> leer lassen (leer überschreibt den Default und ergibt 400). Test: eine Stimme auf der Sprechen-Karte anhören. Auf dem Sitz: Schlitzmenü → Lautstärke.</>}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-abbruch"
          title="CoSiMo bricht mitten im Satz ab"
          check={<>Das ist meist gewollt: ein Druck auf die Sprechtaste unterbricht (Barge-in), ebenso eine Karte oder ein Tipp im Menü. Logs → <C>turn.end</C> mit <C>interrupted</C>.</>}
          fix={<>Der Besucher kann ↻ im Schlitz tippen (acht Sekunden nach der Antwort) oder „Sag das nochmal“ sagen. Bricht es ohne Eingabe ab: Netz prüfen (polling?).</>}
          go={[toLogs]}
        />

        <H3>Das Gehirn</H3>
        <Symptom
          id="s-canned"
          title="Antworten sind vorgefertigt / die LLM-Karte ist rot"
          live={has(f, "llm-down", "network-down")}
          check={<>Übersicht → System-Karte oder Logs (Filter „System“): der letzte <C>service.status</C> sagt, ob das <i>Netz</i> oder das <i>Gehirn</i> weg ist und ob der Fallback greift. Demo-/Offline-Modus unter Sessions → Betrieb versehentlich an?</>}
          fix={
            <>
              Netz weg: Uplink des VPS, bzw. am Stand nichts zu tun. Gehirn weg: auf dem VPS
              <Code className="my-1.5">docker compose exec realtime wget -qO- http://GX10-IP:8007/health</Code>
              Kommt „ok“, springt der Hub binnen 15 s zurück. Kommt nichts: Tailscale-Sidecar (<C>docker compose logs tailscale</C>) und auf dem GX10 <C>~/cosimo-ai/check.log</C>. Übergangsweise im CMS → LLM einen Fallback eintragen (Anthropic).
            </>
          }
          go={[toUebersicht, toLogs]}
        />
        <Symptom
          id="s-fallback"
          title="„Fallback aktiv“ auf der LLM-Karte"
          live={has(f, "llm-fallback")}
          check={<>Das primäre Modell antwortet nicht, der Fallback (Claude) übernimmt. Die Demo läuft normal, nur Latenz und Kosten sind andere. <C>turn.start</C> zeigt „(fallback)“.</>}
          fix={<>Nichts Dringendes. Der Hub prüft das primäre Modell alle 15 s und wechselt von selbst zurück. Bleibt es länger: wie beim Punkt darüber.</>}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-demo-an"
          title="Demo-/Offline-Modus ist an"
          live={has(f, "offline-canned")}
          check={<>Sessions → Betrieb → Häkchen „Demo- / Offline-Modus“. Der Hub schaltet ihn auch selbst an, wenn Netz oder Gehirn fehlen — dann ist das Häkchen aus und trotzdem alles vorgefertigt.</>}
          fix={<>Häkchen entfernen. Ist es schon aus: Netz und Gehirn (oben).</>}
          go={[toSessions]}
        />
        <Symptom
          id="s-kein-tool"
          title="CoSiMo sagt „Das Licht ist jetzt an“ — aber nichts passiert"
          check={<>Logs → der <C>turn.end</C> dieser Antwort: „0 Tools“ heißt, das Modell hat nur geredet statt das Werkzeug zu rufen. Anders als ein Licht-Fehler: dann stünde <C>cabin.result</C> mit Fehler darunter.</>}
          fix={<>Nochmal bitten, meist klappt es. Häuft es sich: CMS → LLM → <b>Tool-Zwang</b> einschalten (klare Licht-/Merk-Sätze erzwingen dann das Werkzeug). Prüfen, dass der Kern-Prompt im CMS aktuell ist (LLM-Karte → „System-Prompt“ nennt <C>set_light</C>).</>}
          go={[toLogs]}
        />
        <Symptom
          id="s-langsam"
          title="Antworten dauern lange (über fünf Sekunden)"
          check={<>Logs → <C>turn.end</C> zeigt die Zeiten stt / llm / tts. Ist llm hoch: Fallback aktiv? Thinking im CMS an? Ist stt hoch: Netz. Ist tts hoch: ElevenLabs-Route.</>}
          fix={<>CMS → LLM → Generierung: „Thinking“ aus, Max-Tokens nicht über 1024. Bei Netzproblemen 5G-Router.</>}
          go={[toLogs]}
        />
        <Symptom
          id="s-haengt"
          title="Ein Sitz hängt — das Gesicht denkt endlos"
          check={<>Sessions: die Karte des Sitzes zeigt die Phase. Logs für den Sitz: gibt es einen <C>turn.start</C> ohne <C>turn.end</C>?</>}
          fix={<>Sessions → Betrieb → „Hängende Unterhaltung lösen“. Hilft das nicht: den Sitz zurücksetzen (↺ auf der Karte oder in den Verbindungen). Der Besucher bekommt eine frische Session.</>}
          go={[toSessions]}
        />

        <H3>Licht</H3>
        <Symptom
          id="s-licht"
          title="Das Licht reagiert nicht"
          live={has(f, "lpu2-unconfigured", "lpu2-unmapped", "light-unconfirmed")}
          check={<>Die Kette: CMS → Kabine (Adresse, Playbacks) → ein echtes iPad mit Ethernet → LPU-2. Logs: <C>cabin.actuate</C> zeigt die URLs, <C>cabin.result</C> das Ergebnis des iPads mit Fehlertext. Übersicht → CMS: „LPU-2 … gemappt“. Ist kein echtes iPad verbunden, feuert der Emulator — der loggt nur, schaltet nichts.</>}
          fix={<>Adresse im CMS gegen die IP am Controller prüfen. Am iPad: Ethernet gesteckt, IP im richtigen Netz, Router-Feld leer; Einrichtung → Licht → „LPU-2 testen“. LPU-2 stromlos machen und wieder ein. Läuft die Standalone-Szene weiter, kann die Demo ohne Lichtwechsel stattfinden.</>}
          go={[toLicht, toLogs]}
        />
        <Symptom
          id="s-falsche-leuchte"
          title="Es schaltet die falsche Leuchte, oder die Leselampe des falschen Sitzes"
          check={<>Zuordnung Playback → Leuchte im CMS → Kabine. Leselampen hängen an der Sitznummer des iPads (Einrichtung → Sitzplatz).</>}
          fix={<>Im CMS die Playback-Nummer korrigieren (wirkt nach 15 s). Sitznummer am iPad richtig setzen.</>}
          go={[toLicht]}
        />
        <Symptom
          id="s-frei"
          title="Die Szene steht auf „frei“"
          live={has(f, "light-free")}
          check={<>Jemand hat auf der Licht-Seite eine einzelne Leuchte bewegt. Das ist kein Fehler, nur kein gespeicherter Zustand.</>}
          fix={<>Licht → eine Szene wählen (verwirft die Änderung) oder „Szene speichern“ (macht sie zum neuen Stand der Szene im CMS).</>}
          go={[toLicht]}
        />

        <H3>Karten und Profile</H3>
        <Symptom
          id="s-karte"
          title="„Diese Karte kenne ich leider nicht“"
          check={<>Logs → <C>nfc.scan</C> zeigt die gelesene Chip-ID. Steht genau diese ID im CMS beim Profil (Groß-/Kleinschreibung zählt)?</>}
          fix={<>ID im CMS beim Profil eintragen, 15 s warten, erneut auflegen. Ohne Leser simulieren: mit Tastatur <Kbd>[</Kbd> ID <Kbd>⏎</Kbd> in die App tippen, oder im Emulator die Karten-Schaltflächen.</>}
          go={[toLogs]}
        />
        <Symptom
          id="s-profil"
          title="Der Sitz hat das falsche Profil oder begrüßt falsch"
          check={<>Sessions → Karte des Sitzes zeigt das Profil und die Sprache. Der Inspektor (🔍) zeigt den genauen Prompt.</>}
          fix={<>Persona auf der Karte umstellen (das ist der Ersatz für eine Karte) oder den Sitz zurücksetzen — er startet mit dem Standardprofil.</>}
          go={[toSessions]}
        />
        <Symptom
          id="s-merken"
          title="„Merk dir …“ funktioniert nicht"
          check={<>Merken gibt es nur für Karten-Fahrgäste mit gespeicherter Einwilligung. Ein Sitz ohne Karte ist anonym — CoSiMo sagt das auch so.</>}
          fix={<>Karte auflegen (Alex, Noa, Luca, Sam haben Einwilligung). Bleibt es aus: CMS erreichbar? Ohne CMS kann nichts geschrieben werden.</>}
          go={[toSessions]}
        />

        <H3>Fahrt</H3>
        <Symptom
          id="s-fahrt"
          title="Die Fahrt steht, oder eine Störung bleibt"
          live={has(f, "sim-paused", "fault-active")}
          check={<>Übersicht → Fahrt: „pausiert“ oder eine Störung mit Restzeit. Störungen kommen nur von der Konsole und enden von selbst.</>}
          fix={<>„Fahrt fortsetzen“ bzw. „Störung beenden“. Ist die Route falsch: CMS → Route; eine Änderung startet die Fahrt am ersten Halt neu.</>}
          go={[toUebersicht]}
        />

        <H3>Konsole und Server</H3>
        <Symptom
          id="s-passwort"
          title="„Der Hub hat das Passwort abgelehnt“"
          check={<>Das Passwort der Seite stimmt, aber der Hub kennt ein anderes: <C>HOST_TOKEN</C> in <C>.env.prod</C> weicht vom Hash im Konsolen-Build ab.</>}
          fix={<><C>HOST_TOKEN</C> auf das Konsolen-Passwort setzen und den Hub neu starten — oder das Passwort in <C>Lock.tsx</C> ändern und die Konsole neu bauen.</>}
        />
        <Symptom
          id="s-ersetzt"
          title="„Konsole ersetzt“ oder „Konsole neu laden“"
          check={<>Ersetzt: es waren mehr als drei Konsolen offen, die älteste musste weichen. Neu laden: jemand hat „Alles zurücksetzen“ gedrückt.</>}
          fix={<>Neu laden. Vergessene Tabs auf anderen Geräten schließen.</>}
        />
        <Symptom
          id="s-hub"
          title="Die Konsole zeigt „warte auf Status“ oder nichts Aktuelles"
          live={has(f, "hub-down", "service-down")}
          check={<>Der Hub ist nicht erreichbar. Öffnet <C>https://ws-cosimo.homannjohannes.de/health</C> im Browser? Übersicht → Services (wenn noch sichtbar).</>}
          fix={
            <>
              Services-Karte → Neustart-Knopf der Zeile, wenn vorhanden. Sonst auf dem VPS im Repo-Verzeichnis:
              <Code className="my-1.5">{"ssh vps\ndocker compose logs --tail 100 realtime\n./start.sh realtime      # baut und startet nur diesen Service"}</Code>
              Immer <C>./start.sh</C>, nie ein nacktes <C>docker compose up</C> — das startet die Dev-Konfiguration und Cloudflare zeigt „Bad Gateway“.
            </>
          }
          go={[toUebersicht]}
        />
        <Symptom
          id="s-defaults"
          title="CMS-Karte: Konfig „env-Defaults“ oder 0 Profile"
          live={has(f, "cms-down", "config-defaults")}
          check={<>Der Hub konnte das CMS noch nie oder gerade nicht lesen. Öffnet <C>cms-cosimo.homannjohannes.de/admin</C>? <C>docker compose logs cms</C>: Fehler beim Lesen eines Globals deuten auf eine fehlende Migration nach einem Schema-Update.</>}
          fix={<>CMS-Container neu starten (Services-Karte oder <C>./start.sh cms</C>). Die Demo läuft derweil mit dem eingebauten Standardprofil und der eingebauten Route weiter — nur Karten und Merken fehlen.</>}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-deploy"
          title="Nach einem Deploy sieht die Konsole alt aus"
          check={<>Statische Bundles werden gecacht; der Hub läuft schon neu, die Seite nicht.</>}
          fix={<>Konsole hart neu laden. Die iPad-App braucht nur bei Protokolländerungen einen neuen Build — dann steht es im Commit.</>}
        />
      </Section>

      {/* ─────────────────────────── Logs lesen ─────────────────────────── */}
      <Section id="logs" title="Logs lesen" lead="Jeder Schritt eines Turns ist ein Ereignis. Die Turn-Nummer eines Sitzes verbindet sie; ein Haarstrich trennt einen Turn vom nächsten.">
        <P>So liest sich ein Sprach-Turn, der das Licht schaltet — von oben nach unten, wie die Logs-Ansicht ihn zeigt, wenn man „älteste zuerst“ denkt:</P>
        <Code>{`stt.result     42 Zeichen in 610 ms                       ← Deepgram hat gehört
turn.start     voice · de · openai-compatible/qwen · „Mach das Licht gemütlich“
llm.step       Schritt 0: 0 Zeichen, Tools set_light · 820 ms  ← das Modell ruft das Werkzeug
cabin.actuate  scene gemuetlich → http://…/ajax/pb12/go …      ← der Hub baut die URLs
tool.call      set_light({"scene":"gemuetlich"}) → ok · 3 ms
cabin.result   ok                                              ← das iPad meldet zurück
llm.step       Schritt 1: 24 Zeichen, keine Tools · 640 ms      ← die gesprochene Antwort
tts.done       24 Zeichen → 31 kB in 380 ms
turn.end       ok · 2,5 s (stt 610, llm 1460, tts 380) · 1 Tool · happy · „Gern, das Licht steht jetzt auf Gemütlich.“`}</Code>
        <Bullets
          items={[
            <><b>Filter</b>: Sitz, Session, Mindest-Level, Freitext, Ereignisarten hinter dem Regler-Symbol („nur Turns“ als Vorgabe). Die Log-Schaltfläche in den Verbindungen und auf Session-Karten springt vorgefiltert hierher.</>,
            <><b>Levels</b>: <i>warn</i> = ein fehlgeschlagenes Werkzeug, eine unbekannte Karte, leere Erkennung. <i>error</i> = ein Turn ist abgebrochen; die Zahl steht rot im Menü.</>,
            <><b>System-Ereignisse</b> ohne Sitz: <C>service.boot</C> (der Hub kam hoch), <C>config.loaded</C> (Konfiguration geladen, mit dem, was sich geändert hat), <C>service.status</C> (LLM/CMS/Netz gekippt), <C>fault.start/end</C>.</>,
            <><b>Export</b>: die aktuelle Auswahl als NDJSON. Auf dem VPS liegt dasselbe unter <C>./logs/cosimo-JJJJ-MM-TT.ndjson</C>. Nach der Messe mitnehmen.</>,
            <><b>Inspektor</b> (🔍 auf einer Session-Karte): der exakte System-Prompt des Sitzes und jeder Turn mit Werkzeugen, Ergebnissen und Zeiten.</>,
          ]}
        />
      </Section>

      {/* ─────────────────────────── Begriffe ─────────────────────────── */}
      <Section id="begriffe" title="Begriffe">
        <dl className="m-0 flex max-w-[76ch] flex-col">
          <Term name="Hub">Der Realtime-Dienst auf dem VPS. Alles Live läuft durch ihn.</Term>
          <Term name="Sitz">Ein iPad (oder der Emulator) mit der Kiosk-Rolle. Hat genau eine Session.</Term>
          <Term name="Session">Ein Gespräch von der ersten Eingabe bis zum Zurücksetzen oder Kartenwechsel. Wird, mit Einwilligung, ins CMS geschrieben — das Forschungsdatenset.</Term>
          <Term name="Turn">Eine Eingabe des Fahrgastes und CoSiMos Antwort darauf, inklusive Werkzeugen. Hat eine Nummer je Sitz.</Term>
          <Term name="Profil">Wer der Fahrgast ist: Name, Sprache, Darstellung (Farbe, Textgröße, Text an/aus, Stimme), Interaktionsstil, Merkzettel. Im CMS „Personas“. „Standard“ ist das leere Profil für Sitze ohne Karte.</Term>
          <Term name="Karte">Ein NFC-Chip, dessen ID im CMS bei einem Profil steht. Auflegen wechselt das Profil des Sitzes und begrüßt.</Term>
          <Term name="Werkzeug">Was das Modell tun kann: Fahrtdaten holen, Licht schalten, Darstellung ändern, Merken/Vergessen, Menü öffnen, Ja/Nein fragen, Gesicht färben. Nur ein Werkzeugaufruf ändert etwas — Worte allein nie.</Term>
          <Term name="Szene">Ein gespeicherter Lichtzustand aller Leuchten: Standard, Gemütlich, Hell, Aus. „Frei“ = jemand hat eine Leuchte einzeln bewegt.</Term>
          <Term name="LPU-2">Der DMX-Lichtcontroller (Cuety) im abgeschotteten Kabinen-LAN. Nur die iPads erreichen ihn.</Term>
          <Term name="Vorgefertigt">Der Skript-Modus ohne Sprachmodell („canned“): kennt Fahrtdaten und Licht, sonst nichts. Kommt bei Netz- oder Gehirnausfall oder per Schalter.</Term>
          <Term name="Fallback">Das zweite Sprachmodell (Claude), das einspringt, wenn das primäre auf dem GX10 nicht erreichbar ist.</Term>
          <Term name="Tailnet">Das private Tailscale-Netz zwischen dem Hub-Container und dem GX10. Nur diese beiden sind drin.</Term>
          <Term name="Schaustellung">Ein Sitz, der stumm vor sich hin spielt, weil ihn kein Besucher erreicht. Einstellung am iPad.</Term>
          <Term name="Barge-in">Die Sprechtaste unterbricht CoSiMo sofort. Ein laufender Werkzeugaufruf wird nie halb abgebrochen.</Term>
        </dl>
      </Section>
    </div>
  );
}

/** The findings block at the top of Fehlersuche — or the green all-clear. */
function Findings({ f }: { f: ReturnType<typeof diagnose> }) {
  if (f.length === 0) {
    return (
      <Card className="flex-row items-center gap-3 border-ok">
        <CircleCheck size={20} className="shrink-0 text-ok" />
        <span className="text-base"><b>Kein Befund.</b> Alles, was die Konsole sehen kann, ist in Ordnung.</span>
      </Card>
    );
  }
  return (
    <Card className={cn("gap-2", f.some((x) => x.severity === "down") ? "border-accent" : "border-warn")}>
      <div className="flex items-center gap-2 text-base">
        <CircleAlert size={18} className={f.some((x) => x.severity === "down") ? "text-accent" : "text-warn"} />
        <b>Aktueller Befund</b> <span className="text-mute">· {f.length}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {f.map((x) => (
          <li key={x.id} className="flex gap-2 text-base leading-snug">
            <Dot state={x.severity === "down" ? "down" : "warn"} className="mt-[7px]" />
            <span><b>{x.title}</b> <span className="text-mute">— {x.detail}</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The morning checklist as live chips: what the console can verify on its own. */
function LiveChecklist({ c, f }: { c: CosimoState; f: ReturnType<typeof diagnose> }) {
  const st = c.status;
  const kiosks = c.devices.filter((d) => d.role === "kiosk" && d.health !== "lost");
  const items: { label: string; ok: boolean | null }[] = [
    { label: `${kiosks.length} Sitz${kiosks.length === 1 ? "" : "e"} verbunden`, ok: kiosks.length >= 1 ? (kiosks.length >= 4 ? true : null) : false },
    { label: "Gehirn", ok: st ? st.llm && !has(f, "llm-fallback") : null },
    { label: "Server-TTS", ok: st ? st.serverTts : null },
    { label: "Server-STT", ok: st ? st.serverStt : null },
    { label: "CMS", ok: st ? st.cms && !has(f, "config-defaults") : null },
    { label: "Licht", ok: st && c.hostConfig ? !has(f, "lpu2-unconfigured", "lpu2-unmapped", "light-unconfirmed") : null },
    { label: "Fahrt läuft", ok: c.telemetry ? !has(f, "sim-paused", "fault-active") : null },
    { label: "Demo-Modus aus", ok: st ? !st.offlineCanned : null },
  ];
  return (
    <div className="print-hide flex flex-wrap gap-2">
      {items.map((i) => (
        <Chip key={i.label} size="sm" className={cn(i.ok === true ? "text-ok" : i.ok === false ? "text-accent" : "text-warn")}>
          <Dot size="sm" state={i.ok === true ? "ok" : i.ok === false ? "down" : "warn"} /> {i.label}
        </Chip>
      ))}
    </div>
  );
}
