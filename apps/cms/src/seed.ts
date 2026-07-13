/**
 * Seed the CMS with the hand-authored demo content: the `default` clean-plate
 * profile, a handful of mockup riders (with NFC cards), and MonoCab telemetry
 * scenarios. Idempotent — profiles that already exist are left untouched.
 *
 * Run from apps/cms:
 *   DATABASE_URI=postgres://cosimo:cosimo_dev@localhost:5432/cosimo npx tsx src/seed.ts
 * (In Docker/VPS the compose env already provides DATABASE_URI.)
 */

import { getPayload } from "payload";
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

const scenarios = [
  {
    name: "Fahrt Lemgo → Rinteln (Standard)",
    active: true,
    speedKmh: 28,
    batteryPct: 82,
    occupancy: 1,
    capacity: 4,
    doorsOpen: false,
    locationDe: "zwischen Lemgo und Dörentrup",
    locationEn: "between Lemgo and Dörentrup",
    lineDe: "Extertalbahn",
    lineEn: "Extertal line",
    destinationDe: "Rinteln",
    destinationEn: "Rinteln",
    nextStops: [
      { stopId: "doerentrup", nameDe: "Dörentrup", nameEn: "Dörentrup", etaMinutes: 4 },
      { stopId: "barntrup", nameDe: "Barntrup", nameEn: "Barntrup", etaMinutes: 11 },
      { stopId: "rinteln", nameDe: "Rinteln", nameEn: "Rinteln", etaMinutes: 23 },
    ],
    notesDe: "Stufenloser Einstieg, Rollstuhlplatz vorhanden.",
    notesEn: "Step-free boarding, wheelchair space available.",
  },
  {
    name: "Halt in Dörentrup (Türen offen)",
    active: false,
    speedKmh: 0,
    batteryPct: 80,
    occupancy: 2,
    capacity: 4,
    doorsOpen: true,
    locationDe: "Bahnhof Dörentrup",
    locationEn: "Dörentrup station",
    lineDe: "Extertalbahn",
    lineEn: "Extertal line",
    destinationDe: "Rinteln",
    destinationEn: "Rinteln",
    nextStops: [
      { stopId: "barntrup", nameDe: "Barntrup", nameEn: "Barntrup", etaMinutes: 7 },
      { stopId: "rinteln", nameDe: "Rinteln", nameEn: "Rinteln", etaMinutes: 19 },
    ],
    notesDe: "Halt mit Niveaueinstieg; Abfahrt in Kürze.",
    notesEn: "Level boarding at this stop; departing shortly.",
  },
  {
    name: "Zügige Fahrt, fast voll (InnoTrans-Demo)",
    active: false,
    speedKmh: 54,
    batteryPct: 64,
    occupancy: 3,
    capacity: 4,
    doorsOpen: false,
    locationDe: "kurz vor Barntrup",
    locationEn: "approaching Barntrup",
    lineDe: "Extertalbahn",
    lineEn: "Extertal line",
    destinationDe: "Rinteln",
    destinationEn: "Rinteln",
    nextStops: [
      { stopId: "barntrup", nameDe: "Barntrup", nameEn: "Barntrup", etaMinutes: 2 },
      { stopId: "rinteln", nameDe: "Rinteln", nameEn: "Rinteln", etaMinutes: 14 },
    ],
    notesDe: "Noch ein freier Platz; Rollstuhlplatz belegt.",
    notesEn: "One seat left; wheelchair space occupied.",
  },
];

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

  for (const s of scenarios) {
    const existing = await payload.count({
      collection: "mockup-data",
      where: { name: { equals: s.name } },
    });
    if (existing.totalDocs > 0) {
      console.log(`[seed] scenario exists: ${s.name}`);
      continue;
    }
    try {
      await payload.create({ collection: "mockup-data", data: s });
      console.log(`[seed] scenario created: ${s.name}`);
    } catch (err) {
      const e = err as { cause?: { errors?: unknown }; data?: { errors?: unknown } };
      console.error(
        `[seed] scenario failed: ${s.name}`,
        JSON.stringify(e.cause?.errors ?? e.data?.errors ?? String(err), null, 2),
      );
    }
  }

  process.exit(0);
}

void seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
