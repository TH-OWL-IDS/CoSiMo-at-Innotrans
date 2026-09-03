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
 */
export async function createNativeDictation(): Promise<NativeDictation | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) return null;
  } catch {
    return null;
  }

  let last = "";
  return {
    async start(lang, onError) {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        onError("keine Erlaubnis (Einstellungen \u2192 CoSiMo \u2192 Mikrofon & Spracherkennung)");
        return;
      }
      last = "";
      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener("partialResults", (d) => {
        if (d.matches?.[0]) last = d.matches[0];
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
      // the engine often delivers one last partial just after stop()
      await new Promise((r) => setTimeout(r, 250));
      void SpeechRecognition.removeAllListeners();
      const text = last.trim();
      last = "";
      return text || null;
    },
  };
}
