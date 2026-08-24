import { useEffect, useState } from "react";
import {
  CABIN_CONTROLS,
  type Accommodations,
  type ConnectionStatus,
  type LogEvent,
  type MonoCabTelemetry,
  type PersonaBroadcast,
  type PersonaKey,
  type SeatInspection,
  type SeatSummary,
} from "@cosimo/shared";
import { useCosimoSocket, type CosimoState } from "@cosimo/client";
import { resolveServerUrl } from "./serverUrl";
import LogView from "./LogView";
import logoUrl from "./assets/monocab-logo.svg";
import cabUrl from "./assets/monocab-base.svg";

/**
 * Die Konsole — the live operator surface, four views behind one header:
 *
 *  ÜBERSICHT  every service the demo depends on, with a detail line and the
 *             operations that belong next to a red dot (recover, demo mode).
 *  FAHRZEUG   the MonoCab itself: the CI line drawing, live state around it,
 *             and the journey/fault controls.
 *  SESSIONS   one card per active seat (persona, accommodations, cabin,
 *             conversation, inspector), idle seats as chips.
 *  LOGS       the structured debug stream (LogView).
 *
 * Served by apps/console (its own static service, not the CMS) so it stays
 * up during the show regardless of the CMS. Unauthenticated — the hub needs
 * a host token before the fair.
 */

const REALTIME_URL = resolveServerUrl();

const TOGGLE_CONTROLS = CABIN_CONTROLS.filter((c) => c.kind === "toggle");

const INK = "#181817";
const MUTE = "#6b6b6b";
const LINE = "#e4e4e4";
const ACCENT = "#e40041";
const OK = "#1a7f37";
const WARN = "#b45309";

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
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: 16,
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(24, 24, 23, 0.04)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #d9d9d9",
  background: "#ffffff",
  color: INK,
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

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: ok ? OK : warn ? WARN : ACCENT,
        flexShrink: 0,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────
 * ÜBERSICHT — every dependency with a status and a sentence of detail
 * ──────────────────────────────────────────────────────────────── */

function ServiceRow({ ok, warn, name, detail }: { ok: boolean; warn?: boolean; name: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 0", borderBottom: `1px solid #f0f0f0` }}>
      <Dot ok={ok} warn={warn} />
      <span style={{ fontSize: 14, fontWeight: 600, width: 130, flexShrink: 0 }}>{name}</span>
      <span style={{ fontSize: 13, color: MUTE }}>{detail}</span>
    </div>
  );
}

