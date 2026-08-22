import { useEffect, useMemo, useState } from "react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { resolveServerUrl } from "./serverUrl";

/**
 * The journey view — the MonoCab's line as a horizontal diagram, the cab
 * moving along it in real time, out and back. Read-only: it draws what the
 * hub's journey simulation broadcasts (`telemetry:update`, global state);
 * faults are injected from the operator console or the CMS scenario.
 *
 * Layout: stops left → right in outbound order; the return trip runs right →
 * left on the same line (the cab flips). On a narrow screen the diagram keeps
 * its width and scrolls horizontally — a line is a line.
 */

const STOP_GAP = 220; // px between stops — the diagram's "scale"
const PAD = 80;

function fmt(n: number): string {
  return n.toLocaleString("de-DE");
}

/** 0..1 position of the cab along the whole line, in outbound coordinates. */
function lineProgress(t: MonoCabTelemetry): number {
  const n = t.stops.length;
  if (n < 2) return 0;
  const { stopIndex, progress, direction } = t.position;
  // `stopIndex` is the stop the cab is at or just left; progress runs towards
  // the next stop in the travel direction.
  const from = stopIndex / (n - 1);
  const step = 1 / (n - 1);
  return direction === "outbound" ? from + progress * step : from - progress * step;
}

export default function App() {
  const serverUrl = useMemo(resolveServerUrl, []);
  // The view is a host-role client: it only listens, and it never counts as a seat.
  const c = useCosimoSocket(serverUrl, "host");
  const t = c.telemetry;
  const [lang, setLang] = useState<Locale>(() => (navigator.language.startsWith("en") ? "en" : "de"));
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const L = (de: string, en: string) => (lang === "de" ? de : en);

  if (!t) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--mute)" }}>
        {c.connected ? L("Warte auf Telemetrie …", "Waiting for telemetry …") : L("Verbinde …", "Connecting …")}
      </main>
    );
  }

  const n = t.stops.length;
  const width = PAD * 2 + STOP_GAP * Math.max(1, n - 1);
  const x = (i: number) => PAD + i * STOP_GAP;
  const cabX = PAD + lineProgress(t) * STOP_GAP * (n - 1);
  const outbound = t.position.direction === "outbound";
  const fault = t.faults[0];
  const holding = t.position.phase === "hold";
  const next = t.nextStops[0];
  const occupied = t.occupancy;
  const seats = Array.from({ length: t.capacity }, (_, i) => ({
    live: i < t.seats.liveSessions,
    taken: i < occupied,
  }));

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── header: line, destination, clock ────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          padding: "18px 24px 8px",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--mute)" }}>MONOCAB · {t.line[lang].toUpperCase()}</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 600 }}>
            {outbound ? "→" : "←"} {t.destination[lang]}
            {t.simPaused && <span style={{ color: "var(--mute)", fontSize: 16, marginLeft: 12 }}>⏸ {L("pausiert", "paused")}</span>}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", color: "var(--mute)", fontSize: 14 }}>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 22, color: "var(--ink)" }}>
            {clock.toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={() => setLang((l) => (l === "de" ? "en" : "de"))}
            style={{ background: "none", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 999, padding: "2px 10px", cursor: "pointer", fontSize: 12 }}
          >
            {lang === "de" ? "EN" : "DE"}
          </button>
          <span>{c.connected ? "●" : "○"}</span>
        </div>
      </header>

      {/* ── fault banner ─────────────────────────────────────────── */}
      <div style={{ minHeight: 44, padding: "0 24px" }}>
        {fault && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(240,136,62,0.12)",
              border: "1px solid var(--warn)",
              color: "var(--warn)",
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 14,
            }}
          >
            <span style={{ animation: "pulse 1.2s infinite" }}>⚠</span>
            <span>{fault.cause[lang]}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>
              {Math.floor(fault.remainingSec / 60)}:{String(fault.remainingSec % 60).padStart(2, "0")}
            </span>
            {t.delayMinutes > 0 && <span style={{ opacity: 0.8 }}>· +{t.delayMinutes} min</span>}
          </div>
        )}
      </div>

      {/* ── the line ─────────────────────────────────────────────── */}
      <section style={{ overflowX: "auto", overflowY: "hidden", padding: "24px 0 8px", WebkitOverflowScrolling: "touch" }}>
        <svg width={width} height={200} viewBox={`0 0 ${width} 200`} style={{ display: "block", minWidth: width }}>
          {/* track */}
          <line x1={PAD} y1={110} x2={width - PAD} y2={110} stroke="var(--track)" strokeWidth={6} strokeLinecap="round" />
          {/* travelled part of the current trip, in the direction of travel */}
          <line
            x1={outbound ? PAD : width - PAD}
            y1={110}
            x2={cabX}
            y2={110}
            stroke="var(--accent)"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.55}
          />
          {/* stops */}
          {t.stops.map((s, i) => {
            const here = t.position.phase !== "drive" && t.position.stopIndex === i && t.position.progress === 0;
            const isNext = next?.id === s.id;
            const eta = t.nextStops.find((ns) => ns.id === s.id)?.etaMinutes;
            return (
              <g key={s.id} transform={`translate(${x(i)} 110)`}>
                <circle r={here ? 13 : 9} fill="var(--bg)" stroke={here || isNext ? "var(--accent)" : "var(--ink)"} strokeWidth={3} />
                <text y={-26} textAnchor="middle" fill="var(--ink)" fontSize={15} fontWeight={here ? 700 : 500}>
                  {s.name[lang]}
                </text>
                <text y={38} textAnchor="middle" fill="var(--mute)" fontSize={12} fontVariant="tabular-nums">
                  {eta != null ? (eta === 0 ? L("jetzt", "now") : `${eta} min`) : i === 0 || i === n - 1 ? L("Endhalt", "terminal") : ""}
                </text>
              </g>
            );
          })}
          {/* the cab */}
          <g transform={`translate(${cabX} 110)`} style={{ transition: "transform 900ms linear" }}>
            <rect x={-30} y={-20} width={60} height={34} rx={10} fill={holding ? "var(--warn)" : "var(--accent)"} />
            <rect x={-22} y={-14} width={44} height={14} rx={4} fill="rgba(11,14,19,0.55)" />
            {/* doors */}
            {t.doorsOpen && (
              <>
                <rect x={-34} y={-12} width={4} height={18} fill="var(--ok)" />
                <rect x={30} y={-12} width={4} height={18} fill="var(--ok)" />
              </>
            )}
            <text y={-30} textAnchor="middle" fill="var(--ink)" fontSize={13} fontWeight={600} fontVariant="tabular-nums">
              {fmt(Math.round(t.speedKmh))} km/h
            </text>
            <text y={34} textAnchor="middle" fill={holding ? "var(--warn)" : "var(--mute)"} fontSize={11}>
              {holding ? L("Halt", "held") : t.doorsOpen ? L("Türen offen", "doors open") : outbound ? "→" : "←"}
            </text>
          </g>
        </svg>
      </section>

      {/* ── status row ───────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          padding: "8px 24px 24px",
        }}
      >
        <Tile label={L("Nächster Halt", "Next stop")} value={next ? next.name[lang] : "—"} sub={next ? (next.etaMinutes === 0 ? L("jetzt", "now") : `${next.etaMinutes} min`) : ""} />
        <Tile label={L("Position", "Position")} value={t.location[lang]} />
        <Tile
          label={L("Fahrgäste", "Passengers")}
          value={`${t.occupancy} / ${t.capacity}`}
          sub={
            <span style={{ display: "inline-flex", gap: 4, marginTop: 4 }}>
              {seats.map((s, i) => (
                <span
                  key={i}
                  title={s.live ? L("echter Fahrgast (CoSiMo-Sitz aktiv)", "real rider (live CoSiMo seat)") : s.taken ? L("simuliert", "simulated") : L("frei", "free")}
                  style={{
                    width: 14,
                    height: 18,
                    borderRadius: "4px 4px 2px 2px",
                    background: s.live ? "var(--accent)" : s.taken ? "var(--ink)" : "transparent",
                    border: "1.5px solid var(--ink)",
                    opacity: s.taken ? 1 : 0.35,
                  }}
                />
              ))}
            </span>
          }
        />
        <Tile label={L("Akku", "Battery")} value={`${Math.round(t.batteryPct)} %`} sub={t.batteryPct < 20 ? L("niedrig", "low") : ""} warn={t.batteryPct < 20} />
        <Tile label={L("Verspätung", "Delay")} value={t.delayMinutes > 0 ? `+${t.delayMinutes} min` : L("pünktlich", "on time")} warn={t.delayMinutes > 0} />
      </section>

      {t.notes && (
        <footer style={{ padding: "0 24px 24px", color: "var(--mute)", fontSize: 13 }}>{t.notes[lang]}</footer>
      )}
    </main>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--mute)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, color: warn ? "var(--warn)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub ? <div style={{ fontSize: 13, color: "var(--mute)" }}>{sub}</div> : null}
    </div>
  );
}
