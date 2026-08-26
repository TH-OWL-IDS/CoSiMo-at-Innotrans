import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, LocateFixed, RotateCw, TriangleAlert } from "lucide-react";
import type { Locale, MonoCabTelemetry } from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { Brand, Button, Card, cn } from "@cosimo/ui";
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

/** The line's scale: distance between stops is proportional to the travel
 *  time between them (3 px per second of driving; at least MIN_GAP). */
const PX_PER_SEC = 15;
const MIN_GAP = 500;
const TRACK_Y = 0.5; // the line's vertical position, fraction of the viewport
/** Foreground parallax: layers between camera and track scroll FASTER
 *  than the world (factor > 1) — the classic depth cue. */
const TREES_FACTOR = 1.7;
/** Small grass right under the track: between the world and the trees. */
const VERGE_FACTOR = 1.12;
const VERGE_TILE = 900;
/** Small bushes in front of the verge, behind the trees. */
const BUSH_FACTOR = 1.3; // 1.18 × 1.1
const BUSH_TILE = 1100;
const GRASS_FACTOR = 2.6;
const TREES_TILE = 2600; // px, one repeat of the tree pattern (sparse), before scale
const TREES_SCALE = 1.5; // the tile is drawn 1.5× (ground stays put)
const GRASS_TILE = 1400;
/** Far background behind the towns: three hill ranges, each slower than
 *  the world and slower the farther away — filled, fading with distance. */
const HILLS = [
  { factor: 0.18, tile: 2600, opacity: 0.14 }, // far
  { factor: 0.3, tile: 2400, opacity: 0.22 }, // mid
  { factor: 0.46, tile: 2200, opacity: 0.32 }, // near
] as const;
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

/** A hill crest as cubic Bézier segments, y relative to the ground line
 *  (negative = up). Gives both the path and an exact height sampler, so
 *  trees stand ON the crest instead of floating near it. */
type Seg = [number, number, number, number, number, number, number, number]; // x0 y0 c1x c1y c2x c2y x1 y1
function hillPath(segs: Seg[], B: number): string {
  const [x0, y0] = segs[0]!;
  return `M${x0} ${B + y0} ` + segs.map((g) => `C ${g[2]} ${B + g[3]}, ${g[4]} ${B + g[5]}, ${g[6]} ${B + g[7]}`).join(" ");
}
function hillY(segs: Seg[], x: number): number {
  const g = segs.find((q) => x >= q[0] && x <= q[6]) ?? segs[segs.length - 1]!;
  const bx = (t: number) => (1 - t) ** 3 * g[0] + 3 * (1 - t) ** 2 * t * g[2] + 3 * (1 - t) * t ** 2 * g[4] + t ** 3 * g[6];
  const by = (t: number) => (1 - t) ** 3 * g[1] + 3 * (1 - t) ** 2 * t * g[3] + 3 * (1 - t) * t ** 2 * g[5] + t ** 3 * g[7];
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid; else hi = mid;
  }
  return by((lo + hi) / 2);
}
const HILL_FAR: Seg[] = [[0, 0, 400, -230, 900, -260, 1300, -150], [1300, -150, 1700, -40, 2100, -200, 2600, -120]];
const HILL_MID: Seg[] = [[0, 0, 260, -150, 560, -170, 900, -90], [900, -90, 1100, -40, 1250, -60, 1500, -130], [1500, -130, 1800, -200, 2100, -150, 2400, -80]];
const HILL_NEAR: Seg[] = [[0, 0, 200, -70, 450, -110, 700, -60], [700, -60, 900, -20, 1000, -30, 1200, -80], [1200, -80, 1450, -140, 1750, -100, 2000, -40], [2000, -40, 2100, -15, 2150, -15, 2200, -30]];

/** Tallest point of each town variant in its own coordinates (for the name above). */
const TOWN_HEIGHT = [122, 96, 60];

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

/**
 * The MonoCab CI drawing, inlined so it can carry a fill. The viewBox is the
 * artwork's (1400×760); on screen it is CAB_W wide, so the stroke is scaled
 * to read exactly like the towns' 3 px lines. Its shadow is a gradient
 * ellipse on the track (drawn by the caller) — no filter.
 */
