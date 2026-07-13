import { useEffect, useRef, useState } from "react";
import type { Locale, PipelinePhase } from "@cosimo/shared";
import { CosimoFaceAnimated, schemeById } from "@cosimo/face";
import { useCosimoSocket } from "@cosimo/client";
import type { PanelLayout } from "../config/panelLayout";
import TelemetryStrip from "./TelemetryStrip";
import ConsentOverlay from "./ConsentOverlay";
import { usePushToTalk } from "./usePushToTalk";
import { useHidInput } from "./useHidInput";

/**
 * Running conversation, shown inside the circle for text-first (deaf) riders:
 * a small face sits above, this fills the rest and auto-scrolls to the latest.
 * No replay button — re-requests stay conversational ("say that again").
 */
function Transcript({
  items,
  reply,
  replying,
  ink,
  textScale,
  bold,
}: {
  items: { role: "user" | "cosimo"; text: string }[];
  reply: string;
  replying: boolean;
  ink: string;
  textScale: number;
  bold: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, reply]);

  return (
    <div
      ref={boxRef}
      role="log"
      aria-live="polite"
      style={{
        position: "absolute",
        left: "50%",
        top: "36%",
        transform: "translateX(-50%)",
        width: "78%",
        height: "56%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: `${6 * textScale}px`,
        fontSize: `${13 * textScale}px`,
        lineHeight: 1.35,
        fontWeight: bold ? 700 : 400,
        color: ink,
        scrollbarWidth: "none",
      }}
    >
      {/* no idle hint — talking happens via the physical button */}
      {items.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            textAlign: m.role === "user" ? "right" : "left",
            maxWidth: "88%",
            opacity: m.role === "user" ? 0.6 : 1,
          }}
        >
          {m.text}
        </div>
      ))}
      {replying && reply && (
        <div style={{ alignSelf: "flex-start", maxWidth: "88%" }}>{reply} ▍</div>
      )}
    </div>
  );
}

/**
 * The panel kiosk view. The iPad sits behind a physical panel with two
 * cutouts — a circle (CoSiMo's Face) and a bottom slit (telemetry) — so only
 * those regions render content; everything else stays black (invisible).
 *
 * Interaction, until the physical buttons arrive: hold the Face circle to
 * talk (push-to-talk). The 3s hold on the slit opens the operator setup.
 */
