/**
 * The system picture for the Hilfe view: who talks to whom. One inline SVG
 * on the CI variables — the live path (seat ↔ hub) in accent, everything
 * else ink, the fallback dashed. Positions are data, so they stay inline.
 * Wide by nature; the wrapper scrolls sideways on a phone.
 */

const INK = "var(--color-ink)";
const MUTE = "var(--color-mute)";
const ACCENT = "var(--color-accent)";
const WELL = "var(--color-well)";

function Box({ x, y, w, h, title, sub, dashed, accent }: { x: number; y: number; w: number; h: number; title: string; sub?: string; dashed?: boolean; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="white" stroke={accent ? ACCENT : INK} strokeWidth={1.2} strokeDasharray={dashed ? "4 3" : undefined} />
      <text x={x + 10} y={y + (sub ? 19 : h / 2 + 4)} fontSize={12.5} fontWeight={700} fill={INK}>{title}</text>
      {sub && <text x={x + 10} y={y + 36} fontSize={10.5} fill={MUTE}>{sub}</text>}
    </g>
  );
}

function Group({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={WELL} stroke={INK} strokeWidth={1} strokeDasharray="2 3" />
      <text x={x + 12} y={y + 18} fontSize={10.5} fontWeight={600} fill={MUTE} letterSpacing={1}>{label.toUpperCase()}</text>
    </g>
  );
}

/** A straight or elbowed edge with an arrow head and a small label. */
function Edge({ d, label, lx, ly, accent, dashed, both }: { d: string; label?: string; lx?: number; ly?: number; accent?: boolean; dashed?: boolean; both?: boolean }) {
  const stroke = accent ? ACCENT : INK;
  const marker = accent ? "url(#arrow-accent)" : "url(#arrow-ink)";
  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeWidth={accent ? 1.8 : 1.2} strokeDasharray={dashed ? "4 3" : undefined} markerEnd={marker} markerStart={both ? marker : undefined} />
      {label && lx != null && ly != null && (
        <text x={lx} y={ly} fontSize={10} fill={accent ? ACCENT : MUTE} textAnchor="middle">{label}</text>
      )}
    </g>
  );
}

export default function SystemDiagram() {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white p-2">
      <svg viewBox="0 0 980 470" className="block h-auto min-w-[860px] w-full font-mono" role="img" aria-label="Systembild: vier iPads in der Kabine, der Hub auf dem VPS, das CMS, die Sprach- und Sprachmodell-Dienste, der Lichtcontroller im Kabinen-LAN">
        <defs>
          <marker id="arrow-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
          </marker>
          <marker id="arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={ACCENT} />
          </marker>
        </defs>

        {/* ── the cabin at the stand ── */}
        <Group x={16} y={16} w={262} h={438} label="Kabine am Stand" />
        {[1, 2, 3, 4].map((n) => (
          <Box key={n} x={36} y={40 + (n - 1) * 56} w={170} h={44} title={`Sitz ${n} · iPad mini`} sub="Tasten · NFC · Panel" accent />
        ))}
        <text x={36} y={286} fontSize={10.5} fill={MUTE}>WLAN → Hub · USB-C-Ethernet → Kabinen-LAN</text>
        <Edge d="M 121 264 L 121 344" label="HTTP GET, fertige URLs vom Hub" lx={165} ly={318} />
        <Box x={36} y={346} w={222} h={56} title="Cuety LPU-2" sub="DMX-Licht · abgeschottet, kein Internet" />
        <text x={36} y={430} fontSize={10.5} fill={MUTE}>Nur die iPads erreichen die LPU-2.</text>

        {/* ── the tunnel ── */}
        <Box x={318} y={128} w={104} h={40} title="Cloudflare" sub="Tunnel, TLS" />
        <Edge d="M 206 150 L 316 150" accent both />
        <Edge d="M 422 148 L 474 148" accent both label="WSS" lx={448} ly={140} />

        {/* ── the VPS ── */}
        <Group x={476} y={16} w={270} h={438} label="VPS · Docker" />
        <Box x={496} y={110} w={230} h={80} title="Hub · apps/realtime" sub="Socket.IO · Agent · Fahrt · Licht" accent />
        <text x={506} y={178} fontSize={10} fill={MUTE}>ws-cosimo.homannjohannes.de</text>
        <Box x={496} y={248} w={230} h={64} title="CMS · Payload + Postgres" sub="Profile · Route · Konfig · Sessions" />
        <text x={506} y={302} fontSize={10} fill={MUTE}>cms-cosimo.homannjohannes.de</text>
        <Box x={496} y={362} w={230} h={72} title="Konsole · Emulator · Fahrt" sub="statische Bundles, nur Socket" />
        <text x={506} y={416} fontSize={10} fill={MUTE}>console- · seat- · journey-cosimo</text>
        <Edge d="M 611 192 L 611 246" label="REST, Cache 15 s" lx={670} ly={224} />
        <Edge d="M 540 360 L 540 314" dashed={false} />
        <Edge d="M 560 360 C 560 330, 480 330, 480 190 C 480 175, 486 165, 494 160" label="WSS" lx={470} ly={270} />

        {/* ── the services ── */}
        <Group x={776} y={16} w={188} h={438} label="Dienste im Internet" />
        <Box x={796} y={44} w={150} h={48} title="Deepgram" sub="STT · hört" />
        <Box x={796} y={124} w={150} h={48} title="ElevenLabs" sub="TTS · spricht" />
        <Box x={796} y={228} w={150} h={60} title="GX10 · vLLM" sub="das Gehirn (Qwen)" />
        <text x={806} y={278} fontSize={10} fill={MUTE}>über Tailscale</text>
        <Box x={796} y={330} w={150} h={60} title="Claude (Anthropic)" sub="Fallback-Gehirn" dashed />
        <text x={806} y={380} fontSize={10} fill={MUTE}>springt automatisch ein</text>
        <Edge d="M 728 130 C 760 130, 760 68, 794 68" />
        <Edge d="M 728 148 L 794 148" />
        <Edge d="M 728 166 C 760 166, 760 258, 794 258" />
        <Edge d="M 728 180 C 764 180, 764 360, 794 360" dashed />
        <text x={760} y={430} fontSize={10.5} fill={MUTE}>Alles hier darf ausfallen:</text>
        <text x={760} y={444} fontSize={10.5} fill={MUTE}>CoSiMo antwortet dann vorgefertigt.</text>
      </svg>
    </div>
  );
}
