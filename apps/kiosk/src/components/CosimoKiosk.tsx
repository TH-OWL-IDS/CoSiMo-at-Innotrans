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

  // Persona drives the theme + accessible presentation, live.
  const scheme = schemeById(cosimo.persona?.themeId ?? "classic");
  const largeText = cosimo.persona?.presentation.largeText ?? false;
  const speakAloud = cosimo.persona?.presentation.speakAloud ?? true;
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
    if (!text || text === spokenRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    spokenRef.current = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "de" ? "de-DE" : "en-US";
    u.onstart = () => cosimo.setSpeaking(true);
    u.onend = () => cosimo.setSpeaking(false);
    u.onerror = () => cosimo.setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [cosimo.replying, cosimo.reply, serverTts, speakAloud, lang, cosimo.setSpeaking]);

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
  const phaseHint: Record<PipelinePhase, Record<Locale, string>> = {
    idle: { de: "Halten & sprechen", en: "Hold & talk" },
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
        {/* the Face — centred, slightly above the middle */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "44%",
            transform: "translate(-50%, -50%)",
            width: "88%",
          }}
        >
          <CosimoFaceAnimated
            emotion={cosimo.faceEmotion}
            style={{ width: "100%", height: "auto", color: scheme.ink, display: "block" }}
          />
        </div>

        {/* streaming reply / hint, inside the lower part of the circle */}
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
            fontSize: largeText ? "clamp(14px, 3.4vw, 22px)" : "clamp(12px, 2.8vw, 18px)",
            lineHeight: 1.35,
            maxHeight: "5.6em",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            opacity: cosimo.reply ? 0.9 : 0.4,
          }}
        >
          {cosimo.reply
            ? `${cosimo.reply}${cosimo.replying ? " ▍" : ""}`
            : consentDecided
              ? phaseHint[cosimo.phase][lang]
              : ""}
        </div>

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
