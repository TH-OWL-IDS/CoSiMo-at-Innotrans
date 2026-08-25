import { useEffect, useMemo, useState } from "react";
import { BatteryMedium, Clock, Flag, MapPin, TriangleAlert, Users } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { Banner, Brand, Button, Dot, Eyebrow, SeatGlyph, StatTile, cn } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";

/**
 * The journey view — the MonoCab's line as a horizontal diagram, the cab
 * moving along it in real time, out and back. Read-only: it draws what the
 * hub's journey simulation broadcasts (`telemetry:update`, global state);
 * faults are injected from the operator console or the CMS scenario.
 *
 * Layout: stops left → right in outbound order; the return trip runs right →
 * left on the same line (the cab flips). On a narrow screen the diagram keeps
 * its width and scrolls horizontally — a line is a line. Same white CI and
 * tokens as the console (@cosimo/ui); the SVG reads the same variables.
 */

const STOP_GAP = 220; // px between stops — the diagram's "scale"
const PAD = 80;

const INK = "var(--color-ink)";
const MUTE = "var(--color-mute)";
const LINE = "var(--color-line)";
const ACCENT = "var(--color-accent)";
const WARN = "var(--color-warn)";
const OK = "var(--color-ok)";

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
      <main className="grid min-h-screen place-items-center bg-bg text-mute">
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
    <main className="flex min-h-screen flex-col bg-bg text-ink">
      {/* ── header: wordmark, line + destination, clock ───────────── */}
      <header className="relative z-header flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-6 py-2.5 shadow-card">
        <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Fahrt">
          <Brand />
        </h1>
        <div className="text-center">
          <Eyebrow size="xs" className="justify-center">MonoCab · {t.line[lang]}</Eyebrow>
          <div className="mt-0.5 text-2xl font-semibold">
            {outbound ? "→" : "←"} {t.destination[lang]}
            {t.simPaused && <span className="ml-3 text-lg font-medium text-mute">⏸ {L("pausiert", "paused")}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-base text-mute">
          <span className="text-2xl tabular-nums text-ink">
            {clock.toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button size="xs" variant="outline" className="rounded-full" onClick={() => setLang((l) => (l === "de" ? "en" : "de"))} aria-label={L("Sprache wechseln", "switch language")}>
            {lang === "de" ? "EN" : "DE"}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-sm" title={c.connected ? L("verbunden", "connected") : L("getrennt", "disconnected")}>
            <Dot state={c.connected ? "ok" : "down"} />
            <span className="sr-only">{c.connected ? L("verbunden", "connected") : L("getrennt", "disconnected")}</span>
          </span>
        </div>
      </header>

      {/* ── fault banner ─────────────────────────────────────────── */}
      <div className="min-h-11 px-6 pt-4">
        {fault && (
          <Banner>
            <TriangleAlert size={16} style={{ animation: "pulse 1.2s infinite" }} />
            <span>{fault.cause[lang]}</span>
            <span className="tabular-nums opacity-85">
              {Math.floor(fault.remainingSec / 60)}:{String(fault.remainingSec % 60).padStart(2, "0")}
            </span>
            {t.delayMinutes > 0 && <span className="opacity-85">· +{t.delayMinutes} min</span>}
          </Banner>
        )}
      </div>

      {/* ── the line ─────────────────────────────────────────────── */}
      <section className="overflow-x-auto overflow-y-hidden pb-2 pt-6" style={{ WebkitOverflowScrolling: "touch" }}>
        <svg width={width} height={200} viewBox={`0 0 ${width} 200`} className="block font-mono" style={{ minWidth: width }}>
          {/* track */}
          <line x1={PAD} y1={110} x2={width - PAD} y2={110} stroke={LINE} strokeWidth={6} strokeLinecap="round" />
          {/* travelled part of the current trip, in the direction of travel */}
          <line
            x1={outbound ? PAD : width - PAD}
            y1={110}
            x2={cabX}
            y2={110}
            stroke={ACCENT}
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
                <circle r={here ? 13 : 9} fill="var(--color-bg)" stroke={here || isNext ? ACCENT : INK} strokeWidth={3} />
                <text y={-26} textAnchor="middle" fill={INK} fontSize={15} fontWeight={here ? 700 : 500}>
                  {s.name[lang]}
                </text>
                <text y={38} textAnchor="middle" fill={MUTE} fontSize={12} fontVariant="tabular-nums">
                  {eta != null ? (eta === 0 ? L("jetzt", "now") : `${eta} min`) : i === 0 || i === n - 1 ? L("Endhalt", "terminal") : ""}
                </text>
              </g>
            );
          })}
          {/* the cab */}
          <g transform={`translate(${cabX} 110)`} style={{ transition: "transform 900ms linear" }}>
            <rect x={-30} y={-20} width={60} height={34} rx={10} fill={holding ? WARN : ACCENT} />
            <rect x={-22} y={-14} width={44} height={14} rx={4} fill="rgba(255,255,255,0.55)" />
            {/* doors */}
            {t.doorsOpen && (
              <>
                <rect x={-34} y={-12} width={4} height={18} fill={OK} />
                <rect x={30} y={-12} width={4} height={18} fill={OK} />
              </>
            )}
            <text y={-30} textAnchor="middle" fill={INK} fontSize={13} fontWeight={600} fontVariant="tabular-nums">
              {fmt(Math.round(t.speedKmh))} km/h
            </text>
            <text y={34} textAnchor="middle" fill={holding ? WARN : MUTE} fontSize={11}>
              {holding ? L("Halt", "held") : t.doorsOpen ? L("Türen offen", "doors open") : outbound ? "→" : "←"}
            </text>
          </g>
        </svg>
      </section>

      {/* ── status row ───────────────────────────────────────────── */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 px-6 pb-6 pt-2">
        <StatTile icon={Flag} label={L("Nächster Halt", "Next stop")} value={next ? next.name[lang] : "—"} sub={next ? (next.etaMinutes === 0 ? L("jetzt", "now") : `${next.etaMinutes} min`) : ""} />
        <StatTile icon={MapPin} label={L("Position", "Position")} value={t.location[lang]} />
        <StatTile
          icon={Users}
          label={L("Fahrgäste", "Passengers")}
          value={`${t.occupancy} / ${t.capacity}`}
          sub={
            <span className="mt-1 inline-flex gap-1">
              {seats.map((s, i) => (
                <SeatGlyph
                  key={i}
                  state={s.live ? "live" : s.taken ? "taken" : "free"}
                  title={s.live ? L("echter Fahrgast (CoSiMo-Sitz aktiv)", "real rider (live CoSiMo seat)") : s.taken ? L("simuliert", "simulated") : L("frei", "free")}
                />
              ))}
            </span>
          }
        />
        <StatTile icon={BatteryMedium} label={L("Akku", "Battery")} value={`${Math.round(t.batteryPct)} %`} sub={t.batteryPct < 20 ? L("niedrig", "low") : ""} warn={t.batteryPct < 20} />
        <StatTile icon={Clock} label={L("Verspätung", "Delay")} value={t.delayMinutes > 0 ? `+${t.delayMinutes} min` : L("pünktlich", "on time")} warn={t.delayMinutes > 0} />
      </section>

      {t.notes && (
        <footer className={cn("px-6 pb-6 text-md text-mute")}>{t.notes[lang]}</footer>
      )}
    </main>
  );
}
