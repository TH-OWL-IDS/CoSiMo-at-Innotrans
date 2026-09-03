import { useRef, useState } from "react";
import type { Locale } from "@cosimo/shared";

/**
 * Push-to-talk capture, extracted from the old button so any surface (the
 * Face circle, later a physical button relay) can drive it. Three modes, in
 * this order:
 *  - server STT available → record audio (MediaRecorder) and upload it;
 *  - a native recognizer was injected (the iPad app wraps Apple's
 *    SFSpeechRecognizer — free, on-device, works without server STT);
 *  - otherwise → browser Web Speech recognition (not available in WKWebView).
 */

/**
 * A platform recognizer injected by the host app (Capacitor plugin around
 * Apple dictation). seat-ui stays pure web: it only calls this contract.
 */
export interface NativeDictation {
  /** Begin listening. Errors (permission, engine) surface via `onError`. */
  start: (lang: "de-DE" | "en-US", onError: (message: string) => void) => Promise<void>;
  /** Stop listening and resolve with the final transcript (null = nothing heard). */
  stop: () => Promise<string | null>;
}
export function usePushToTalk({
  serverStt,
  nativeStt,
  lang,
  onStart,
  onStop,
  onUtterance,
  onTranscript,
}: {
  serverStt: boolean;
  /** Injected by the native app when Apple dictation is available. */
  nativeStt?: NativeDictation | null;
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
  /** The live microphone signal while the button is held — for the slit's
   *  waveform. `kind` "audio" = real samples from the captured stream;
   *  "native" = Apple dictation owns the mic (no samples available, the UI
   *  shows a neutral listening motion instead); null = not listening. */
  wave: { kind: () => "audio" | "native" | null; sample: (out: Float32Array) => boolean };
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
  /** Analyser on the captured mic stream (server STT / browser dev) — the
   *  slit draws the actual signal from it. Torn down on release. */
  const analyserRef = useRef<{ ctx: AudioContext; an: AnalyserNode; own: MediaStream | null; buf: Uint8Array<ArrayBuffer> } | null>(null);
  const waveKindRef = useRef<"audio" | "native" | null>(null);

  function attachAnalyser(stream: MediaStream, own: MediaStream | null): void {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.15;
      ctx.createMediaStreamSource(stream).connect(an);
      analyserRef.current = { ctx, an, own, buf: new Uint8Array(an.fftSize) };
      waveKindRef.current = "audio";
      void ctx.resume();
    } catch {
      // no analyser — the wave just stays flat
    }
  }
  function releaseAnalyser(): void {
    const a = analyserRef.current;
    analyserRef.current = null;
    waveKindRef.current = null;
    if (!a) return;
    a.own?.getTracks().forEach((t) => t.stop());
    void a.ctx.close().catch(() => undefined);
  }
  const wave = useRef({
    kind: () => waveKindRef.current,
    sample: (out: Float32Array): boolean => {
      const a = analyserRef.current;
      if (!a) return false;
      a.an.getByteTimeDomainData(a.buf);
      const n = Math.min(out.length, a.buf.length);
      for (let i = 0; i < n; i++) out[i] = (a.buf[i]! - 128) / 128;
      return true;
    },
  }).current;

  const supported =
    typeof window !== "undefined" &&
    (serverStt
      ? typeof navigator !== "undefined" && !!navigator.mediaDevices
      : Boolean(nativeStt) ||
        !!(
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
        attachAnalyser(stream, null); // the recorder's own stream — tracks stop with it
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
        releaseAnalyser();
        setActive(false);
        onStop();
      }
      return;
    }

    if (nativeStt) {
      waveKindRef.current = "native";
      try {
        await nativeStt.start(lang === "de" ? "de-DE" : "en-US", (msg) => setError(`dictation: ${msg}`));
      } catch (err) {
        setError(`dictation: ${err instanceof Error ? err.message : String(err)}`);
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
    // Browsers allow a second capture next to SpeechRecognition — used only
    // to draw the wave; it is stopped on release.
    void navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => { if (active || recognitionRef.current === rec) attachAnalyser(s, s); }).catch(() => undefined);
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
    releaseAnalyser();
    if (serverStt) {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    } else if (nativeStt) {
      void nativeStt
        .stop()
        .then((text) => {
          if (text) onTranscript(text, lang);
          else setError((prev) => prev ?? "dictation: nothing recognised");
        })
        .catch((err) => setError(`dictation: ${err instanceof Error ? err.message : String(err)}`));
    } else {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
  }

  return { active, supported, start, stop, error, wave };
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
