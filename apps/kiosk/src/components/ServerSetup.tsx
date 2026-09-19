import { useState } from "react";
import { FlaskConical, Lightbulb, RotateCcw } from "lucide-react";
import { LIGHT_SIGNALS, LIGHT_ZONES } from "@cosimo/shared";
import { Brand, Button, Card, Eyebrow, Input } from "@cosimo/ui";
import { DEFAULT_PANEL_LAYOUT, type PanelLayout } from "../config/panelLayout";
import { DEFAULT_SLIT_MOTION, type SlitMotion } from "../config/slitMotion";

/**
 * Operator-only screen: server URL + panel-cutout calibration. Shown on
 * first launch when no URL is known, and via the hidden 3s hold on the
 * telemetry slit. Visitors never see it — so it wears the console's CI,
 * not the rider UI's.
 */
/** One rig row: a CW/WW pair (kalt · warm · aus) or a single playback (an · aus). */
function LightRow({ label, onLight, pair, single }: {
  label: string;
  onLight: (key: string, on?: boolean) => void;
  pair?: string;
  single?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-left text-md">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {pair ? (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => onLight(`${pair}-cw`, true)}>kalt</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onLight(`${pair}-ww`, true)}>warm</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => { onLight(`${pair}-cw`, false); onLight(`${pair}-ww`, false); }}>aus</Button>
        </>
      ) : (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => onLight(single!, true)}>an</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onLight(single!, false)}>aus</Button>
        </>
      )}
    </div>
  );
}

