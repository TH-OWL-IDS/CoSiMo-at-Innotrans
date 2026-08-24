import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain, CloudCog, Database, MonitorSmartphone, RotateCcw,
  TabletSmartphone, TramFront, Volume2, Waypoints, X, type LucideIcon,
} from "lucide-react";
import type { ConnectionStatus, LogEvent, MonoCabTelemetry, SeatSummary } from "@cosimo/shared";
import type { CosimoState } from "@cosimo/client";

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

const INK = "#181817";
const MUTE = "#6b6b6b";
const LINE = "#e4e4e4";
const ACCENT = "#e40041";
const OK = "#1a7f37";
const WARN = "#b45309";

type NodeId = "vehicle" | "hub" | "cms" | "apps" | "llm" | "claude" | "tts";
/** A popup target: a fixed node, or one kiosk inside the vehicle. */
type OpenId = NodeId | `kiosk:${string}`;

const DEFAULT_POS: Record<NodeId, [number, number]> = {
  vehicle: [170, 240],
  hub: [560, 110],
  cms: [620, 280],
  apps: [620, 440],
  llm: [850, 110],
  claude: [850, 280],
  tts: [850, 440],
};

const POS_KEY = "cosimo.console.diagram.pos.v3";

function loadPos(): Record<NodeId, [number, number]> {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return { ...DEFAULT_POS };
    return { ...DEFAULT_POS, ...(JSON.parse(raw) as Partial<Record<NodeId, [number, number]>>) };
  } catch {
    return { ...DEFAULT_POS };
  }
}

interface NodeDef {
  id: NodeId;
  icon: LucideIcon;
  title: string;
  w: number;
}

const NODES: NodeDef[] = [
  { id: "hub", icon: Waypoints, title: "Hub · Agent", w: 170 },
  { id: "cms", icon: Database, title: "CMS + Postgres", w: 190 },
  { id: "apps", icon: MonitorSmartphone, title: "Konsole · Emulator · Fahrt", w: 236 },
  { id: "llm", icon: Brain, title: "GX10 · vLLM", w: 172 },
  { id: "claude", icon: CloudCog, title: "Claude", w: 158 },
  { id: "tts", icon: Volume2, title: "ElevenLabs", w: 162 },
];

const EDGES: { from: NodeId; to: NodeId; label?: string; color?: string; dashed?: boolean; width?: number }[] = [
  { from: "vehicle", to: "hub", label: "wss · via Cloudflare" },
  { from: "hub", to: "llm", label: "WireGuard", color: ACCENT, width: 2.2 },
  { from: "hub", to: "claude", label: "Fallback", color: WARN, dashed: true },
  { from: "hub", to: "cms", label: "REST · TTL" },
  { from: "hub", to: "tts", label: "TTS" },
  { from: "apps", to: "hub", label: "wss" },
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
  const rFrom = Math.min(wFrom / 2 / Math.max(Math.abs(ux), 0.001), hFrom / 2 / Math.max(Math.abs(uy), 0.001)) + 4;
  const rTo = Math.min(wTo / 2 / Math.max(Math.abs(ux), 0.001), hTo / 2 / Math.max(Math.abs(uy), 0.001)) + 8;
  return [from[0] + ux * rFrom, from[1] + uy * rFrom, to[0] - ux * rTo, to[1] - uy * rTo];
}

type State = "ok" | "warn" | "down" | "none";

const dotColor = (s: State) => (s === "ok" ? OK : s === "warn" ? WARN : s === "down" ? ACCENT : undefined);
const borderColor = (s: State) => (s === "down" ? ACCENT : s === "warn" ? WARN : LINE);