export default function CosimoKiosk({
  serverUrl,
  layout,
  onOpenSetup,
}: {
  serverUrl: string;
  layout: PanelLayout;
  onOpenSetup: () => void;
}) {
  const cosimo = useCosimoSocket(serverUrl);
  const [lang, setLang] = useState<Locale>("de");
  const [consentDecided, setConsentDecided] = useState(false);

  const decideConsent = (consent: boolean) => {
    cosimo.setConsent(consent);
    setConsentDecided(true);
  };

  // Host reset → return to the consent screen for the next visitor.
  useEffect(() => {
    if (cosimo.resetNonce > 0) setConsentDecided(false);
  }, [cosimo.resetNonce]);

  // The active profile's preferred language becomes the seat's UI language
  // (e.g. an NFC scan loads an English-speaking rider). The visitor can still
  // toggle manually afterwards.
  const profileLang = cosimo.persona?.accommodations.language;
  useEffect(() => {
    if (profileLang) setLang(profileLang);
  }, [profileLang]);

  // Profile accommodations drive the theme + accessible presentation, live —
  // all voice-mutable via CoSiMo (set_presentation).
  const acc = cosimo.persona?.accommodations;
  const scheme = schemeById(acc?.theme ?? "classic");
  const textScale = { s: 0.85, m: 1, l: 1.25, xl: 1.55 }[acc?.textSize ?? "m"];
  const highContrast = acc?.contrast === "high";
  const showText = acc?.showText ?? false;
  const speakAloud = acc?.audioOutput ?? true;
  const speechRate = acc?.speechRate ?? 1;
  const reduceMotion = acc?.reduceMotion ?? false;
  const serverStt = cosimo.status?.serverStt ?? false;
  const serverTts = cosimo.status?.serverTts ?? false;

  const ptt = usePushToTalk({
    serverStt,
    lang,
    onStart: cosimo.pttStart,
    onStop: cosimo.pttStop,
    onUtterance: cosimo.sendUtterance,
    onTranscript: (t, l) => cosimo.send(t, l, "voice"),
  });

  // Physical buttons + NFC reader (ESP32 as a BLE keyboard).
  useHidInput({
    enabled: consentDecided,
    onTalkStart: ptt.start,
    onTalkEnd: ptt.stop,
    onInfo: () =>
      cosimo.send(
        lang === "de"
          ? "Was kannst du und wie hilfst du mir hier im MonoCab?"
          : "What can you do and how can you help me here in the MonoCab?",
        lang,
      ),
    onTag: (tagId) => cosimo.registerNfc(tagId, lang),
  });

  // Browser TTS fallback: when there is no server TTS, speak the reply.
  const spokenRef = useRef("");
  useEffect(() => {
    if (serverTts || !speakAloud || cosimo.replying) return;
    const text = cosimo.reply.trim();
    // Barge-in: while the rider holds the talk button, never (re)start
    // speaking — and mark the partial reply as spoken so it stays silent
    // in the release→new-turn gap too.
    if (ptt.active) {
      spokenRef.current = text;
      return;
    }
    if (!text || text === spokenRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    spokenRef.current = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "de" ? "de-DE" : "en-US";
    u.rate = speechRate;
    u.onstart = () => cosimo.setSpeaking(true);
    u.onend = () => cosimo.setSpeaking(false);
    u.onerror = () => cosimo.setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [cosimo.replying, cosimo.reply, ptt.active, serverTts, speakAloud, speechRate, lang, cosimo.setSpeaking]);

  // Operator gesture: 3s hold on the slit opens the setup screen.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    holdTimer.current = setTimeout(onOpenSetup, 3000);
  };
  const holdEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const circleSize = `min(${layout.circleD}vw, 96vh)`;
  const guide = layout.guides ? "2px dashed rgba(255,80,80,0.9)" : "none";
  // No idle hint — talking happens via the physical button, not the screen.
  const phaseHint: Record<PipelinePhase, Record<Locale, string>> = {
    idle: { de: "", en: "" },
    listening: { de: "Hört zu …", en: "Listening …" },
    thinking: { de: "Denkt nach …", en: "Thinking …" },
    speaking: { de: "", en: "" },
  };

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        // Behind the panel: pitch black, so light bleed around cutouts is invisible.
        background: "#000",
        color: scheme.ink,
        overflow: "hidden",
        ["--bg" as string]: scheme.bg,
        ["--ink" as string]: scheme.ink,
      }}
    >
      {/* ── circle cutout: the Face ─────────────────────────────── */}
      <div
        onPointerDown={consentDecided && ptt.supported ? ptt.start : undefined}
        onPointerUp={ptt.stop}
        onPointerLeave={ptt.stop}
        onPointerCancel={ptt.stop}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "absolute",
          left: `${layout.circleX}%`,
          top: `${layout.circleY}%`,
          transform: "translate(-50%, -50%)",
          width: circleSize,
          height: circleSize,
          borderRadius: "50%",
          background: scheme.bg,
          overflow: "hidden",
          outline: guide,
          touchAction: "none",
          transition: "background 300ms",
        }}
      >
        {/* the Face — centred by default; shrinks to the top when the rider
            reads a running transcript (showText). reduceMotion stills its idle life. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: showText ? "18%" : "44%",
            transform: "translate(-50%, -50%)",
            width: showText ? "44%" : "88%",
            transition: "top 300ms, width 300ms",
          }}
        >
          <CosimoFaceAnimated
            emotion={cosimo.faceEmotion}
            idle={!reduceMotion}
            mouthDrive={cosimo.getMouthDrive}
            style={{ width: "100%", height: "auto", color: scheme.ink, display: "block" }}
          />
        </div>

        {/* Reply text is progressive disclosure: face-and-voice-first by
            default (only a short phase hint); a running transcript when the
            rider needs to read (showText, e.g. a deaf rider). */}
        {showText ? (
          <Transcript
            items={cosimo.transcript}
            reply={cosimo.reply}
            replying={cosimo.replying}
            ink={scheme.ink}
            textScale={textScale}
            bold={highContrast}
          />
        ) : (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "9%",
              transform: "translateX(-50%)",
              width: "62%",
              textAlign: "center",
              fontSize: `clamp(12px, ${2.8 * textScale}vw, ${18 * textScale}px)`,
              lineHeight: 1.35,
              fontWeight: highContrast ? 700 : 400,
              opacity: 0.55,
            }}
          >
            {consentDecided ? phaseHint[cosimo.phase][lang] : ""}
          </div>
        )}

        {/* listening ring while push-to-talk is held */}
        {ptt.active && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "6px solid currentColor",
              opacity: 0.35,
              pointerEvents: "none",
            }}
          />
        )}

        {/* connection state, tucked at the top of the circle */}
        {!cosimo.connected && (
          <div
            role="status"
            style={{
              position: "absolute",
              top: "7%",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "clamp(10px, 2.2vw, 14px)",
              opacity: 0.5,
            }}
          >
            {lang === "de" ? "Verbindung wird hergestellt …" : "Connecting …"}
          </div>
        )}

        {!consentDecided && (
          <ConsentOverlay
            lang={lang}
            onDecide={decideConsent}
            onToggleLang={() => setLang((l) => (l === "de" ? "en" : "de"))}
          />
        )}
      </div>

      {/* ── slit cutout: telemetry ──────────────────────────────── */}
      <div
        onPointerDown={holdStart}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
        style={{
          position: "absolute",
          left: `${layout.slitX}%`,
          top: `${layout.slitY}%`,
          transform: "translate(-50%, -50%)",
          width: `${layout.slitW}%`,
          height: `${layout.slitH}%`,
          borderRadius: layout.slitR,
          background: scheme.bg,
          color: scheme.ink,
          overflow: "hidden",
          outline: guide,
          transition: "background 300ms",
        }}
      >
        <TelemetryStrip telemetry={cosimo.telemetry} lang={lang} />
      </div>
    </main>
  );
}
