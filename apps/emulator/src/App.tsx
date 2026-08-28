import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CabinActuation, CabinActuationResult } from "@cosimo/shared";
import { DEFAULT_PANEL_LAYOUT, SeatView, useSeat } from "@cosimo/seat-ui";
import { LockKeyhole, X } from "lucide-react";
import { Brand, Button, Dot, Eyebrow, Input, cn } from "@cosimo/ui";

/** SHA-256 of the operator password — the console's page lock uses the same. */
const HASH = "3bb21893fb23828e7ae7a66a38d67ae119525d12867310adfcb622d2742bb540";
const UNLOCK_KEY = "cosimo.emulator.unlocked";
/** The browser seat gets a larger face than the calibrated iPad default —
 *  there is no physical panel to fit; the slit stays where it is. */
const EMULATOR_LAYOUT = { ...DEFAULT_PANEL_LAYOUT, circleD: 92 };
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
import { resolveServerUrl } from "./serverUrl";

/**
 * The seat emulator: a browser stand-in for one iPad. To the hub it IS a
 * kiosk seat (same hook, same role, same events), and it renders the exact
 * SeatView the iPad renders — so what you see here is what a rider sees.
 * The physical parts are replaced by the side panel: the talk/info buttons,
 * the NFC reader, and the cabin-LAN light controller (which is logged, or
 * optionally fired for real when this machine can reach it). The panel is
 * hidden behind a near-invisible corner handle and the operator password:
 * a visitor on seat-cosimo.… just sees the seat. Right-side drawer on a
 * desktop, bottom sheet on a phone. The seat itself stays black and in
 * the kiosk's system font.
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
      if (e.code !== "Space" || e.repeat) return;
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
  }, [ptt]);

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

  // The panel: hidden behind a near-invisible handle, password on first
  // open (same hash as the console's lock), remembered for this tab.
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const controls = cosimo.cabin;
  const Status = ({ ok, label }: { ok: boolean | undefined; label: string }) => (
    <span className="inline-flex items-center gap-1.5"><Dot size="sm" state={ok ? "ok" : "down"} />{label}</span>
  );

  return (
    <div className="fixed inset-0 bg-[#f4f3f0] font-sans">
      {/* ── the seat, exactly as the iPad renders it — including the
             kiosk's system font, which SeatView inherits. It has the whole
             viewport on an off-white ground, the cutouts inset like holes in
             a real panel; the developer panel floats over it. ── */}
      <SeatView seat={seat} layout={EMULATOR_LAYOUT} fullscreen={false} surface="panel" />

      {/* ── the panel's handle: a small, almost invisible dot in the corner.
             Visitors don't find it; staff know it is there. ── */}
      {!open && (
        <button
          type="button"
          aria-label="Emulator-Panel öffnen"
          onClick={() => setOpen(true)}
          className="fixed bottom-3 right-3 z-drawer size-7 cursor-pointer rounded-full border border-ink/25 bg-transparent opacity-30 transition-opacity hover:opacity-90 focus-visible:opacity-90 motion-reduce:transition-none"
        >
          <span className="sr-only">Panel</span>
        </button>
      )}

      {/* ── the panel: right-side drawer on desktop, bottom sheet on a phone
             (the face stays visible above it while you hold to talk).
             Behind the password on first open; remembered for this tab. ── */}
      {open && (
        <div className="fixed inset-0 z-drawer">
          <div className="absolute inset-0 bg-ink/20 md:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Seat emulator"
            className={cn(
              "absolute flex flex-col gap-4 overflow-y-auto bg-white p-4 font-mono text-md text-ink shadow-drawer",
              "inset-x-0 bottom-0 max-h-[56vh] rounded-t-2xl border-t border-line",
              "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[360px] md:rounded-none md:border-l md:border-t-0",
            )}
          >
            <div className="flex items-center justify-between">
              <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Seat emulator">
                <Brand size={32} />
              </h1>
              <Button icon variant="ghost" size="sm" aria-label="Panel schließen" onClick={() => setOpen(false)}>
                <X size={18} />
              </Button>
            </div>
            {!unlocked ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if ((await sha256(pw.trim())) === HASH) {
                    try {
                      sessionStorage.setItem(UNLOCK_KEY, "1");
                    } catch {
                      // private mode — unlocked for this page load
                    }
                    setUnlocked(true);
                  } else {
                    setWrong(true);
                    setPw("");
                  }
                }}
                className="flex flex-col gap-3"
              >
                <Eyebrow size="xs">Nur für das Standpersonal</Eyebrow>
                <label className="flex flex-col gap-1.5 text-sm uppercase tracking-caps opacity-55">
                  Passwort
                  <Input
                    type="password"
                    size="lg"
                    autoFocus
                    autoComplete="current-password"
                    value={pw}
                    onChange={(e) => {
                      setPw(e.target.value);
                      setWrong(false);
                    }}
                    aria-invalid={wrong}
                    className="normal-case tracking-normal opacity-100"
                  />
                </label>
                <Button type="submit" variant="primary" size="lg">
                  <LockKeyhole size={15} /> Entsperren
                </Button>
                <span role="status" className="min-h-4 text-sm text-accent">{wrong ? "Falsches Passwort" : ""}</span>
              </form>
            ) : (
              <>

        <header className="flex flex-col gap-1.5">
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
              disabled={!ptt.supported}
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
            <Button size="lg" className="justify-start" onClick={seat.askInfo}>
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
            {!ptt.supported && (
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
              placeholder="chip id, e.g. ALEX1"
              spellCheck={false}
            />
            <Button type="submit" disabled={!nfc.trim()}>
              tap
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* the four fair riders (Nutzungsprofile 01–04) */}
            {["ALEX1", "NOA1", "LUCA1", "SAM1"].map((id) => (
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
            />
            <Button type="submit" disabled={!text.trim()}>
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
      
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
