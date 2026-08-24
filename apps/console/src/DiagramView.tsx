import {
  Brain, Cloud, CloudCog, Database, Keyboard, Lightbulb, MonitorSmartphone,
  TabletSmartphone, Volume2, Waypoints, type LucideIcon,
} from "lucide-react";
import type { ConnectionStatus, MonoCabTelemetry } from "@cosimo/shared";
import type { CosimoState } from "@cosimo/client";

/**
 * The system, live: the Systembild's topology as bubbles — icon + title —
 * with the hub's real status colouring each node. Same mechanism as the
 * published diagram (the air-gapped cabin, the one WireGuard hop to the
 * brain, the fallbacks), but the dots are the ones the health monitor sets
 * right now. Fixed layout on a 900×540 canvas; edges in an SVG layer
 * beneath, bubbles as positioned HTML so the lucide icons stay crisp.
 */

const INK = "#181817";
const MUTE = "#6b6b6b";
const LINE = "#e4e4e4";
const ACCENT = "#e40041";
const OK = "#1a7f37";
const WARN = "#b45309";

type State = "ok" | "warn" | "down" | "none";

function Bubble({ x, y, icon: Icon, title, sub, state = "none", w = 168 }: {
  x: number; y: number; icon: LucideIcon; title: string; sub?: string; state?: State; w?: number;
}) {
  const border = state === "down" ? ACCENT : state === "warn" ? WARN : LINE;
  const dot = state === "ok" ? OK : state === "warn" ? WARN : state === "down" ? ACCENT : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - 34,
        width: w,
        background: "#fff",
        border: `1.5px solid ${border}`,
        borderRadius: 999,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 1px 3px rgba(24,24,23,0.06)",
      }}
    >
      <Icon size={20} color={INK} style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          {title}
          {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: MUTE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    </div>
  );
}

/** A labeled edge between two bubble centres. */
function Edge({ from, to, label, color = INK, dashed, width = 1.4 }: {
  from: [number, number]; to: [number, number]; label?: string; color?: string; dashed?: boolean; width?: number;
}) {
  const [x1, y1] = from; const [x2, y2] = to;
  const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dashed ? "6 5" : undefined} markerEnd={color === ACCENT ? "url(#dg-ar)" : color === WARN ? "url(#dg-aw)" : "url(#dg-a)"} />
      {label && (
        <text x={mx} y={my - 7} fontSize={10.5} textAnchor="middle" fill={color === INK ? MUTE : color} fontFamily="inherit">
          {label}
        </text>
      )}
    </g>
  );
}

export default function DiagramView({ c, st, t }: { c: CosimoState; st: ConnectionStatus | null; t: MonoCabTelemetry | null }) {
  const kiosks = c.devices.filter((d) => d.role === "kiosk").length;
  const fault = t?.faults?.[0];
  // positions: [x, y] bubble centres on the 900×540 canvas
  const P = {
    kiosks: [130, 110] as [number, number],
    esp32: [130, 260] as [number, number],
    licht: [130, 440] as [number, number],
    edge: [370, 110] as [number, number],
    hub: [590, 110] as [number, number],
    cms: [590, 280] as [number, number],
    apps: [590, 440] as [number, number],
    llm: [810, 110] as [number, number],
    claude: [810, 280] as [number, number],
    tts: [810, 440] as [number, number],
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", width: 920, height: 560, margin: "0 auto" }}>
        {/* edges beneath */}
        <svg viewBox="0 0 920 560" width={920} height={560} style={{ position: "absolute", inset: 0 }} role="img" aria-label="Live-Topologie: Kiosks über Cloudflare zum Hub, der Hub über Tailscale zum GX10-Gehirn, CMS, statische Apps, Fallbacks.">
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
          {/* air-gap zone around the light */}
          <rect x={30} y={380} width={200} height={120} rx={14} fill="none" stroke={WARN} strokeDasharray="6 4" />
          <text x={44} y={372} fontSize={10.5} fill={WARN} fontFamily="inherit">Kabinen-LAN — kein Uplink</text>

          <Edge from={[214, 110]} to={[286, 110]} label="wss" />
          <Edge from={[454, 110]} to={[506, 110]} />
          <Edge from={[130, 226] as [number, number]} to={[130, 150]} label="BLE" />
          <Edge from={[110, 144]} to={[110, 402]} label="GET /ajax/pbXX" dashed />
          <Edge from={[674, 110]} to={[722, 110]} label="WireGuard" color={ACCENT} width={2.2} />
          <Edge from={[634, 148]} to={[762, 252]} label="Fallback" color={WARN} dashed />
          <Edge from={[590, 148]} to={[590, 242]} label="REST · TTL" />
          <Edge from={[655, 132]} to={[788, 404]} label="TTS" />
          <Edge from={[590, 402]} to={[590, 320]} label="" />
          <Edge from={[540, 402]} to={[540, 150]} label="wss" />
        </svg>

        {/* bubbles above */}
        <Bubble {...{ x: P.kiosks[0], y: P.kiosks[1] }} icon={TabletSmartphone} title="Kiosks" sub={`${kiosks} verbunden · dual-homed`} state={kiosks > 0 ? "ok" : "down"} />
        <Bubble {...{ x: P.esp32[0], y: P.esp32[1] }} icon={Keyboard} title="ESP32 + NFC" sub="Taster · Karten" />
        <Bubble {...{ x: P.licht[0], y: P.licht[1] }} icon={Lightbulb} title="LPU-2 · Licht" sub={st?.light ? "Treiber bereit" : "kein Treiber"} state={st?.light ? "ok" : "warn"} />
        <Bubble {...{ x: P.edge[0], y: P.edge[1] }} icon={Cloud} title="Cloudflare" sub="Tunnel · TLS" />
        <Bubble {...{ x: P.hub[0], y: P.hub[1] }} icon={Waypoints} title="Hub · Agent" sub={fault ? `Störung: ${fault.kind}` : "realtime · Fahrt-Sim"} state={c.connected ? (fault ? "warn" : "ok") : "down"} />
        <Bubble {...{ x: P.cms[0], y: P.cms[1] }} icon={Database} title="CMS + Postgres" sub={st?.cms ? "Profile · Route · Sessions" : "Defaults aktiv"} state={st?.cms ? "ok" : "warn"} />
        <Bubble {...{ x: P.apps[0], y: P.apps[1] }} icon={MonitorSmartphone} title="Konsole · Emulator · Fahrt" sub="statisch, socket-only" w={230} />
        <Bubble {...{ x: P.llm[0], y: P.llm[1] }} icon={Brain} title="GX10 · vLLM" sub="Qwen3 27B · :8007" state={st?.llm ? "ok" : "down"} />
        <Bubble {...{ x: P.claude[0], y: P.claude[1] }} icon={CloudCog} title="Claude" sub="automatischer Fallback" />
        <Bubble {...{ x: P.tts[0], y: P.tts[1] }} icon={Volume2} title="ElevenLabs" sub={st?.serverTts ? "TTS bereit" : "Browser-Synthese"} state={st?.serverTts ? "ok" : "warn"} />
      </div>
      <p style={{ fontSize: 12, color: MUTE, textAlign: "center", maxWidth: 640, margin: "10px auto 0", lineHeight: 1.5 }}>
        Punkte = Live-Status aus der Übersicht. Der rote Pfad ist das Tailnet zum eigenen Gehirn; bricht er,
        übernimmt Claude. Ausführliche Fassung: das <b style={{ color: INK }}>Systembild</b>-Artefakt.
      </p>
    </div>
  );
}
