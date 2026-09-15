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
  /** Begin listening. Errors (permission, engine) surface via `onError`;
   *  the growing transcript (what the engine has understood so far) via
   *  `onPartial` — shown live under the wave. */
  start: (lang: "de-DE" | "en-US", onError: (message: string) => void, onPartial?: (text: string) => void) => Promise<void>;
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
  /** The dictation so far while the button is held (native / Web Speech
   *  interim results; server STT has none until the upload). Cleared on the
   *  next press. */
  partial: string;
} {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Web Speech types aren't in lib.dom; keep it loose.
  const recognitionRef = useRef<{ stop: () => void; heard?: string } | null>(null);
  /** One transcript per press — WKWebView's SpeechRecognition fires onresult
   *  continuously with the same text (observed at ~400/s), which flooded the
   *  server with identical turns until it OOM'd. */
  const sentRef = useRef(false);
  /** Analyser on the captured mic stream (server STT / browser dev) — the
   *  slit draws the actual signal from it. Torn down on release. */
  const analyserRef = useRef<{ ctx: AudioContext; an: AnalyserNode; own: MediaStream | null; buf: Uint8Array<ArrayBuffer> } | null>(null);
  const waveKindRef = useRef<"audio" | "native" | null>(null);
  /** Release grace: people let go of the button a beat before the last
   *  word is out. The capture keeps running this long after release. */
  const RELEASE_GRACE_MS = 320;
  /** Web Speech: after stop() the engine's final result can take a while
   *  (a server round trip); past this, the last interim text is sent. */
  const FINAL_WAIT_MS = 250;
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Pressed again inside the release grace: just keep listening.
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
      return;
    }
    if (active || !supported) return;
    setActive(true);
    setError(null);
    setPartial("");
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
        await nativeStt.start(lang === "de" ? "de-DE" : "en-US", (msg) => setError(`dictation: ${msg}`), (text) => setPartial(text));
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
    rec.interimResults = true; // interim text is shown live; only a final result is sent
    rec.maxAlternatives = 1;
    sentRef.current = false;
    rec.heard = "";
    rec.onresult = (e: SpeechResultLike) => {
      if (sentRef.current) return; // guard against repeated onresult (WKWebView)
      // SpeechRecognitionResultList / -Result are array-LIKE (indexed + length), not arrays
      const results = Array.from((e.results ?? []) as ArrayLike<SpeechResultItemLike>);
      const text = results.map((r) => r[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        rec.heard = text;
        setPartial(text);
      }
      const last = results[results.length - 1];
      if (text && last?.isFinal) {
        sentRef.current = true;
        onTranscript(text, lang);
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
      // An engine that never flags a result final still ends: send what it
      // last understood. Ended with nothing at all and no error: it heard
      // nothing it could use (Safari does this quietly).
      if (!sentRef.current && rec.heard) {
        sentRef.current = true;
        onTranscript(rec.heard, lang);
        return;
      }
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
    if (!active || stopTimerRef.current) return;
    // Keep capturing for a moment so the tail of the sentence lands; the
    // wave stays up meanwhile, which reads as "still listening".
    stopTimerRef.current = setTimeout(() => {
      stopTimerRef.current = null;
      stopNow();
    }, RELEASE_GRACE_MS);
  }

  function stopNow() {
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
      const rec = recognitionRef.current;
      setTimeout(() => {
        if (!sentRef.current && rec?.heard) {
          sentRef.current = true;
          onTranscript(rec.heard, lang);
        }
      }, FINAL_WAIT_MS);
    }
  }

  return { active, supported, start, stop, error, wave, partial };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

interface SpeechResultItemLike {
  0?: { transcript?: string };
  isFinal?: boolean;
}
interface SpeechResultLike {
  results?: ArrayLike<SpeechResultItemLike>;
}
interface SpeechRecognitionLike {
  /** ours: the last interim text, so stop() can send it without a final */
  heard?: string;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: SpeechResultLike) => void;
  onerror: (e: { error?: string; message?: string }) => void;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
