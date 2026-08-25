import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CabinActuation, CabinActuationResult } from "@cosimo/shared";
import { DEFAULT_PANEL_LAYOUT, SeatView, useSeat } from "@cosimo/seat-ui";
import { Brand, Button, Dot, Eyebrow, Input, cn } from "@cosimo/ui";
import { resolveServerUrl } from "./serverUrl";

/**
 * The seat emulator: a browser stand-in for one iPad. To the hub it IS a
 * kiosk seat (same hook, same role, same events), and it renders the exact
 * SeatView the iPad renders — so what you see here is what a rider sees.
 * The physical parts are replaced by the side panel: the talk/info buttons,
 * the NFC reader, and the cabin-LAN light controller (which is logged, or
 * optionally fired for real when this machine can reach it). The panel
 * wears the console's white CI (@cosimo/ui); the seat column stays black.
 */

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
  const seat = useSeat(serverUrl, "emulator");
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
  const Status = ({ ok, label }: { ok: boolean | undefined; label: string }) => (
    <span className="inline-flex items-center gap-1.5"><Dot size="sm" state={ok ? "ok" : "down"} />{label}</span>
  );

  return (
    <div className="fixed inset-0 grid grid-cols-[1fr_340px]">
      {/* ── the seat, exactly as the iPad renders it — including the
             kiosk's system font, which SeatView inherits ──────────── */}
      <div className="relative bg-black font-sans">
        <SeatView seat={seat} layout={DEFAULT_PANEL_LAYOUT} fullscreen={false} />
      </div>

      {/* ── the side panel: everything the hardware would provide ── */}
      <aside className="flex flex-col gap-4 overflow-y-auto border-l border-line bg-white p-4 text-md text-ink">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Seat emulator">
            <Brand size={32} />
          </h1>
          <Eyebrow size="xs">Seat emulator</Eyebrow>
          <div className="leading-normal text-mute">
            <Status ok={cosimo.connected} label={cosimo.connected ? "connected" : "connecting…"} /> ·{" "}
            <span title={serverUrl || "same-origin (dev proxy)"}>
              {serverUrl ? new URL(serverUrl).host : "same-origin"}
            </span>
            <br />
            seat <code>{cosimo.sessionId.slice(0, 10)}</code>
            {cosimo.persona && (
              <>
                {" "}
                · profile <b className="text-ink">{cosimo.persona.label}</b>
              </>
            )}
          </div>
          <div className="text-xs text-mute">
            Repoint with <code>?server=https://…</code>
          </div>
        </header>

        <section>
          <Eyebrow size="xs" className="mb-1.5">Buttons (ESP32)</Eyebrow>
          <div className="grid gap-2">
            <Button
              variant={ptt.active ? "on" : "primary"}
              size="lg"
              className="min-h-14 touch-none"
              aria-pressed={ptt.active}
              disabled={!seat.consentDecided || !ptt.supported}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                ptt.start();
              }}
              onPointerUp={ptt.stop}
              onPointerCancel={ptt.stop}
              onContextMenu={(e) => e.preventDefault()}
            >
              {ptt.active ? "● listening — release to send" : "hold to talk  (or hold Space)"}
            </Button>
            <Button size="lg" className="justify-start" disabled={!seat.consentDecided} onClick={seat.askInfo}>
              ⓘ info — canned intro question
            </Button>
            {/* Say which speech path is live — "STT doesn't work" is usually
                "there is no Deepgram key and this isn't Chrome". */}
            <div className="text-xs leading-normal text-mute">
              STT:{" "}
              {cosimo.status?.serverStt
                ? "Deepgram (server)"
                : ptt.supported
                  ? "browser speech recognition (no DEEPGRAM_API_KEY on the server)"
                  : "none — no DEEPGRAM_API_KEY on the server and this browser has no speech recognition (use Chrome, or set the key)"}
              <br />
              TTS: {cosimo.status?.serverTts ? "ElevenLabs (server)" : "browser speech synthesis"}
            </div>
            {ptt.error && (
              <div className="text-sm leading-snug text-accent">
                ✖ {ptt.error}
              </div>
            )}
            {!ptt.supported && seat.consentDecided && (
              <div className="text-sm leading-snug text-warn">
                Voice input is unavailable here — use the text field below, or fix the STT
                path above. The mic also needs a secure origin (https / localhost).
              </div>
            )}
          </div>
        </section>

        <section>
          <Eyebrow size="xs" className="mb-1.5">NFC card</Eyebrow>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scanNfc();
            }}
            className="flex gap-2"
          >
            <Input
              className="w-full"
              aria-label="chip id"
              value={nfc}
              onChange={(e) => setNfc(e.target.value)}
              placeholder="chip id, e.g. ANNA1"
              spellCheck={false}
            />
            <Button type="submit" disabled={!nfc.trim()}>
              tap
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["ANNA1", "BRUNO1", "CLARA1", "DAVID1", "EMIL1"].map((id) => (
              <Button
                key={id}
                size="xs"
                onClick={() => {
                  setNfc(id);
                  cosimo.registerNfc(id, lang);
                }}
              >
                {id}
              </Button>
            ))}
          </div>
        </section>

        <section>
          <Eyebrow size="xs" className="mb-1.5">Text (test console path)</Eyebrow>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText();
            }}
            className="flex gap-2"
          >
            <Input
              className="w-full"
              aria-label="message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={lang === "de" ? "Nachricht an CoSiMo…" : "Message to CoSiMo…"}
              disabled={!seat.consentDecided}
            />
            <Button type="submit" disabled={!seat.consentDecided || !text.trim()}>
              →
            </Button>
          </form>
        </section>

        <section>
          <Eyebrow size="xs" className="mb-1.5">Cabin (this seat)</Eyebrow>
          <div className="grid gap-1 text-sm">
            {controls.length === 0 && <span className="text-mute">—</span>}
            {controls.map((c) => (
              <div key={c.id} className="flex justify-between">
                <span>{c.id}</span>
                <span>
                  {c.on !== undefined ? (c.on ? "on" : "off") : `${c.level ?? 0}%`}
                  {c.degraded ? " ⚠︎" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-[120px] flex-1 flex-col">
          <div className="mb-1.5 flex items-baseline justify-between">
            <Eyebrow size="xs">Cabin LAN — LPU-2 calls</Eyebrow>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-mute">
              <input
                type="checkbox"
                className="accent-ink"
                checked={fireForReal}
                onChange={(e) => setFireForReal(e.target.checked)}
              />
              fire for real
            </label>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-line bg-well p-2 text-xs leading-normal text-mute">
            {log.length === 0 && (
              <span>
                Nothing yet. Ask CoSiMo to change the light — the URLs the hub hands this seat
                appear here{fireForReal ? " and are fired" : " (not fired)"}.
              </span>
            )}
            {log.map((e, i) => (
              <div key={i} className="mb-1.5">
                <span className="text-ink">
                  {e.at} {e.control}
                </span>{" "}
                <span className={cn(e.outcome === "failed" && "text-accent", e.outcome === "ok" && "text-ok")}>
                  {e.outcome}
                  {e.error ? ` — ${e.error}` : ""}
                </span>
                {e.urls.map((u) => (
                  <div key={u} className="break-all pl-2">
                    → GET {u}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap gap-3 text-xs leading-normal text-mute">
          {cosimo.status && (
            <>
              <Status ok={cosimo.status.llm} label="llm" />
              <Status ok={cosimo.status.serverStt} label="stt" />
              <Status ok={cosimo.status.serverTts} label="tts" />
              <Status ok={cosimo.status.network} label="net" />
              {cosimo.status.offlineCanned && <span>· offline canned</span>}
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
