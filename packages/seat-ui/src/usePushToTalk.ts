import { useRef, useState } from "react";
import type { Locale } from "@cosimo/shared";

/**
 * Push-to-talk capture, extracted from the old button so any surface (the
 * Face circle, later a physical button relay) can drive it. Two modes:
 *  - server STT available → record audio (MediaRecorder) and upload it;
 *  - otherwise → browser Web Speech recognition (not available in WKWebView).
 */
export function usePushToTalk({
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
}): {
  active: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  /** What went wrong on the last press, in words (mic denied, no speech,
   *  recognition service refused…). Cleared on the next press. */
  error: string | null;
} {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Web Speech types aren't in lib.dom; keep it loose.
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  /** One transcript per press — WKWebView's SpeechRecognition fires onresult
   *  continuously with the same text (observed at ~400/s), which flooded the
   *  server with identical turns until it OOM'd. */
  const sentRef = useRef(false);

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
    setError(null);
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
      } catch (err) {
        setError(`microphone: ${err instanceof Error ? err.message : String(err)}`);
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
    sentRef.current = false;
    rec.onresult = (e: SpeechResultLike) => {
      if (sentRef.current) return; // guard against repeated onresult (WKWebView)
      const t = e.results?.[0]?.[0]?.transcript?.trim();
      if (t) {
        sentRef.current = true;
        onTranscript(t, lang);
      }
    };
    // Safari and Chrome report distinct codes: "not-allowed" (mic/permission),
    // "service-not-allowed" (Siri/Dictation off, or no secure context),
    // "no-speech", "network", "audio-capture". Surface them — a silent
    // failure here cost us an afternoon once.
    rec.onerror = (e: { error?: string; message?: string }) => {
      const code = e?.error ?? "unknown";
      setError(`speech recognition: ${code}${e?.message ? ` — ${e.message}` : ""}`);
      // eslint-disable-next-line no-console
      console.warn("[cosimo-seat] speech recognition error:", code, e?.message ?? "");
    };
    rec.onend = () => {
      // Ended without ever delivering a result and without an error: the
      // engine heard nothing it could use (Safari does this quietly).
      if (!sentRef.current) setError((prev) => prev ?? "speech recognition: ended without a transcript (nothing recognised — check Dictation is on and the mic level)");
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      setError(`speech recognition: ${err instanceof Error ? err.message : String(err)}`);
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

  return { active, supported, start, stop, error };
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
  onerror: (e: { error?: string; message?: string }) => void;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
