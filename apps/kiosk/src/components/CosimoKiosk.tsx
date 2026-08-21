import { useEffect, useRef, useState } from "react";
import type { Locale } from "@cosimo/shared";
import { SeatView, useSeat, type PanelLayout } from "@cosimo/seat-ui";
import { isNative } from "../config/serverUrl";
import { useHidInput } from "./useHidInput";
import { useCabinActuator } from "./useCabinActuator";

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
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 12,
        transform: "translateX(-50%)",
        width: "min(92vw, 520px)",
        zIndex: 50,
        background: "rgba(13,17,23,0.94)",
        color: "#e8eaed",
        border: "1px dashed #4b5563",
        borderRadius: 14,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ opacity: 0.6, fontSize: 11, letterSpacing: 1 }}>🧪 TEST-KONSOLE</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, opacity: 0.7 }}
        >
          ✕
        </button>
      </div>
      <div
        ref={logRef}
        style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
      >
        {transcript.slice(-6).map((m, i) => (
          <div key={i} style={{ opacity: m.role === "user" ? 0.6 : 0.95 }}>
            <b>{m.role === "user" ? "Du" : "Cosi"}:</b> {m.text}
          </div>
        ))}
        {replying && reply && (
          <div>
            <b>Cosi:</b> {reply} ▍
          </div>
        )}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={lang === "de" ? "Nachricht an CoSiMo…" : "Message to CoSiMo…"}
          autoFocus
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #4b5563",
            background: "#0e1013",
            color: "inherit",
            fontSize: 14,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
        <button
          type="submit"
          style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#f3f4f6", color: "#16181c", cursor: "pointer", fontWeight: 600 }}
        >
          →
        </button>
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
  onOpenSetup,
  testChat = false,
  onCloseTestChat,
}: {
  serverUrl: string;
  layout: PanelLayout;
  onOpenSetup: () => void;
  /** Testing aid: show the hidden text console (opened via the setup screen). */
  testChat?: boolean;
  onCloseTestChat?: () => void;
}) {
  const seat = useSeat(serverUrl);
  const { cosimo, lang, ptt } = seat;

  // This seat drives the cabin's light controller on the local LAN — the hub
  // is on the other side of the air gap and can only decide, not act.
  useCabinActuator(cosimo.setCabinActuator);

  // Physical buttons + NFC reader (ESP32 as a BLE keyboard).
  useHidInput({
    enabled: seat.consentDecided,
    onTalkStart: ptt.start,
    onTalkEnd: ptt.stop,
    onInfo: seat.askInfo,
    onTag: (tagId) => cosimo.registerNfc(tagId, lang),
  });

  return (
    <SeatView seat={seat} layout={layout} fullscreen={isNative()} onSlitHold={onOpenSetup}>
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
  );
}
