import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import type { NativeDictation } from "@cosimo/seat-ui";

/**
 * Apple dictation (SFSpeechRecognizer) behind the seat-ui `NativeDictation`
 * contract — the voice fallback when the hub has no server STT. Free,
 * on-device on the A17-Pro iPad minis, works without any cloud STT.
 *
 * The plugin's `start({ partialResults: true })` resolves only when
 * listening ends, so it is deliberately not awaited; we collect the growing
 * transcript from `partialResults` events and hand the last one over on
 * release of the talk button.
 *
 * The plugin is patched (patches/): on-device recognition where the locale
 * supports it (needs the offline dictation language on the device), the
 * dictation task hint, and an `isFinal` flag on partial results — so stop()
 * resolves the moment the final transcript lands instead of waiting a fixed
 * beat, capped at FINAL_WAIT_MS.
 */
const FINAL_WAIT_MS = 300;
export async function createNativeDictation(): Promise<NativeDictation | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) return null;
  } catch {
    return null;
  }

  let last = "";
  let finalSeen: (() => void) | null = null;
  return {
    async start(lang, onError, onPartial) {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        onError("keine Erlaubnis (Einstellungen \u2192 CoSiMo \u2192 Mikrofon & Spracherkennung)");
        return;
      }
      last = "";
      await SpeechRecognition.removeAllListeners();
      finalSeen = null;
      await SpeechRecognition.addListener("partialResults", (d) => {
        if (d.matches?.[0]) {
          last = d.matches[0];
          onPartial?.(last);
        }
        if ((d as { isFinal?: boolean }).isFinal) finalSeen?.();
      });
      SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 }).catch(
        (err) => onError(err instanceof Error ? err.message : String(err)),
      );
    },
    async stop() {
      try {
        await SpeechRecognition.stop();
      } catch {
        /* was not listening */
      }
      // the final transcript lands shortly after stop(): take it as soon as
      // it is flagged final, or the last partial after FINAL_WAIT_MS
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, FINAL_WAIT_MS);
        finalSeen = () => { clearTimeout(t); resolve(); };
      });
      finalSeen = null;
      void SpeechRecognition.removeAllListeners();
      const text = last.trim();
      last = "";
      return text || null;
    },
  };
}
