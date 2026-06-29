"use client";

import { useRef, useState } from "react";
import type { Locale } from "@cosimo/shared";

/**
 * Push-to-talk button. Press and hold to speak. Two capture modes:
 *  - server STT available → record audio (MediaRecorder) and upload it;
 *  - otherwise → use the browser's Web Speech recognition locally.
 * Either way the recognised text reaches CoSiMo as a voice-modality turn.
 *
 * Web Speech recognition is best-effort (flaky on iOS Safari / in noise) — the
 * always-available text input is the reliable fallback for the hall, and server
 * STT (Deepgram) is the production upgrade.
 */
export default function PushToTalk({
  serverStt,
  lang,
  onStart,
  onStop,
  onUtterance,
  onTranscript,
}: {
  serverStt: boolean;
  lang: Locale;
  onStart: () => void;
  onStop: () => void;
  onUtterance: (audioBase64: string, mime: string, lang: Locale) => void;
  onTranscript: (text: string, lang: Locale) => void;
}) {
  const [active, setActive] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Web Speech types aren't in lib.dom; keep it loose.
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const supported =
    typeof window !== "undefined" &&
    (serverStt
      ? typeof navigator !== "undefined" && !!navigator.mediaDevices
      : !!(
          (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
          (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
        ));

  async function start() {
    if (active || !supported) return;
    setActive(true);
    onStart();

    if (serverStt) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const b64 = await blobToBase64(blob);
          if (b64) onUtterance(b64, blob.type, lang);
        };
        rec.start();
        recorderRef.current = rec;
      } catch {
        setActive(false);
        onStop();
      }
      return;
    }

    const SR =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
    if (!SR) {
      setActive(false);
      onStop();
      return;
    }
    const rec = new SR();
    rec.lang = lang === "de" ? "de-DE" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechResultLike) => {
      const t = e.results?.[0]?.[0]?.transcript?.trim();
      if (t) onTranscript(t, lang);
    };
    rec.onerror = () => {};
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  function stop() {
    if (!active) return;
    setActive(false);
    onStop();
    if (serverStt) {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    } else {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <button
      type="button"
      aria-label={lang === "de" ? "Zum Sprechen halten" : "Hold to talk"}
      disabled={!supported}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: "2px solid currentColor",
        background: active ? "currentColor" : "transparent",
        color: "inherit",
        cursor: supported ? "pointer" : "not-allowed",
        opacity: supported ? 1 : 0.35,
        fontSize: 26,
        flexShrink: 0,
        touchAction: "none",
        transition: "transform 120ms",
        transform: active ? "scale(1.08)" : "scale(1)",
      }}
      title={
        supported
          ? lang === "de"
            ? "Zum Sprechen halten"
            : "Hold to talk"
          : lang === "de"
            ? "Spracheingabe nicht verfügbar – bitte tippen"
            : "Voice unavailable — please type"
      }
    >
      🎤
    </button>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

interface SpeechResultLike {
  results?: Array<Array<{ transcript?: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: SpeechResultLike) => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}
