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
      language: "de", theme: "weiss", textSize: "m", input: "both",
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
 * layout flip, large text, and calm/slow reduce-motion.
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
      language: "de", theme: "weiss", textSize: "l", input: "voice",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "neutral",
    },
    traits: { modality: "audio-first", pace: "normal", verbosity: "normal", confirmation: "every-step", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "ALEX1" }],
    consent: true,
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
      language: "de", theme: "grau", textSize: "l", input: "both",
      audioOutput: true, speechRate: 1, showText: true, reduceMotion: true,
      volume: 0.6, voiceGender: "female", voiceTone: "ruhig",
    },
    traits: { modality: "visual-first", pace: "normal", verbosity: "terse", confirmation: "result-only", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "NOA1" }],
    consent: true,
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
      language: "de", theme: "gelb", textSize: "l", input: "both",
      audioOutput: true, speechRate: 0.9, showText: true, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "warm",
    },
    traits: { modality: "balanced", pace: "step-by-step", verbosity: "explanatory", confirmation: "every-step", initiative: "leads", scope: "basics" },
    nfcIds: [{ tag: "LUCA1" }],
    consent: true,
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
      language: "de", theme: "weiss", textSize: "m", input: "both",
      audioOutput: true, speechRate: 1.1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "lebhaft",
    },
    traits: { modality: "balanced", pace: "brisk", verbosity: "terse", confirmation: "result-only", initiative: "responds", scope: "full" },
    nfcIds: [{ tag: "SAM1" }],
    consent: true,
    memories: [
      { note: "Pendelt täglich; will nur den nächsten Halt und die Zeit — kurz und ohne Rückfragen.", at: "2026-08-28T08:00:00.000Z" },
    ],
  },
];