function MonoCab({ width, height }: { width: number; height: number }) {
  const stroke = 3 / (width / 1400);
  return (
    <svg viewBox="0 0 1400 760" width={width} height={height} overflow="visible" style={{ overflow: "visible" }}>
      <g fill="#ffffff" stroke={INK} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {/* chassis first, so the cabin body overlaps its top edge */}
        <path fill="#f6f6f6" d="M171 594 Q183 610 214 614 L1186 614 Q1217 610 1229 594 L1247 630 Q1253 644 1245 660 Q1237 678 1212 686 Q1186 694 1154 694 L247 694 Q215 694 189 686 Q164 678 156 660 Q148 644 154 630 Z" />
        <path d="M165 540 L177 395 Q185 320 268 287 Q322 265 400 258 L1000 258 Q1078 265 1132 287 Q1215 320 1223 395 L1235 540 Q1238 576 1208 594 L191 594 Q162 576 165 540 Z" />
      </g>
      <g fill="none" stroke={INK} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d="M278 694 Q334 702 402 702 L998 702 Q1066 702 1122 694" />
        <path d="M345 257 L448 223 L603 223 L614 257" />
        <path d="M786 257 L797 223 L952 223 L1055 257" />
      </g>
    </svg>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE");
}

/** World x of every stop: cumulative travel time, scaled. */
function stopPositions(t: MonoCabTelemetry, pad: number): number[] {
  const xs: number[] = [];
  let x = pad;
  t.stops.forEach((s, i) => {
    if (i > 0) x += Math.max(MIN_GAP, s.travelSecondsFromPrev * PX_PER_SEC);
    xs.push(x);
  });
  return xs;
}

/** World x of the cab: between the stop it is at/just left and the next one
 *  in its direction of travel, by the sim's leg progress. */
function cabPosition(t: MonoCabTelemetry, xs: number[]): number {
  const { stopIndex, progress, direction } = t.position;
  const here = xs[stopIndex] ?? xs[0] ?? 0;
  const nextIdx = direction === "outbound" ? stopIndex + 1 : stopIndex - 1;
  const next = xs[nextIdx];
  return next == null ? here : here + (next - here) * progress;
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
  const worldSvg = useRef<SVGSVGElement>(null);
  const [following, setFollowing] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const followRef = useRef(true);
  followRef.current = following;
  /** Virtual scroll offset in world px — fractional, applied as a transform
   *  (native scrollLeft is integer-quantised and stutters against the
   *  sub-pixel cab). */
  const offset = useRef(0);
  const worldWRef = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);
  /** A "go there" animation target (the off-screen stop arrows). */
  const goal = useRef<number | null>(null);
  /** Low-rate copy of the offset for React (the off-screen arrows). */
  const [viewX, setViewX] = useState(0);
  const lastViewPush = useRef(0);
  const cabGroup = useRef<SVGGElement>(null);
  /** Where telemetry says the cab is (world x) and where we draw it (eased). */
  const cabTarget = useRef(0);
  const cabSmooth = useRef<number | null>(null);
  /** Dead reckoning: the last telemetry sample and the velocity it implied. */
  const sample = useRef<{ x: number; at: number } | null>(null);
  const velocity = useRef(0); // world px per ms
  const lastFrame = useRef(0);
  const trackYRef = useRef(0);
  const vwRef = useRef(0);
  const treesLayer = useRef<SVGGElement>(null);
  const vergeLayer = useRef<SVGGElement>(null);
  const bushLayer = useRef<SVGGElement>(null);
  const grassLayer = useRef<SVGGElement>(null);
  const hillLayers = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];

  const pad = vw / 2; // a terminal can sit dead centre too
  const xs = t ? stopPositions(t, pad) : [pad];
  const worldW = (xs[xs.length - 1] ?? pad) + pad;
  const stopX = (i: number) => xs[i] ?? pad;
  const cabX = t ? cabPosition(t, xs) : pad;
  if (t && cabTarget.current !== cabX) {
    // a new sample: velocity from the last one (0 when the sim stands still)
    const now = performance.now();
    const prev = sample.current;
    if (prev && now - prev.at > 50) velocity.current = (cabX - prev.x) / (now - prev.at);
    sample.current = { x: cabX, at: now };
  } else if (t && sample.current && performance.now() - sample.current.at > 4000) {
    velocity.current = 0; // no movement reported for a while — we are standing
  }
  cabTarget.current = cabX;
  if (cabSmooth.current === null && t) cabSmooth.current = cabX;
  vwRef.current = vw;
  worldWRef.current = worldW;

  // Ease the viewport towards the cab every frame while following. Native
  // scrollLeft is the scroll position, so a manual drag simply takes over.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = scroller.current;
      // The cab moves by dead reckoning every frame; while following, the
      // viewport is pinned to it — the cab stands still in the middle and
      // the world glides (as a fractional transform, never a scroll).
      if (cabSmooth.current !== null) {
        const now = performance.now();
        const dt = lastFrame.current ? Math.min(50, now - lastFrame.current) : 16;
        lastFrame.current = now;
        // where the sim would be right now, if it kept the last velocity
        const predicted = cabTarget.current + velocity.current * (now - (sample.current?.at ?? now));
        // advance at that velocity, and correct the drift softly (no jumps)
        const sm = cabSmooth.current + velocity.current * dt + (predicted - cabSmooth.current) * 0.03;
        cabSmooth.current = sm;
        // a little bounce while rolling: amplitude grows with speed, a hair of
        // roll with it — none at all when standing
        const speed = Math.min(1, Math.abs(velocity.current) / 0.02);
        const bob = speed ? Math.sin(now / 90) * 2.2 * speed + Math.sin(now / 230) * 0.8 * speed : 0;
        const roll = speed ? Math.sin(now / 140) * 0.6 * speed : 0;
        cabGroup.current?.setAttribute("transform", `translate(${sm} ${trackYRef.current + bob}) rotate(${roll})`);
        if (followRef.current) offset.current = sm - vwRef.current / 2;
      }
      // "go there": glide the view towards a stop (arrow click)
      if (goal.current !== null && !followRef.current) {
        offset.current += (goal.current - offset.current) * 0.08;
        if (Math.abs(goal.current - offset.current) < 0.5) goal.current = null;
      }
      if (el) {
        const maxOff = Math.max(0, worldWRef.current - vwRef.current);
        offset.current = Math.max(0, Math.min(maxOff, offset.current));
        const sl = offset.current;
        if (worldSvg.current) worldSvg.current.style.transform = `translate3d(${-sl}px, 0, 0)`;
        const now2 = performance.now();
        if (now2 - lastViewPush.current > 120) {
          lastViewPush.current = now2;
          setViewX(sl);
        }
        // GPU transforms on a group of repeated tiles — no re-tiling, no filters
        const shift = (g: SVGGElement | null, f: number, tile: number) => {
          if (g) g.style.transform = `translate3d(${-((sl * f) % tile)}px, 0, 0)`;
        };
        shift(vergeLayer.current, VERGE_FACTOR, VERGE_TILE);
        shift(bushLayer.current, BUSH_FACTOR, BUSH_TILE);
        shift(treesLayer.current, TREES_FACTOR, TREES_TILE * TREES_SCALE);
        shift(grassLayer.current, GRASS_FACTOR, GRASS_TILE);
        HILLS.forEach((h, i) => shift(hillLayers[i]!.current, h.factor, h.tile));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Looking around: wheel or drag moves the virtual offset and stops following.
  const lookAround = (dx: number) => {
    if (!dx) return;
    goal.current = null;
    offset.current += dx;
    if (followRef.current) setFollowing(false);
  };
  const onWheel = (e: React.WheelEvent) => lookAround(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, start: offset.current };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = drag.current.x - e.clientX;
    if (Math.abs(dx) < 3 && followRef.current) return; // a tap, not a drag
    goal.current = null;
    offset.current = drag.current.start + dx;
    if (followRef.current) setFollowing(false);
  };
  const onPointerUp = () => { drag.current = null; };
  const recenter = () => { goal.current = null; setFollowing(true); };
  /** Glide the view to a stop's world x (centred). */
  const goTo = (x: number) => { setFollowing(false); goal.current = x - vwRef.current / 2; };

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
  trackYRef.current = trackY;

  return (
    <main className="relative isolate h-screen overflow-hidden bg-bg text-ink">
      {/* ── far background: three rolling hill ranges, each its own parallax
          speed and opacity — filled so they layer, softer the farther away ── */}
      {HILLS.map((h, i) => {
        const B = trackY - 40; // the layers' shared ground line
        // a hill: the area filled without a stroke, the crest stroked alone —
        // so the ground edge never shows as a line
        const Hill = ({ crest }: { crest: string }) => (
          <>
            <path d={`${crest} V${B} H0 Z`} stroke="none" />
            <path d={crest} fill="none" />
          </>
        );
        return (
          <svg key={i} className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden" style={{ height: B }} width="100%" height={B} aria-hidden>
            <g ref={hillLayers[i]} style={{ willChange: "transform" }}>
              {Array.from({ length: tiles(h.tile) }, (_, k) => (
                <g key={k} transform={`translate(${k * h.tile} 0)`} fill="var(--color-bg)" stroke={INK} strokeOpacity={h.opacity} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {i === 0 && <Hill crest={hillPath(HILL_FAR, B)} />}
                  {i === 1 && (
                    <>
                      <Hill crest={hillPath(HILL_MID, B)} />
                      {/* a tree line ON the crest */}
                      {[520, 600, 680, 1620, 1700, 1780, 1860].map((x) => {
                        const y = B + hillY(HILL_MID, x);
                        return <path key={x} d={`M${x} ${y} L${x - 9} ${y} L${x} ${y - 22} L${x + 9} ${y} Z`} />;
                      })}
                    </>
                  )}
                  {i === 2 && (
                    <>
                      <Hill crest={hillPath(HILL_NEAR, B)} />
                      {/* pines + an oak, each standing on the sampled crest */}
                      {[380, 410, 1480].map((x) => {
                        const y = B + hillY(HILL_NEAR, x);
                        return (
                          <g key={x}>
                            <path d={`M${x} ${y} V${y - 16}`} fill="none" />
                            <path d={`M${x - 14} ${y - 16} L${x} ${y - 44} L${x + 14} ${y - 16} Z`} />
                          </g>
                        );
                      })}
                      {(() => {
                        const x = 1526, y = B + hillY(HILL_NEAR, x);
                        return (
                          <g>
                            <path d={`M${x} ${y} V${y - 14}`} fill="none" />
                            <path d={`M${x - 6} ${y - 14} C${x - 26} ${y - 14} ${x - 28} ${y - 38} ${x - 10} ${y - 40} C${x - 12} ${y - 54} ${x + 12} ${y - 54} ${x + 10} ${y - 40} C${x + 28} ${y - 38} ${x + 26} ${y - 14} ${x + 6} ${y - 14} Z`} />
                          </g>
                        );
                      })()}
                      {/* the fence on the flat, on the crest too */}
                      {(() => {
                        const y = B + hillY(HILL_NEAR, 2050);
                        return <path fill="none" d={`M2000 ${y - 14} H2100 M2000 ${y - 7} H2100 M2020 ${y} V${y - 20} M2050 ${y} V${y - 20} M2080 ${y} V${y - 20}`} />;
                      })()}
                    </>
                  )}
                </g>
              ))}
            </g>
          </svg>
        );
      })}

      {/* ── the world: one wide strip, scrolls horizontally ──────────── */}
      <div
        ref={scroller}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // positioned + above the far background (a positioned sibling would otherwise paint over it)
        className="relative z-[1] h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <svg ref={worldSvg} width={worldW} height={vh} viewBox={`0 0 ${worldW} ${vh}`} className="block font-mono" style={{ minWidth: worldW, willChange: "transform" }}>
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
                <text y={-(TOWN_HEIGHT[i % 3]! * 2.25) - 26} textAnchor="middle" fill={INK} fontSize={22} fontWeight={here ? 700 : 500}>
                  {s.name[lang]}
                </text>
              </g>
            );
          })}
          {/* the cab — the CI drawing (1400×760), sitting on the track; a tap re-centres.
              It faces the direction of travel (the drawing faces right). */}
          <g ref={cabGroup} transform={`translate(${cabSmooth.current ?? cabX} ${trackY})`} style={{ cursor: "pointer" }} onClick={recenter}>
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

      {/* ── verge: small grass just below the track, a touch faster than the world ── */}
      <svg className="pointer-events-none fixed inset-x-0 z-sticky overflow-hidden" style={{ top: trackY + 14, height: 24 }} width="100%" height={24} aria-hidden>
        <defs>
          <radialGradient id="verge-shadow">
            <stop offset="0" stopColor="#181817" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="#181817" stopOpacity="0.1" />
            <stop offset="1" stopColor="#181817" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={vergeLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(VERGE_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * VERGE_TILE} 0)`} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round">
              <ellipse cx={44} cy={22} rx={16} ry={3} fill="url(#verge-shadow)" stroke="none" />
              <ellipse cx={307} cy={22} rx={20} ry={3} fill="url(#verge-shadow)" stroke="none" />
              <ellipse cx={624} cy={22} rx={16} ry={3} fill="url(#verge-shadow)" stroke="none" />
              <ellipse cx={851} cy={22} rx={12} ry={3} fill="url(#verge-shadow)" stroke="none" />
              <path d="M40 22 C39 16 42 13 41 8" />
              <path d="M47 22 C48 17 45 14 49 10" />
              <path d="M300 22 C299 16 303 13 302 8" />
              <path d="M307 22 C308 17 305 14 309 11" />
              <path d="M313 22 C312 18 315 15 314 12" />
              <path d="M620 22 C619 16 623 13 622 8" />
              <path d="M627 22 C628 17 625 14 629 11" />
              <path d="M850 22 C849 17 852 14 851 10" />
            </g>
          ))}
        </g>
      </svg>

      {/* ── bushes: small, lumpy, in front of the verge grass ──────────── */}
      <svg className="pointer-events-none fixed inset-x-0 z-sticky overflow-hidden" style={{ top: trackY + 126, height: 64 }} width="100%" height={64} aria-hidden>
        <defs>
          <radialGradient id="bush-shadow">
            <stop offset="0" stopColor="#181817" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="#181817" stopOpacity="0.1" />
            <stop offset="1" stopColor="#181817" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={bushLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(BUSH_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * BUSH_TILE} 0)`} fill="var(--color-bg)" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx={146} cy={60} rx={44} ry={4} fill="url(#bush-shadow)" stroke="none" />
              <path d="M120 58 C104 58 100 40 116 36 C114 24 134 20 142 30 C150 18 172 22 172 34 C188 34 190 56 172 58 Z" />
              <path fill="none" d="M128 44 C134 38 142 40 146 46 M156 40 C160 34 168 36 170 42" />
              <ellipse cx={624} cy={60} rx={34} ry={4} fill="url(#bush-shadow)" stroke="none" />
              <path d="M600 58 C588 58 586 44 598 42 C598 30 618 28 624 36 C634 28 650 34 648 44 C660 46 658 58 646 58 Z" />
              <path fill="none" d="M610 48 C616 42 624 44 628 50" />
              <ellipse cx={944} cy={60} rx={44} ry={4} fill="url(#bush-shadow)" stroke="none" />
              <path d="M970 58 C986 58 990 40 974 36 C976 24 956 20 948 30 C940 18 918 22 918 34 C902 34 900 56 918 58 Z" />
              <path fill="none" d="M962 44 C956 38 948 40 944 46 M934 40 C930 34 922 36 920 42" />
            </g>
          ))}
        </g>
      </svg>

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
          {/* scaled about the ground line (tile y=220), so the trees grow upwards */}
          <g transform={`translate(0 ${220 * TREES_SCALE}) scale(${TREES_SCALE}) translate(0 -220)`}>
          {Array.from({ length: tiles(TREES_TILE * TREES_SCALE) }, (_, k) => (
            <g key={k} transform={`translate(${k * TREES_TILE} 0)`} fill="var(--color-bg)" stroke={INK} strokeWidth={3.5 / TREES_SCALE} strokeLinecap="round" strokeLinejoin="round">
              {/* pine: trunk behind, one jagged silhouette, two bough lines inside */}
              <ellipse cx={240} cy={222} rx={70} ry={9} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M234 220 V160 H246 V220 Z" />
              <path d="M240 58 L222 92 L230 90 L206 128 L216 126 L196 158 L210 156 L186 190 L294 190 L272 156 L286 158 L266 126 L276 128 L252 90 L260 92 Z" />
              <path fill="none" d="M214 154 C226 148 254 148 268 154 M218 126 C230 120 252 120 264 126" />
              <path fill="none" d="M246 176 L262 168" />
              {/* oak: forked trunk, lumpy crown with inner foliage, a knot */}
              <ellipse cx={1180} cy={222} rx={82} ry={9} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M1170 220 L1172 176 Q1180 168 1188 176 L1190 220 Z" />
              <path fill="none" d="M1180 176 L1164 156 M1181 178 L1198 160 M1184 198 C1181 200 1181 204 1184 206" />
              <path d="M1130 150 C1112 150 1108 122 1128 118 C1122 96 1150 86 1162 100 C1170 78 1204 80 1206 102 C1230 96 1244 122 1226 134 C1246 146 1232 172 1210 164 C1204 184 1170 186 1160 168 C1140 178 1124 166 1130 150 Z" />
              <path fill="none" d="M1150 132 C1156 124 1168 124 1174 130 M1192 118 C1200 112 1210 116 1212 126 M1166 156 C1174 150 1186 152 1190 160" />
              <ellipse cx={2070} cy={222} rx={60} ry={8} fill="url(#fg-ground-shadow)" stroke="none" />
              <path d="M2060 220 C2020 220 2016 180 2048 178 C2050 156 2090 156 2092 178 C2124 180 2120 220 2080 220 Z" />
            </g>
          ))}
          </g>
        </g>
      </svg>
      <svg className="pointer-events-none fixed inset-x-0 bottom-0 z-sticky overflow-hidden" width="100%" height={90} aria-hidden>
        <defs>
          <radialGradient id="grass-shadow">
            <stop offset="0" stopColor="#181817" stopOpacity="0.3" />
            <stop offset="0.6" stopColor="#181817" stopOpacity="0.1" />
            <stop offset="1" stopColor="#181817" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={grassLayer} style={{ willChange: "transform" }}>
          {Array.from({ length: tiles(GRASS_TILE) }, (_, k) => (
            <g key={k} transform={`translate(${k * GRASS_TILE} 0)`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round">
              <ellipse cx={134} cy={88} rx={34} ry={5} fill="url(#grass-shadow)" stroke="none" />
              <ellipse cx={767} cy={88} rx={26} ry={5} fill="url(#grass-shadow)" stroke="none" />
              <ellipse cx={1187} cy={88} rx={26} ry={5} fill="url(#grass-shadow)" stroke="none" />
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

      {/* ── off-screen neighbours: the stop just behind and the one ahead,
          as arrows at the edge; a click glides the view there ──────── */}
      {(() => {
        const dir = outbound ? 1 : -1;
        const idx = t.position.stopIndex;
        // neighbours of the cab — and always both terminals, so the ends of
        // the line are reachable from anywhere
        const candidates = [...new Set([idx - dir, idx, idx + dir, 0, t.stops.length - 1])].filter((i) => i >= 0 && i < t.stops.length);
        const left = candidates.filter((i) => stopX(i) < viewX + 80).sort((a, b) => stopX(b) - stopX(a))[0];
        const right = candidates.filter((i) => stopX(i) > viewX + vw - 80).sort((a, b) => stopX(a) - stopX(b))[0];
        const Arrow = ({ i, side }: { i: number; side: "left" | "right" }) => (
          <button
            type="button"
            onClick={() => goTo(stopX(i))}
            aria-label={`${L("Zu", "To")} ${t.stops[i]!.name[lang]}`}
            className={cn(
              "fixed z-header flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-base text-ink shadow-card",
              side === "left" ? "left-6" : "right-6",
            )}
            style={{ top: trackY - 22 }}
          >
            {side === "left" && <ChevronLeft size={18} />}
            <span>{t.stops[i]!.name[lang]}</span>
            {side === "right" && <ChevronRight size={18} />}
          </button>
        );
        return (
          <>
            {left != null && <Arrow i={left} side="left" />}
            {right != null && <Arrow i={right} side="right" />}
          </>
        );
      })()}

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
