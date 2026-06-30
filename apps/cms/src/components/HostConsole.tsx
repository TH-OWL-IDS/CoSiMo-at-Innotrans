"use client";

import { CABIN_CONTROLS, type PersonaKey } from "@cosimo/shared";
import { useCosimoSocket } from "./useCosimoSocket";

/**
 * Live operator console — the control surface a host uses during the demo. It
 * connects to the realtime hub as a "host" device. Config (personas, telemetry
 * scenarios, recorded sessions) lives in the Payload admin; this page is the
 * *live* half: switch persona, override the light, force telemetry, recover a
 * stuck conversation, toggle demo mode, and reset a kiosk for the next visitor.
 *
 * Hidden, unlinked route (/host). Add real auth before the fair.
 */

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";

const PERSONAS: PersonaKey[] = ["default", "eyes-free", "wheelchair", "text-first"];
const TOGGLE_CONTROLS = CABIN_CONTROLS.filter((c) => c.kind === "toggle");

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

function Dot({ ok }: { ok: boolean }) {
  return (
    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: ok ? "#3fb950" : "#6e7681", marginRight: 6 }} />
  );
}

export default function HostConsole() {
  const c = useCosimoSocket(REALTIME_URL, "host");
  const st = c.status;
  const kiosks = c.devices.filter((d) => d.role === "kiosk");
  const light = c.cabin.find((x) => x.id === "interior-light");

  return (
    <main style={{ minHeight: "100vh", background: "#0d1117", color: "#e8eaed", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>CoSiMo · Operator</h1>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {c.connected ? "● connected" : "○ offline"} · <a href="/admin" style={{ color: "#58a6ff" }}>CMS admin →</a>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {/* Services */}
        <section style={card}>
          <p style={h}>Services</p>
          {st ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 14 }}>
              <span><Dot ok={st.llm} />LLM</span>
              <span><Dot ok={st.serverStt} />STT</span>
              <span><Dot ok={st.serverTts} />TTS</span>
              <span><Dot ok={st.light} />Light</span>
              <span><Dot ok={st.network} />Network</span>
              <span><Dot ok={!st.offlineCanned} />{st.offlineCanned ? "Demo mode" : "Live"}</span>
            </div>
          ) : (
            <span style={{ opacity: 0.5 }}>waiting…</span>
          )}
        </section>

        {/* Devices */}
        <section style={card}>
          <p style={h}>Kiosks ({kiosks.length})</p>
          {kiosks.length === 0 && <span style={{ opacity: 0.5 }}>none connected</span>}
          {kiosks.map((d) => (
            <div key={d.deviceId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <code style={{ opacity: 0.8 }}>{d.deviceId}</code>
              <button style={btn} onClick={() => c.resetSession(d.deviceId)}>Reset</button>
            </div>
          ))}
        </section>

        {/* Persona */}
        <section style={card}>
          <p style={h}>Active persona</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PERSONAS.map((p) => {
              const active = c.persona?.persona === p;
              return (
                <button
                  key={p}
                  style={{ ...btn, background: active ? "#1f6feb" : btn.background, borderColor: active ? "#1f6feb" : "#3a4150" }}
                  onClick={() => c.setPersona(p)}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </section>

        {/* Cabin light overrides */}
        <section style={card}>
          <p style={h}>Cabin (override)</p>
          {TOGGLE_CONTROLS.map((def) => {
            const s = c.cabin.find((x) => x.id === def.id);
            const on = Boolean(s?.on);
            return (
              <div key={def.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                <span>
                  {def.label.en}
                  {def.real ? <span style={{ fontSize: 10, opacity: 0.6 }}> · real{s?.degraded ? " (offline)" : ""}</span> : null}
                </span>
                <button style={{ ...btn, background: on ? "#238636" : btn.background }} onClick={() => c.overrideLight(def.id, !on)}>
                  {on ? "ON" : "OFF"}
                </button>
              </div>
            );
          })}
          {light?.degraded && <span style={{ fontSize: 12, color: "#d29922" }}>⚠ interior light unreachable</span>}
        </section>

        {/* Telemetry */}
        <section style={card}>
          <p style={h}>Telemetry (force)</p>
          {c.telemetry ? (
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {Math.round(c.telemetry.speedKmh)} km/h · {c.telemetry.doorsOpen ? "doors open" : "doors closed"} · {c.telemetry.batteryPct}%
            </div>
          ) : (
            <span style={{ opacity: 0.5 }}>no telemetry</span>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button style={btn} onClick={() => c.patchTelemetry({ speedKmh: 0, doorsOpen: true })}>Halt + doors open</button>
            <button style={btn} onClick={() => c.patchTelemetry({ speedKmh: 28, doorsOpen: false })}>Resume (28 km/h)</button>
            <button style={btn} onClick={() => c.patchTelemetry({ batteryPct: 15 })}>Low battery</button>
          </div>
        </section>

        {/* Recovery */}
        <section style={card}>
          <p style={h}>Recovery</p>
          <button style={{ ...btn, background: "#30363d" }} onClick={() => c.recover()}>
            Recover stuck conversation
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={Boolean(st?.offlineCanned)}
              onChange={(e) => c.toggleOffline(e.target.checked)}
            />
            Demo / offline mode
          </label>
        </section>
      </div>
    </main>
  );
}
