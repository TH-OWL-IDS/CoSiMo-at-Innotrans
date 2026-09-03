import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Brand, Button, Card, Eyebrow, Input } from "@cosimo/ui";
import { DEFAULT_PANEL_LAYOUT, type PanelLayout } from "../config/panelLayout";

/**
 * Operator-only screen: server URL + panel-cutout calibration. Shown on
 * first launch when no URL is known, and via the hidden 3s hold on the
 * telemetry slit. Visitors never see it — so it wears the console's CI,
 * not the rider UI's.
 */
export default function ServerSetup({
  current,
  layout,
  seat,
  onSave,
  onCancel,
  onOpenTestChat,
}: {
  current: string | null;
  layout: PanelLayout;
  /** Physical seat position 1-4, 0 = not configured. */
  seat: number;
  onSave: (url: string, layout: PanelLayout, seat: number) => void;
  /** Present when opened as an overlay over a running kiosk. */
  onCancel?: () => void;
  /** Testing aid: return to the kiosk with the text console open. */
  onOpenTestChat?: () => void;
}) {
  const [draft, setDraft] = useState(current ?? "https://");
  const [geo, setGeo] = useState<PanelLayout>(layout);
  const [seatDraft, setSeatDraft] = useState(seat);
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
    onSave(url, geo, seatDraft);
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
