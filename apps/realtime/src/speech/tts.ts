/**
 * Text-to-speech providers. Server-side TTS (ElevenLabs) gives a high-quality
 * bilingual voice; when no key is configured the realtime service advertises
 * serverTts=false and the iPad speaks the reply with the browser's Web Speech
 * synthesis. The interface keeps the vendor swappable.
 */

import type { Locale } from "@cosimo/shared";
import { config } from "../config.js";
import type { OperatorConfigProvider } from "../agent/operatorConfig.js";

export interface SynthResult {
  audioBase64: string;
  mime: string;
}

export interface TtsProvider {
  readonly available: boolean;
  /** Synthesize speech, or null if unavailable (client speaks locally). */
  synthesize(text: string, lang: Locale): Promise<SynthResult | null>;
}

/** No server TTS — clients speak with the browser. */
export class NoServerTts implements TtsProvider {
  readonly available = false;
  async synthesize(): Promise<SynthResult | null> {
    return null;
  }
}

/** ElevenLabs multilingual TTS over HTTP, returning MP3. */
export class ElevenLabsTts implements TtsProvider {
  readonly available = true;
  private readonly key: string;
  /** Endpoint details resolve per call so operator-config edits apply live. */
  private readonly endpoint: () => { baseUrl: string; voiceId: string; model: string };

  constructor(key: string, endpoint: () => { baseUrl: string; voiceId: string; model: string }) {
    this.key = key;
    this.endpoint = endpoint;
  }

  async synthesize(text: string, _lang: Locale): Promise<SynthResult | null> {
    if (!text.trim()) return null;
    const { baseUrl, voiceId, model } = this.endpoint();
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
  }
}

export function createTtsProvider(operatorConfig: OperatorConfigProvider): TtsProvider {
  return config.speech.elevenLabsApiKey && config.speech.elevenLabsVoiceId
    ? new ElevenLabsTts(config.speech.elevenLabsApiKey, () => operatorConfig.get().tts)
    : new NoServerTts();
}
