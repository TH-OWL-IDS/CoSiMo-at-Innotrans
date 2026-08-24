import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain, Cloud, CloudCog, Database, Keyboard, Lightbulb, MonitorSmartphone,
  RotateCcw, TabletSmartphone, Volume2, Waypoints, X, type LucideIcon,
} from "lucide-react";
import type { ConnectionStatus, LogEvent, MonoCabTelemetry } from "@cosimo/shared";
import type { CosimoState } from "@cosimo/client";

/**
 * The system, live and touchable: the Systembild's topology as draggable
 * bubbles (icon + title, Miro-style — the layout persists per browser),
 * edges that follow, and a click on any node opens a popup with everything
 * the console knows about it right now. Drag = move, click = inspect;
 * the two are told apart by a 5-px movement threshold.
 */

const INK = "#181817";
const MUTE = "#6b6b6b";
const LINE = "#e4e4e4";
const ACCENT = "#e40041";
const OK = "#1a7f37";
const WARN = "#b45309";

type NodeId =
  | "kiosks" | "esp32" | "licht" | "edge" | "hub" | "cms" | "apps" | "llm" | "claude" | "tts";

const DEFAULT_POS: Record<NodeId, [number, number]> = {
  kiosks: [130, 110],
  esp32: [130, 260],
  licht: [130, 440],
  edge: [370, 110],
  hub: [590, 110],
  cms: [590, 280],
  apps: [590, 440],
  llm: [820, 110],
  claude: [820, 280],
  tts: [820, 440],
};

const POS_KEY = "cosimo.console.diagram.pos.v1";

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
  { id: "kiosks", icon: TabletSmartphone, title: "Kiosks", w: 168 },
  { id: "esp32", icon: Keyboard, title: "ESP32 + NFC", w: 168 },
  { id: "licht", icon: Lightbulb, title: "LPU-2 · Licht", w: 168 },
  { id: "edge", icon: Cloud, title: "Cloudflare", w: 158 },
  { id: "hub", icon: Waypoints, title: "Hub · Agent", w: 190 },
  { id: "cms", icon: Database, title: "CMS + Postgres", w: 190 },
  { id: "apps", icon: MonitorSmartphone, title: "Konsole · Emulator · Fahrt", w: 236 },
  { id: "llm", icon: Brain, title: "GX10 · vLLM", w: 172 },
  { id: "claude", icon: CloudCog, title: "Claude", w: 158 },
  { id: "tts", icon: Volume2, title: "ElevenLabs", w: 162 },
];

const EDGES: { from: NodeId; to: NodeId; label?: string; color?: string; dashed?: boolean; width?: number }[] = [
  { from: "kiosks", to: "edge", label: "wss" },
  { from: "edge", to: "hub" },
  { from: "esp32", to: "kiosks", label: "BLE" },
  { from: "kiosks", to: "licht", label: "GET /ajax/pbXX", dashed: true },
  { from: "hub", to: "llm", label: "WireGuard", color: ACCENT, width: 2.2 },
  { from: "hub", to: "claude", label: "Fallback", color: WARN, dashed: true },
  { from: "hub", to: "cms", label: "REST · TTL" },
  { from: "hub", to: "tts", label: "TTS" },
  { from: "apps", to: "hub", label: "wss" },
];

const BUBBLE_H = 58;

/** Trim a centre-to-centre line so it starts/ends at the bubble borders. */
function trim(from: [number, number], to: [number, number], wFrom: number, wTo: number): [number, number, number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const rFrom = Math.min(wFrom / 2 / Math.max(Math.abs(ux), 0.001), BUBBLE_H / 2 / Math.max(Math.abs(uy), 0.001)) + 4;
  const rTo = Math.min(wTo / 2 / Math.max(Math.abs(ux), 0.001), BUBBLE_H / 2 / Math.max(Math.abs(uy), 0.001)) + 8;
  return [from[0] + ux * rFrom, from[1] + uy * rFrom, to[0] - ux * rTo, to[1] - uy * rTo];
}

type State = "ok" | "warn" | "down" | "none";