export default function ServerSetup({
  current,
  layout,
  seat,
  showcase,
  autoCheckout,
  slitMotion,
  onSave,
  onCancel,
  onOpenTestChat,
  onLight,
}: {
  current: string | null;
  layout: PanelLayout;
  /** Physical seat position 1-4, 0 = not configured. */
  seat: number;
  /** Showcase mode (silent endless performance) on/off. */
  showcase: boolean;
  /** Auto-checkout after 2 min of silence on/off (off for a carried iPad). */
  autoCheckout: boolean;
  /** Timing of the slit's rest rotation. */
  slitMotion: SlitMotion;
  onSave: (url: string, layout: PanelLayout, seat: number, showcase: boolean, motion: SlitMotion, autoCheckout: boolean) => void;
  /** Present when opened as an overlay over a running kiosk. */
  onCancel?: () => void;
  /** Testing aid: return to the kiosk with the text console open. */
  onOpenTestChat?: () => void;
  /** Rig actions (zones, signals, globals) — this iPad fires them. Absent on first launch (no socket yet). */
  onLight?: (key: string, on?: boolean) => void;
}) {
  const [draft, setDraft] = useState(current ?? "https://");
  const [geo, setGeo] = useState<PanelLayout>(layout);
  const [seatDraft, setSeatDraft] = useState(seat);
  const [showDraft, setShowDraft] = useState(showcase);
  const [checkoutDraft, setCheckoutDraft] = useState(autoCheckout);
  const [motionDraft, setMotionDraft] = useState<SlitMotion>(slitMotion);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = draft.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setError("Bitte eine vollständige URL angeben, z. B. https://cosimo.example.org");
      return;
    }
    onSave(url, geo, seatDraft, showDraft, motionDraft, checkoutDraft);
  };

  const num = (key: keyof PanelLayout, label: string) => (
    <label key={key} className="flex flex-col gap-1 text-sm text-mute">
      {label}
      <Input
        type="number"
        step={0.5}
        size="lg"
        className="w-[76px] select-text"
        value={geo[key] as number}
        onChange={(e) => setGeo({ ...geo, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <main className="fixed inset-0 z-header flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-8 font-mono text-center text-ink">
      <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Einrichtung">
        <Brand size={44} />
      </h1>
      <div>
        <Eyebrow className="justify-center">Einrichtung</Eyebrow>
        <p className="m-0 mt-1 max-w-[30rem] text-md text-mute">
          Server-Adresse und Panel-Kalibrierung (Position der Ausschnitte in % des
          Bildschirms). Nur für das Standpersonal.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col items-center gap-5">
        <Input
          size="lg"
          className="w-[min(90vw,30rem)] select-text"
          aria-label="Server-Adresse"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          aria-invalid={Boolean(error)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          placeholder="https://ws-cosimo.homannjohannes.de"
        />

        <Card className="items-center">
          <Eyebrow>Sitzplatz</Eyebrow>
          {/* which physical seat this iPad is mounted at — the hub picks the
              seat's reading-lamp playback (PB 49-52) from this */}
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant={seatDraft === n ? "primary" : "secondary"}
                aria-pressed={seatDraft === n}
                onClick={() => setSeatDraft(n)}
              >
                {n === 0 ? "keiner" : String(n)}
              </Button>
            ))}
          </div>
          <p className="m-0 max-w-[26rem] text-sm text-mute">
            1 = vorn, 4 = hinten. Bestimmt, welche Leselampe dieser Sitz schaltet — ohne Zuordnung bleibt sie simuliert.
          </p>
        </Card>

        <Card className="items-center">
          <Eyebrow>Auschecken</Eyebrow>
          <label className="flex cursor-pointer items-center gap-2 text-md">
            <input type="checkbox" className="accent-ink" checked={checkoutDraft} onChange={(e) => setCheckoutDraft(e.target.checked)} />
            Nach 2 Minuten Stille automatisch auschecken
          </label>
          <p className="m-0 max-w-[26rem] text-sm text-mute">
            Der Kreis zeigt dann wieder das Einchecken, die Sitzung ist vorbei. Aus, wenn dieses iPad herumgetragen wird.
          </p>
        </Card>

        <Card className="items-center">
          <Eyebrow>Schaustellung</Eyebrow>
          {/* the two seats visitors cannot reach: the face performs silently and
              endlessly; the buttons do nothing; only this switch ends it */}
          <label className="flex cursor-pointer items-center gap-2 text-md">
            <input type="checkbox" className="accent-ink" checked={showDraft} onChange={(e) => setShowDraft(e.target.checked)} />
            Stummes Schauspiel, endlos — für Sitze, die kein Besucher erreicht
          </label>
          <p className="m-0 max-w-[26rem] text-sm text-mute">
            Gesicht, Farben und Untertitel laufen von selbst; die Tasten sind aus. Nur dieser Schalter beendet es.
          </p>
        </Card>

        {onLight && (
          <Card className="items-stretch">
            <Eyebrow className="justify-center"><Lightbulb size={12} className="-mb-px inline" /> Licht (Standpersonal)</Eyebrow>
            <LightRow label="Innenlicht (Rooflight)" onLight={onLight} pair="interior-light" />
            {[1, 2, 3, 4].map((n) => (
              <LightRow key={n} label={`Leselampe Sitz ${n}`} onLight={onLight} single={`reading-${n}`} />
            ))}
            {LIGHT_ZONES.map((z) => <LightRow key={z.id} label={z.label} onLight={onLight} pair={z.id} />)}
            {LIGHT_SIGNALS.map((sg) => <LightRow key={sg.id} label={sg.label} onLight={onLight} single={sg.id} />)}
            <div className="flex flex-wrap justify-center gap-2 border-t border-line-soft pt-2.5">
              <Button type="button" size="sm" variant="secondary" onClick={() => onLight("blackout", true)}>Blackout an</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onLight("blackout", false)}>Blackout aus</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { if (window.confirm("Alle Playbacks releasen?")) onLight("release-all"); }}>Alles releasen</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onLight("hello")}>LPU-2 testen</Button>
            </div>
            <p className="m-0 text-sm text-mute">
              Dieses iPad feuert die Befehle direkt ins Kabinen-LAN. Ergebnis in der Konsole unter System-Logs.
            </p>
          </Card>
        )}

        <Card className="items-center">
          <Eyebrow>Schlitz-Animation</Eyebrow>
          {/* the rest rotation: how long each display stays, how long a slide takes */}
          <div className="flex flex-wrap justify-center gap-3">
            <label className="flex flex-col gap-1 text-sm text-mute">
              Schritt (s)
              <Input type="number" step={0.5} min={1} size="lg" className="w-[88px] select-text" value={motionDraft.stepSec}
                onChange={(e) => setMotionDraft({ ...motionDraft, stepSec: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-mute">
              Animation (ms)
              <Input type="number" step={20} min={0} max={2000} size="lg" className="w-[88px] select-text" value={motionDraft.slideMs}
                onChange={(e) => setMotionDraft({ ...motionDraft, slideMs: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={() => setMotionDraft(DEFAULT_SLIT_MOTION)}>
              <RotateCcw size={14} /> Standard ({DEFAULT_SLIT_MOTION.stepSec} s / {DEFAULT_SLIT_MOTION.slideMs} ms)
            </Button>
          </div>
          <p className="m-0 max-w-[26rem] text-sm text-mute">
            Schritt = wie lange jede Anzeige steht (Status, Linie, nächste Station, Mikro). Animation = Dauer des Hoch-/Runtergleitens.
          </p>
        </Card>

        <Card className="items-center">
          <Eyebrow>Panel-Kalibrierung (%)</Eyebrow>
          <div className="flex flex-wrap justify-center gap-3">
            {num("circleX", "Kreis X")}
            {num("circleY", "Kreis Y")}
            {num("circleD", "Kreis Ø")}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {num("slitX", "Schlitz X")}
            {num("slitY", "Schlitz Y")}
            {num("slitW", "Schlitz B")}
            {num("slitH", "Schlitz H")}
            {num("slitR", "Radius px")}
          </div>
          <label className="flex items-center justify-center gap-2 text-md">
            <input
              type="checkbox"
              className="accent-ink"
              checked={geo.guides}
              onChange={(e) => setGeo({ ...geo, guides: e.target.checked })}
            />
            Umrisse anzeigen (zum Ausrichten hinter dem Panel)
          </label>
          {/* Back to the measured panel defaults (Ø 110 mm / 24 x 110 mm on the
              iPad mini). Only the draft resets — nothing sticks until Speichern. */}
          <Button type="button" size="sm" onClick={() => setGeo({ ...DEFAULT_PANEL_LAYOUT, guides: geo.guides })}>
            <RotateCcw size={14} /> Auf Standardmaße zurücksetzen
          </Button>
        </Card>

        <div className="flex gap-2.5">
          <Button type="submit" variant="primary">Speichern</Button>
          {onCancel && (
            <Button type="button" onClick={onCancel}>Abbrechen</Button>
          )}
        </div>
        {onOpenTestChat && (
          <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={onOpenTestChat}>
            <FlaskConical size={14} /> Text-Konsole (Test) — mit CoSiMo schreiben
          </Button>
        )}
      </form>
      {error && <p role="alert" className="m-0 text-md text-accent">{error}</p>}
    </main>
  );
}
