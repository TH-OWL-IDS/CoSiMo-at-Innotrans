/**
 * Seed the CMS with the hand-authored demo content: the `default` clean-plate
 * profile, a handful of mockup riders (with NFC cards), and the simulation
 * route. Idempotent — existing profiles/route are left untouched.
 *
 * Run from apps/cms:
 *   DATABASE_URI=postgres://cosimo:cosimo_dev@localhost:5432/cosimo npx tsx src/seed.ts
 * (In Docker/VPS the compose env already provides DATABASE_URI.)
 */

import { getPayload } from "payload";
import { DEFAULT_CORE_PROMPT } from "@cosimo/shared";
import config from "./payload.config.js";

/** Shape of a seeded profile (the default clean plate + mockup riders). */
type ProfileSeed = {
  key: string;
  name?: string;
  label: string;
  summary: string;
  brief: string;
  accommodations: {
    language: "de" | "en";
    theme: string;
    textSize: "s" | "m" | "l" | "xl";
    contrast: "normal" | "high";
    input: "voice" | "text" | "both";
    volume?: number;
    voiceGender?: "female" | "male";
    voice?: string;
    voiceTone?: "neutral" | "warm" | "ruhig" | "lebhaft";
    audioOutput: boolean;
    speechRate: number;
    showText: boolean;
    reduceMotion: boolean;
  };
  traits?: {
    modality: "audio-first" | "visual-first" | "balanced";
    pace: "step-by-step" | "normal" | "brisk";
    verbosity: "terse" | "normal" | "explanatory";
    confirmation: "every-step" | "result-only";
    initiative: "leads" | "responds";
    scope: "basics" | "full";
  };
  nfcIds?: { tag: string }[];
  memories?: { note: string; at: string }[];
  consent?: boolean;
};

// The `default` clean plate: neutral accommodations. It is the profile a
// walk-up (no card) seat runs and the template new riders are copied from.
const personas: ProfileSeed[] = [
  {
    key: "default",
    label: "Standard",
    summary: "Allgemeine Begleitung.",
    brief: "Speak naturally and warmly. Keep answers short and clear.",
    accommodations: {
      language: "de", theme: "weiss", textSize: "m", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "neutral",
    },
  },
];

/**
 * The four fair riders (Nutzungsprofile 01–04) — each with NFC card, traits
 * and pre-seeded memories so "CoSiMo remembers you" demos on the first scan. The chip ids are short and typeable so a scan
 * can be simulated from a keyboard (type `[`, the id, then Enter). Together they
 * exercise every lever: audio-first, step-free proactivity, the text-first
 * layout flip, large/high-contrast, and calm/slow reduce-motion.
 */