// The route the journey simulation drives (mirrors the realtime service's
// built-in DEFAULT_ROUTE, so CMS edits start from the same baseline).
const route = {
  lineDe: "Begatalbahn",
  lineEn: "Bega valley line",
  cruiseSpeedKmh: 55,
  capacity: 4,
  notesDe: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
  notesEn: "Step-free boarding, wheelchair space available.",
  stops: [
    { stopId: "lemgo-luettfeld", nameDe: "Lemgo-Lüttfeld", nameEn: "Lemgo-Lüttfeld", travelSecondsFromPrev: 0, dwellSeconds: 90, demand: 3 },
    { stopId: "schlossstrasse", nameDe: "Schlossstraße", nameEn: "Schlossstraße", travelSecondsFromPrev: 60, dwellSeconds: 45, demand: 1 },
    { stopId: "blomberger-weg", nameDe: "Blomberger Weg", nameEn: "Blomberger Weg", travelSecondsFromPrev: 90, dwellSeconds: 45, demand: 1 },
    { stopId: "doerentrup-mitte", nameDe: "Dörentrup Mitte", nameEn: "Dörentrup Mitte", travelSecondsFromPrev: 350, dwellSeconds: 45, demand: 2 },
    { stopId: "farmbeck", nameDe: "Farmbeck", nameEn: "Farmbeck", travelSecondsFromPrev: 150, dwellSeconds: 45, demand: 1 },
    { stopId: "bega-friedhof", nameDe: "Bega Friedhof", nameEn: "Bega Friedhof", travelSecondsFromPrev: 150, dwellSeconds: 45, demand: 2 },
    { stopId: "barntrup-hauptstation", nameDe: "Barntrup Hauptstation", nameEn: "Barntrup main station", travelSecondsFromPrev: 330, dwellSeconds: 90, demand: 3 },
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

  // Voice catalog: 5 female + 5 male per language. The German ten are
  // native community-library voices (must be added to the ElevenLabs account
  // once — Voice Library → "Add"), the English ten are premades. Order
  // matters: the FIRST entry per language+gender is that combination's
  // default ("sprich als frau"). Only seeded when empty — an operator-edited
  // list stays.
  const VOICES = [
    // — Deutsch, weiblich —
    { key: "doreen", label: "Doreen", gender: "female" as const, language: "de" as const, voiceId: "mDRP1h6KfUD1XAUJxqr0", description: "klar, weiblich, dynamisch-professionell (Standard Deutsch)" },
    { key: "nadine", label: "Nadine", gender: "female" as const, language: "de" as const, voiceId: "XFigb6fqZPxl2Q2dFOXN", description: "warm, weiblich, natürlich im Gespräch" },
    { key: "ela", label: "Ela", gender: "female" as const, language: "de" as const, voiceId: "SJJe86Va82zRzg6zi2dX", description: "jung, weiblich, einfühlsam und weich" },
    { key: "lea", label: "Lea", gender: "female" as const, language: "de" as const, voiceId: "M39iqBUcu1jyiwM5PfSy", description: "ruhig, weiblich, beruhigend-zugewandt" },
    { key: "dana", label: "Dana", gender: "female" as const, language: "de" as const, voiceId: "nF7t9cuYo0u3kuVI9q4B", description: "tiefer, weiblich, warm und fröhlich" },
    // — Deutsch, männlich —
    { key: "leo", label: "Leo", gender: "male" as const, language: "de" as const, voiceId: "f64OyGck4gc2zk7QOs55", description: "ausgeglichen, männlich, natürlich und klar (Standard Deutsch)" },
    { key: "finn", label: "Finn", gender: "male" as const, language: "de" as const, voiceId: "1J0wWp4zPQIvsK7Xwh34", description: "freundlich, männlich, natürlich im Gespräch" },
    { key: "ben", label: "Ben", gender: "male" as const, language: "de" as const, voiceId: "MMwckqU477oQxnAk1SgA", description: "ruhig, männlich, gelassen und natürlich" },
    { key: "simon", label: "Simon", gender: "male" as const, language: "de" as const, voiceId: "K5ZVtkkBnuPY6YqXs70E", description: "jung, männlich, nahbar und unaufgeregt" },
    { key: "christian", label: "Christian", gender: "male" as const, language: "de" as const, voiceId: "CvLyegHbActy7exgIBri", description: "ruhig, männlich, sanft und vertrauensvoll" },
    // — Englisch, weiblich —
    { key: "sarah", label: "Sarah", gender: "female" as const, language: "en" as const, voiceId: "EXAVITQu4vr4xnSDxMaL", description: "sanft, weiblich, professionell (Standard Englisch)" },
    { key: "matilda", label: "Matilda", gender: "female" as const, language: "en" as const, voiceId: "XrExE9yKIg1WjnnlVkGX", description: "hell, weiblich, freundlich, jung" },
    { key: "alice", label: "Alice", gender: "female" as const, language: "en" as const, voiceId: "Xb7hH8MSUJpSbSDYk0k2", description: "klar, weiblich, britisch, erklärend" },
    { key: "lily", label: "Lily", gender: "female" as const, language: "en" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", description: "weich, weiblich, warm, leicht britisch" },
    { key: "jessica", label: "Jessica", gender: "female" as const, language: "en" as const, voiceId: "cgSgspJ2msm6clMCkdW9", description: "verspielt, weiblich, hell und warm" },
    // — Englisch, männlich —
    { key: "daniel", label: "Daniel", gender: "male" as const, language: "en" as const, voiceId: "onwK4e9ZLuTAKqWW03F9", description: "tief, männlich, ruhig, seriös (Standard Englisch)" },
    { key: "george", label: "George", gender: "male" as const, language: "en" as const, voiceId: "JBFqnCBsd6RMkjVDRZzb", description: "warm, männlich, erzählend, britisch" },
    { key: "brian", label: "Brian", gender: "male" as const, language: "en" as const, voiceId: "nPczCjzI2devNBz1zQrb", description: "tief, männlich, gelassen" },
    { key: "eric", label: "Eric", gender: "male" as const, language: "en" as const, voiceId: "cjVigY5qzO86Huf0OWal", description: "freundlich, männlich, mittleres Alter" },
    { key: "chris", label: "Chris", gender: "male" as const, language: "en" as const, voiceId: "iP95p4xoKVk53GoZ742B", description: "locker, männlich, bodenständig" },
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

  // The cabin light rig: LPU-2 address + playback map, exactly the Cuety
  // table from the vehicle team (2026-09-02). Zones are CW/WW pairs, reading
  // lamps individual per seat, red signals host-only. Only seeded when no
  // mapping exists — an operator-edited map stays.
  const PLAYBACKS = [
    { control: "interior-light-cw", playback: 7 },
    { control: "interior-light-ww", playback: 8 },
    { control: "reading-1", playback: 49 },
    { control: "reading-2", playback: 50 },
    { control: "reading-3", playback: 51 },
    { control: "reading-4", playback: 52 },
    { control: "outer-cw", playback: 1 },
    { control: "outer-ww", playback: 2 },
    { control: "floor-cw", playback: 3 },
    { control: "floor-ww", playback: 4 },
    { control: "roofline-cw", playback: 5 },
    { control: "roofline-ww", playback: 6 },
    { control: "headrests-cw", playback: 9 },
    { control: "headrests-ww", playback: 10 },
    { control: "signals-cw", playback: 25 },
    { control: "signals-ww", playback: 26 },
    { control: "signals-front-red", playback: 33 },
    { control: "signals-rear-red", playback: 34 },
    { control: "signals-front-flash", playback: 35 },
    { control: "signals-rear-flash", playback: 36 },
  ] as const;
  const opConfig3 = await payload.findGlobal({ slug: "operator-config" });
  if (opConfig3?.cabin?.lpu2Playbacks?.length) {
    console.log("[seed] LPU-2 playback map exists: keeping the operator's mapping");
  } else {
    await payload.updateGlobal({
      slug: "operator-config",
      data: {
        cabin: {
          ...(opConfig3?.cabin ?? {}),
          lpu2BaseUrl: opConfig3?.cabin?.lpu2BaseUrl || "http://192.168.96.176",
          lpu2Playbacks: PLAYBACKS.map((p) => ({ ...p })),
        },
      },
    });
    console.log(`[seed] LPU-2 playback map seeded (${PLAYBACKS.length} playbacks)`);
  }

  process.exit(0);
}

void seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