export default function DiagramView({ c, st, t }: { c: CosimoState; st: ConnectionStatus | null; t: MonoCabTelemetry | null }) {
  const [pos, setPos] = useState<Record<NodeId, [number, number]>>(loadPos);
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
    setPos((p) => ({
      ...p,
      [d.id]: [
        Math.max(90, Math.min(maxX, d.origin[0] + dx)),
        Math.max(40, Math.min(540, d.origin[1] + dy)),
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
    apps: "none",
    llm: st?.llm ? (fallbackActive ? "warn" : "ok") : "down",
    claude: fallbackActive ? "ok" : "none",
    tts: st?.serverTts ? "ok" : "warn",
  };

  /** Everything the console knows about a node, for the popup. */
  const detailsOf = (id: OpenId): { title: string; icon: LucideIcon; rows: [string, string][]; links?: [string, string][] } => {
    if (id.startsWith("kiosk:")) {
      const deviceId = id.slice(6);
      const seat = seatOf(deviceId);
      return {
        title: deviceId,
        icon: TabletSmartphone,
        rows: seat
          ? [
              ["Session", seat.active ? "aktiv" : "wartet"],
              ["Profil", `${seat.personaLabel} (${seat.persona})`],
              ["Phase", seat.phase],
              ["Gesicht", seat.emotion],
              ["Consent", seat.consent ? "ja — Session wird aufgezeichnet" : "nein"],
              ["Darstellung", `Text ${seat.accommodations.textSize.toUpperCase()} · ${seat.accommodations.theme}${seat.accommodations.showText ? " · Text sichtbar" : ""}${seat.accommodations.audioOutput ? "" : " · stumm"}`],
              ["Erinnert", seat.memories.length ? seat.memories.join(" · ") : "—"],
              ["Gast", seat.lastUser || "—"],
              ["CoSiMo", seat.lastReply || "—"],
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
            ["Aktive Sessions", String(c.seats.filter((s) => s.active).length)],
            ["Fahrt", t ? `${t.location.de} · ${Math.round(t.speedKmh)} km/h${t.simPaused ? " · pausiert" : ""}` : "—"],
            ["Fahrgäste", t ? `${t.occupancy}/${t.capacity} (${t.seats?.liveSessions ?? 0} echt)` : "—"],
            ["Netz", "iPads dual-homed: WLAN → Hub · USB-C → Kabinen-LAN (Licht)"],
            ["Rolle", "Kiosks bleiben dumm — Eingabe rauf, Bedeutung im Hub"],
          ],
        };
      case "hub":
        return {
          title: "Hub · Agent",
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
            ["cosimo (CMS)", "https://cosimo.homannjohannes.de"],
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
          links: [["Payload Admin", "https://cosimo.homannjohannes.de/admin"]],
        };
      case "apps":
        return {
          title: "Konsole · Emulator · Fahrt",
          icon: MonitorSmartphone,
          rows: [["Gemeinsam", "socket-only — keine App spricht mit dem CMS"]],
          links: [
            ["Konsole (:6102)", "https://console-cosimo.homannjohannes.de"],
            ["Emulator (:6103)", "https://seat-cosimo.homannjohannes.de"],
            ["Fahrt (:6104)", "https://journey-cosimo.homannjohannes.de"],
          ],
        };
      case "llm":
        return {
          title: "GX10 · vLLM",
          icon: Brain,
          rows: [
            ["Modell", llmName],
            ["Erreichbar", st?.llm ? (fallbackActive ? "Fallback aktiv" : "ja") : "nein"],
            ["Wo", "GX10 (Uni-Netz), eigener vLLM-Stack, Tailnet :8007, Bearer"],
            ["Tuning", "NVFP4 · MTP-Spekulation (Tiefe 3) · Thinking aus"],
            ["Gemessen", "Aktions-Turn ≈ 2,4 s · Telemetrie ≈ 3,4 s (24.08.)"],
          ],
        };
      case "claude":
        return {
          title: "Claude",
          icon: CloudCog,
          rows: [
            ["Rolle", "automatischer Fallback (Operator-Config → LLM)"],
            ["Aktiv", fallbackActive ? "JA — Turns laufen gerade über Claude" : "nein — GX10 antwortet"],
            ["Wechsel", "Probe alle 15 s; zurück zum GX10, sobald es antwortet"],
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
    <div style={{ overflowX: "auto" }}>
      <div ref={canvasRef} style={{ position: "relative", width: "100%", minWidth: 940, height: 580 }}>
        {/* edges beneath in raw pixel space, following the live positions */}
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} role="img" aria-label="Live-Topologie als verschiebbare Knoten mit Verbindungen.">
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
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen("vehicle")}
          style={{
            position: "absolute",
            left: pos.vehicle[0] - VEHICLE_W / 2,
            top: pos.vehicle[1] - vh / 2,
            width: VEHICLE_W,
            background: "#fff",
            border: `1.5px solid ${borderColor(stateOf.vehicle)}`,
            borderRadius: 18,
            boxShadow: "0 1px 3px rgba(24,24,23,0.08)",
            cursor: "grab",
            userSelect: "none",
            touchAction: "none",
            padding: "12px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
            <TramFront size={20} color={INK} />
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: 6 }}>
              MonoCab
              {dotColor(stateOf.vehicle) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(stateOf.vehicle) }} />}
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
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(`kiosk:${d.deviceId}`)}
                style={{
                  border: `1.5px solid ${active ? ACCENT : LINE}`,
                  borderRadius: 999,
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <TabletSmartphone size={16} color={INK} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(n.id)}
              style={{
                position: "absolute",
                left: x - n.w / 2,
                top: y - BUBBLE_H / 2,
                width: n.w,
                background: "#fff",
                border: `1.5px solid ${borderColor(s)}`,
                borderRadius: 999,
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 1px 3px rgba(24,24,23,0.08)",
                cursor: "grab",
                userSelect: "none",
                touchAction: "none",
              }}
            >
              <Icon size={20} color={INK} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                {n.title}
                {dotColor(s) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(s), flexShrink: 0 }} />}
              </div>
            </div>
          );
        })}

        {/* layout reset, quietly in the corner */}
        <button
          onClick={() => {
            setPos({ ...DEFAULT_POS });
            try {
              localStorage.removeItem(POS_KEY);
            } catch {
              // fine
            }
          }}
          title="Layout zurücksetzen"
          aria-label="Layout zurücksetzen"
          style={{ position: "absolute", top: 8, right: 8, appearance: "none", border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, padding: 6, cursor: "pointer", color: MUTE, display: "inline-flex" }}
        >
          <RotateCcw size={13} />
        </button>

        {/* node popup */}
        {open && details && (
          <div
            role="dialog"
            aria-label={details.title}
            style={{
              position: "absolute",
              left: Math.min(Math.max(popupAnchor[0] - 170, 12), (canvasRef.current?.clientWidth ?? 940) - 352),
              top: Math.min(popupAnchor[1] + 44, 330),
              width: 340,
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(24,24,23,0.14)",
              padding: 16,
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
                <details.icon size={17} /> {details.title}
              </span>
              <button
                onClick={() => setOpen(null)}
                aria-label="schließen"
                style={{ appearance: "none", border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, padding: 4, cursor: "pointer", display: "inline-flex" }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {details.rows.map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 10, fontSize: 12, lineHeight: 1.45 }}>
                  <span style={{ color: MUTE, width: 96, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: INK }}>{v}</span>
                </div>
              ))}
            </div>
            {details.links && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid #f0f0f0`, paddingTop: 8 }}>
                {details.links.map(([label, href]) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT, textDecoration: "none" }}>
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