const users: ProfileSeed[] = [
  // ── the four fair mock riders (Nutzungsprofile 01–04) ─────────────────
  {
    key: "alex",
    name: "Alex",
    label: "Alex",
    summary: "Nutzungsprofil 01 – kommuniziert über Hören und Tasten.",
    brief: "",
    accommodations: {
      language: "de", theme: "weiss", textSize: "l", contrast: "normal", input: "voice",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "neutral",
    },
    traits: { modality: "audio-first", pace: "normal", verbosity: "normal", confirmation: "every-step", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "ALEX1" }],
    memories: [
      { note: "Orientiert sich über Sprache und Tasten; möchte jede Aktion laut bestätigt bekommen.", at: "2026-08-28T08:00:00.000Z" },
      { note: "Fährt regelmäßig mit öffentlichen Verkehrsmitteln.", at: "2026-08-28T08:00:00.000Z" },
    ],
  },
  {
    key: "noa",
    name: "Noa",
    label: "Noa",
    summary: "Nutzungsprofil 02 – kommuniziert überwiegend visuell.",
    brief: "",
    accommodations: {
      language: "de", theme: "grau", textSize: "l", contrast: "high", input: "both",
      audioOutput: true, speechRate: 1, showText: true, reduceMotion: true,
      volume: 0.6, voiceGender: "female", voiceTone: "ruhig",
    },
    traits: { modality: "visual-first", pace: "normal", verbosity: "terse", confirmation: "result-only", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "NOA1" }],
    memories: [
      { note: "Liest lieber mit, als zuzuhören — in lauter Umgebung Text statt Sprache.", at: "2026-08-28T08:00:00.000Z" },
      { note: "Mag hohe Kontraste und klare Symbole.", at: "2026-08-28T08:00:00.000Z" },
    ],
  },
  {
    key: "luca",
    name: "Luca",
    label: "Luca",
    summary: "Nutzungsprofil 03 – benötigt einfache und verständliche Abläufe.",
    brief: "",
    accommodations: {
      language: "de", theme: "gelb", textSize: "l", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 0.9, showText: true, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "warm",
    },
    traits: { modality: "balanced", pace: "step-by-step", verbosity: "explanatory", confirmation: "every-step", initiative: "leads", scope: "basics" },
    nfcIds: [{ tag: "LUCA1" }],
    memories: [
      { note: "Fühlt sich sicher, wenn Abläufe Schritt für Schritt erklärt werden.", at: "2026-08-28T08:00:00.000Z" },
      { note: "Nutzt hauptsächlich die Basisfunktionen.", at: "2026-08-28T08:00:00.000Z" },
    ],
  },
  {
    key: "sam",
    name: "Sam",
    label: "Sam",
    summary: "Nutzungsprofil 04 – nutzt das System schnell und effizient.",
    brief: "",
    accommodations: {
      language: "de", theme: "weiss", textSize: "m", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 1.1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "lebhaft",
    },
    traits: { modality: "balanced", pace: "brisk", verbosity: "terse", confirmation: "result-only", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "SAM1" }],
    memories: [
      { note: "Pendelt täglich; will nur den nächsten Halt und die Zeit — kurz und ohne Rückfragen.", at: "2026-08-28T08:00:00.000Z" },
    ],
  },
];

// The route the journey simulation drives (mirrors the realtime service's
// built-in DEFAULT_ROUTE, so CMS edits start from the same baseline).
const route = {
  lineDe: "Extertalbahn",
  lineEn: "Extertal line",
  cruiseSpeedKmh: 55,
  capacity: 4,
  notesDe: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
  notesEn: "Step-free boarding, wheelchair space available.",
  stops: [
    { stopId: "lemgo", nameDe: "Lemgo", nameEn: "Lemgo", travelSecondsFromPrev: 0, dwellSeconds: 90, demand: 3 },
    { stopId: "doerentrup", nameDe: "Dörentrup", nameEn: "Dörentrup", travelSecondsFromPrev: 240, dwellSeconds: 45, demand: 1 },
    { stopId: "barntrup", nameDe: "Barntrup", nameEn: "Barntrup", travelSecondsFromPrev: 420, dwellSeconds: 45, demand: 2 },
    { stopId: "rinteln", nameDe: "Rinteln", nameEn: "Rinteln", travelSecondsFromPrev: 720, dwellSeconds: 90, demand: 3 },
  ],
};

/** Demo riders that were replaced by the four fair profiles — removed on every seed run. */
const RETIRED_KEYS = ["anna", "bruno", "clara", "david", "emil"];

