import { useEffect, useMemo, useRef, useState } from "react";
import { Info, LocateFixed, RotateCw, TriangleAlert } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { Brand, Button, Card } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";

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

const STOP_GAP = 1300; // px between stops — the world's scale
const TRACK_Y = 0.5; // the line's vertical position, fraction of the viewport
/** Foreground parallax: layers between camera and track scroll FASTER
 *  than the world (factor > 1) — the classic depth cue. */
const TREES_FACTOR = 1.7;
const GRASS_FACTOR = 2.6;
const TREES_TILE = 2600; // px, one repeat of the tree pattern (sparse)
const GRASS_TILE = 1400;
/** Far background behind the towns: scrolls SLOWER than the world. */
const HILLS_FACTOR = 0.3;
const HILLS_TILE = 2400;
const CAB_W = 220; // the CI drawing's width on screen (1400×760 → keeps ratio)
const CAB_H = Math.round((CAB_W * 760) / 1400);

const INK = "var(--color-ink)";
const MUTE = "var(--color-mute)";
const WARN = "var(--color-warn)";
const OK = "var(--color-ok)";

/**
 * A stop as a small town — three line-art variants in the CI drawing's
 * language (stroke only, round joins), ground at y=0, centred on x=0.
 * Deterministic per stop index so the map is stable.
 */
/** A cheap ground shadow: a radial-gradient ellipse, no filter (filters
 *  re-rasterise every frame while the world scrolls — that was the lag). */
function GroundShadow({ w, h = 10, y = 2 }: { w: number; h?: number; y?: number }) {
  return <ellipse cx={0} cy={y} rx={w / 2} ry={h} fill="url(#ground-shadow)" />;
}