export default function DiagramView({ c, st, t }: { c: CosimoState; st: ConnectionStatus | null; t: MonoCabTelemetry | null }) {
  const [pos, setPos] = useState<Record<NodeId, [number, number]>>(loadPos);
  const [open, setOpen] = useState<NodeId | null>(null);
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

  const onPointerDown = (id: NodeId) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).closest("[data-bubble]")?.setPointerCapture?.(e.pointerId);
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
        Math.max(40, Math.min(520, d.origin[1] + dy)),
      ],
    }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setPos((p) => (save(p), p));
    else setOpen(d.id);
  };

  const kioskDevices = c.devices.filter((d) => d.role === "kiosk");
  const fault = t?.faults?.[0];
  const lastTurnLlm = [...c.logs].reverse().find((e) => e.kind === "turn.start" && e.data.llm !== null);
  const llmName = lastTurnLlm?.kind === "turn.start" && lastTurnLlm.data.llm
    ? `${lastTurnLlm.data.llm.provider} · ${lastTurnLlm.data.llm.model}` : "noch kein Turn";
  const lastSvc = [...c.logs].reverse().find(
    (e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status",
  );
  const fallbackActive = Boolean(lastSvc && "llmFallbackActive" in lastSvc.data && lastSvc.data.llmFallbackActive);

  const stateOf: Record<NodeId, State> = {
    kiosks: kioskDevices.length > 0 ? "ok" : "down",
    esp32: "none",
    licht: st?.light ? "ok" : "warn",
    edge: "none",
    hub: c.connected ? (fault ? "warn" : "ok") : "down",
    cms: st?.cms ? "ok" : "warn",
    apps: "none",
    llm: st?.llm ? (fallbackActive ? "warn" : "ok") : "down",
    claude: fallbackActive ? "ok" : "none",
    tts: st?.serverTts ? "ok" : "warn",
  };

  const subOf: Record<NodeId, string> = {
    kiosks: `${kioskDevices.length} verbunden · dual-homed`,
    esp32: "Taster · Karten",
    licht: st?.light ? "Treiber bereit" : "kein Treiber",
    edge: "Tunnel · TLS",
    hub: fault ? `Störung: ${fault.kind}` : "realtime · Fahrt-Sim",
    cms: st?.cms ? "Profile · Route · Sessions" : "Defaults aktiv",
    apps: "statisch, socket-only",
    llm: st?.llm ? "Qwen3 27B · :8007" : "nicht erreichbar",
    claude: fallbackActive ? "übernimmt gerade" : "automatischer Fallback",
    tts: st?.serverTts ? "TTS bereit" : "Browser-Synthese",
  };

  /** Everything the console knows about a node, for the popup. */
  const detailsOf = (id: NodeId): { rows: [string, string][]; links?: [string, string][] } => {
    switch (id) {
      case "kiosks":
        return {
          rows: [
            ["Geräte", kioskDevices.length ? kioskDevices.map((d) => d.deviceId).join(", ") : "keine verbunden"],
            ["Aktive Sessions", String(c.seats.filter((s) => s.active).length)],
            ["App", "apps/kiosk (Capacitor, nativ) — Face, Consent, Push-to-talk"],
            ["Netz", "WLAN → Hub (wss) · USB-C-Ethernet → Kabinen-LAN (ohne Default-Route)"],
            ["Rolle", "dumm: Eingabe rauf, Bedeutung im Hub; einziger Aktor im Kabinen-LAN"],
          ],
        };
      case "esp32":
        return {
          rows: [
            ["Protokoll", "BLE-HID-Tastatur, 1:1 pro iPad"],
            ["Sprechtaste", "„s“ — key down = Aufnahme, key up = senden"],
            ["Infotaste", "„i“ — eine Frage an CoSiMo"],
            ["NFC", "„[“ + Chip-ID + Enter — Karte = Profil"],
            ["Testen", "ohne Hardware: einfach auf einer Tastatur tippen"],
          ],
        };
      case "licht":
        return {
          rows: [
            ["Controller", "Visual Productions Cuety LPU-2 · HTTP Port 80"],
            ["Befehle", "pbXX/in=0..100 (an/Stufe) · pbXX/re (Release → Standalone-Szene)"],
            ["Mapping", "CMS → Operator-Config → Kabine (Playback je Funktion)"],
            ["Status", st?.light ? "Treiber verbunden" : "kein Treiber aktiv"],
            ["Weg", "Hub baut URLs → iPad feuert im Kabinen-LAN → meldet ok/degraded"],
          ],
        };
      case "edge":
        return {
          rows: [["TLS", "endet bei Cloudflare; Dienste binden nur 127.0.0.1"]],
          links: [
            ["ws-cosimo (Hub)", "https://ws-cosimo.homannjohannes.de/health"],
            ["cosimo (CMS)", "https://cosimo.homannjohannes.de"],
            ["console-cosimo", "https://console-cosimo.homannjohannes.de"],
            ["seat-cosimo (Emulator)", "https://seat-cosimo.homannjohannes.de"],
            ["journey-cosimo (Fahrt)", "https://journey-cosimo.homannjohannes.de"],
          ],
        };
      case "hub":
        return {
          rows: [
            ["Verbindung", c.connected ? "verbunden" : "getrennt"],
            ["Geräte", `${c.devices.length} (${kioskDevices.length} Kiosk)`],
            ["Fahrt", t ? `${t.location.de} · ${Math.round(t.speedKmh)} km/h${t.simPaused ? " · pausiert" : ""}` : "—"],
            ["Störung", fault ? `${fault.cause.de} (${fault.remainingSec}s)` : "keine"],
            ["Verspätung", t?.delayMinutes ? `+${t.delayMinutes} min` : "pünktlich"],
            ["Modus", st?.offlineCanned ? "Demo (Skript)" : "Live (Agent)"],
            ["Log", "Ring-Puffer + NDJSON täglich — Tab „Logs“"],
          ],
        };
      case "cms":
        return {
          rows: [
            ["Erreichbar", st?.cms ? "ja (Probe alle 15 s)" : "nein — eingebaute Defaults aktiv"],
            ["Hält", "Profile (NFC-Karten), Route + Störungs-Szenario, Operator-Config, Sessions"],
            ["Live-Pfad", "nie — der Hub liest per TTL und degradiert auf Defaults"],
          ],
          links: [["Payload Admin", "https://cosimo.homannjohannes.de/admin"]],
        };
      case "apps":
        return {
          rows: [["Gemeinsam", "socket-only — keine App spricht mit dem CMS"]],
          links: [
            ["Konsole (:6102)", "https://console-cosimo.homannjohannes.de"],
            ["Emulator (:6103)", "https://seat-cosimo.homannjohannes.de"],
            ["Fahrt (:6104)", "https://journey-cosimo.homannjohannes.de"],
          ],
        };
      case "llm":
        return {
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
          rows: [
            ["Rolle", "automatischer Fallback (Operator-Config → LLM)"],
            ["Aktiv", fallbackActive ? "JA — Turns laufen gerade über Claude" : "nein — GX10 antwortet"],
            ["Wechsel", "Probe alle 15 s; zurück zum GX10, sobald es antwortet"],
          ],
        };
      case "tts":
        return {
          rows: [
            ["Server-TTS", st?.serverTts ? "ElevenLabs aktiv (eleven_flash_v2_5)" : "aus — Browser-Synthese"],
            ["STT", st?.serverStt ? "Deepgram aktiv" : "kein Server-STT (geplant: Deepgram / GX10-Whisper)"],
            ["Mundbild", "der Kiosk folgt der echten Audio-Wiedergabe, nicht dem Text"],
          ],
        };
    }
  };

  const openNode = open ? NODES.find((n) => n.id === open)! : null;
  const openDetails = open ? detailsOf(open) : null;

  return (
    <div style={{ overflowX: "auto" }}>
      <div ref={canvasRef} style={{ position: "relative", width: "100%", minWidth: 940, height: 560 }}>
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
          {/* air-gap zone follows the light bubble */}
          <rect x={pos.licht[0] - 108} y={pos.licht[1] - 56} width={216} height={112} rx={14} fill="none" stroke={WARN} strokeDasharray="6 4" />
          <text x={pos.licht[0] - 94} y={pos.licht[1] - 64} fontSize={10.5} fill={WARN} fontFamily="inherit">
            Kabinen-LAN — kein Uplink
          </text>
          {EDGES.map((e, i) => {
            const nFrom = NODES.find((n) => n.id === e.from)!;
            const nTo = NODES.find((n) => n.id === e.to)!;
            const [x1, y1, x2, y2] = trim(pos[e.from], pos[e.to], nFrom.w, nTo.w);
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

        {/* draggable bubbles */}
        {NODES.map((n) => {
          const s = stateOf[n.id];
          const border = s === "down" ? ACCENT : s === "warn" ? WARN : LINE;
          const dot = s === "ok" ? OK : s === "warn" ? WARN : s === "down" ? ACCENT : undefined;
          const Icon = n.icon;
          const [x, y] = pos[n.id];
          return (
            <div
              key={n.id}
              data-bubble
              onPointerDown={onPointerDown(n.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(n.id)}
              style={{
                position: "absolute",
                left: x - n.w / 2,
                top: y - BUBBLE_H / 2,
                width: n.w,
                background: "#fff",
                border: `1.5px solid ${border}`,
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
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  {n.title}
                  {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 10.5, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {subOf[n.id]}
                </div>
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
        {openNode && openDetails && (
          <div
            role="dialog"
            aria-label={openNode.title}
            style={{
              position: "absolute",
              left: Math.min(Math.max(pos[openNode.id][0] - 170, 12), 588),
              top: Math.min(pos[openNode.id][1] + 44, 320),
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
                <openNode.icon size={17} /> {openNode.title}
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
              {openDetails.rows.map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 10, fontSize: 12, lineHeight: 1.45 }}>
                  <span style={{ color: MUTE, width: 96, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: INK }}>{v}</span>
                </div>
              ))}
            </div>
            {openDetails.links && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid #f0f0f0`, paddingTop: 8 }}>
                {openDetails.links.map(([label, href]) => (
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
