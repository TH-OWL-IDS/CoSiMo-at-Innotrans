import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CabinActuation, CabinActuationResult } from "@cosimo/shared";
import { DEFAULT_PANEL_LAYOUT, SeatView, useSeat } from "@cosimo/seat-ui";

/**
 * The seat emulator: a browser stand-in for one iPad. To the hub it IS a
 * kiosk seat (same hook, same role, same events), and it renders the exact
 * SeatView the iPad renders — so what you see here is what a rider sees.
 * The physical parts are replaced by the side panel: the talk/info buttons,
 * the NFC reader, and the cabin-LAN light controller (which is logged, or
 * optionally fired for real when this machine can reach it).
 */

/**
 * Where the realtime service lives. Priority: `?server=` in the URL (kept in
 * localStorage, so it survives reloads) → the build-time VITE_REALTIME_URL →
 * same-origin (the Vite dev proxy). Mirrors the kiosk's own resolution order.
 */
function resolveServerUrl(): string {
  const KEY = "cosimo.emulator.serverUrl";
  const q = new URLSearchParams(window.location.search).get("server");
  if (q != null) {
    const url = q.trim().replace(/\/+$/, "");
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
    return url;
  }
  return localStorage.getItem(KEY) ?? (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? "";
}

interface LogEntry {
  at: string;
  control: string;
  urls: string[];
  outcome: "logged" | "ok" | "failed";
  error?: string;
}

function entry(at: string, a: CabinActuation, outcome: LogEntry["outcome"], error?: string): LogEntry {
  return { at, control: a.control, urls: a.urls, outcome, ...(error ? { error } : {}) };
}

export default function App() {
  const serverUrl = useMemo(resolveServerUrl, []);
  const seat = useSeat(serverUrl);
  const { cosimo, lang, ptt } = seat;

  const [nfc, setNfc] = useState("");
  const [text, setText] = useState("");
  const [fireForReal, setFireForReal] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const fireRef = useRef(fireForReal);
  fireRef.current = fireForReal;

  // The cabin LAN stand-in: every actuation the hub would send to this seat
  // is logged with its URLs — the cheapest way to verify the LPU-2 playback
  // mapping from your desk. "Fire for real" actually GETs them, for when the
  // dev machine is on the cabin network.
  useEffect(() => {
    const perform = async (a: CabinActuation): Promise<CabinActuationResult> => {
      const at = new Date().toLocaleTimeString();
      if (!fireRef.current) {
        setLog((l) => [entry(at, a, "logged"), ...l].slice(0, 40));
        return { control: a.control, ok: true };
      }
      for (const url of a.urls) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(a.timeoutMs), mode: "no-cors" });
          if (res.type !== "opaque" && !res.ok) throw new Error(`http ${res.status}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          setLog((l) => [entry(at, a, "failed", error), ...l].slice(0, 40));
          return { control: a.control, ok: false, error };
        }
      }
      setLog((l) => [entry(at, a, "ok"), ...l].slice(0, 40));
      return { control: a.control, ok: true };
    };
    cosimo.setCabinActuator(perform);
    return () => cosimo.setCabinActuator(null);
  }, [cosimo.setCabinActuator]);

  // Space bar = the talk button (hold), like holding "s" on the iPad.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || !seat.consentDecided) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      ptt.start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      ptt.stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ptt, seat.consentDecided]);

  const scanNfc = useCallback(() => {
    const id = nfc.trim();
    if (!id) return;
    cosimo.registerNfc(id, lang);
  }, [nfc, cosimo, lang]);

  const sendText = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    cosimo.send(t, lang, "text");
    setText("");
  }, [text, cosimo, lang]);

  const controls = cosimo.cabin;
  const statusDot = (ok: boolean | undefined) => (ok ? "🟢" : "🔴");

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", gridTemplateColumns: "1fr 340px" }}>
      {/* ── the seat, exactly as the iPad renders it ─────────────── */}
      <div style={{ position: "relative" }}>
        <SeatView seat={seat} layout={DEFAULT_PANEL_LAYOUT} fullscreen={false} />
      </div>

      {/* ── the side panel: everything the hardware would provide ── */}
      <aside
        style={{
          background: "var(--panel)",
          color: "var(--panel-ink)",
          borderLeft: "1px solid var(--panel-line)",
          padding: 16,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          fontSize: 13,
        }}
      >
        <header>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--panel-mute)" }}>COSIMO</div>
          <h1 style={{ margin: "2px 0 6px", fontSize: 18 }}>Seat emulator</h1>
          <div style={{ color: "var(--panel-mute)", lineHeight: 1.5 }}>
            {cosimo.connected ? "🟢 connected" : "🔴 connecting…"} ·{" "}
            <span title={serverUrl || "same-origin (dev proxy)"}>
              {serverUrl ? new URL(serverUrl).host : "same-origin"}
            </span>
            <br />
            seat <code>{cosimo.sessionId.slice(0, 10)}</code>
            {cosimo.persona && (
              <>
                {" "}
                · profile <b>{cosimo.persona.label}</b>
              </>
            )}
          </div>
          <div style={{ color: "var(--panel-mute)", marginTop: 6, fontSize: 11.5 }}>
            Repoint with <code>?server=https://…</code>
          </div>
        </header>

        <section>
          <p className="em-label">Buttons (ESP32)</p>
          <div style={{ display: "grid", gap: 8 }}>
            <button
              className="em-btn primary"
              data-active={ptt.active}
              disabled={!seat.consentDecided || !ptt.supported}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                ptt.start();
              }}
              onPointerUp={ptt.stop}
              onPointerCancel={ptt.stop}
              onContextMenu={(e) => e.preventDefault()}
              style={{ minHeight: 56, touchAction: "none" }}
            >
              {ptt.active ? "● listening — release to send" : "hold to talk  (or hold Space)"}
            </button>
            <button className="em-btn" disabled={!seat.consentDecided} onClick={seat.askInfo}>
              ⓘ info — canned intro question
            </button>
            {!ptt.supported && seat.consentDecided && (
              <div style={{ color: "#f0883e", fontSize: 12, lineHeight: 1.4 }}>
                Voice needs server STT (Deepgram) or Chrome — and a secure origin (https /
                localhost) for the mic.
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="em-label">NFC card</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scanNfc();
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              className="em-input"
              value={nfc}
              onChange={(e) => setNfc(e.target.value)}
              placeholder="chip id, e.g. ANNA1"
              spellCheck={false}
            />
            <button className="em-btn" type="submit" disabled={!nfc.trim()}>
              tap
            </button>
          </form>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {["ANNA1", "BRUNO1", "CLARA1", "DAVID1", "EMIL1"].map((id) => (
              <button
                key={id}
                className="em-btn"
                style={{ padding: "4px 8px", fontSize: 11.5 }}
                onClick={() => {
                  setNfc(id);
                  cosimo.registerNfc(id, lang);
                }}
              >
                {id}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="em-label">Text (test console path)</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText();
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              className="em-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={lang === "de" ? "Nachricht an CoSiMo…" : "Message to CoSiMo…"}
              disabled={!seat.consentDecided}
            />
            <button className="em-btn" type="submit" disabled={!seat.consentDecided || !text.trim()}>
              →
            </button>
          </form>
        </section>

        <section>
          <p className="em-label">Cabin (this seat)</p>
          <div style={{ display: "grid", gap: 4, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
            {controls.length === 0 && <span style={{ color: "var(--panel-mute)" }}>—</span>}
            {controls.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{c.id}</span>
                <span>
                  {c.on !== undefined ? (c.on ? "on" : "off") : `${c.level ?? 0}%`}
                  {c.degraded ? " ⚠︎" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ flex: 1, minHeight: 120, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p className="em-label">Cabin LAN — LPU-2 calls</p>
            <label style={{ fontSize: 11.5, color: "var(--panel-mute)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={fireForReal}
                onChange={(e) => setFireForReal(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              fire for real
            </label>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: "var(--panel-mute)",
              border: "1px solid var(--panel-line)",
              borderRadius: 10,
              padding: 8,
            }}
          >
            {log.length === 0 && (
              <span>
                Nothing yet. Ask CoSiMo to change the light — the URLs the hub hands this seat
                appear here{fireForReal ? " and are fired" : " (not fired)"}.
              </span>
            )}
            {log.map((e, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span style={{ color: "var(--panel-ink)" }}>
                  {e.at} {e.control}
                </span>{" "}
                <span style={{ color: e.outcome === "failed" ? "#f85149" : e.outcome === "ok" ? "#3fb950" : "inherit" }}>
                  {e.outcome}
                  {e.error ? ` — ${e.error}` : ""}
                </span>
                {e.urls.map((u) => (
                  <div key={u} style={{ paddingLeft: 8, wordBreak: "break-all" }}>
                    → GET {u}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <footer style={{ color: "var(--panel-mute)", fontSize: 11.5, lineHeight: 1.5 }}>
          {cosimo.status && (
            <>
              {statusDot(cosimo.status.llm)} llm · {statusDot(cosimo.status.serverStt)} stt ·{" "}
              {statusDot(cosimo.status.serverTts)} tts · {statusDot(cosimo.status.network)} net
              {cosimo.status.offlineCanned && " · offline canned"}
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
