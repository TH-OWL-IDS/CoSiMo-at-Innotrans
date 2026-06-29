/**
 * Speech-to-text providers. Server-side STT (Deepgram) is the reliable path for
 * a noisy trade-show hall; when no key is configured the realtime service
 * advertises serverStt=false and the iPad falls back to the browser's Web Speech
 * recognition. The interface keeps the vendor swappable.
 */

import type { Locale } from "@cosimo/shared";
import { config } from "../config.js";

export interface SttProvider {
  readonly available: boolean;
  /** Transcribe an audio buffer. Returns "" if nothing was recognised. */
  transcribe(audio: Buffer, mime: string, lang: Locale): Promise<string>;
}

/** No server STT — clients use the browser. transcribe is never called. */
export class NoServerStt implements SttProvider {
  readonly available = false;
  async transcribe(): Promise<string> {
    return "";
  }
}

/** Deepgram prerecorded transcription over HTTP. */
export class DeepgramStt implements SttProvider {
  readonly available = true;
  private readonly key: string;
  private readonly model: string;

  constructor(key: string, model: string) {
    this.key = key;
    this.model = model;
  }

  async transcribe(audio: Buffer, mime: string, lang: Locale): Promise<string> {
    const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(this.model)}&language=${lang}&smart_format=true&punctuate=true`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${this.key}`, "Content-Type": mime },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`deepgram ${res.status}`);
    const body = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    return body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  }
}

export function createSttProvider(): SttProvider {
  return config.speech.deepgramApiKey
    ? new DeepgramStt(config.speech.deepgramApiKey, config.speech.deepgramModel)
    : new NoServerStt();
}
