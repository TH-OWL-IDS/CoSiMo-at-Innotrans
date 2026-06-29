/**
 * Text-to-speech providers. Server-side TTS (ElevenLabs) gives a high-quality
 * bilingual voice; when no key is configured the realtime service advertises
 * serverTts=false and the iPad speaks the reply with the browser's Web Speech
 * synthesis. The interface keeps the vendor swappable.
 */

import type { Locale } from "@cosimo/shared";
import { config } from "../config.js";

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
  private readonly voiceId: string;

  constructor(key: string, voiceId: string) {
    this.key = key;
    this.voiceId = voiceId;
  }

  async synthesize(text: string, _lang: Locale): Promise<SynthResult | null> {
    if (!text.trim()) return null;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
  }
}

export function createTtsProvider(): TtsProvider {
  return config.speech.elevenLabsApiKey && config.speech.elevenLabsVoiceId
    ? new ElevenLabsTts(config.speech.elevenLabsApiKey, config.speech.elevenLabsVoiceId)
    : new NoServerTts();
}
