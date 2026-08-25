import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain, Check, Database, Monitor, RotateCcw, Route, ScrollText,
  TabletSmartphone, TramFront, Volume2, Waypoints, X, type LucideIcon,
} from "lucide-react";
import type { ConnectionStatus, LogEvent, MonoCabTelemetry, SeatSummary } from "@cosimo/shared";
import type { CosimoState } from "@cosimo/client";
import { Button, Dot, KeyValue, cn, type DotState } from "@cosimo/ui";

/**
 * The system, live and touchable: draggable bubbles (Miro-style, the layout
 * persists per browser), edges that follow, click opens a popup with
 * everything the console knows about that node.
 *
 * The Fahrzeug is a CONTAINER node: every connected kiosk appears inside it
 * as its own node the moment it connects, and disappears when it drops —
 * the diagram literally shows who is sitting in the cab. Clicking a kiosk
 * opens its live seat state (profile, phase, consent, last exchange).
 */

/* The SVG edges and markers are drawn in pixel space, so they take colours
   as values — read from the same tokens the utilities use. */
const INK = "var(--color-ink)";
const MUTE = "var(--color-mute)";
const ACCENT = "var(--color-accent)";
const WARN = "var(--color-warn)";

type NodeId = "vehicle" | "hub" | "cms" | "console" | "journey" | "llm" | "tts";
/** A popup target: a fixed node, or one kiosk inside the vehicle. */
type OpenId = NodeId | `kiosk:${string}`;

/**
 * Standard layout, computed from the canvas size: the Hub top centre, the
 * MonoCab centred directly beneath it, the LLM column to the right, CMS and
 * the browser apps to the left.
 */
function defaultPos(w: number, h: number): Record<NodeId, [number, number]> {
  const cx = Math.max(470, w / 2);
  const right = Math.min(w - 140, cx + Math.max(360, w * 0.3));
  const left = Math.max(150, cx - Math.max(360, w * 0.3));
  return {
    hub: [cx, 110],
    vehicle: [cx, Math.min(h * 0.55, Math.max(280, h - 260))],
    cms: [left, 130],
    console: [left, h * 0.5],
    journey: [left, h - 110],
    llm: [right, 150],
    tts: [right, h - 150],
  };
}

const POS_KEY = "cosimo.console.diagram.pos.v4";

function loadPos(w: number, h: number): Record<NodeId, [number, number]> {
  const base = defaultPos(w, h);
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<Record<NodeId, [number, number]>>) };
  } catch {
    return base;
  }
}

interface NodeDef {
  id: NodeId;
  icon: LucideIcon;
  title: string;
  w: number;
}

const NODES: NodeDef[] = [
  { id: "hub", icon: Waypoints, title: "Hub · CoSiMo", w: 178 },
  { id: "cms", icon: Database, title: "CMS + Postgres", w: 190 },
  { id: "console", icon: Monitor, title: "Konsole", w: 142 },
  { id: "journey", icon: Route, title: "Fahrt", w: 126 },
  { id: "llm", icon: Brain, title: "GX10 · vLLM", w: 172 },
  { id: "tts", icon: Volume2, title: "ElevenLabs", w: 162 },
];

/**
 * The edges follow the real flows, not the diagram convention:
 * — wss links are genuinely two-way (the kiosk sends audio/taps up, the Hub
 *   pushes turns, status and cabin:actuate down the SAME socket) → both ends
 *   carry an arrowhead. The light itself then leaves the iPad over the
 *   Kabinen-LAN — that hop lives in the MonoCab popup, not on the canvas.
 * — http(s) edges are request/response; the arrow marks who initiates.
 *   The CMS never pushes: the Hub reads with a TTL and writes sessions,
 *   so a single arrow with an honest label.
 * — Claude gets no node of its own: it is only the fallback; the GX10
 *   bubble turns amber and its popup says so while Claude carries turns.
 */
const EDGES: { from: NodeId; to: NodeId; label?: string; color?: string; dashed?: boolean; width?: number; bidi?: boolean }[] = [
  { from: "vehicle", to: "hub", label: "wss · via Cloudflare", bidi: true, width: 1.8 },
  { from: "console", to: "hub", label: "wss · via Cloudflare", bidi: true },
  { from: "hub", to: "journey", label: "wss · Telemetrie" },
  { from: "hub", to: "llm", label: "https · WireGuard", color: ACCENT, width: 2.2 },
  { from: "hub", to: "cms", label: "liest (TTL) · schreibt Sessions" },
  { from: "hub", to: "tts", label: "https · Audio" },
];

