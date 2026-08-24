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
    voiceTone?: "neutral" | "warm" | "ruhig" | "lebhaft";
    audioOutput: boolean;
    speechRate: number;
    showText: boolean;
    reduceMotion: boolean;
  };
  nfcIds?: { tag: string }[];
  memories?: { note: string; at: string }[];
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
      language: "de", theme: "classic", textSize: "m", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
      volume: 1, voiceGender: "female", voiceTone: "neutral",
    },
  },
];

/**
 * Mockup **riders** — real people with NFC cards, each given a name, a nuanced
 * brief and a pre-seeded memory so "CoSiMo remembers
 * you" demos on the first scan. The chip ids are short and typeable so a scan
 * can be simulated from a keyboard (type `[`, the id, then Enter). Together they
 * exercise every lever: audio-first, step-free proactivity, the text-first
 * layout flip, large/high-contrast, and calm/slow reduce-motion.
 */
const users: ProfileSeed[] = [
  {
    key: "anna",
    name: "Anna Berg",
    label: "Anna Berg",
    summary: "Blind, Alltagsfahrerin.",
    brief:
      "Anna is blind and a confident daily rider on this line — skip basic orientation and lead straight with the answer.",
    accommodations: {
      language: "de", theme: "night", textSize: "xl", contrast: "high", input: "voice",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
    },
    nfcIds: [{ tag: "ANNA1" }],
    memories: [
      { note: "Prefers very short answers.", at: "2026-07-01T09:00:00.000Z" },
      { note: "Rides this line daily to work.", at: "2026-07-01T09:00:00.000Z" },
    ],
  },
  {
    key: "bruno",
    name: "Bruno Klein",
    label: "Bruno Klein",
    summary: "Rollstuhlnutzer.",
    brief:
      "Bruno uses a wheelchair; be proactive about step-free access, the wheelchair space and boarding help.",
    accommodations: {
      language: "de", theme: "ocean", textSize: "l", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 1, showText: false, reduceMotion: false,
    },
    nfcIds: [{ tag: "BRUNO1" }],
    memories: [
      { note: "Boards at the front where the ramp is.", at: "2026-07-01T09:00:00.000Z" },
    ],
  },
  {
    key: "clara",
    name: "Clara Voss",
    label: "Clara Voss",
    summary: "Gehörlos, liest mit.",
    brief:
      "Clara is deaf and reads your replies; write clearly and confirm actions in writing. Do not rely on tone of voice.",
    accommodations: {
      language: "de", theme: "slate", textSize: "l", contrast: "normal", input: "text",
      audioOutput: false, speechRate: 1, showText: true, reduceMotion: false,
    },
    nfcIds: [{ tag: "CLARA1" }],
    memories: [
      { note: "Reads a little lip movement but prefers text.", at: "2026-07-01T09:00:00.000Z" },
    ],
  },
  {
    key: "david",
    name: "David Ono",
    label: "David Ono",
    summary: "Sehbeeinträchtigt, sieht noch.",
    brief:
      "David has low vision — larger, high-contrast text helps a lot, and he can also hear you.",
    accommodations: {
      language: "en", theme: "classic", textSize: "xl", contrast: "high", input: "both",
      audioOutput: true, speechRate: 1, showText: true, reduceMotion: false,
    },
    nfcIds: [{ tag: "DAVID1" }],
    memories: [
      { note: "Likes the larger text; no need to ask.", at: "2026-07-01T09:00:00.000Z" },
    ],
  },
  {
    key: "emil",
    name: "Emil Roth",
    label: "Emil Roth",
    summary: "Älterer Fahrgast, ruhiges Tempo.",
    brief:
      "Emil is an older rider who appreciates a calm, unhurried pace and plain, simple language.",
    accommodations: {
      language: "de", theme: "sun", textSize: "l", contrast: "normal", input: "both",
      audioOutput: true, speechRate: 0.85, showText: false, reduceMotion: true,
    },
    nfcIds: [{ tag: "EMIL1" }],
    memories: [
      { note: "Appreciates an unhurried pace.", at: "2026-07-01T09:00:00.000Z" },
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
  // The unattended booth loop: a signal hold now and then, a door fault
  // rarely. One fault at a time; the host can always inject or clear.
  faults: [
    { kind: "signal-hold" as const, everyMinutes: 8, chancePct: 35, durationSec: 45 },
    { kind: "door-fault" as const, everyMinutes: 15, chancePct: 20, durationSec: 30 },
  ],
};

async function seed(): Promise<void> {
  const payload = await getPayload({ config });

  for (const p of [...personas, ...users]) {
    const existing = await payload.count({
      collection: "personas",
      where: { key: { equals: p.key } },
    });
    if (existing.totalDocs > 0) {
      console.log(`[seed] profile exists: ${p.key}`);
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

  process.exit(0);
}

void seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
