import { useEffect, useRef, useState } from "react";
import type { Locale } from "@cosimo/shared";
import { SeatView, useHidInput, useSeat, type NativeDictation, type PanelLayout } from "@cosimo/seat-ui";
import { X } from "lucide-react";
import { Button, Eyebrow, Input } from "@cosimo/ui";
import { isNative } from "../config/serverUrl";
import { useCabinActuator } from "./useCabinActuator";
import { createNativeDictation } from "./nativeDictation";
import ServerSetup from "./ServerSetup";

/**
 * Testing aid, reached via the hidden setup screen: chat with CoSiMo in
 * text over the exact same path a voice turn takes (chat:send → agent →
 * tools → reply/TTS), just without STT. Shows the running conversation.
 * Never visible to visitors — it must be opened deliberately per session.
 */
function TestConsole({
  transcript,
  reply,
  replying,
  lang,
  onSend,
  onClose,
}: {
  transcript: { role: "user" | "cosimo"; text: string }[];
  reply: string;
  replying: boolean;
  lang: Locale;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length, reply]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="absolute bottom-3 left-1/2 z-popover flex w-[min(92vw,520px)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-dashed border-line-strong bg-white/95 px-3 py-2.5 font-mono text-md text-ink shadow-float">
      <div className="flex items-center justify-between">
        <Eyebrow size="xs">🧪 Test-Konsole</Eyebrow>
        <Button icon variant="ghost" size="sm" onClick={onClose} aria-label="schließen"><X size={15} /></Button>
      </div>
      <div ref={logRef} className="flex max-h-[130px] flex-col gap-1 overflow-y-auto">
        {transcript.slice(-6).map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-mute" : "text-ink"}>
            <b>{m.role === "user" ? "Du" : "Cosi"}:</b> {m.text}
          </div>
        ))}
        {replying && reply && (
          <div>
            <b>Cosi:</b> {reply} ▍
          </div>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          className="flex-1 select-text"
          aria-label="Nachricht"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={lang === "de" ? "Nachricht an CoSiMo…" : "Message to CoSiMo…"}
          autoFocus
        />
        <Button type="submit" variant="primary">→</Button>
      </form>
    </div>
  );
}

/**
 * The native seat: the shared SeatView (what the rider sees — identical to
 * the browser emulator) driven by what only the iPad has — the ESP32
 * buttons/NFC arriving as a BLE keyboard (hold "s" to talk, "i" for info; a
 * normal keyboard works identically in dev), the cabin-LAN light actuator,
 * and the operator's 3s hold on the slit that opens the setup screen.
 */
export default function CosimoKiosk({
  serverUrl,
  layout,
  seatNumber,
  showcase,
  onOpenSetup,
  setup,
  testChat = false,
  onCloseTestChat,
}: {
  serverUrl: string;
  layout: PanelLayout;
  /** Physical seat position 1-4 (0 = not configured) — reading-lamp mapping. */
  seatNumber: number;
  /** Showcase: silent endless performance; buttons ignored, only the menu ends it. */
  showcase: boolean;
  onOpenSetup: () => void;
  /** The hidden operator setup, overlaid while non-null (the kiosk keeps running underneath). */
  setup: { onSave: (url: string, layout: PanelLayout, seat: number, showcase: boolean) => void; onCancel: () => void; onOpenTestChat: () => void } | null;
  /** Testing aid: show the hidden text console (opened via the setup screen). */
  testChat?: boolean;
  onCloseTestChat?: () => void;
}) {
  // Apple dictation as the voice fallback when the hub has no server STT.
  // Resolved once; null on the web/emulator or when the device refuses.
  const [nativeStt, setNativeStt] = useState<NativeDictation | null>(null);
  useEffect(() => {
    void createNativeDictation().then(setNativeStt);
  }, []);
  const seat = useSeat(serverUrl, "kiosk", { nativeStt, seat: seatNumber >= 1 && seatNumber <= 4 ? seatNumber : undefined, showcase });
  const { cosimo, lang, ptt } = seat;

  // This seat drives the cabin's light controller on the local LAN — the hub
  // is on the other side of the air gap and can only decide, not act.
  useCabinActuator(cosimo.setCabinActuator);

  // Physical buttons + NFC reader (ESP32 as a BLE keyboard).
  useHidInput({
    // showcase: the physical buttons do nothing — the performance is not a session
    enabled: !showcase,
    onTalkStart: ptt.start,
    onTalkEnd: ptt.stop,
    onInfo: seat.askInfo,
    onTag: (tagId) => cosimo.registerNfc(tagId, lang),
  });

  return (
    <>
    {setup && (
      <ServerSetup
        current={serverUrl}
        layout={layout}
        seat={seatNumber}
        showcase={showcase}
        onSave={setup.onSave}
        onCancel={setup.onCancel}
        onOpenTestChat={setup.onOpenTestChat}
        onLight={(key, on) => cosimo.cabinLight(key, on)}
      />
    )}
    <SeatView seat={seat} layout={layout} fullscreen={isNative()} onSlitHold={onOpenSetup} showcase={showcase}>
      {/* hidden testing console (via setup screen) — text chat with CoSiMo */}
      {testChat && onCloseTestChat && (
        <TestConsole
          transcript={cosimo.transcript}
          reply={cosimo.reply}
          replying={cosimo.replying}
          lang={lang}
          onSend={(text) => cosimo.send(text, lang, "text")}
          onClose={onCloseTestChat}
        />
      )}
    </SeatView>
    </>
  );
}