const BUBBLE_H = 58;
const VEHICLE_W = 240;
const KIOSK_ROW_H = 44;

/** The vehicle container's height grows with the kiosks inside it. */
function vehicleH(kioskCount: number): number {
  return 52 + Math.max(kioskCount, 1) * KIOSK_ROW_H + 10;
}

/** Trim a centre-to-centre line so it starts/ends at the node borders. */
function trim(
  from: [number, number], to: [number, number],
  wFrom: number, hFrom: number, wTo: number, hTo: number,
): [number, number, number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const rFrom = Math.min(wFrom / 2 / Math.max(Math.abs(ux), 0.001), hFrom / 2 / Math.max(Math.abs(uy), 0.001)) + 8;
  const rTo = Math.min(wTo / 2 / Math.max(Math.abs(ux), 0.001), hTo / 2 / Math.max(Math.abs(uy), 0.001)) + 8;
  return [from[0] + ux * rFrom, from[1] + uy * rFrom, to[0] - ux * rTo, to[1] - uy * rTo];
}

type State = "ok" | "warn" | "down" | "none";

const dotState = (s: State): DotState | null => (s === "ok" ? "ok" : s === "warn" ? "warn" : s === "down" ? "down" : null);
const borderClass = (s: State) => (s === "down" ? "border-accent" : s === "warn" ? "border-warn" : "border-line");

