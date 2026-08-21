import { useEffect } from "react";
import {
  CABIN_CONTROLS,
  type Accommodations,
  type PersonaBroadcast,
  type PersonaKey,
  type SeatInspection,
  type SeatSummary,
} from "@cosimo/shared";
import { useCosimoSocket } from "@cosimo/client";
import { resolveServerUrl } from "./serverUrl";

/**
 * Live operator console (/host). Two levels, mirroring the architecture:
 *
 *  GLOBALS — the journey everyone shares: services health, telemetry
 *  (speed/destination/battery + force buttons), demo mode, recovery.
 *
 *  SEATS — each iPad is its own kiosk seat with its own session. Cards appear
 *  only while a session is active (visitor engaged); idle seats show as
 *  chips. Per seat: face/phase, persona (NFC or manual), reading lamp & co.,
 *  the live conversation snippet, and reset for the next visitor.
 *
 * Served by apps/console (its own static service, not the CMS) so it stays
 * up during the show regardless of the CMS. Unauthenticated — the hub needs
 * a host token before the fair.
 */

const REALTIME_URL = resolveServerUrl();

const TOGGLE_CONTROLS = CABIN_CONTROLS.filter((c) => c.kind === "toggle");

/**
 * Persona options for a picker, built from the live (CMS-authored) set the
 * realtime service broadcasts. `ensureKey` guarantees the currently-selected
 * key is always an option even if it has since been removed from the set.
 */
function personaOptions(
  personas: PersonaBroadcast[],
  ensureKey?: PersonaKey,
): { key: PersonaKey; label: string }[] {
  const opts = personas.map((p) => ({ key: p.persona, label: p.label || p.persona }));
  if (ensureKey && !opts.some((o) => o.key === ensureKey)) {
    opts.unshift({ key: ensureKey, label: ensureKey });
  }
  return opts;
}

const EMOTION_ICON: Record<string, string> = {
  neutral: "😐", happy: "😊", thinking: "🤔", listening: "👂",
  speaking: "💬", sleeping: "😴", sad: "😞", surprised: "😲",
};

const card: React.CSSProperties = {
  border: "1px solid #2a2f3a",
  borderRadius: 12,
  padding: 16,
  background: "#181b22",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #3a4150",
  background: "#222732",
  color: "#e8eaed",
  cursor: "pointer",
  fontSize: 14,
};
const h: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55, margin: 0 };

/** Compact chips describing the accommodations a seat is presenting with. */
function accommodationChips(a: Accommodations): string[] {
  return [
    a.theme,
    `Text ${a.textSize.toUpperCase()}`,
    a.contrast === "high" ? "Kontrast" : null,
    a.audioOutput ? "Audio" : "🔇",
    a.showText ? "Text sichtbar" : null,
    a.reduceMotion ? "ruhig" : null,
    `Eingabe: ${a.input}`,
  ].filter((c): c is string => Boolean(c));
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: ok ? "#3fb950" : "#6e7681", marginRight: 6 }} />
  );
}

/**
 * Deep view of one seat: the exact live system prompt and the recorded
 * conversation incl. tool calls, outcomes and latencies. Auto-refreshes
 * while open so a running turn appears as it happens.
 */
