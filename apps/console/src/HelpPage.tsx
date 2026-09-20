import { useMemo } from "react";
import { CircleAlert, CircleCheck, Printer } from "lucide-react";
import type { CosimoState } from "@cosimo/client";
import { Button, Card, Chip, Dot, cn } from "@cosimo/ui";
import { Bullets, C, Code, H3, Kbd, Note, P, Section, Steps, SubNav, Symptom, Table, Term } from "./doc";
import { LangToggle, picker, useDocLang, type DocLang } from "./docLang";
import { diagnose, has } from "./diagnose";
import { CardIcon, InfoIcon, LightIcon, PanelKey, TalkIcon } from "./PanelIcons";
import SystemDiagram from "./SystemDiagram";
import type { Tab } from "./tabs";

/**
 * The Hilfe view — the technical page for the booth staff, German or
 * English on the page: how the system is built, how a stand is set up, the
 * morning routine, and a troubleshooting list that reads the hub's live
 * state (`diagnose`) so the entry that applies right now says so. Written
 * for someone who did not build CoSiMo but has to keep it running for a day.
 */

export default function HelpPage({ c, go, showLogsFor }: { c: CosimoState; go: (t: Tab) => void; showLogsFor: (deviceId: string) => void }) {
  const [lang, setLang] = useDocLang();
  const t = picker(lang);
  const f = useMemo(() => diagnose(c), [c.status, c.hostConfig, c.devices, c.telemetry, c.light, c.services, c.logs.length, c.connected]);
  void showLogsFor;
  const toUebersicht = { label: t("Übersicht", "Overview"), onClick: () => go("uebersicht") };
  const toLicht = { label: t("Licht", "Light"), onClick: () => go("licht") };
  const toSessions = { label: "Sessions", onClick: () => go("sessions") };
  const toLogs = { label: "Logs", onClick: () => go("logs") };

  const NAV = [
    { id: "aufbau", label: t("Aufbau", "Structure") },
    { id: "einrichten", label: t("Einrichten", "Set-up") },
    { id: "morgen", label: t("Morgenroutine", "Morning routine") },
    { id: "fehlersuche", label: t("Fehlersuche", "Troubleshooting") },
    { id: "logs", label: t("Logs lesen", "Reading the logs") },
    { id: "begriffe", label: t("Begriffe", "Glossary") },
  ];

  return (
    <div className="doc-print flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-4xl font-black">{t("Hilfe", "Help")}</h1>
          <p className="m-0 max-w-[68ch] text-base text-mute">
            {t(
              "Wie CoSiMo gebaut ist, wie der Stand eingerichtet wird und was zu tun ist, wenn etwas nicht geht. Die Fehlersuche liest den Zustand des Hubs mit — was gerade zutrifft, ist markiert.",
              "How CoSiMo is built, how the stand is set up and what to do when something fails. The troubleshooting list reads the hub's state — whatever applies right now is marked.",
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

      <Note className="print-hide flex flex-wrap items-center justify-between gap-3">
        <span>
          <b>{t("Du begleitest Besucher?", "Accompanying visitors?")}</b>{" "}
          {t("Dann ist die Seite „Begleiten“ die richtige: der Ablauf, die Karten, Sätze, die immer funktionieren. Diese Seite hier ist für die Technik.", "Then “Begleiten” is the page you want: the flow, the cards, sentences that always work. This page is for the technicians.")}
        </span>
        <Button size="sm" variant="secondary" onClick={() => go("begleiten")}>{t("Begleiten öffnen", "Open Begleiten")}</Button>
      </Note>

      {/* ─────────────────────────── Aufbau ─────────────────────────── */}
      <Section id="aufbau" title={t("Aufbau", "Structure")} lead={t("Vier Sitze, ein Hub, ein CMS, ein paar Dienste im Internet — und ein Lichtcontroller, den nur die iPads erreichen.", "Four seats, one hub, one CMS, a few internet services — and a light controller only the iPads can reach.")}>
        <SystemDiagram />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="gap-2">
            <H3 className="mt-0">{t("Die Sitze", "The seats")}</H3>
            <P>{t(
              <>Vier iPad minis, je hinter einem Panel mit zwei Ausschnitten: dem <b>Kreis</b> für das Gesicht und dem <b>Schlitz</b> für Fahrtinfos, Untertitel, Ja/Nein-Karte und das Einstellungsmenü. Alles außerhalb bleibt schwarz. Neben dem Panel sitzen die physischen Tasten (ein ESP32, der sich als Bluetooth-Tastatur koppelt) und der Kartenleser.</>,
              <>Four iPad minis, each behind a panel with two cut-outs: the <b>circle</b> for the face and the <b>slit</b> for journey info, subtitles, the yes/no card and the settings menu. Everything outside stays black. Beside the panel sit the physical buttons (an ESP32 that pairs as a Bluetooth keyboard) and the card reader.</>,
            )}</P>
            <div className="flex flex-wrap gap-3">
              <PanelKey icon={<TalkIcon />}>{t("Sprechen", "Talk")}</PanelKey>
              <PanelKey icon={<InfoIcon />}>{t("Info", "Info")}</PanelKey>
              <PanelKey icon={<LightIcon />}>{t("Licht", "Light")}</PanelKey>
              <PanelKey icon={<CardIcon />}>{t("Karte", "Card")}</PanelKey>
            </div>
            <P>{t(
              "Die App ist bewusst dumm: sie schickt Audio, Tastendrücke und Chip-IDs roh zum Hub und zeigt, was zurückkommt. Nur eines tut sie selbst: sie feuert die Licht-URLs ins Kabinen-LAN, weil sie das einzige Gerät ist, das dort hängt.",
              "The app is deliberately dumb: it sends audio, button presses and chip ids raw to the hub and shows what comes back. It does one thing itself: it fires the light URLs into the cabin LAN, because it is the only device on it.",
            )}</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">{t("Der Hub", "The hub")}</H3>
            <P>{t(
              <>Ein Node-Prozess auf dem VPS (<C>apps/realtime</C>, Host <C>ws-cosimo</C>). Er hält jede Verbindung, führt den Agenten (Sprachmodell mit Werkzeugen), simuliert die Fahrt, kennt die Lichtszenen und schreibt das Log. Alles, was <i>gerade</i> passiert, passiert hier.</>,
              <>A Node process on the VPS (<C>apps/realtime</C>, host <C>ws-cosimo</C>). It holds every connection, runs the agent (language model with tools), simulates the journey, knows the light scenes and writes the log. Everything that happens <i>right now</i> happens here.</>,
            )}</P>
            <P>{t(
              <>Er unterscheidet <b>global</b> (die Fahrt: Ort, Tempo, Halte, Störung — an alle) und <b>pro Sitz</b> (das Gespräch, das Profil, das Gesicht — nur an das eine iPad). Sitze hören einander nie.</>,
              <>It separates <b>global</b> (the journey: place, speed, stops, fault — to everyone) from <b>per seat</b> (the conversation, the profile, the face — to that one iPad only). Seats never hear each other.</>,
            )}</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">{t("Das CMS", "The CMS")}</H3>
            <P>{t(
              <>Payload auf Postgres (<C>cms-cosimo</C>, Login unter <C>/admin</C>). Hält die Profile mit ihren Chip-IDs, die Route der Simulation, das Wissen über MonoCab und CoSiMo, die aufgezeichneten Sessions, die Fragebogen-Antworten und fünf Konfigurations-Globals: Agent (Kern-Prompt), LLM (Modell, Route, Fallback), Sprache (STT/TTS-Routen), Stimmen (Katalog) und Kabine (LPU-2-Adresse, Playbacks, Szenen).</>,
              <>Payload on Postgres (<C>cms-cosimo</C>, login at <C>/admin</C>). Holds the profiles with their chip ids, the simulation route, the facts about MonoCab and CoSiMo, the recorded sessions, the questionnaire responses and five config globals: Agent (core prompt), LLM (model, route, fallback), Speech (STT/TTS routes), Voices (catalogue) and Cabin (LPU-2 address, playbacks, scenes).</>,
            )}</P>
            <P>{t(
              <>Es ist <b>nie im Live-Pfad</b>: der Hub liest es alle 15 s und fährt mit dem letzten Stand oder eingebauten Defaults weiter, wenn es weg ist. API-Schlüssel stehen nie im CMS, nur in der Umgebung des Hubs.</>,
              <>It is <b>never in the live path</b>: the hub reads it every 15 s and carries on with the last copy or built-in defaults when it is gone. API keys never live in the CMS, only in the hub's environment.</>,
            )}</P>
          </Card>
          <Card className="gap-2">
            <H3 className="mt-0">{t("Die Dienste", "The services")}</H3>
            <P>{t(
              <><b>Deepgram</b> hört (Server-STT), <b>ElevenLabs</b> spricht (Server-TTS, satzweise gestreamt). Das <b>Gehirn</b> ist ein Qwen-Modell auf dem GX10, das der Hub über Tailscale erreicht; fällt es aus, springt automatisch der <b>Fallback</b> ein (Claude), wenn einer konfiguriert ist. Fällt beides aus oder das Internet, antwortet CoSiMo <b>vorgefertigt</b> — aus Skripten, die die Fahrtdaten kennen und das Licht schalten können.</>,
              <><b>Deepgram</b> listens (server STT), <b>ElevenLabs</b> speaks (server TTS, streamed sentence by sentence). The <b>brain</b> is a Qwen model on the GX10 that the hub reaches over Tailscale; if it fails, the <b>fallback</b> (Claude) takes over automatically, if one is configured. If both fail, or the internet, CoSiMo answers <b>canned</b> — from scripts that know the journey data and can switch the light.</>,
            )}</P>
          </Card>
        </div>
        <H3>{t("Wer wo erreichbar ist", "Who is reachable where")}</H3>
        <Table
          head={[t("Was", "What"), t("Öffentlich (Cloudflare)", "Public (Cloudflare)"), t("Im Container", "In the container"), t("Lokal (Dev)", "Local (dev)")]}
          rows={[
            [t("Hub / WebSocket", "Hub / WebSocket"), "ws-cosimo.homannjohannes.de", "127.0.0.1:6221", ":6101"],
            [t("CMS (Admin + API)", "CMS (admin + API)"), "cms-cosimo.homannjohannes.de", "127.0.0.1:6220", ":6100"],
            [t("Diese Konsole", "This console"), "console-cosimo.homannjohannes.de", "127.0.0.1:6222", ":6102"],
            [t("Sitz-Emulator (Browser-iPad)", "Seat emulator (browser iPad)"), "seat-cosimo.homannjohannes.de", "127.0.0.1:6223", ":6103"],
            [t("Fahrt-Ansicht (Standbildschirm)", "Journey view (booth screen)"), "journey-cosimo.homannjohannes.de", "127.0.0.1:6224", ":6104"],
            [t("Befragung (QR-Code am Ausgang)", "Questionnaire (QR code at the exit)"), "form-cosimo.homannjohannes.de", "127.0.0.1:6225", ":6105"],
            [t("LPU-2 (Lichtcontroller)", "LPU-2 (light controller)"), t("— nur Kabinen-LAN", "— cabin LAN only"), t("Adresse im CMS → Kabine", "address in CMS → Cabin"), "—"],
          ]}
        />
        <H3>{t("Was ausfallen darf", "What may fail")}</H3>
        <Table
          head={[t("Fällt aus", "Fails"), t("Was passiert", "What happens"), t("Was der Besucher merkt", "What the visitor notices")]}
          rows={[
            ["CMS", t("Profile, Route, Konfig aus Cache/Defaults; Sessions werden nicht gespeichert; Merken geht nicht", "profiles, route, config from cache/defaults; sessions are not saved; remembering is off"), t("nichts", "nothing")],
            [t("Gehirn (GX10)", "Brain (GX10)"), t("Fallback-Modell übernimmt, sonst vorgefertigte Antworten", "fallback model takes over, else canned replies"), t("nichts, bzw. kürzere Antworten", "nothing, or shorter replies")],
            [t("Internet am Hub", "Internet at the hub"), t("vorgefertigte Antworten, Systemstimme statt ElevenLabs, Diktat auf dem iPad", "canned replies, system voice instead of ElevenLabs, dictation on the iPad"), t("einfachere Antworten, andere Stimme", "simpler replies, a different voice")],
            ["Deepgram", t("iPad diktiert selbst (Apple, offline Deutsch)", "the iPad dictates itself (Apple, offline German)"), t("etwas schlechtere Erkennung", "slightly worse recognition")],
            ["ElevenLabs", t("iPad spricht mit der Systemstimme", "the iPad speaks with the system voice"), t("andere Stimme", "a different voice")],
            [t("LPU-2 / Ethernet", "LPU-2 / Ethernet"), t("Licht bleibt in der Standalone-Szene; Zustand „degradiert“", "light stays in the standalone scene; state “degraded”"), t("Licht reagiert nicht", "the light does not react")],
            ["Hub", t("alles steht — die iPads zeigen „Verbindung wird hergestellt …“ und verbinden von selbst neu", "everything stops — the iPads show “connecting …” and reconnect on their own"), t("kein CoSiMo", "no CoSiMo")],
          ]}
        />
      </Section>

      {/* ─────────────────────────── Einrichten ─────────────────────────── */}
      <Section id="einrichten" title={t("Einrichten", "Set-up")} lead={t("Einmal beim Aufbau, je iPad ein paar Minuten. Alles davon steht im versteckten Einrichtungsbildschirm der App.", "Once at build-up, a few minutes per iPad. All of it lives in the app's hidden set-up screen.")}>
        <Note>{t(<>Einrichtung öffnen: <b>den Schlitz drei Sekunden gedrückt halten.</b> Bildschirmecken sind hinter dem Panel unerreichbar.</>, <>Open the set-up: <b>hold the slit for three seconds.</b> Screen corners are unreachable behind the panel.</>)}</Note>
        <H3>{t("Je iPad", "Per iPad")}</H3>
        <Steps
          items={[
            t(<>App „CoSiMo Kiosk“ starten. Beim ersten Start fragt sie nach dem Mikrofon und später nach dem lokalen Netzwerk — <b>beides erlauben</b>.</>, <>Start the “CoSiMo Kiosk” app. On first start it asks for the microphone and later for the local network — <b>allow both</b>.</>),
            t(<><b>Server-Adresse</b>: <C>https://ws-cosimo.homannjohannes.de</C> ist eingebaut. Nur ändern, wenn ein Entwickler-Hub gemeint ist.</>, <><b>Server address</b>: <C>https://ws-cosimo.homannjohannes.de</C> is built in. Change it only for a developer hub.</>),
            t(<><b>Sitzplatz</b> 1 bis 4 wählen (1 = vorn, 4 = hinten). Die Konsole zeigt die Nummer in der Verbindungsliste.</>, <>Pick the <b>seat</b> 1 to 4 (1 = front, 4 = rear). The console shows the number in the connections list.</>),
            t(<><b>Panel-Kalibrierung</b>: „Umrisse anzeigen“ an, die Werte für Kreis und Schlitz in Prozent anpassen, bis die Umrisse mit den Ausschnitten fluchten, speichern, Umrisse wieder aus.</>, <><b>Panel calibration</b>: switch on “show outlines”, adjust the circle and slit values in percent until the outlines line up with the cut-outs, save, outlines off again.</>),
            t(<><b>Schaustellung</b> nur auf Sitzen, die kein Besucher erreicht: das Gesicht spielt dann stumm und endlos, die Tasten sind aus. Nur dieser Schalter beendet es.</>, <><b>Showcase</b> only on seats no visitor can reach: the face then performs silently and endlessly, the buttons are off. Only this switch ends it.</>),
            t(<><b>Tasten koppeln</b>: iPad-Einstellungen → Bluetooth → <C>CoSiMo-Seat-n</C>. Test: Sprechtaste halten → im Schlitz erscheint die Welle. Info-Taste → CoSiMo stellt sich vor. Licht-Taste → nächste Szene.</>, <><b>Pair the buttons</b>: iPad Settings → Bluetooth → <C>CoSiMo-Seat-n</C>. Test: hold the talk button → the wave appears in the slit. Info button → CoSiMo introduces itself. Light button → next scene.</>),
            t(<><b>Kabinen-LAN</b>: USB-C-Ethernet-Adapter anschließen. Statische IP im Netz der LPU-2, <b>Router-Feld leer lassen</b> (keine Default-Route, sonst verliert das iPad den Hub). Test: Einrichtung → Licht (Standpersonal) → „LPU-2 testen“; das Ergebnis steht in der Konsole unter System-Logs.</>, <><b>Cabin LAN</b>: plug in the USB-C Ethernet adapter. Static IP in the LPU-2's network, <b>leave the router field empty</b> (no default route, or the iPad loses the hub). Test: set-up → Light (staff) → “LPU-2 testen”; the result is in the console under system logs.</>),
            t(<><b>Kiosk-Modus</b>: Geführter Zugriff an, automatische Sperre aus. Für den Diktat-Fallback: Einstellungen → Allgemein → Tastatur → Diktiersprachen → Deutsch offline laden.</>, <><b>Kiosk mode</b>: Guided Access on, auto-lock off. For the dictation fallback: Settings → General → Keyboard → Dictation languages → download German offline.</>),
          ]}
        />
        <H3>{t("Kabine und Licht", "Cabin and light")}</H3>
        <Steps
          items={[
            t(<>Im CMS unter <b>Kabine</b> die LPU-2-Adresse eintragen — so, wie die <i>iPads</i> sie sehen — und die Playback-Zuordnung prüfen. Kein Neustart nötig, der Hub liest es nach 15 s.</>, <>In the CMS under <b>Cabin</b> enter the LPU-2 address — as the <i>iPads</i> see it — and check the playback mapping. No restart needed, the hub reads it after 15 s.</>),
            t(<>In der Konsole unter <b>Licht</b> die Szene „Standard“ wählen. Ändert sich das Licht in der Kabine, ist die Kette iPad → LAN → LPU-2 in Ordnung; die Karte zeigt das Ergebnis je Leuchte.</>, <>In the console under <b>Licht</b> pick the “Standard” scene. If the cabin light changes, the chain iPad → LAN → LPU-2 is fine; the card shows the result per fixture.</>),
            t("Der Hub setzt Szene 1 von selbst, sobald das erste echte iPad verbindet. Ein „Alle Sitze zurücksetzen“ fasst das Licht bewusst nicht an.", "The hub applies scene 1 by itself once the first real iPad connects. “Alle Sitze zurücksetzen” deliberately leaves the light alone."),
          ]}
        />
        <H3>{t("Konsole und Standbildschirm", "Console and booth screen")}</H3>
        <Bullets
          items={[
            t(<>Diese Konsole: <C>console-cosimo.homannjohannes.de</C>, Passwort = <C>HOST_TOKEN</C> aus <C>.env.prod</C>. Höchstens <b>drei</b> Konsolen gleichzeitig; die vierte löst die älteste ab. Die zuletzt offene Ansicht bleibt in der Adresse (<C>#sessions</C>).</>, <>This console: <C>console-cosimo.homannjohannes.de</C>, password = <C>HOST_TOKEN</C> from <C>.env.prod</C>. At most <b>three</b> consoles at once; a fourth replaces the oldest. The last open view stays in the address (<C>#sessions</C>).</>),
            t(<>Fahrt-Ansicht für den Standbildschirm: <C>journey-cosimo.homannjohannes.de</C>. Sie hört nur mit und zählt nicht als Sitz.</>, <>Journey view for the booth screen: <C>journey-cosimo.homannjohannes.de</C>. It only listens and does not count as a seat.</>),
            t(<>Sitz-Emulator für Tests ohne iPad: <C>seat-cosimo.homannjohannes.de</C>. Er ist für den Hub ein echter Sitz und taucht in Sessions auf — nach dem Test zurücksetzen.</>, <>Seat emulator for tests without an iPad: <C>seat-cosimo.homannjohannes.de</C>. To the hub it is a real seat and shows up in Sessions — reset it after the test.</>),
            t("Backup-Uplink: einen 5G-Router bereithalten. Die Messe-WLANs sind der häufigste Ausfallgrund; die iPads brauchen nur den Weg zum Hub.", "Backup uplink: keep a 5G router ready. Venue Wi-Fi is the most common failure; the iPads only need the path to the hub."),
          ]}
        />
      </Section>

      {/* ─────────────────────────── Morgenroutine ─────────────────────────── */}
      <Section id="morgen" title={t("Morgenroutine", "Morning routine")} lead={t("Zehn Minuten vor Öffnung, einmal durch die Übersicht — von oben nach unten.", "Ten minutes before opening, once through the overview — top to bottom.")}>
        <LiveChecklist c={c} f={f} lang={lang} />
        <Steps
          items={[
            t(<><b>Verbindungen</b>: alle vier Sitze mit Sitznummer, Status „ok“, Transport <i>websocket</i>. Kein „polling“, kein „antwortet nicht“. „Jetzt prüfen“ misst sofort.</>, <><b>Verbindungen</b>: all four seats with seat number, status “ok”, transport <i>websocket</i>. No “polling”, no “antwortet nicht”. “Jetzt prüfen” measures at once.</>),
            t(<><b>Services</b>: alle sechs Zeilen ok — auch die Befragung, deren Ausfall sonst niemand bemerkt.</>, <><b>Services</b>: all six rows ok — including the questionnaire, whose outage nobody would notice otherwise.</>),
            t(<><b>LLM</b>: healthy, kein „Fallback aktiv“. „Testen“ drücken — eine Antwort unter drei Sekunden ist normal.</>, <><b>LLM</b>: healthy, no “Fallback aktiv”. Press “Testen” — a reply under three seconds is normal.</>),
            t(<><b>Sprechen (TTS)</b>: Pfad „ElevenLabs (Server)“. Eine Stimme antippen und anhören.</>, <><b>Sprechen (TTS)</b>: path “ElevenLabs (Server)”. Tap a voice and listen.</>),
            t(<><b>Hören (STT)</b>: Pfad „Deepgram (Server)“. „Testen“ schickt einen gesprochenen Satz durch die Erkennung.</>, <><b>Hören (STT)</b>: path “Deepgram (Server)”. “Testen” sends a spoken sentence through recognition.</>),
            t(<><b>CMS</b>: erreichbar, Konfig „aus dem CMS“, LPU-2 mit Adresse und gemappten Playbacks.</>, <><b>CMS</b>: reachable, config “aus dem CMS”, LPU-2 with address and mapped playbacks.</>),
            t(<><b>Licht</b>: Szene „Standard“ setzen und in die Kabine schauen.</>, <><b>Licht</b>: set the “Standard” scene and look into the cabin.</>),
            t(<><b>Fahrt</b>: läuft, keine Störung, nicht pausiert. Fahrt-Ansicht auf dem Standbildschirm öffnen.</>, <><b>Fahrt</b>: running, no fault, not paused. Open the journey view on the booth screen.</>),
            t(<><b>Sessions → Betrieb</b>: „Alle Sitze zurücksetzen“. Demo-/Offline-Modus <b>aus</b>.</>, <><b>Sessions → Betrieb</b>: “Alle Sitze zurücksetzen”. Demo/offline mode <b>off</b>.</>),
            t(<><b>Probelauf</b> an einem Sitz: Taste halten, „Wo sind wir gerade?“ — Antwort mit Ort und nächstem Halt. Dann „Mach das Licht gemütlich“ — das Licht wechselt.</>, <><b>Test run</b> at one seat: hold the button, “Wo sind wir gerade?” — a reply with place and next stop. Then “Mach das Licht gemütlich” — the light changes.</>),
          ]}
        />
      </Section>

      {/* ─────────────────────────── Fehlersuche ─────────────────────────── */}
      <Section id="fehlersuche" title={t("Fehlersuche", "Troubleshooting")} lead={t("Symptom, dann prüfen, dann beheben. Was gerade zutrifft, ist rot markiert — die Liste oben ist der aktuelle Befund.", "Symptom, then check, then fix. Whatever applies right now is marked red — the list on top is the current finding.")}>
        <Findings f={f} lang={lang} />

        <H3>{t("Verbindung", "Connection")}</H3>
        <Symptom
          id="s-ipad-fehlt"
          title={t("Ein iPad fehlt in den Verbindungen", "An iPad is missing from the connections")}
          live={has(f, "no-kiosks", "device-lost")}
          check={t(<>Läuft die App im Vordergrund? Ist das iPad im WLAN? Steht im Kreis „Verbindung wird hergestellt …“? Einrichtung (Schlitz 3 s) → stimmt die Server-Adresse?</>, <>Is the app in the foreground? Is the iPad on Wi-Fi? Does the circle say “connecting …”? Set-up (slit 3 s) → is the server address right?</>)}
          fix={t(<>WLAN neu verbinden oder App neu starten. Die App verbindet von selbst wieder; die Session bleibt zehn Minuten geparkt und läuft dann weiter. Steckt ein Ethernet-Kabel: Router-Feld der Ethernet-Einstellung leeren (siehe Einrichten).</>, <>Reconnect Wi-Fi or restart the app. It reconnects by itself; the session stays parked for ten minutes and then continues. If an Ethernet cable is plugged in: clear the router field of the Ethernet settings (see Set-up).</>)}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-stale"
          title={t("Ein Gerät steht auf „antwortet nicht“, hat aber gerade noch etwas getan", "A device says “antwortet nicht” but was just active")}
          live={has(f, "device-stale")}
          check={t("Der Socket ist offen, aber zwei Pings blieben unbeantwortet. Bei einem iPad meist eine alte App-Version; bei einer Konsole ein eingefrorener Tab.", "The socket is open but two pings went unanswered. On an iPad usually an old app build; on a console a frozen tab.")}
          fix={t("App auf dem iPad beenden und neu starten; ist es nach jedem Start wieder „antwortet nicht“, braucht das iPad einen neuen App-Build. Browser-Tab neu laden.", "Quit and restart the app on the iPad; if it is “antwortet nicht” again after every start, the iPad needs a new app build. Reload the browser tab.")}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-polling"
          title={t("Ein Gerät zeigt „polling“", "A device shows “polling”")}
          live={has(f, "device-polling")}
          check={t("Der WebSocket kam nicht zustande, Socket.IO fällt auf HTTP-Polling zurück. Es funktioniert, aber träge und mit mehr Aussetzern. Typisch für Gäste-WLANs mit Proxy.", "The WebSocket did not come up, Socket.IO fell back to HTTP polling. It works, but sluggishly and with more gaps. Typical for guest Wi-Fi with a proxy.")}
          fix={t("Anderes Netz (5G-Router). Auf dem VPS prüfen, dass der Cloudflare-Tunnel für den ws-Host WebSockets erlaubt.", "Another network (5G router). On the VPS check that the Cloudflare tunnel allows WebSockets for the ws host.")}
          go={[toUebersicht]}
        />

        <H3>{t("Hören und Sprechen", "Hearing and speaking")}</H3>
        <Symptom
          id="s-hoert-nicht"
          title={t("CoSiMo hört nichts — beim Halten der Taste erscheint keine Welle", "CoSiMo hears nothing — no wave appears while holding the button")}
          check={t(<>Ist der ESP32 gekoppelt (Bluetooth-Einstellungen)? Hat die App die Mikrofon-Berechtigung? Test ohne Hardware: eine Bluetooth-Tastatur anschließen und <Kbd>s</Kbd> halten (die Tasten sind Tastaturbuchstaben: <Kbd>s</Kbd> sprechen, <Kbd>i</Kbd> Info, <Kbd>l</Kbd> Licht).</>, <>Is the ESP32 paired (Bluetooth settings)? Does the app have the microphone permission? Test without hardware: connect a Bluetooth keyboard and hold <Kbd>s</Kbd> (the buttons are keyboard letters: <Kbd>s</Kbd> talk, <Kbd>i</Kbd> info, <Kbd>l</Kbd> light).</>)}
          fix={t("ESP32 aus- und einschalten, neu koppeln. Mikrofon: iPad-Einstellungen → CoSiMo Kiosk → Mikrofon an. Erscheint die Welle, aber keine Antwort: nächster Punkt.", "Power-cycle the ESP32, pair again. Microphone: iPad Settings → CoSiMo Kiosk → microphone on. If the wave appears but no reply: next entry.")}
        />
        <Symptom
          id="s-leer"
          title={t("Welle da, aber CoSiMo reagiert nicht oder sagt „nicht verstanden“", "Wave shows, but CoSiMo does not react or says “not understood”")}
          live={has(f, "no-server-stt")}
          check={t(<>Logs → letzter <C>stt.result</C>: 0 Zeichen heißt, die Aufnahme war leer oder zu leise. Übersicht → Hören: steht der Pfad auf „Deepgram (Server)“? Wenn nicht, diktiert das iPad lokal — dann muss Deutsch als Offline-Diktiersprache geladen sein.</>, <>Logs → last <C>stt.result</C>: 0 characters means the recording was empty or too quiet. Overview → Hören: is the path “Deepgram (Server)”? If not, the iPad dictates locally — then German must be downloaded as an offline dictation language.</>)}
          fix={t(<>Näher ans Mikrofon, die Taste erst nach dem letzten Wort loslassen (die App nimmt 0,3 s nach). Fehlt Server-STT: <C>DEEPGRAM_API_KEY</C> in <C>.env.prod</C>, Hub neu starten. Test: „Testen“ auf der Hören-Karte.</>, <>Closer to the microphone, release the button only after the last word (the app records 0.3 s longer). No server STT: <C>DEEPGRAM_API_KEY</C> in <C>.env.prod</C>, restart the hub. Test: “Testen” on the Hören card.</>)}
          go={[toUebersicht, toLogs]}
        />
        <Symptom
          id="s-stimme"
          title={t("Keine Stimme, oder die falsche (Systemstimme)", "No voice, or the wrong one (system voice)")}
          live={has(f, "no-server-tts")}
          check={t("Übersicht → Sprechen: Pfad „ElevenLabs (Server)“? Wenn „Systemstimme auf dem iPad“: der Hub hat keinen ElevenLabs-Schlüssel oder die Route ist kaputt. Lautstärke im Schlitzmenü und am iPad prüfen (Seitentasten).", "Overview → Sprechen: path “ElevenLabs (Server)”? If “Systemstimme auf dem iPad”: the hub has no ElevenLabs key or the route is broken. Check the volume in the slit menu and on the iPad (side buttons).")}
          fix={t(<><C>ELEVENLABS_API_KEY</C> und <C>ELEVENLABS_VOICE_ID</C> in <C>.env.prod</C>; <b>nie</b> eine Zeile wie <C>ELEVENLABS_MODEL=</C> leer lassen (leer überschreibt den Default und ergibt 400). Test: eine Stimme auf der Sprechen-Karte anhören. Auf dem Sitz: Schlitzmenü → Lautstärke.</>, <><C>ELEVENLABS_API_KEY</C> and <C>ELEVENLABS_VOICE_ID</C> in <C>.env.prod</C>; <b>never</b> leave a line like <C>ELEVENLABS_MODEL=</C> empty (empty overrides the default and yields 400). Test: listen to a voice on the Sprechen card. On the seat: slit menu → volume.</>)}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-abbruch"
          title={t("CoSiMo bricht mitten im Satz ab", "CoSiMo stops mid-sentence")}
          check={t(<>Das ist meist gewollt: ein Druck auf die Sprechtaste unterbricht (Barge-in), ebenso eine Karte oder ein Tipp im Menü. Logs → <C>turn.end</C> mit <C>interrupted</C>.</>, <>Usually intended: pressing the talk button interrupts (barge-in), so does a card or a tap in the menu. Logs → <C>turn.end</C> with <C>interrupted</C>.</>)}
          fix={t("Der Besucher kann ↻ im Schlitz tippen (acht Sekunden nach der Antwort) oder „Sag das nochmal“ sagen. Bricht es ohne Eingabe ab: Netz prüfen (polling?).", "The visitor can tap ↻ in the slit (eight seconds after the reply) or say “Sag das nochmal”. If it stops without input: check the network (polling?).")}
          go={[toLogs]}
        />

        <H3>{t("Das Gehirn", "The brain")}</H3>
        <Symptom
          id="s-canned"
          title={t("Antworten sind vorgefertigt / die LLM-Karte ist rot", "Replies are canned / the LLM card is red")}
          live={has(f, "llm-down", "network-down")}
          check={t(<>Übersicht → System-Karte oder Logs (Filter „System“): der letzte <C>service.status</C> sagt, ob das <i>Netz</i> oder das <i>Gehirn</i> weg ist und ob der Fallback greift. Demo-/Offline-Modus unter Sessions → Betrieb versehentlich an?</>, <>Overview → System card or Logs (filter “System”): the last <C>service.status</C> says whether the <i>network</i> or the <i>brain</i> is gone and whether the fallback is active. Demo/offline mode under Sessions → Betrieb switched on by accident?</>)}
          fix={
            <>
              {t("Netz weg: Uplink des VPS, bzw. am Stand nichts zu tun. Gehirn weg: auf dem VPS", "Network gone: the VPS uplink, nothing to do at the booth. Brain gone: on the VPS")}
              <Code className="my-1.5">docker compose exec realtime wget -qO- http://GX10-IP:8007/health</Code>
              {t(<>Kommt „ok“, springt der Hub binnen 15 s zurück. Kommt nichts: Tailscale-Sidecar (<C>docker compose logs tailscale</C>) und auf dem GX10 <C>~/cosimo-ai/check.log</C>. Übergangsweise im CMS → LLM einen Fallback eintragen (Anthropic).</>, <>If “ok” comes back, the hub switches back within 15 s. If nothing: the Tailscale sidecar (<C>docker compose logs tailscale</C>) and on the GX10 <C>~/cosimo-ai/check.log</C>. Meanwhile enter a fallback in CMS → LLM (Anthropic).</>)}
            </>
          }
          go={[toUebersicht, toLogs]}
        />
        <Symptom
          id="s-fallback"
          title={t("„Fallback aktiv“ auf der LLM-Karte", "“Fallback aktiv” on the LLM card")}
          live={has(f, "llm-fallback")}
          check={t(<>Das primäre Modell antwortet nicht, der Fallback (Claude) übernimmt. Die Demo läuft normal, nur Latenz und Kosten sind andere. <C>turn.start</C> zeigt „(fallback)“.</>, <>The primary model does not answer, the fallback (Claude) takes over. The demo runs normally, only latency and cost differ. <C>turn.start</C> shows “(fallback)”.</>)}
          fix={t("Nichts Dringendes. Der Hub prüft das primäre Modell alle 15 s und wechselt von selbst zurück. Bleibt es länger: wie beim Punkt darüber.", "Nothing urgent. The hub probes the primary model every 15 s and switches back by itself. If it persists: as in the entry above.")}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-demo-an"
          title={t("Demo-/Offline-Modus ist an", "Demo/offline mode is on")}
          live={has(f, "offline-canned")}
          check={t("Sessions → Betrieb → Häkchen „Demo- / Offline-Modus“. Der Hub schaltet ihn auch selbst an, wenn Netz oder Gehirn fehlen — dann ist das Häkchen aus und trotzdem alles vorgefertigt.", "Sessions → Betrieb → checkbox “Demo- / Offline-Modus”. The hub also switches it on itself when the network or the brain is missing — then the box is unchecked and everything is canned anyway.")}
          fix={t("Häkchen entfernen. Ist es schon aus: Netz und Gehirn (oben).", "Uncheck it. If it is already off: network and brain (above).")}
          go={[toSessions]}
        />
        <Symptom
          id="s-kein-tool"
          title={t("CoSiMo sagt „Das Licht ist jetzt an“ — aber nichts passiert", "CoSiMo says “the light is on now” — but nothing happens")}
          check={t(<>Logs → der <C>turn.end</C> dieser Antwort: „0 Tools“ heißt, das Modell hat nur geredet statt das Werkzeug zu rufen. Anders als ein Licht-Fehler: dann stünde <C>cabin.result</C> mit Fehler darunter.</>, <>Logs → the <C>turn.end</C> of that reply: “0 Tools” means the model only talked instead of calling the tool. Unlike a light failure: then a <C>cabin.result</C> with an error would follow.</>)}
          fix={t(<>Nochmal bitten, meist klappt es. Häuft es sich: CMS → LLM → <b>Tool-Zwang</b> einschalten (klare Licht-/Merk-Sätze erzwingen dann das Werkzeug). Prüfen, dass der Kern-Prompt im CMS aktuell ist (LLM-Karte → „System-Prompt“ nennt <C>set_light</C>).</>, <>Ask again, it usually works. If it piles up: CMS → LLM → switch on <b>Tool-Zwang</b> (clear light/remember sentences then force the tool). Check that the core prompt in the CMS is current (LLM card → “System-Prompt” mentions <C>set_light</C>).</>)}
          go={[toLogs]}
        />
        <Symptom
          id="s-langsam"
          title={t("Antworten dauern lange (über fünf Sekunden)", "Replies take long (over five seconds)")}
          check={t(<>Logs → <C>turn.end</C> zeigt die Zeiten stt / llm / tts. Ist llm hoch: Fallback aktiv? Thinking im CMS an? Ist stt hoch: Netz. Ist tts hoch: ElevenLabs-Route.</>, <>Logs → <C>turn.end</C> shows the timings stt / llm / tts. llm high: fallback active? Thinking on in the CMS? stt high: network. tts high: the ElevenLabs route.</>)}
          fix={t("CMS → LLM → Generierung: „Thinking“ aus, Max-Tokens nicht über 1024. Bei Netzproblemen 5G-Router.", "CMS → LLM → Generation: “Thinking” off, max tokens not above 1024. Network trouble: 5G router.")}
          go={[toLogs]}
        />
        <Symptom
          id="s-haengt"
          title={t("Ein Sitz hängt — das Gesicht denkt endlos", "A seat hangs — the face thinks forever")}
          check={t(<>Sessions: die Karte des Sitzes zeigt die Phase. Logs für den Sitz: gibt es einen <C>turn.start</C> ohne <C>turn.end</C>?</>, <>Sessions: the seat's card shows the phase. Logs for the seat: is there a <C>turn.start</C> without a <C>turn.end</C>?</>)}
          fix={t("Sessions → Betrieb → „Hängende Unterhaltung lösen“. Hilft das nicht: den Sitz zurücksetzen (↺ auf der Karte oder in den Verbindungen). Der Besucher bekommt eine frische Session.", "Sessions → Betrieb → “Hängende Unterhaltung lösen”. If that does not help: reset the seat (↺ on the card or in the connections). The visitor gets a fresh session.")}
          go={[toSessions]}
        />

        <H3>{t("Licht", "Light")}</H3>
        <Symptom
          id="s-licht"
          title={t("Das Licht reagiert nicht", "The light does not react")}
          live={has(f, "lpu2-unconfigured", "lpu2-unmapped", "light-unconfirmed")}
          check={t(<>Die Kette: CMS → Kabine (Adresse, Playbacks) → ein echtes iPad mit Ethernet → LPU-2. Logs: <C>cabin.actuate</C> zeigt die URLs, <C>cabin.result</C> das Ergebnis des iPads mit Fehlertext. Übersicht → CMS: „LPU-2 … gemappt“. Ist kein echtes iPad verbunden, feuert der Emulator — der loggt nur, schaltet nichts.</>, <>The chain: CMS → Cabin (address, playbacks) → a real iPad with Ethernet → LPU-2. Logs: <C>cabin.actuate</C> shows the URLs, <C>cabin.result</C> the iPad's outcome with an error text. Overview → CMS: “LPU-2 … gemappt”. With no real iPad connected the emulator fires — it only logs, switches nothing.</>)}
          fix={t("Adresse im CMS gegen die IP am Controller prüfen. Am iPad: Ethernet gesteckt, IP im richtigen Netz, Router-Feld leer; Einrichtung → Licht → „LPU-2 testen“. LPU-2 stromlos machen und wieder ein. Läuft die Standalone-Szene weiter, kann die Demo ohne Lichtwechsel stattfinden.", "Check the address in the CMS against the controller's IP. On the iPad: Ethernet plugged in, IP in the right network, router field empty; set-up → Light → “LPU-2 testen”. Power-cycle the LPU-2. If the standalone scene keeps running, the demo can go on without light changes.")}
          go={[toLicht, toLogs]}
        />
        <Symptom
          id="s-falsche-leuchte"
          title={t("Es schaltet die falsche Leuchte, oder die Leselampe des falschen Sitzes", "It switches the wrong fixture, or the wrong seat's reading lamp")}
          check={t("Zuordnung Playback → Leuchte im CMS → Kabine. Leselampen hängen an der Sitznummer des iPads (Einrichtung → Sitzplatz).", "Mapping playback → fixture in CMS → Cabin. Reading lamps follow the iPad's seat number (set-up → Sitzplatz).")}
          fix={t("Im CMS die Playback-Nummer korrigieren (wirkt nach 15 s). Sitznummer am iPad richtig setzen.", "Correct the playback number in the CMS (takes effect after 15 s). Set the seat number on the iPad correctly.")}
          go={[toLicht]}
        />
        <Symptom
          id="s-frei"
          title={t("Die Szene steht auf „frei“", "The scene says “frei”")}
          live={has(f, "light-free")}
          check={t("Jemand hat auf der Licht-Seite eine einzelne Leuchte bewegt. Das ist kein Fehler, nur kein gespeicherter Zustand.", "Someone moved a single fixture on the Licht page. Not an error, just not a saved state.")}
          fix={t("Licht → eine Szene wählen (verwirft die Änderung) oder „Szene speichern“ (macht sie zum neuen Stand der Szene im CMS).", "Licht → pick a scene (discards the change) or “Szene speichern” (makes it the scene's new state in the CMS).")}
          go={[toLicht]}
        />

        <H3>{t("Karten und Profile", "Cards and profiles")}</H3>
        <Symptom
          id="s-karte"
          title={t("„Diese Karte kenne ich leider nicht“", "“I don't recognise this card”")}
          check={t(<>Logs → <C>nfc.scan</C> zeigt die gelesene Chip-ID. Steht genau diese ID im CMS beim Profil (Groß-/Kleinschreibung zählt)?</>, <>Logs → <C>nfc.scan</C> shows the chip id read. Is exactly this id on the profile in the CMS (case matters)?</>)}
          fix={t(<>ID im CMS beim Profil eintragen, 15 s warten, erneut auflegen. Ohne Leser simulieren: mit Tastatur <Kbd>[</Kbd> ID <Kbd>⏎</Kbd> in die App tippen, oder im Emulator die Karten-Schaltflächen.</>, <>Enter the id on the profile in the CMS, wait 15 s, tap again. Simulate without a reader: type <Kbd>[</Kbd> id <Kbd>⏎</Kbd> into the app with a keyboard, or use the card buttons in the emulator.</>)}
          go={[toLogs]}
        />
        <Symptom
          id="s-profil"
          title={t("Der Sitz hat das falsche Profil oder begrüßt falsch", "The seat has the wrong profile or greets wrongly")}
          check={t("Sessions → Karte des Sitzes zeigt das Profil und die Sprache. Der Inspektor (🔍) zeigt den genauen Prompt.", "Sessions → the seat's card shows the profile and language. The inspector (🔍) shows the exact prompt.")}
          fix={t("Persona auf der Karte umstellen (das ist der Ersatz für eine Karte) oder den Sitz zurücksetzen — er startet mit dem Standardprofil.", "Change the persona on the card (the stand-in for a physical card) or reset the seat — it starts with the default profile.")}
          go={[toSessions]}
        />
        <Symptom
          id="s-merken"
          title={t("„Merk dir …“ funktioniert nicht", "“Remember …” does not work")}
          check={t("Merken gibt es nur für Karten-Fahrgäste mit gespeicherter Einwilligung. Ein Sitz ohne Karte ist anonym — CoSiMo sagt das auch so.", "Remembering exists only for card riders with stored consent. A seat without a card is anonymous — CoSiMo says so.")}
          fix={t("Karte auflegen (Alex, Noa, Luca, Sam haben Einwilligung). Bleibt es aus: CMS erreichbar? Ohne CMS kann nichts geschrieben werden.", "Put a card on (Alex, Noa, Luca, Sam have consent). Still nothing: CMS reachable? Without the CMS nothing can be written.")}
          go={[toSessions]}
        />

        <H3>{t("Fahrt", "Journey")}</H3>
        <Symptom
          id="s-fahrt"
          title={t("Die Fahrt steht, oder eine Störung bleibt", "The journey is stopped, or a fault persists")}
          live={has(f, "sim-paused", "fault-active")}
          check={t("Übersicht → Fahrt: „pausiert“ oder eine Störung mit Restzeit. Störungen kommen nur von der Konsole und enden von selbst.", "Overview → Fahrt: “pausiert” or a fault with remaining time. Faults come only from the console and end by themselves.")}
          fix={t("„Fahrt fortsetzen“ bzw. „Störung beenden“. Ist die Route falsch: CMS → Route; eine Änderung startet die Fahrt am ersten Halt neu.", "“Fahrt fortsetzen” or “Störung beenden”. Wrong route: CMS → Route; a change restarts the journey at the first stop.")}
          go={[toUebersicht]}
        />

        <H3>{t("Konsole und Server", "Console and server")}</H3>
        <Symptom
          id="s-passwort"
          title={t("„Der Hub hat das Passwort abgelehnt“", "“The hub refused the password”")}
          check={t(<>Das Passwort der Seite stimmt, aber der Hub kennt ein anderes: <C>HOST_TOKEN</C> in <C>.env.prod</C> weicht vom Hash im Konsolen-Build ab.</>, <>The page password is right, but the hub knows another: <C>HOST_TOKEN</C> in <C>.env.prod</C> differs from the hash in the console build.</>)}
          fix={t(<><C>HOST_TOKEN</C> auf das Konsolen-Passwort setzen und den Hub neu starten — oder das Passwort in <C>Lock.tsx</C> ändern und die Konsole neu bauen.</>, <>Set <C>HOST_TOKEN</C> to the console password and restart the hub — or change the password in <C>Lock.tsx</C> and rebuild the console.</>)}
        />
        <Symptom
          id="s-ersetzt"
          title={t("„Konsole ersetzt“ oder „Konsole neu laden“", "“Konsole ersetzt” or “Konsole neu laden”")}
          check={t("Ersetzt: es waren mehr als drei Konsolen offen, die älteste musste weichen. Neu laden: jemand hat „Alles zurücksetzen“ gedrückt.", "Replaced: more than three consoles were open, the oldest had to go. Reload: someone pressed “Alles zurücksetzen”.")}
          fix={t("Neu laden. Vergessene Tabs auf anderen Geräten schließen.", "Reload. Close forgotten tabs on other devices.")}
        />
        <Symptom
          id="s-hub"
          title={t("Die Konsole zeigt „warte auf Status“ oder nichts Aktuelles", "The console shows “warte auf Status” or nothing current")}
          live={has(f, "hub-down", "service-down")}
          check={t(<>Der Hub ist nicht erreichbar. Öffnet <C>https://ws-cosimo.homannjohannes.de/health</C> im Browser? Übersicht → Services (wenn noch sichtbar).</>, <>The hub is unreachable. Does <C>https://ws-cosimo.homannjohannes.de/health</C> open in a browser? Overview → Services (if still visible).</>)}
          fix={
            <>
              {t("Services-Karte → Neustart-Knopf der Zeile, wenn vorhanden. Sonst auf dem VPS im Repo-Verzeichnis:", "Services card → the row's restart button, if present. Otherwise on the VPS in the repo directory:")}
              <Code className="my-1.5">{"ssh vps\ndocker compose logs --tail 100 realtime\n./start.sh realtime      # builds and starts only this service"}</Code>
              {t(<>Immer <C>./start.sh</C>, nie ein nacktes <C>docker compose up</C> — das startet die Dev-Konfiguration und Cloudflare zeigt „Bad Gateway“.</>, <>Always <C>./start.sh</C>, never a bare <C>docker compose up</C> — that starts the dev configuration and Cloudflare shows “Bad Gateway”.</>)}
            </>
          }
          go={[toUebersicht]}
        />
        <Symptom
          id="s-defaults"
          title={t("CMS-Karte: Konfig „env-Defaults“ oder 0 Profile", "CMS card: config “env-Defaults” or 0 profiles")}
          live={has(f, "cms-down", "config-defaults")}
          check={t(<>Der Hub konnte das CMS noch nie oder gerade nicht lesen. Öffnet <C>cms-cosimo.homannjohannes.de/admin</C>? <C>docker compose logs cms</C>: Fehler beim Lesen eines Globals deuten auf eine fehlende Migration nach einem Schema-Update.</>, <>The hub could never, or cannot right now, read the CMS. Does <C>cms-cosimo.homannjohannes.de/admin</C> open? <C>docker compose logs cms</C>: errors reading a global point to a missing migration after a schema update.</>)}
          fix={t(<>CMS-Container neu starten (Services-Karte oder <C>./start.sh cms</C>). Die Demo läuft derweil mit dem eingebauten Standardprofil und der eingebauten Route weiter — nur Karten und Merken fehlen.</>, <>Restart the CMS container (Services card or <C>./start.sh cms</C>). Meanwhile the demo runs on the built-in default profile and route — only cards and remembering are missing.</>)}
          go={[toUebersicht]}
        />
        <Symptom
          id="s-deploy"
          title={t("Nach einem Deploy sieht die Konsole alt aus", "After a deploy the console looks old")}
          check={t("Statische Bundles werden gecacht; der Hub läuft schon neu, die Seite nicht.", "Static bundles are cached; the hub is already new, the page is not.")}
          fix={t("Konsole hart neu laden. Die iPad-App braucht nur bei Protokolländerungen einen neuen Build — dann steht es im Commit.", "Hard-reload the console. The iPad app needs a new build only on protocol changes — the commit says so.")}
        />
      </Section>

      {/* ─────────────────────────── Logs lesen ─────────────────────────── */}
      <Section id="logs" title={t("Logs lesen", "Reading the logs")} lead={t("Jeder Schritt eines Turns ist ein Ereignis. Die Turn-Nummer eines Sitzes verbindet sie; ein Haarstrich trennt einen Turn vom nächsten.", "Every step of a turn is an event. The seat's turn number joins them; a hairline separates one turn from the next.")}>
        <P>{t("So liest sich ein Sprach-Turn, der das Licht schaltet — von oben nach unten, in der Reihenfolge, in der es passiert:", "This is how a voice turn that switches the light reads — top to bottom, in the order it happens:")}</P>
        <Code>{`stt.result     42 Zeichen in 610 ms                       ← Deepgram ${t("hat gehört", "heard")}
turn.start     voice · de · openai-compatible/qwen · „Mach das Licht gemütlich“
llm.step       Schritt 0: 0 Zeichen, Tools set_light · 820 ms  ← ${t("das Modell ruft das Werkzeug", "the model calls the tool")}
cabin.actuate  scene gemuetlich → http://…/ajax/pb12/go …      ← ${t("der Hub baut die URLs", "the hub builds the URLs")}
tool.call      set_light({"scene":"gemuetlich"}) → ok · 3 ms
cabin.result   ok                                              ← ${t("das iPad meldet zurück", "the iPad reports back")}
llm.step       Schritt 1: 24 Zeichen, keine Tools · 640 ms      ← ${t("die gesprochene Antwort", "the spoken reply")}
tts.done       24 Zeichen → 31 kB in 380 ms
turn.end       ok · 2,5 s (stt 610, llm 1460, tts 380) · 1 Tool · happy · „Gern, das Licht steht jetzt auf Gemütlich.“`}</Code>
        <Bullets
          items={[
            t(<><b>Filter</b>: Sitz, Session, Mindest-Level, Freitext, Ereignisarten hinter dem Regler-Symbol („nur Turns“ als Vorgabe). Die Log-Schaltfläche in den Verbindungen und auf Session-Karten springt vorgefiltert hierher.</>, <><b>Filters</b>: seat, session, minimum level, free text, event kinds behind the sliders icon (“nur Turns” as the preset). The log button in the connections and on session cards jumps here pre-filtered.</>),
            t(<><b>Levels</b>: <i>warn</i> = ein fehlgeschlagenes Werkzeug, eine unbekannte Karte, leere Erkennung. <i>error</i> = ein Turn ist abgebrochen; die Zahl steht rot im Menü.</>, <><b>Levels</b>: <i>warn</i> = a failed tool, an unknown card, empty recognition. <i>error</i> = a turn aborted; the count shows red in the menu.</>),
            t(<><b>System-Ereignisse</b> ohne Sitz: <C>service.boot</C> (der Hub kam hoch), <C>config.loaded</C> (Konfiguration geladen, mit dem, was sich geändert hat), <C>service.status</C> (LLM/CMS/Netz gekippt), <C>fault.start/end</C>.</>, <><b>System events</b> without a seat: <C>service.boot</C> (the hub came up), <C>config.loaded</C> (config loaded, with what changed), <C>service.status</C> (LLM/CMS/network flipped), <C>fault.start/end</C>.</>),
            t(<><b>Export</b>: die aktuelle Auswahl als NDJSON. Auf dem VPS liegt dasselbe unter <C>./logs/cosimo-JJJJ-MM-TT.ndjson</C>. Nach der Messe mitnehmen.</>, <><b>Export</b>: the current selection as NDJSON. The same lives on the VPS under <C>./logs/cosimo-YYYY-MM-DD.ndjson</C>. Take it along after the fair.</>),
            t(<><b>Inspektor</b> (🔍 auf einer Session-Karte): der exakte System-Prompt des Sitzes und jeder Turn mit Werkzeugen, Ergebnissen und Zeiten.</>, <><b>Inspector</b> (🔍 on a session card): the seat's exact system prompt and every turn with tools, results and timings.</>),
          ]}
        />
      </Section>

      {/* ─────────────────────────── Begriffe ─────────────────────────── */}
      <Section id="begriffe" title={t("Begriffe", "Glossary")}>
        <dl className="m-0 flex max-w-[76ch] flex-col">
          <Term name="Hub">{t("Der Realtime-Dienst auf dem VPS. Alles Live läuft durch ihn.", "The realtime service on the VPS. Everything live runs through it.")}</Term>
          <Term name={t("Sitz", "Seat")}>{t("Ein iPad (oder der Emulator) mit der Kiosk-Rolle. Hat genau eine Session.", "An iPad (or the emulator) in the kiosk role. Has exactly one session.")}</Term>
          <Term name="Session">{t("Ein Gespräch von der ersten Eingabe bis zum Zurücksetzen oder Kartenwechsel. Wird, mit Einwilligung, ins CMS geschrieben — das Forschungsdatenset.", "A conversation from the first input to a reset or card change. Written to the CMS with consent — the research dataset.")}</Term>
          <Term name="Turn">{t("Eine Eingabe des Fahrgastes und CoSiMos Antwort darauf, inklusive Werkzeugen. Hat eine Nummer je Sitz.", "One rider input and CoSiMo's reply to it, tools included. Numbered per seat.")}</Term>
          <Term name={t("Profil", "Profile")}>{t("Wer der Fahrgast ist: Name, Sprache, Darstellung (Farbe, Textgröße, Text an/aus, Stimme), Interaktionsstil, Merkzettel. Im CMS „Personas“. „Standard“ ist das leere Profil für Sitze ohne Karte.", "Who the rider is: name, language, presentation (colour, text size, text on/off, voice), interaction style, notes. “Personas” in the CMS. “Standard” is the blank profile for seats without a card.")}</Term>
          <Term name={t("Karte", "Card")}>{t("Ein NFC-Chip, dessen ID im CMS bei einem Profil steht. Auflegen wechselt das Profil des Sitzes und begrüßt.", "An NFC chip whose id is on a profile in the CMS. Tapping it switches the seat's profile and greets.")}</Term>
          <Term name={t("Werkzeug", "Tool")}>{t("Was das Modell tun kann: Fahrtdaten holen, Licht schalten, Darstellung ändern, Merken/Vergessen, Menü öffnen, Ja/Nein fragen, Gesicht färben. Nur ein Werkzeugaufruf ändert etwas — Worte allein nie.", "What the model can do: fetch journey data, switch the light, change presentation, remember/forget, open the menu, ask yes/no, colour the face. Only a tool call changes anything — words alone never do.")}</Term>
          <Term name={t("Szene", "Scene")}>{t("Ein gespeicherter Lichtzustand aller Leuchten: Standard, Gemütlich, Hell, Aus. „Frei“ = jemand hat eine Leuchte einzeln bewegt.", "A saved light state of all fixtures: Standard, Gemütlich, Hell, off. “Frei” = someone moved a single fixture.")}</Term>
          <Term name="LPU-2">{t("Der DMX-Lichtcontroller (Cuety) im abgeschotteten Kabinen-LAN. Nur die iPads erreichen ihn.", "The DMX light controller (Cuety) on the air-gapped cabin LAN. Only the iPads reach it.")}</Term>
          <Term name={t("Vorgefertigt", "Canned")}>{t("Der Skript-Modus ohne Sprachmodell („canned“): kennt Fahrtdaten und Licht, sonst nichts. Kommt bei Netz- oder Gehirnausfall oder per Schalter.", "The script mode without a language model: knows journey data and the light, nothing else. Kicks in on network or brain failure, or by switch.")}</Term>
          <Term name="Fallback">{t("Das zweite Sprachmodell (Claude), das einspringt, wenn das primäre auf dem GX10 nicht erreichbar ist.", "The second language model (Claude) that steps in when the primary on the GX10 is unreachable.")}</Term>
          <Term name="Tailnet">{t("Das private Tailscale-Netz zwischen dem Hub-Container und dem GX10. Nur diese beiden sind drin.", "The private Tailscale network between the hub container and the GX10. Only those two are in it.")}</Term>
          <Term name={t("Schaustellung", "Showcase")}>{t("Ein Sitz, der stumm vor sich hin spielt, weil ihn kein Besucher erreicht. Einstellung am iPad.", "A seat performing silently because no visitor can reach it. A setting on the iPad.")}</Term>
          <Term name="Barge-in">{t("Die Sprechtaste unterbricht CoSiMo sofort. Ein laufender Werkzeugaufruf wird nie halb abgebrochen.", "The talk button interrupts CoSiMo at once. A running tool call is never cut halfway.")}</Term>
        </dl>
      </Section>
    </div>
  );
}

/** The findings block at the top of Fehlersuche — or the green all-clear. Live, so hidden in print. */
function Findings({ f, lang }: { f: ReturnType<typeof diagnose>; lang: DocLang }) {
  const t = picker(lang);
  if (f.length === 0) {
    return (
      <Card className="print-hide flex-row items-center gap-3 border-ok">
        <CircleCheck size={20} className="shrink-0 text-ok" />
        <span className="text-base"><b>{t("Kein Befund.", "Nothing found.")}</b> {t("Alles, was die Konsole sehen kann, ist in Ordnung.", "Everything the console can see is fine.")}</span>
      </Card>
    );
  }
  return (
    <Card className={cn("print-hide gap-2", f.some((x) => x.severity === "down") ? "border-accent" : "border-warn")}>
      <div className="flex items-center gap-2 text-base">
        <CircleAlert size={18} className={f.some((x) => x.severity === "down") ? "text-accent" : "text-warn"} />
        <b>{t("Aktueller Befund", "Current findings")}</b> <span className="text-mute">· {f.length}</span>
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
function LiveChecklist({ c, f, lang }: { c: CosimoState; f: ReturnType<typeof diagnose>; lang: DocLang }) {
  const t = picker(lang);
  const st = c.status;
  const kiosks = c.devices.filter((d) => d.role === "kiosk" && d.health !== "lost");
  const items: { label: string; ok: boolean | null }[] = [
    { label: t(`${kiosks.length} Sitz${kiosks.length === 1 ? "" : "e"} verbunden`, `${kiosks.length} seat${kiosks.length === 1 ? "" : "s"} connected`), ok: kiosks.length >= 1 ? (kiosks.length >= 4 ? true : null) : false },
    { label: t("Gehirn", "Brain"), ok: st ? st.llm && !has(f, "llm-fallback") : null },
    { label: "Server-TTS", ok: st ? st.serverTts : null },
    { label: "Server-STT", ok: st ? st.serverStt : null },
    { label: "CMS", ok: st ? st.cms && !has(f, "config-defaults") : null },
    { label: t("Licht", "Light"), ok: st && c.hostConfig ? !has(f, "lpu2-unconfigured", "lpu2-unmapped", "light-unconfirmed") : null },
    { label: t("Fahrt läuft", "Journey running"), ok: c.telemetry ? !has(f, "sim-paused", "fault-active") : null },
    { label: t("Demo-Modus aus", "Demo mode off"), ok: st ? !st.offlineCanned : null },
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
