/**
 * Text-to-speech providers. Server-side TTS (ElevenLabs) gives a high-quality
 * bilingual voice; when no key is configured the realtime service advertises
 * serverTts=false and the iPad speaks the reply with the browser's Web Speech
 * synthesis. The interface keeps the vendor swappable.
 */

import { DEFAULT_VOICE_GENDER, VOICE_TONE_STABILITY, type Locale, type VoiceCatalogEntry, type VoiceTone } from "@cosimo/shared";
import { config } from "../config.js";
import type { OperatorConfigProvider } from "../agent/operatorConfig.js";

export interface SynthResult {
  audioBase64: string;
  mime: string;
}

/** Per-utterance voice adaptation, from the seat's accommodations. */
export interface VoiceOptions {
  /** speechRate 0.5–1.5; ElevenLabs supports 0.7–1.2 (clamped). */
  rate: number;
  gender: "female" | "male";
  tone: VoiceTone;
  /** A specific catalog voice (accommodations.voice); wins over gender. */
  voiceKey?: string;
  /** Already-spoken text of this turn (streaming) — keeps prosody continuous. */
  previousText?: string;
}

export interface TtsProvider {
  readonly available: boolean;
  /** Synthesize speech, or null if unavailable (client speaks locally). */
  synthesize(text: string, lang: Locale, voice?: VoiceOptions): Promise<SynthResult | null>;
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
  private readonly endpoint: () => { baseUrl: string; voiceId: string; voiceIdMale: string; model: string; voices: VoiceCatalogEntry[] };

  constructor(key: string, endpoint: () => { baseUrl: string; voiceId: string; voiceIdMale: string; model: string; voices: VoiceCatalogEntry[] }) {
    this.key = key;
    this.endpoint = endpoint;
  }

  async synthesize(text: string, lang: Locale, voice?: VoiceOptions): Promise<SynthResult | null> {
    if (!text.trim()) return null;
    const { baseUrl, voiceId, voiceIdMale, model, voices } = this.endpoint();
    // Voice = a different voice id on the same endpoint — zero latency cost.
    // Precedence: explicit catalog key → gender in the sentence's language →
    // gender in any language (male keeps the env fallback) → env default.
    // A German rider asking for "eine Frau" gets a German female voice, an
    // English rider an English one. Anything unresolvable stays on the
    // default voice, never fails.
    const gender = voice?.gender ?? DEFAULT_VOICE_GENDER;
    const pool = voices.filter((v) => v.language === lang);
    const byKey = voice?.voiceKey ? voices.find((v) => v.key === voice.voiceKey)?.voiceId : undefined;
    const byGender =
      (pool.find((v) => v.gender === gender) ?? voices.find((v) => v.gender === gender))?.voiceId ||
      (gender === "male" ? voiceIdMale : undefined);
    const id = byKey || byGender || voiceId;
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/text-to-speech/${id}?output_format=mp3_44100_128`;
    // speed + stability are free; `style` > 0 and speaker boost would add
    // latency, so tone maps onto stability only (see VOICE_TONE_STABILITY).
    const voice_settings = {
      speed: Math.min(1.2, Math.max(0.7, voice?.rate ?? 1)),
      stability: VOICE_TONE_STABILITY[voice?.tone ?? "neutral"],
      similarity_boost: 0.75,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": this.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings,
        ...(voice?.previousText ? { previous_text: voice.previousText.slice(-600) } : {}),
      }),
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