function Town({ variant }: { variant: number }) {
  // silhouettes: one CLOSED path per building/tree, filled — they occlude each
  // other cleanly; details (doors, windows, cross, fence) are stroke-only on top
  const solid = { fill: "var(--color-bg)", stroke: INK, strokeWidth: 3 / 2.25, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const lines = { fill: "none", stroke: INK, strokeWidth: 3 / 2.25, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (variant === 0) {
    // Dorf: house, house, church with tower, a tree
    return (
      <g>
        <GroundShadow w={200} h={7} />
        <g {...solid}>
          <path d="M-84 0 V-38 L-60 -60 L-36 -38 V0 Z" />
          <path d="M-20 0 V-46 L2 -64 L24 -46 V0 Z" />
          <path d="M30 0 V-92 L40 -110 L50 -92 V0 Z" />
          <path d="M72 -26 C56 -26 54 -50 70 -52 C68 -68 90 -68 88 -52 C102 -50 100 -26 84 -26 Z" />
        </g>
        <g {...lines}>
          <path d="M-70 0 V-20 H-56 V0" />
          <path d="M-8 -30 H12 M2 -30 V-16" />
          <path d="M40 -110 V-122 M34 -116 H46" />
          <path d="M40 -60 V-48" />
          <path d="M78 0 V-26" />
        </g>
      </g>
    );
  }
  if (variant === 1) {
    // Stadt: a row of houses of different heights, a lamp post
    return (
      <g>
        <GroundShadow w={200} h={7} />
        <g {...solid}>
          <path d="M-96 0 V-52 L-78 -70 L-60 -52 V0 Z" />
          <path d="M-60 0 V-80 H-32 V-96 H-24 V-80 H-20 V0 Z" />
          <path d="M-20 0 V-62 L1 -78 L22 -62 V0 Z" />
          <path d="M22 0 V-44 L41 -58 L60 -44 V0 Z" />
        </g>
        <g {...lines}>
          <path d="M-84 -30 H-72 M-48 -40 H-34 M-48 -22 H-34 M-8 -36 H8 M34 -22 H48" />
          <path d="M-46 0 V-18 H-34 V0" />
          <path d="M70 0 V-30 M62 -30 H78" />
        </g>
      </g>
    );
  }
  // Weiler: one house, a pine, a round tree, fences
  return (
    <g>
      <GroundShadow w={220} h={7} />
      <g {...solid}>
        <path d="M-84 -28 L-70 -60 L-56 -28 Z" />
        <path d="M-30 0 V-40 L-4 -60 L22 -40 V0 Z" />
        <path d="M50 -24 C36 -24 34 -46 48 -48 C46 -62 66 -62 64 -48 C78 -46 76 -24 62 -24 Z" />
      </g>
      <g {...lines}>
        <path d="M-70 0 V-28" />
        <path d="M-14 0 V-22 H0 V0" />
        <path d="M8 -38 H16" />
        <path d="M50 0 V-24" />
        <path d="M-104 -12 H-90 M-104 -6 H-90 M-100 0 V-16 M-94 0 V-16" />
        <path d="M78 -12 H98 M78 -6 H98 M82 0 V-16 M94 0 V-16" />
      </g>
    </g>
  );
}

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
  const [infoOpen, setInfoOpen] = useState(false);
  const followRef = useRef(true);
  followRef.current = following;
  const ourScroll = useRef(false);
  const targetRef = useRef(0);
  const treesLayer = useRef<SVGGElement>(null);
  const grassLayer = useRef<SVGGElement>(null);
  const hillsLayer = useRef<SVGGElement>(null);

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
      // parallax foreground: shift the repeating patterns against the scroll
      if (el) {
        const sl = el.scrollLeft;
        // GPU transforms on a group of repeated tiles — no re-tiling, no filters
        const shift = (g: SVGGElement | null, f: number, tile: number) => {
          if (g) g.style.transform = `translate3d(${-((sl * f) % tile)}px, 0, 0)`;
        };
        shift(treesLayer.current, TREES_FACTOR, TREES_TILE);
        shift(grassLayer.current, GRASS_FACTOR, GRASS_TILE);
        shift(hillsLayer.current, HILLS_FACTOR, HILLS_TILE);
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

  const tiles = (tile: number) => Math.ceil(vw / tile) + 1;
  const outbound = t.position.direction === "outbound";
  const fault = t.faults[0];
  const holding = t.position.phase === "hold";
  const next = t.nextStops[0];
  const trackY = Math.round(vh * TRACK_Y);

  return (
    <main className="relative h-screen overflow-hidden bg-bg text-ink">
      {/* ── far background: hills + distant trees, behind the towns, slow ── */}
      <svg className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: trackY - 40 }} width="100%" height={trackY - 40} aria-hidden>
        <g ref={hillsLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(HILLS_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * HILLS_TILE} 0)`} fill="var(--color-bg)" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.28}>
              <path d={`M0 ${trackY - 40} C 300 ${trackY - 150}, 700 ${trackY - 170}, 1000 ${trackY - 90} C 1200 ${trackY - 40}, 1350 ${trackY - 40}, 1500 ${trackY - 40}`} />
              <path d={`M1300 ${trackY - 40} C 1600 ${trackY - 130}, 2000 ${trackY - 150}, 2400 ${trackY - 60}`} />
              <path d={`M560 ${trackY - 150} V${trackY - 175} M540 ${trackY - 175} L560 ${trackY - 205} L580 ${trackY - 175} Z`} />
              <path d={`M640 ${trackY - 156} V${trackY - 178} M620 ${trackY - 178} L640 ${trackY - 206} L660 ${trackY - 178} Z`} />
              <path d={`M1880 ${trackY - 132} V${trackY - 154} M1860 ${trackY - 154} L1880 ${trackY - 182} L1900 ${trackY - 154} Z`} />
            </g>
          ))}
        </g>
      </svg>

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
          <defs>
            {/* one soft ground shadow for everything that stands on the line */}
            <radialGradient id="ground-shadow">
              <stop offset="0" stopColor="#181817" stopOpacity="0.28" />
              <stop offset="0.6" stopColor="#181817" stopOpacity="0.10" />
              <stop offset="1" stopColor="#181817" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* track */}
          <line x1={pad} y1={trackY} x2={worldW - pad} y2={trackY} stroke={INK} strokeWidth={3} strokeLinecap="round" />
          {/* stops */}
          {t.stops.map((s, i) => {
            const here = t.position.phase !== "drive" && t.position.stopIndex === i && t.position.progress === 0;
            return (
              <g key={s.id} transform={`translate(${stopX(i)} ${trackY})`}>
                {/* the town stands on the line; the marker below is the halt */}
                <g transform="translate(0 0) scale(2.25)">
                  <Town variant={i % 3} />
                </g>
                <circle r={here ? 9 : 6} fill="var(--color-bg)" stroke={INK} strokeWidth={3} />
                <text y={40} textAnchor="middle" fill={INK} fontSize={22} fontWeight={here ? 700 : 500}>
                  {s.name[lang]}
                </text>
              </g>
            );
          })}
          {/* the cab — the CI drawing (1400×760), sitting on the track; a tap re-centres.
              It faces the direction of travel (the drawing faces right). */}
          <g transform={`translate(${cabX} ${trackY})`} style={{ transition: "transform 900ms linear", cursor: "pointer" }} onClick={recenter}>
            {/* state ring: amber while held at a signal, green while the doors are open */}
            {(holding || t.doorsOpen) && (
              <ellipse cx={0} cy={-18} rx={CAB_W * 0.62} ry={CAB_H * 0.9} fill={holding ? WARN : OK} opacity={0.12} />
            )}
            <g transform={outbound ? undefined : "scale(-1 1)"}>
              <ellipse cx={0} cy={2} rx={CAB_W * 0.5} ry={12} fill="url(#ground-shadow)" />
              <g transform={`translate(${-CAB_W / 2} ${-CAB_H - 8})`}>
                <MonoCab width={CAB_W} height={CAB_H} />
              </g>
            </g>
          </g>
        </svg>
      </div>

      {/* ── foreground parallax: trees (mid), grasses (nearest) — repeated
          tiles moved by GPU transforms; shadows are gradient ellipses ── */}
      <svg className="pointer-events-none fixed inset-x-0 z-sticky overflow-hidden" style={{ top: trackY + 40, height: vh - trackY - 40 }} width="100%" height={vh - trackY - 40} aria-hidden>
        <defs>
          <radialGradient id="fg-ground-shadow">
            <stop offset="0" stopColor="#181817" stopOpacity="0.3" />
            <stop offset="0.6" stopColor="#181817" stopOpacity="0.1" />
            <stop offset="1" stopColor="#181817" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={treesLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(TREES_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * TREES_TILE} 0)`} fill="var(--color-bg)" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx={240} cy={222} rx={70} ry={9} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M240 150 L200 150 L240 60 L280 150 Z" />
              <path d="M240 118 L212 118 L240 60 L268 118" fill="none" />
              <path d="M240 220 V150" fill="none" />
              <ellipse cx={1180} cy={222} rx={80} ry={9} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M1180 220 V160" fill="none" />
              <path d="M1180 160 C1130 160 1122 96 1172 92 C1168 52 1230 52 1226 92 C1276 96 1268 160 1218 160 Z" />
              <ellipse cx={2070} cy={222} rx={60} ry={8} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M2060 220 C2020 220 2016 180 2048 178 C2050 156 2090 156 2092 178 C2124 180 2120 220 2080 220 Z" />
            </g>
          ))}
        </g>
      </svg>
      <svg className="pointer-events-none fixed inset-x-0 bottom-0 z-sticky overflow-hidden" width="100%" height={90} aria-hidden>
        <g ref={grassLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(GRASS_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * GRASS_TILE} 0)`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round">
              <path d="M120 90 C118 70 124 60 122 44" />
              <path d="M134 90 C136 74 130 62 140 50" />
              <path d="M148 90 C146 78 152 70 150 58" />
              <path d="M760 90 C762 68 754 58 764 40" />
              <path d="M774 90 C770 76 778 66 772 52" />
              <path d="M1180 90 C1178 74 1186 66 1182 48" />
              <path d="M1194 90 C1198 80 1190 70 1200 58" />
            </g>
          ))}
        </g>
      </svg>

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
          className="fixed right-6 top-6 z-header rounded-full"
          onClick={recenter}
          aria-label={L("Zum MonoCab zurück", "Back to the MonoCab")}
        >
          <LocateFixed size={16} /> {L("Zum MonoCab", "To the MonoCab")}
        </Button>
      )}

      {/* ── the numbers, on demand: hover (or tap) the info icon ─────── */}
      <div
        className="fixed bottom-5 left-6 z-header"
        onMouseEnter={() => setInfoOpen(true)}
        onMouseLeave={() => setInfoOpen(false)}
      >
        {infoOpen && (
          <div role="tooltip" className="absolute bottom-full left-0 mb-3 w-[280px] rounded-xl border border-line bg-white p-4 shadow-float">
            <dl className="m-0 flex flex-col gap-2 text-sm leading-snug">
              {([
                [L("Tempo", "Speed"), `${fmt(Math.round(t.speedKmh))} km/h${t.simPaused ? ` · ${L("pausiert", "paused")}` : ""}`],
                [L("Richtung", "Heading"), `${outbound ? "→" : "←"} ${t.destination[lang]}`],
                [L("Position", "Position"), t.location[lang]],
                [L("Nächster Halt", "Next stop"), next ? `${next.name[lang]} · ${next.etaMinutes === 0 ? L("jetzt", "now") : `${next.etaMinutes} min`}` : "—"],
                [L("Status", "Status"), holding ? L("Halt am Signal", "held at signal") : t.doorsOpen ? L("Türen offen", "doors open") : L("fährt", "moving")],
                [L("Verspätung", "Delay"), t.delayMinutes > 0 ? `+${t.delayMinutes} min` : L("pünktlich", "on time")],
                [L("Fahrgäste", "Passengers"), `${t.occupancy} / ${t.capacity}`],
                [L("Akku", "Battery"), `${Math.round(t.batteryPct)} %`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-[104px] shrink-0 text-mute">{k}</dt>
                  <dd className="m-0 min-w-0 flex-1 text-ink tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <button
          type="button"
          aria-label={L("Fahrtdaten", "Journey data")}
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((o) => !o)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink shadow-card"
        >
          <Info size={20} />
        </button>
      </div>

      {brand}
      {reloadPanel}
    </main>
  );
}