export default function DiagramView({ c, st, t, onShowLogs }: { c: CosimoState; st: ConnectionStatus | null; t: MonoCabTelemetry | null; onShowLogs?: (deviceId: string) => void }) {
  const [pos, setPos] = useState<Record<NodeId, [number, number]>>(() => loadPos(window.innerWidth - 48, window.innerHeight - 170));
  const [open, setOpen] = useState<OpenId | null>(null);
  const drag = useRef<{ id: NodeId; startX: number; startY: number; origin: [number, number]; moved: boolean } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = useCallback((next: Record<NodeId, [number, number]>) => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      // storage full/blocked — the session layout still works
    }
  }, []);

  const startDrag = (id: NodeId) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id, startX: e.clientX, startY: e.clientY, origin: pos[id], moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const maxX = (canvasRef.current?.clientWidth ?? 940) - 90;
    const maxY = (canvasRef.current?.clientHeight ?? 580) - 50;
    setPos((p) => ({
      ...p,
      [d.id]: [
        Math.max(90, Math.min(maxX, d.origin[0] + dx)),
        Math.max(40, Math.min(maxY, d.origin[1] + dy)),
      ],
    }));
  };
  const endDrag = (clickTarget: OpenId | null) => () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setPos((p) => (save(p), p));
    else if (clickTarget) setOpen(clickTarget);
  };

  const kioskDevices = c.devices.filter((d) => d.role === "kiosk");
  const seatOf = (deviceId: string): SeatSummary | undefined => c.seats.find((s) => s.deviceId === deviceId);
  const fault = t?.faults?.[0];
  const lastTurnLlm = [...c.logs].reverse().find((e) => e.kind === "turn.start" && e.data.llm !== null);
  const llmName = lastTurnLlm?.kind === "turn.start" && lastTurnLlm.data.llm
    ? `${lastTurnLlm.data.llm.provider} · ${lastTurnLlm.data.llm.model}` : "noch kein Turn";
  const lastSvc = [...c.logs].reverse().find(
    (e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status",
  );
  const fallbackActive = Boolean(lastSvc && "llmFallbackActive" in lastSvc.data && lastSvc.data.llmFallbackActive);

  const stateOf: Record<NodeId, State> = {
    vehicle: kioskDevices.length > 0 ? "ok" : "down",
    hub: c.connected ? (fault ? "warn" : "ok") : "down",
    cms: st?.cms ? "ok" : "warn",
    console: "none",
    journey: "none",
    llm: st?.llm ? (fallbackActive ? "warn" : "ok") : "down",
    tts: st?.serverTts ? "ok" : "warn",
  };

  /** Everything the console knows about a node, for the popup. */
  const detailsOf = (
    id: OpenId,
  ): { title: string; icon: LucideIcon; rows: [string, React.ReactNode][]; links?: [string, string][]; logSeat?: string } => {
    if (id.startsWith("kiosk:")) {
      const deviceId = id.slice(6);
      const seat = seatOf(deviceId);
      return {
        title: deviceId,
        icon: TabletSmartphone,
        logSeat: deviceId,
        rows: seat
          ? [
              ["Session", seat.active ? "aktiv" : "wartet"],
              ["Profil", `${seat.personaLabel} (${seat.persona})`],
              ["Phase", seat.phase],
              ["Gesicht", seat.emotion],
              ["Consent", seat.consent ? <Check size={14} className="text-ok" aria-label="ja" /> : <X size={14} className="text-accent" aria-label="nein" />],
              ["Farben", `${seat.accommodations.theme}${seat.accommodations.contrast === "high" ? " · hoher Kontrast" : ""}`],
              ["Schriftgröße", seat.accommodations.textSize.toUpperCase()],
              ["Stimme", `${seat.accommodations.voice || (seat.accommodations.voiceGender === "male" ? "männlich" : "weiblich")} · ${seat.accommodations.voiceTone ?? "neutral"}`],
              ["Lautstärke", `${Math.round((seat.accommodations.volume ?? 1) * 100)} %`],
              ["Erinnert", seat.memories.length ? seat.memories.join(" · ") : "—"],
            ]
          : [["Session", "verbunden, noch keine Sitzdaten"]],
      };
    }
    switch (id as NodeId) {
      case "vehicle":
        return {
          title: "MonoCab · Fahrzeug",
          icon: TramFront,
          rows: [
            ["Kiosks", kioskDevices.length ? `${kioskDevices.length} verbunden` : "keine verbunden"],
            ["Emulator", "Browser-Sitze erscheinen hier wie echte Kiosks"],
            ["Aktive Sessions", String(c.seats.filter((s) => s.active).length)],
            ["Fahrt", t ? `${t.location.de} · ${Math.round(t.speedKmh)} km/h${t.simPaused ? " · pausiert" : ""}` : "—"],
            ["Fahrgäste", t ? `${t.occupancy}/${t.capacity} (${t.seats?.liveSessions ?? 0} echt)` : "—"],
            ["Netz", "iPads dual-homed: WLAN → Hub · USB-C → Kabinen-LAN (Licht)"],
            ["Rolle", "Kiosks bleiben dumm — Eingabe rauf, Bedeutung im Hub"],
          ],
        };
      case "hub":
        return {
          title: "Hub · CoSiMo",
          icon: Waypoints,
          rows: [
            ["Verbindung", c.connected ? "verbunden" : "getrennt"],
            ["Geräte", `${c.devices.length} (${kioskDevices.length} Kiosk)`],
            ["Fahrt", t ? `${t.location.de} · ${Math.round(t.speedKmh)} km/h${t.simPaused ? " · pausiert" : ""}` : "—"],
            ["Störung", fault ? `${fault.cause.de} (${fault.remainingSec}s)` : "keine"],
            ["Verspätung", t?.delayMinutes ? `+${t.delayMinutes} min` : "pünktlich"],
            ["Modus", st?.offlineCanned ? "Demo (Skript)" : "Live (Agent)"],
            ["Log", "Ring-Puffer + NDJSON täglich — Tab „Logs“"],
            ["TLS", "endet bei Cloudflare; alle Dienste binden nur 127.0.0.1"],
          ],
          links: [
            ["ws-cosimo (Hub)", "https://ws-cosimo.homannjohannes.de/health"],
            ["cms-cosimo (CMS)", "https://cms-cosimo.homannjohannes.de"],
            ["console-cosimo", "https://console-cosimo.homannjohannes.de"],
            ["seat-cosimo (Emulator)", "https://seat-cosimo.homannjohannes.de"],
            ["journey-cosimo (Fahrt)", "https://journey-cosimo.homannjohannes.de"],
          ],
        };
      case "cms":
        return {
          title: "CMS + Postgres",
          icon: Database,
          rows: [
            ["Erreichbar", st?.cms ? "ja (Probe alle 15 s)" : "nein — eingebaute Defaults aktiv"],
            ["Hält", "Profile (NFC-Karten), Route + Störungs-Szenario, Operator-Config, Sessions"],
            ["Live-Pfad", "nie — der Hub liest per TTL und degradiert auf Defaults"],
          ],
          links: [["Payload Admin", "https://cms-cosimo.homannjohannes.de/admin"]],
        };
      case "console":
        return {
          title: "Konsole",
          icon: Monitor,
          rows: [
            ["Rolle", "Personal-Ansicht: Status, Fahrzeug, Sessions, Logs — diese Seite"],
            ["Pfad", "socket-only — spricht nie mit dem CMS"],
          ],
          links: [["Konsole (:6102)", "https://console-cosimo.homannjohannes.de"]],
        };
      case "journey":
        return {
          title: "Fahrt",
          icon: Route,
          rows: [
            ["Rolle", "die Linie live: Halte, Position, Störungen, Fahrgäste"],
            ["Pfad", "hört nur zu — Telemetrie über den Socket, sendet nichts"],
          ],
          links: [["Fahrt (:6104)", "https://journey-cosimo.homannjohannes.de"]],
        };
      case "llm":
        return {
          title: "GX10 · vLLM",
          icon: Brain,
          rows: [
            ["Modell", llmName],
            ["Erreichbar", st?.llm ? (fallbackActive ? "Fallback aktiv — Turns laufen über Claude" : "ja") : "nein"],
            ["Fallback", "Claude (direkt, https) — Probe alle 15 s, zurück sobald der GX10 antwortet"],
            ["Wo", "GX10 (Uni-Netz), eigener vLLM-Stack, Tailnet :8007, Bearer"],
            ["Tuning", "NVFP4 · MTP-Spekulation (Tiefe 3) · Thinking aus"],
            ["Gemessen", "Aktions-Turn ≈ 2,4 s · Telemetrie ≈ 3,4 s (24.08.)"],
          ],
        };
      default:
        return {
          title: "ElevenLabs",
          icon: Volume2,
          rows: [
            ["Server-TTS", st?.serverTts ? "ElevenLabs aktiv (eleven_flash_v2_5)" : "aus — Browser-Synthese"],
            ["STT", st?.serverStt ? "Deepgram aktiv" : "kein Server-STT (geplant: Deepgram / GX10-Whisper)"],
            ["Mundbild", "der Kiosk folgt der echten Audio-Wiedergabe, nicht dem Text"],
          ],
        };
    }
  };

  const vh = vehicleH(kioskDevices.length);
  const details = open ? detailsOf(open) : null;
  const popupAnchor: [number, number] = open
    ? open.startsWith("kiosk:") || open === "vehicle"
      ? pos.vehicle
      : pos[open as NodeId]
    : [0, 0];

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <div ref={canvasRef} className="relative h-[calc(100vh-61px)] min-h-[560px] w-full min-w-[940px]">
        {/* edges beneath in raw pixel space, following the live positions */}
        <svg width="100%" height="100%" className="pointer-events-none absolute inset-0" role="img" aria-label="Live-Topologie als verschiebbare Knoten mit Verbindungen.">
          <defs>
            <marker id="dg-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={INK} />
            </marker>
            <marker id="dg-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
            </marker>
            <marker id="dg-aw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={WARN} />
            </marker>
          </defs>
          {EDGES.map((e, i) => {
            const wFrom = e.from === "vehicle" ? VEHICLE_W : NODES.find((n) => n.id === e.from)!.w;
            const hFrom = e.from === "vehicle" ? vh : BUBBLE_H;
            const nTo = NODES.find((n) => n.id === e.to)!;
            const [x1, y1, x2, y2] = trim(pos[e.from], pos[e.to], wFrom, hFrom, nTo.w, BUBBLE_H);
            const color = e.color ?? INK;
            return (
              <g key={i}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color}
                  strokeWidth={e.width ?? 1.4}
                  strokeDasharray={e.dashed ? "6 5" : undefined}
                  markerEnd={color === ACCENT ? "url(#dg-ar)" : color === WARN ? "url(#dg-aw)" : "url(#dg-a)"}
                  markerStart={e.bidi ? (color === ACCENT ? "url(#dg-ar)" : color === WARN ? "url(#dg-aw)" : "url(#dg-a)") : undefined}
                />
                {e.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} fontSize={10.5} textAnchor="middle" fill={color === INK ? MUTE : color} fontFamily="inherit">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── the vehicle: a container whose kiosks are nodes of their own ── */}
        <div
          onPointerDown={startDrag("vehicle")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag("vehicle")}
          role="group"
          aria-label="MonoCab — Enter öffnet Details"
          tabIndex={0}
          onKeyDown={(e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && setOpen("vehicle")}
          className={cn(
            "absolute flex cursor-grab touch-none select-none flex-col gap-2 rounded-2xl border bg-white px-3 pb-2.5 pt-3 shadow-node focus-ring",
            "hover:bg-well active:cursor-grabbing",
            borderClass(stateOf.vehicle),
          )}
          style={{ left: pos.vehicle[0] - VEHICLE_W / 2, top: pos.vehicle[1] - vh / 2, width: VEHICLE_W }}
        >
          <div className="flex items-center gap-2.5 px-1">
            <TramFront size={20} className="text-ink" />
            <div className="flex items-center gap-1.5 text-md font-bold text-ink">
              MonoCab
              {dotState(stateOf.vehicle) && <Dot size="sm" state={dotState(stateOf.vehicle)!} />}
            </div>
          </div>

          {kioskDevices.map((d) => {
            const seat = seatOf(d.deviceId);
            const active = Boolean(seat?.active);
            return (
              <div
                key={d.deviceId}
                onPointerDown={(e) => {
                  // A kiosk press is a click target of its own; the container
                  // still drags when the press turns into a move.
                  e.stopPropagation();
                  startDrag("vehicle")(e);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag(`kiosk:${d.deviceId}`)}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(`kiosk:${d.deviceId}`)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border bg-white px-3 py-2 focus-ring hover:bg-well",
                  active ? "border-accent" : "border-line",
                )}
              >
                <TabletSmartphone size={16} className="shrink-0 text-ink" />
                <div className="truncate text-sm font-semibold text-ink">
                  {d.deviceId}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── the fixed bubbles ── */}
        {NODES.map((n) => {
          const s = stateOf[n.id];
          const Icon = n.icon;
          const [x, y] = pos[n.id];
          return (
            <div
              key={n.id}
              onPointerDown={startDrag(n.id)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag(n.id)}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(n.id)}
              className={cn(
                "absolute flex cursor-grab touch-none select-none items-center gap-2.5 rounded-full border bg-white px-4 py-2.5 shadow-node focus-ring",
                "hover:bg-well active:cursor-grabbing",
                borderClass(s),
              )}
              style={{ left: x - n.w / 2, top: y - BUBBLE_H / 2, width: n.w }}
            >
              <Icon size={20} className="shrink-0 text-ink" />
              <div className="flex items-center gap-1.5 whitespace-nowrap text-md font-semibold text-ink">
                {n.title}
                {dotState(s) && <Dot size="sm" state={dotState(s)!} />}
              </div>
            </div>
          );
        })}

        {/* layout reset, quietly in the corner */}
        <Button
          variant="outline"
          size="sm"
          icon
          className="absolute right-3 top-3"
          onClick={() => {
            setPos(defaultPos(canvasRef.current?.clientWidth ?? 1100, canvasRef.current?.clientHeight ?? 640));
            try {
              localStorage.removeItem(POS_KEY);
            } catch {
              // fine
            }
          }}
          title="Layout zurücksetzen"
          aria-label="Layout zurücksetzen"
        >
          <RotateCcw size={13} />
        </Button>

        {/* node popup */}
        {open && details && (
          <div
            role="dialog"
            aria-label={details.title}
            className="absolute z-popover flex w-[340px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 shadow-float"
            style={{
              left: Math.min(Math.max(popupAnchor[0] - 170, 12), (canvasRef.current?.clientWidth ?? 940) - 352),
              top: Math.min(popupAnchor[1] + 44, (canvasRef.current?.clientHeight ?? 580) - 270),
            }}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-base font-bold">
                <details.icon size={17} /> {details.title}
              </span>
              <Button variant="outline" size="sm" icon autoFocus onClick={() => setOpen(null)} aria-label="schließen">
                <X size={14} />
              </Button>
            </div>
            <KeyValue rows={details.rows} />
            {details.logSeat && onShowLogs && (
              <Button
                variant="outline"
                size="sm"
                tone="accent"
                className="self-start"
                onClick={() => {
                  const seat = details.logSeat!;
                  setOpen(null);
                  onShowLogs(seat);
                }}
              >
                <ScrollText size={13} /> Log dieser Session
              </Button>
            )}
            {details.links && (
              <div className="flex flex-col gap-1 border-t border-line-soft pt-2">
                {details.links.map(([label, href]) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer" className="text-sm text-accent no-underline hover:underline hover:underline-offset-2 focus-ring rounded-xs">
                    {label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