function OverviewTab({ c, st }: { c: CosimoState; st: ConnectionStatus | null }) {
  // The log stream carries the richer facts: which brain answers, and
  // whether the fallback is standing in for it.
  const lastTurnLlm = [...c.logs].reverse().find((e) => e.kind === "turn.start" && e.data.llm !== null);
  const llmName = lastTurnLlm?.kind === "turn.start" && lastTurnLlm.data.llm
    ? `${lastTurnLlm.data.llm.provider} · ${lastTurnLlm.data.llm.model}` : "noch kein Turn";
  const lastSvc = [...c.logs].reverse().find(
    (e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status",
  );
  const fallbackActive = Boolean(lastSvc && "llmFallbackActive" in lastSvc.data && lastSvc.data.llmFallbackActive);
  const since = lastSvc ? new Date(lastSvc.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
  const kiosks = c.devices.filter((d) => d.role === "kiosk").length;

  return (
    <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 24 }}>
      <section style={card}>
        <p style={h}>Dienste</p>
        {st ? (
          <div>
            <ServiceRow
              ok={c.connected}
              name="Verbindung"
              detail={c.connected ? `Hub verbunden · ${kiosks} Kiosk${kiosks === 1 ? "" : "s"}, ${c.devices.length - kiosks} Konsole(n)` : "keine Verbindung zum Hub"}
            />
            <ServiceRow
              ok={st.llm}
              warn={fallbackActive}
              name="LLM"
              detail={
                st.llm
                  ? `${llmName}${fallbackActive ? " — Fallback aktiv" : ""}${since ? ` · seit ${since}` : ""}`
                  : "Gehirn nicht erreichbar — Antworten kommen aus dem Skript"
              }
            />
            <ServiceRow
              ok={st.serverStt}
              warn={!st.serverStt}
              name="Hören (STT)"
              detail={st.serverStt ? "Deepgram (Server)" : "kein Server-STT — Browser-Erkennung, wo vorhanden"}
            />
            <ServiceRow
              ok={st.serverTts}
              warn={!st.serverTts}
              name="Sprechen (TTS)"
              detail={st.serverTts ? "ElevenLabs (Server)" : "Browser-Synthese"}
            />
            <ServiceRow ok={st.light} name="Licht" detail={st.light ? "Treiber verbunden (Kabine über die Sitze)" : "kein Licht-Treiber"} />
            <ServiceRow ok={st.network} name="Netzwerk" detail={st.network ? "Internet erreichbar" : "kein Internet — Offline-Modus"} />
            <ServiceRow
              ok={!st.offlineCanned}
              warn={st.offlineCanned}
              name="Modus"
              detail={st.offlineCanned ? "Demo-Modus: geskriptete Antworten" : "Live: der Agent antwortet"}
            />
          </div>
        ) : (
          <span style={{ color: MUTE }}>warte auf Status …</span>
        )}
      </section>

      <section style={card}>
        <p style={h}>Betrieb</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <button style={{ ...btn, background: "#f0f0f0" }} onClick={() => c.recover()}>
            Hängende Unterhaltung lösen
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(st?.offlineCanned)}
              onChange={(e) => c.toggleOffline(e.target.checked)}
            />
            Demo- / Offline-Modus
          </label>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: MUTE }}>Alle Sitze:</span>
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
          </span>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * FAHRZEUG — the MonoCab itself, state arranged around the CI drawing
 * ──────────────────────────────────────────────────────────────── */

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 14px", background: "#fff" }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: MUTE }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: warn ? WARN : INK, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function VehicleTab({ c, t }: { c: CosimoState; t: MonoCabTelemetry | null }) {
  if (!t) return <span style={{ color: MUTE }}>keine Telemetrie …</span>;
  const fault = t.faults?.[0];
  const outbound = t.position?.direction !== "return";
  const holding = t.position?.phase === "hold";
  const next = t.nextStops[0];
  const seats = Array.from({ length: t.capacity }, (_, i) => ({
    live: i < (t.seats?.liveSessions ?? 0),
    taken: i < t.occupancy,
  }));

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* disruption first — it is the one thing that changes everything below */}
      {fault && (
        <div
          style={{
            alignSelf: "center",
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            border: `1px solid ${WARN}`,
            color: WARN,
            background: "#fff8f0",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 14,
          }}
        >
          <span>⚠</span>
          <span>{fault.cause.de}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
            {Math.floor(fault.remainingSec / 60)}:{String(fault.remainingSec % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {/* the vehicle */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: holding ? WARN : INK }}>
          {Math.round(t.speedKmh)} <span style={{ fontSize: 15, fontWeight: 500, color: MUTE }}>km/h</span>
        </div>
        <img src={cabUrl} alt="MonoCab" style={{ width: "min(560px, 90%)", display: "block" }} />
        <div style={{ fontSize: 14, color: MUTE }}>
          {outbound ? "→" : "←"} {t.destination.de} · {t.line.de}
          {t.simPaused ? " · ⏸ pausiert" : ""}
          {holding ? " · Halt" : t.doorsOpen ? " · Türen offen" : ""}
        </div>
      </div>

      {/* the state, symmetric around it */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Stat label="Position" value={t.location.de} />
        <Stat
          label="Nächster Halt"
          value={next ? next.name.de : "—"}
          sub={next ? (next.etaMinutes === 0 ? "jetzt" : `in ${next.etaMinutes} min`) : ""}
        />
        <Stat
          label="Verspätung"
          value={t.delayMinutes > 0 ? `+${t.delayMinutes} min` : "pünktlich"}
          warn={t.delayMinutes > 0}
        />
        <Stat
          label="Akku"
          value={`${Math.round(t.batteryPct)} %`}
          warn={t.batteryPct < 20}
          sub={
            <span style={{ display: "block", height: 4, borderRadius: 2, background: "#eee", marginTop: 4 }}>
              <span
                style={{
                  display: "block",
                  height: 4,
                  borderRadius: 2,
                  width: `${Math.round(t.batteryPct)}%`,
                  background: t.batteryPct < 20 ? WARN : OK,
                }}
              />
            </span>
          }
        />
        <Stat label="Türen" value={t.doorsOpen ? "offen" : "geschlossen"} />
        <Stat
          label="Fahrgäste"
          value={`${t.occupancy} / ${t.capacity}`}
          sub={
            <span style={{ display: "inline-flex", gap: 4, marginTop: 4 }}>
              {seats.map((s, i) => (
                <span
                  key={i}
                  title={s.live ? "echter Fahrgast (CoSiMo-Sitz aktiv)" : s.taken ? "simuliert" : "frei"}
                  style={{
                    width: 13,
                    height: 17,
                    borderRadius: "4px 4px 2px 2px",
                    background: s.live ? ACCENT : s.taken ? INK : "transparent",
                    border: `1.5px solid ${INK}`,
                    opacity: s.taken ? 1 : 0.3,
                  }}
                />
              ))}
            </span>
          }
        />
      </div>

      {/* controls that belong to the vehicle */}
      <section style={card}>
        <p style={h}>Fahrt steuern</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={btn} onClick={() => c.patchTelemetry({ paused: !t.simPaused })}>
            {t.simPaused ? "▶ Weiterfahren" : "⏸ Fahrt anhalten"}
          </button>
          <button style={btn} onClick={() => c.patchTelemetry({ batteryPct: 15 })}>Akku schwach</button>
        </div>
        <p style={{ ...h, marginTop: 6 }}>Störung auslösen</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={btn} onClick={() => c.patchTelemetry({ fault: { kind: "signal-hold" } })}>⚠ Halt vor Signal</button>
          <button style={btn} onClick={() => c.patchTelemetry({ fault: { kind: "door-fault" } })}>⚠ Türstörung</button>
          <button style={btn} onClick={() => c.patchTelemetry({ fault: { kind: "slow-order" } })}>⚠ Langsamfahrt</button>
          <button style={btn} onClick={() => c.patchTelemetry({ fault: { kind: "low-battery" } })}>⚠ Akku niedrig</button>
          {(t.faults?.length ?? 0) > 0 && (
            <button style={{ ...btn, background: "#f0f0f0" }} onClick={() => c.patchTelemetry({ clearFaults: true })}>
              ✔ Störung beheben
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * SESSIONS — the seats and their conversations
 * ──────────────────────────────────────────────────────────────── */

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

  const roleColor = (r: string) => (r === "user" ? OK : "#0969da");
  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(520px, 92vw)",
        background: "#ffffff",
        borderLeft: `1px solid ${LINE}`,
        boxShadow: "-8px 0 24px rgba(24,24,23,0.08)",
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
              background: "#f6f6f6",
              border: `1px solid ${LINE}`,
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
                border: "1px solid #e9e9e9",
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
              {(t.actions ?? (t.action ? [t.action] : [])).map((a, j) => (
                <code
                  key={j}
                  title={a.result}
                  style={{
                    fontSize: 11,
                    opacity: 0.85,
                    background: "#f6f6f6",
                    borderRadius: 6,
                    padding: "3px 6px",
                    borderLeft: `2px solid ${a.ok === false ? ACCENT : LINE}`,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  ⚙ {a.tool}
                  {a.control ? ` ${a.control}` : ""}
                  {a.args ? ` ${JSON.stringify(a.args)}` : ""}
                  {a.result ? ` → ${a.result.length > 160 ? `${a.result.slice(0, 160)}…` : a.result}` : ""}
                  {a.durationMs != null ? ` · ${a.durationMs} ms` : ""}
                </code>
              ))}
              {t.error && (
                <code style={{ fontSize: 11, color: ACCENT, background: "#f6f6f6", borderRadius: 6, padding: "3px 6px", whiteSpace: "pre-wrap" }}>
                  ✖ {t.error}
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
    <section style={{ ...card, borderColor: seat.phase !== "idle" ? ACCENT : LINE }}>
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
            style={{ fontSize: 11, opacity: 0.7, border: `1px solid ${LINE}`, borderRadius: 999, padding: "2px 8px" }}
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
              style={{
                ...btn,
                fontSize: 12,
                padding: "5px 10px",
                background: on ? OK : btn.background,
                color: on ? "#fff" : INK,
                borderColor: on ? OK : "#d9d9d9",
              }}
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

function SessionsTab({ c }: { c: CosimoState }) {
  const activeSeats = c.seats.filter((s) => s.active);
  const idleSeats = c.seats.filter((s) => !s.active);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ ...h }}>
        {activeSeats.length} aktiv{idleSeats.length ? ` · ${idleSeats.length} frei` : ""}
        {c.seats.length === 0 ? " · keine iPads verbunden" : ""}
      </p>
      {activeSeats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
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
      {idleSeats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {idleSeats.map((seat) => (
            <span
              key={seat.deviceId}
              style={{ fontSize: 12, opacity: 0.55, border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 12px" }}
            >
              {EMOTION_ICON[seat.emotion] ?? "·"} <code>{seat.deviceId}</code> · wartet
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Shell — header with the four tabs
 * ──────────────────────────────────────────────────────────────── */

type Tab = "uebersicht" | "fahrzeug" | "sessions" | "logs";
const TABS: { id: Tab; label: string }[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "fahrzeug", label: "Fahrzeug" },
  { id: "sessions", label: "Sessions" },
  { id: "logs", label: "Logs" },
];

function tabFromHash(): Tab {
  const hash = window.location.hash.replace("#", "");
  if (hash === "log" || hash === "logs") return "logs";
  return (TABS.some((t) => t.id === hash) ? hash : "uebersicht") as Tab;
}

export default function HostConsole() {
  const c = useCosimoSocket(REALTIME_URL, "host");
  const st = c.status;
  // The tab survives a reload — during the show that is the one you left open.
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const switchTab = (t: Tab) => {
    setTab(t);
    window.location.hash = t;
  };
  const errors = c.logs.filter((e) => e.level === "error").length;
  const activeSeats = c.seats.filter((s) => s.active).length;
  const anyDown = Boolean(st && (!st.llm || !st.network || st.offlineCanned)) || !c.connected;

  const badge = (t: Tab): React.ReactNode => {
    if (t === "uebersicht" && anyDown) return <span style={{ color: ACCENT }}>●</span>;
    if (t === "sessions" && activeSeats > 0) return <span style={{ color: MUTE }}>{activeSeats}</span>;
    if (t === "logs" && errors > 0) return <span style={{ color: ACCENT }}>{errors}</span>;
    return null;
  };

  return (
    <main style={{ minHeight: "100vh", background: "#ffffff", color: INK }}>
      {/* ── the header: logo, "Konsole", the four views ──────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#ffffff",
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          padding: "0 24px",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
            <img src={logoUrl} alt="MonoCab" width={40} height={40} style={{ display: "block" }} />
            <h1 style={{ fontSize: 18, margin: 0, fontWeight: 600, letterSpacing: 0.5 }}>Konsole</h1>
          </div>
          <nav style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  style={{
                    appearance: "none",
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
                    marginBottom: -1,
                    padding: "0 14px",
                    font: "inherit",
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? INK : MUTE,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {t.label}
                  {badge(t.id)}
                </button>
              );
            })}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: MUTE }}>
          <Dot ok={c.connected} />
          {c.connected ? "verbunden" : "getrennt"}
        </div>
      </header>

      <div style={{ padding: 24 }}>
        {tab === "uebersicht" && <OverviewTab c={c} st={st} />}
        {tab === "fahrzeug" && <VehicleTab c={c} t={c.telemetry} />}
        {tab === "sessions" && <SessionsTab c={c} />}
        {tab === "logs" && <LogView logs={c.logs} onClear={c.clearLogs} onReplay={() => c.replayLogs()} />}
      </div>

      {c.inspection && (
        <InspectorDrawer
          inspection={c.inspection}
          onRefresh={() => c.inspectSeat(c.inspection!.deviceId)}
          onClose={() => c.clearInspection()}
        />
      )}
    </main>
  );
}
