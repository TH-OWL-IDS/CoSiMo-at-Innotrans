import { useState } from "react";
import type { PanelLayout } from "../config/panelLayout";

/**
 * Operator-only screen: server URL + panel-cutout calibration. Shown on
 * first launch when no URL is known, and via the hidden 3s hold on the
 * telemetry slit. Visitors never see it.
 */
export default function ServerSetup({
  current,
  layout,
  onSave,
  onCancel,
}: {
  current: string | null;
  layout: PanelLayout;
  onSave: (url: string, layout: PanelLayout) => void;
  /** Present when opened as an overlay over a running kiosk. */
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(current ?? "https://");
  const [geo, setGeo] = useState<PanelLayout>(layout);
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
    onSave(url, geo);
  };

  const num = (key: keyof PanelLayout, label: string) => (
    <label
      key={key}
      style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.85 }}
    >
      {label}
      <input
        type="number"
        step={0.5}
        value={geo[key] as number}
        onChange={(e) => setGeo({ ...geo, [key]: Number(e.target.value) })}
        style={{
          width: 76,
          padding: "8px 10px",
          fontSize: 15,
          borderRadius: 10,
          border: "1px solid #4b5563",
          background: "#0e1013",
          color: "inherit",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      />
    </label>
  );

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.1rem",
        padding: "2rem",
        background: "#16181c",
        color: "#f3f4f6",
        textAlign: "center",
        overflowY: "auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.35rem" }}>CoSiMo — Einrichtung</h1>
      <p style={{ margin: 0, maxWidth: "30rem", opacity: 0.7, fontSize: 13 }}>
        Server-Adresse und Panel-Kalibrierung (Position der Ausschnitte in % des
        Bildschirms). Nur für das Standpersonal.
      </p>

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "1.1rem", alignItems: "center" }}
      >
        <div style={{ display: "flex", gap: 8, width: "min(90vw, 30rem)" }}>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder="https://cosimo.homannjohannes.de"
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: "1.05rem",
              borderRadius: 12,
              border: "1px solid #4b5563",
              background: "#0e1013",
              color: "inherit",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
        </div>

        <fieldset
          style={{
            border: "1px solid #374151",
            borderRadius: 14,
            padding: "12px 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <legend style={{ fontSize: 12, opacity: 0.7, padding: "0 6px" }}>
            Panel-Kalibrierung (%)
          </legend>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {num("circleX", "Kreis X")}
            {num("circleY", "Kreis Y")}
            {num("circleD", "Kreis Ø")}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {num("slitX", "Schlitz X")}
            {num("slitY", "Schlitz Y")}
            {num("slitW", "Schlitz B")}
            {num("slitH", "Schlitz H")}
            {num("slitR", "Radius px")}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={geo.guides}
              onChange={(e) => setGeo({ ...geo, guides: e.target.checked })}
            />
            Umrisse anzeigen (zum Ausrichten hinter dem Panel)
          </label>
        </fieldset>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              border: "none",
              background: "#f3f4f6",
              color: "#16181c",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Speichern
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid #4b5563",
                background: "transparent",
                color: "inherit",
                opacity: 0.75,
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Abbrechen
            </button>
          )}
        </div>
      </form>
      {error && <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>{error}</p>}
    </main>
  );
}
