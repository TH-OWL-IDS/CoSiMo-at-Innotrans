import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, RotateCw, TriangleAlert } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { Brand, Button, Card } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";
import cabUrl from "./assets/monocab-base.svg";

/**
 * The journey view — the MonoCab's line as one wide horizontal world. The
 * cab sits in the middle of the screen and the line flies past underneath
 * it (stops are 650 px apart, so motion between stops is visible). The
 * world scrolls horizontally: drag or wheel to look ahead, the ↺ button
 * (or a tap on the cab) snaps back to the cab and re-enables following.
 *
 * Read-only: it draws what the hub's journey simulation broadcasts
 * (`telemetry:update`); faults come from the console or the CMS scenario.
 * No header, no cards — the line is the page; the wordmark sits bottom-right.
 */

const STOP_GAP = 650; // px between stops — the world's scale
const TICK = 65; // px between the small distance ticks (10 per stop gap)
const TRACK_Y = 0.5; // the line's vertical position, fraction of the viewport
const CAB_W = 220; // the CI drawing's width on screen (1400×760 → keeps ratio)
const CAB_H = Math.round((CAB_W * 760) / 1400);

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
  const from = stopIndex / (n - 1);
  const step = 1 / (n - 1);
  return direction === "outbound" ? from + progress * step : from - progress * step;
}

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export default function App() {
  const serverUrl = useMemo(resolveServerUrl, []);
  // The view is a host-role client: it only listens, and it never counts as a seat.
  const c = useCosimoSocket(serverUrl, "host", "journey");
  const t = c.telemetry;
  const lang: Locale = useMemo(() => (navigator.language.startsWith("en") ? "en" : "de"), []);
  const L = (de: string, en: string) => (lang === "de" ? de : en);
  const { w: vw, h: vh } = useViewport();

  /* ── follow-the-cab scrolling ─────────────────────────────────────── */
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);
  followRef.current = following;
  const ourScroll = useRef(false);
  const targetRef = useRef(0);

  const n = t?.stops.length ?? 0;
  const pad = vw / 2; // a terminal can sit dead centre too
  const worldW = pad * 2 + STOP_GAP * Math.max(1, n - 1);
  const stopX = (i: number) => pad + i * STOP_GAP;
  const cabX = t ? pad + lineProgress(t) * STOP_GAP * (n - 1) : pad;
  targetRef.current = cabX - vw / 2;

  // Ease the viewport towards the cab every frame while following. Native
  // scrollLeft is the scroll position, so a manual drag simply takes over.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = scroller.current;
      if (el && followRef.current) {
        const cur = el.scrollLeft;
        const next = cur + (targetRef.current - cur) * 0.12;
        if (Math.abs(next - cur) > 0.2) {
          ourScroll.current = true;
          el.scrollLeft = next;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Any scroll we did not cause = the visitor is looking around → stop following.
  const onScroll = () => {
    if (ourScroll.current) {
      ourScroll.current = false;
      return;
    }
    if (followRef.current) setFollowing(false);
  };
  const recenter = () => setFollowing(true);

  // A console reset everything → this view should reload for a fresh state.
  const reloadPanel = c.reloadRequired && (
    <div role="alertdialog" aria-modal="true" aria-label={L("Bitte neu laden", "Please reload")} className="fixed inset-0 z-drawer flex items-center justify-center bg-ink/20 p-6">
      <Card className="w-[min(420px,100%)] items-start gap-4">
        <span className="text-2xl font-black">{L("Bitte neu laden", "Please reload")}</span>
        <p className="m-0 text-md text-mute">
          {L(
            "Die Konsole hat alles zurückgesetzt. Diese Ansicht zeigt möglicherweise alten Stand.",
            "The console reset everything. This view may be showing stale state.",
          )}
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RotateCw size={15} /> {L("Neu laden", "Reload")}
        </Button>
      </Card>
    </div>
  );

  /* ── the wordmark, bottom right, on every screen ───────────────────── */
  const brand = (
    <div className="pointer-events-none fixed bottom-5 right-6 z-header text-ink">
      <Brand size={36} />
    </div>
  );

  if (!t) {
    return (
      <main className="grid h-screen place-items-center bg-bg text-mute">
        {c.connected ? L("Warte auf Telemetrie …", "Waiting for telemetry …") : L("Verbinde …", "Connecting …")}
        {brand}
        {reloadPanel}
      </main>
    );
  }

  const outbound = t.position.direction === "outbound";
  const fault = t.faults[0];
  const holding = t.position.phase === "hold";
  const next = t.nextStops[0];
  const trackY = Math.round(vh * TRACK_Y);
  const ticks = Math.round((worldW - pad * 2) / TICK);

  return (
    <main className="relative h-screen overflow-hidden bg-bg text-ink">
      {/* ── the world: one wide strip, scrolls horizontally ──────────── */}
      <div
        ref={scroller}
        onScroll={onScroll}
        // intent beats heuristics: a wheel, a finger or a drag means "let me look"
        onWheel={() => followRef.current && setFollowing(false)}
        onTouchStart={() => followRef.current && setFollowing(false)}
        onPointerDown={(e) => e.pointerType === "mouse" && e.buttons === 1 && followRef.current && setFollowing(false)}
        className="no-scrollbar h-full w-full overflow-x-auto overflow-y-hidden"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        <svg width={worldW} height={vh} viewBox={`0 0 ${worldW} ${vh}`} className="block font-mono" style={{ minWidth: worldW }}>
          {/* distance ticks — the "background" that flies by between stops */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const tx = pad + i * TICK;
            const major = i % 10 === 0;
            return major ? null : (
              <line key={i} x1={tx} y1={trackY - 6} x2={tx} y2={trackY + 6} stroke={LINE} strokeWidth={1.5} opacity={0.6} />
            );
          })}
          {/* track */}
          <line x1={pad} y1={trackY} x2={worldW - pad} y2={trackY} stroke={LINE} strokeWidth={6} strokeLinecap="round" />
          {/* travelled part of the current trip, in the direction of travel */}
          <line
            x1={outbound ? pad : worldW - pad}
            y1={trackY}
            x2={cabX}
            y2={trackY}
            stroke={ACCENT}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.45}
          />
          {/* stops */}
          {t.stops.map((s, i) => {
            const here = t.position.phase !== "drive" && t.position.stopIndex === i && t.position.progress === 0;
            const isNext = next?.id === s.id;
            const eta = t.nextStops.find((ns) => ns.id === s.id)?.etaMinutes;
            return (
              <g key={s.id} transform={`translate(${stopX(i)} ${trackY})`}>
                <circle r={here ? 16 : 11} fill="var(--color-bg)" stroke={here || isNext ? ACCENT : INK} strokeWidth={3.5} />
                <text y={-40} textAnchor="middle" fill={INK} fontSize={22} fontWeight={here ? 700 : 500}>
                  {s.name[lang]}
                </text>
                <text y={52} textAnchor="middle" fill={MUTE} fontSize={15} fontVariant="tabular-nums">
                  {eta != null ? (eta === 0 ? L("jetzt", "now") : `${eta} min`) : i === 0 || i === n - 1 ? L("Endhalt", "terminal") : ""}
                </text>
              </g>
            );
          })}
          {/* the cab — the CI drawing (1400×760), sitting on the track; a tap re-centres.
              It faces the direction of travel (the drawing faces right). */}
          <g transform={`translate(${cabX} ${trackY})`} style={{ transition: "transform 900ms linear", cursor: "pointer" }} onClick={recenter}>
            {/* state ring: amber while held at a signal, green while the doors are open */}
            {(holding || t.doorsOpen) && (
              <ellipse cx={0} cy={0} rx={CAB_W * 0.62} ry={CAB_H * 0.9} fill={holding ? WARN : OK} opacity={0.12} />
            )}
            <g transform={outbound ? undefined : "scale(-1 1)"}>
              <image href={cabUrl} x={-CAB_W / 2} y={-CAB_H + 10} width={CAB_W} height={CAB_H} />
            </g>
            <text y={-CAB_H - 8} textAnchor="middle" fill={INK} fontSize={18} fontWeight={600} fontVariant="tabular-nums">
              {fmt(Math.round(t.speedKmh))} km/h{t.simPaused ? ` · ${L("pausiert", "paused")}` : ""}
            </text>
            <text y={34} textAnchor="middle" fill={holding ? WARN : MUTE} fontSize={15}>
              {holding ? L("Halt", "held") : t.doorsOpen ? L("Türen offen", "doors open") : outbound ? `→ ${t.destination[lang]}` : `← ${t.destination[lang]}`}
            </text>
          </g>
        </svg>
      </div>

      {/* ── fault, quietly at the top — the cab already turned amber ── */}
      {fault && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-header flex -translate-x-1/2 items-center gap-3 rounded-full border border-warn bg-white px-4 py-2 text-base text-warn shadow-card">
          <TriangleAlert size={16} style={{ animation: "pulse 1.2s infinite" }} />
          <span className="text-ink">{fault.cause[lang]}</span>
          <span className="tabular-nums">
            {Math.floor(fault.remainingSec / 60)}:{String(fault.remainingSec % 60).padStart(2, "0")}
          </span>
          {t.delayMinutes > 0 && <span>· +{t.delayMinutes} min</span>}
        </div>
      )}

      {/* ── back to the cab (only while the visitor looked away) ───── */}
      {!following && (
        <Button
          variant="primary"
          className="fixed bottom-5 left-6 z-header rounded-full"
          onClick={recenter}
          aria-label={L("Zum MonoCab zurück", "Back to the MonoCab")}
        >
          <LocateFixed size={16} /> {L("Zum MonoCab", "To the MonoCab")}
        </Button>
      )}

      {brand}
      {reloadPanel}
    </main>
  );
}