async function seed(): Promise<void> {
  const payload = await getPayload({ config });

  // One-time remap of the old scheme ids to the colour names (2026-08-28).
  const OLD_THEME: Record<string, string> = { classic: "weiss", night: "dunkel", ocean: "blau", forest: "gruen", sun: "gelb", berry: "rosa", slate: "grau" };
  const all = await payload.find({ collection: "personas", limit: 100, depth: 0 });
  for (const doc of all.docs) {
    const cur = doc.accommodations?.theme;
    if (cur && OLD_THEME[cur]) {
      await payload.update({ collection: "personas", id: doc.id, data: { accommodations: { ...doc.accommodations, theme: OLD_THEME[cur] } } });
      console.log(`[seed] colour renamed: ${doc.key} ${cur} → ${OLD_THEME[cur]}`);
    }
  }

  for (const key of RETIRED_KEYS) {
    const gone = await payload.delete({ collection: "personas", where: { key: { equals: key } } });
    if (gone.docs.length) console.log(`[seed] retired profile removed: ${key}`);
  }

  for (const p of [...personas, ...users]) {
    const existing = await payload.count({
      collection: "personas",
      where: { key: { equals: p.key } },
    });
    if (existing.totalDocs > 0) {
      // Existing profiles are the operator's — except an EMPTY memory list on a
      // seeded rider, which gets the seed memories once (the demo needs them).
      const doc = (await payload.find({ collection: "personas", where: { key: { equals: p.key } }, limit: 1 })).docs[0];
      const hasMemories = Array.isArray(doc?.memories) && doc.memories.length > 0;
      if (doc && !hasMemories && p.memories?.length) {
        await payload.update({ collection: "personas", id: doc.id, data: { memories: p.memories } });
        console.log(`[seed] profile exists: ${p.key} — memories seeded`);
      } else {
        console.log(`[seed] profile exists: ${p.key}`);
      }
      continue;
    }
    await payload.create({ collection: "personas", data: p });
    console.log(`[seed] profile created: ${p.key}`);
  }

  const existingRoute = await payload.findGlobal({ slug: "route-config" });
  if (existingRoute?.stops?.length) {
    console.log("[seed] route exists: keeping the authored route");
  } else {
    await payload.updateGlobal({ slug: "route-config", data: route });
    console.log(`[seed] route created: ${route.lineDe} (${route.stops.length} stops)`);
  }

  // Pre-fill the agent's core system prompt so the admin shows the actual
  // prompt in use (instead of an empty field silently falling back to the
  // built-in). Only when empty — an operator-edited prompt is never touched.
  const opConfig = await payload.findGlobal({ slug: "operator-config" });
  if (opConfig?.agent?.systemPrompt?.trim()) {
    console.log("[seed] core prompt exists: keeping the operator's text");
  } else {
    await payload.updateGlobal({
      slug: "operator-config",
      data: { agent: { systemPrompt: DEFAULT_CORE_PROMPT } },
    });
    console.log("[seed] core prompt seeded into operator-config");
  }

  // Voice catalog: 10 ElevenLabs premade voices (multilingual, fast, natural
  // — nothing cartoonish). Only when empty — an operator-edited list stays.
  const VOICES = [
    { key: "charlotte", label: "Charlotte", gender: "female" as const, voiceId: "XB0fDUnXU5powFXDhCwa", description: "warm, weiblich, angenehm ruhig (Standard)" },
    { key: "rachel", label: "Rachel", gender: "female" as const, voiceId: "21m00Tcm4TlvDq8ikWAM", description: "klar, weiblich, sachlich-freundlich" },
    { key: "lily", label: "Lily", gender: "female" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", description: "weich, weiblich, warm, leicht britisch" },
    { key: "matilda", label: "Matilda", gender: "female" as const, voiceId: "XrExE9yKIg1WjnnlVkGX", description: "hell, weiblich, freundlich, jung" },
    { key: "sarah", label: "Sarah", gender: "female" as const, voiceId: "EXAVITQu4vr4xnSDxMaL", description: "sanft, weiblich, professionell" },
    { key: "daniel", label: "Daniel", gender: "male" as const, voiceId: "onwK4e9ZLuTAKqWW03F9", description: "tief, männlich, ruhig, seriös" },
    { key: "george", label: "George", gender: "male" as const, voiceId: "JBFqnCBsd6RMkjVDRZzb", description: "warm, männlich, erzählend" },
    { key: "brian", label: "Brian", gender: "male" as const, voiceId: "nPczCjzI2devNBz1zQrb", description: "tief, männlich, gelassen" },
    { key: "eric", label: "Eric", gender: "male" as const, voiceId: "cjVigY5qzO86Huf0OWal", description: "freundlich, männlich, mittleres Alter" },
    { key: "will", label: "Will", gender: "male" as const, voiceId: "bIHbv24MWmeRgasZH58o", description: "jung, männlich, entspannt-freundlich" },
  ];
  const opConfig2 = await payload.findGlobal({ slug: "operator-config" });
  if (opConfig2?.tts?.voices?.length) {
    console.log("[seed] voice catalog exists: keeping the operator's voices");
  } else {
    await payload.updateGlobal({
      slug: "operator-config",
      data: { tts: { ...(opConfig2?.tts ?? {}), voices: VOICES } },
    });
    console.log(`[seed] voice catalog seeded (${VOICES.length} voices)`);
  }

  process.exit(0);
}

void seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
