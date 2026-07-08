/**
 * Seed the CMS with the hand-authored demo content: the four personas
 * (mirroring the realtime service's built-in defaults, so CMS edits start
 * from the same baseline) and MonoCab telemetry scenarios. Idempotent —
 * collections that already have documents are left untouched.
 *
 * Run from apps/cms:
 *   DATABASE_URI=postgres://cosimo:cosimo_dev@localhost:5432/cosimo npx tsx src/seed.ts
 * (In Docker/VPS the compose env already provides DATABASE_URI.)
 */

import { getPayload } from "payload";
import config from "./payload.config.js";

const personas = [
  {
    key: "default",
    labelDe: "Standard",
    labelEn: "Default",
    summaryDe: "Allgemeine Begleitung.",
    summaryEn: "General assistance.",
    supportStyle: "Speak naturally and warmly. Keep answers short and clear.",
    preferredModality: "both",
    themeId: "classic",
    emotionBias: { happy: 0.3, neutral: 0.2 },
    presentation: { highContrast: false, largeText: false, speakAloud: true },
  },
  {
    key: "eyes-free",
    labelDe: "Ohne Sicht",
    labelEn: "Eyes-free",
    summaryDe: "Für blinde oder sehbeeinträchtigte Fahrgäste.",
    summaryEn: "For blind or low-vision riders.",
    supportStyle:
      "The rider may not be looking at the screen. Be fully understandable by ear alone: lead with the answer, avoid references to on-screen elements ('as you can see'), spell out anything a screen would show, and confirm every action aloud.",
    preferredModality: "voice",
    themeId: "night",
    emotionBias: { neutral: 0.4, happy: 0.2 },
    presentation: { highContrast: true, largeText: true, speakAloud: true },
  },
  {
    key: "wheelchair",
    labelDe: "Rollstuhl",
    labelEn: "Wheelchair",
    summaryDe: "Fokus auf barrierefreien Zugang.",
    summaryEn: "Focus on step-free access.",
    supportStyle:
      "Pay attention to step-free access, the wheelchair space, door width and boarding help. Proactively mention accessibility details when relevant to the rider's question.",
    preferredModality: "both",
    themeId: "ocean",
    emotionBias: { happy: 0.3, neutral: 0.2 },
    presentation: { highContrast: false, largeText: true, speakAloud: true },
  },
  {
    key: "text-first",
    labelDe: "Text",
    labelEn: "Text-first",
    summaryDe: "Für gehörlose oder text-bevorzugende Fahrgäste.",
    summaryEn: "For deaf or text-preferring riders.",
    supportStyle:
      "The rider prefers reading. Write in clear, well-structured text. Do not rely on tone of voice; make confirmations explicit in writing.",
    preferredModality: "text",
    themeId: "slate",
    emotionBias: { neutral: 0.3, happy: 0.2 },
    presentation: { highContrast: false, largeText: true, speakAloud: false },
  },
] as const;

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

  for (const p of personas) {
    const existing = await payload.count({
      collection: "personas",
      where: { key: { equals: p.key } },
    });
    if (existing.totalDocs > 0) {
      console.log(`[seed] persona exists: ${p.key}`);
      continue;
    }
    await payload.create({ collection: "personas", data: p });
    console.log(`[seed] persona created: ${p.key}`);
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