function InspectorDrawer({
  inspection,
  onRefresh,
  onClose,
}: {
  inspection: SeatInspection;
  onRefresh: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setInterval(onRefresh, 2000);
    return () => clearInterval(t);
  }, [onRefresh]);

  const roleColor = (r: string) => (r === "user" ? "#7ee1a2" : "#8ab8ff");
  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(520px, 92vw)",
        background: "#11141a",
        borderLeft: "1px solid #2a2f3a",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14 }}>
          <b>🔍 {inspection.deviceId}</b>{" "}
          <span style={{ opacity: 0.6 }}>
            · {inspection.persona} · {inspection.sessionId || "keine Session"}
          </span>
        </div>
        <button style={{ ...btn, padding: "4px 10px" }} onClick={onClose}>✕</button>
      </div>

      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, opacity: 0.8 }}>
            Systemprompt ({inspection.systemPrompt.length} Zeichen)
          </summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 11.5,
              lineHeight: 1.45,
              background: "#0b0e13",
              border: "1px solid #2a2f3a",
              borderRadius: 10,
              padding: 10,
              margin: "8px 0 0",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {inspection.systemPrompt}
          </pre>
        </details>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>
            Verlauf ({inspection.turns.length} Turns)
          </span>
          {inspection.turns.length === 0 && (
            <span style={{ opacity: 0.45, fontSize: 13 }}>noch keine Unterhaltung</span>
          )}
          {inspection.turns.map((t, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #232936",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
                <span style={{ color: roleColor(t.role) }}>
                  {t.role === "user" ? "Gast" : "CoSiMo"} · {t.modality} · {t.lang}
                </span>
                <span>
                  {t.faceEmotion ? `${t.faceEmotion} · ` : ""}
                  {t.latencyMs != null ? `${(t.latencyMs / 1000).toFixed(1)}s · ` : ""}
                  {t.outcome ?? ""}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{t.transcript || <i style={{ opacity: 0.4 }}>(leer)</i>}</div>
              {t.action && (
                <code style={{ fontSize: 11, opacity: 0.8, background: "#0b0e13", borderRadius: 6, padding: "3px 6px" }}>
                  ⚙ {t.action.tool}
                  {t.action.control ? ` ${t.action.control}` : ""}
                  {t.action.args ? ` ${JSON.stringify(t.action.args)}` : ""}
                </code>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SeatCard({
  seat,
  personas,
  onPersona,
  onLight,
  onReset,
  onInspect,
}: {
  seat: SeatSummary;
  personas: PersonaBroadcast[];
  onPersona: (key: PersonaKey) => void;
  onLight: (control: (typeof TOGGLE_CONTROLS)[number]["id"], on: boolean) => void;
  onReset: () => void;
  onInspect: () => void;
}) {
  return (
    <section style={{ ...card, borderColor: seat.phase !== "idle" ? "#1f6feb" : "#2a2f3a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {EMOTION_ICON[seat.emotion] ?? "·"} <code style={{ fontSize: 12, opacity: 0.7 }}>{seat.deviceId}</code>
        </span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {seat.phase !== "idle" ? `● ${seat.phase}` : "idle"}
          {seat.consent ? " · ✓ consent" : " · no recording"}
        </span>
      </div>

      {/* persona — set by NFC chip or manually here */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ opacity: 0.6 }}>Persona</span>
        <select
          value={seat.persona}
          onChange={(e) => onPersona(e.target.value)}
          style={{ ...btn, padding: "6px 10px", fontSize: 13 }}
        >
          {personaOptions(personas, seat.persona).map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{seat.personaLabel}</span>
      </div>

      {/* accommodations CoSiMo is presenting with (live, voice-mutable) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {accommodationChips(seat.accommodations).map((c) => (
          <span
            key={c}
            style={{ fontSize: 11, opacity: 0.7, border: "1px solid #2a2f3a", borderRadius: 999, padding: "2px 8px" }}
          >
            {c}
          </span>
        ))}
      </div>

      {/* what CoSiMo has remembered about this rider */}
      {seat.memories.length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.8, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ opacity: 0.55 }}>Erinnert:</span>
          {seat.memories.map((m, i) => (
            <span key={i}>· {m}</span>
          ))}
        </div>
      )}

      {/* per-seat cabin (reading lamp etc.) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {TOGGLE_CONTROLS.map((def) => {
          const s = seat.controls.find((x) => x.id === def.id);
          const on = Boolean(s?.on);
          return (
            <button
              key={def.id}
              style={{ ...btn, fontSize: 12, padding: "5px 10px", background: on ? "#238636" : btn.background }}
              onClick={() => onLight(def.id, !on)}
              title={def.real ? "real hardware" : "simulated"}
            >
              {def.label.de} {on ? "an" : "aus"}{s?.degraded ? " ⚠" : ""}
            </button>
          );
        })}
      </div>

      {/* live conversation snippet */}
      <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, minHeight: 40 }}>
        {seat.lastUser && (
          <div style={{ opacity: 0.75 }}>
            <span style={{ opacity: 0.55 }}>Gast: </span>{seat.lastUser}
          </div>
        )}
        {seat.lastReply && (
          <div style={{ opacity: 0.9 }}>
            <span style={{ opacity: 0.55 }}>CoSiMo: </span>{seat.lastReply}
          </div>
        )}
        {!seat.lastUser && !seat.lastReply && (
          <span style={{ opacity: 0.4 }}>noch keine Unterhaltung</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn} onClick={onInspect}>🔍 Verlauf</button>
        <button style={btn} onClick={onReset}>Sitz zurücksetzen</button>
      </div>
    </section>
  );
}

export default function HostConsole() {
  const c = useCosimoSocket(REALTIME_URL, "host");
  const st = c.status;
  const activeSeats = c.seats.filter((s) => s.active);
  const idleSeats = c.seats.filter((s) => !s.active);

  return (
    <main style={{ minHeight: "100vh", background: "#0d1117", color: "#e8eaed", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>CoSiMo · Operator</h1>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {c.connected ? "● connected" : "○ offline"} · <a href="/admin" style={{ color: "#58a6ff" }}>CMS admin →</a>
        </div>
      </header>

      {/* ── GLOBALS: the journey everyone shares ─────────────────── */}
      <p style={{ ...h, marginBottom: 10 }}>Fahrt (global)</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
        <section style={card}>
          <p style={h}>Services</p>
          {st ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 14 }}>
              <span><Dot ok={st.llm} />LLM</span>
              <span><Dot ok={st.serverStt} />STT</span>
              <span><Dot ok={st.serverTts} />TTS</span>
              <span><Dot ok={st.light} />Licht</span>
              <span><Dot ok={st.network} />Netz</span>
              <span><Dot ok={!st.offlineCanned} />{st.offlineCanned ? "Demo-Modus" : "Live"}</span>
            </div>
          ) : (
            <span style={{ opacity: 0.5 }}>waiting…</span>
          )}
        </section>

        <section style={card}>
          <p style={h}>Fahrt (Simulation)</p>
          {c.telemetry ? (
            <div style={{ fontSize: 13, opacity: 0.85, display: "flex", flexDirection: "column", gap: 3 }}>
              <span>
                → {c.telemetry.destination.de} · {Math.round(c.telemetry.speedKmh)} km/h
                {c.telemetry.simPaused ? " · ⏸ pausiert" : ""}
              </span>
              <span>{c.telemetry.location.de}</span>
              <span>
                Nächster Halt: {c.telemetry.nextStops[0] ? `${c.telemetry.nextStops[0].name.de} · ${c.telemetry.nextStops[0].etaMinutes} min` : "—"}
              </span>
              <span>
                {c.telemetry.doorsOpen ? "Türen offen" : "Türen zu"} · Akku {Math.round(c.telemetry.batteryPct)} % · {c.telemetry.occupancy}/{c.telemetry.capacity} Plätze
              </span>
            </div>
          ) : (
            <span style={{ opacity: 0.5 }}>keine Telemetrie</span>
          )}
          {/* the journey drives itself (route in /admin); hosts can hold it */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              style={btn}
              onClick={() => c.patchTelemetry({ paused: !c.telemetry?.simPaused })}
            >
              {c.telemetry?.simPaused ? "▶ Weiterfahren" : "⏸ Fahrt anhalten"}
            </button>
            <button style={btn} onClick={() => c.patchTelemetry({ batteryPct: 15 })}>Akku schwach</button>
          </div>
        </section>

        <section style={card}>
          <p style={h}>Betrieb</p>
          <button style={{ ...btn, background: "#30363d" }} onClick={() => c.recover()}>
            Hängende Unterhaltung lösen
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={Boolean(st?.offlineCanned)}
              onChange={(e) => c.toggleOffline(e.target.checked)}
            />
            Demo- / Offline-Modus
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.6 }}>Alle Sitze:</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) c.setPersona(e.target.value);
                e.target.value = "";
              }}
              style={{ ...btn, padding: "6px 10px", fontSize: 13 }}
            >
              <option value="" disabled>Persona wählen…</option>
              {personaOptions(c.personas).map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {/* ── SEATS: one card per active session ───────────────────── */}
      <p style={{ ...h, marginBottom: 10 }}>
        Sitze ({activeSeats.length} aktiv{idleSeats.length ? ` · ${idleSeats.length} frei` : ""}
        {c.seats.length === 0 ? " · keine iPads verbunden" : ""})
      </p>
      {activeSeats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
          {activeSeats.map((seat) => (
            <SeatCard
              key={seat.deviceId}
              seat={seat}
              personas={c.personas}
              onInspect={() => c.inspectSeat(seat.deviceId)}
              onPersona={(p) => c.setPersona(p, seat.deviceId)}
              onLight={(control, on) => c.overrideLight(seat.deviceId, control, on)}
              onReset={() => c.resetSession(seat.deviceId)}
            />
          ))}
        </div>
      )}
      {c.inspection && (
        <InspectorDrawer
          inspection={c.inspection}
          onRefresh={() => c.inspectSeat(c.inspection!.deviceId)}
          onClose={() => c.clearInspection()}
        />
      )}
      {idleSeats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {idleSeats.map((seat) => (
            <span
              key={seat.deviceId}
              style={{ fontSize: 12, opacity: 0.55, border: "1px solid #2a2f3a", borderRadius: 999, padding: "5px 12px" }}
            >
              {EMOTION_ICON[seat.emotion] ?? "·"} <code>{seat.deviceId}</code> · wartet
            </span>
          ))}
        </div>
      )}
    </main>
  );
}
