import type { Locale } from "./telemetry.js";
import { RIG_FIXTURES, rigDefaultState, type RigFixtureState } from "./rig.js";

/**
 * The cabin light as the rider, CoSiMo, the panel button and the console
 * all speak about it: SCENES. A scene is a table with a row for EVERY
 * fixture of the rig (rig.ts RIG_FIXTURES) — on/off, brightness and the
 * cold/warm bias, the signal light with its RGB and mode — in the
 * installer's own model (`splitBias`). Exactly one scene is active, or
 * "off", or the cabin is "free" (someone moved a fixture by hand).
 *
 * The rider and CoSiMo only ever touch the three interior groups
 * (LIGHT_GROUPS); everything else — outer light, headrests, reading lamps,
 * the signal light — is part of the scene too, but staff-only (console).
 *
 * The scenes live in the CMS (cabin-config → lightScenes) and are SAVED
 * FROM THE CONSOLE: set the sliders in the cabin, then "Szene speichern".
 */

/** The fixture ids the rider / CoSiMo may set (slit menu, set_light `group`). */
export const LIGHT_GROUPS = ["roofline", "rooflight", "floor"] as const;
export type LightGroup = (typeof LIGHT_GROUPS)[number];

export const LIGHT_GROUP_LABEL: Record<LightGroup, Record<Locale, string>> = {
  roofline: { de: "Lichtlinien", en: "Light lines" },
  rooflight: { de: "Deckenpaneel", en: "Ceiling panel" },
  floor: { de: "Boden", en: "Floor" },
};

/** Every fixture a scene describes (all of the rig). */
export const SCENE_FIXTURES: readonly string[] = RIG_FIXTURES.map((f) => f.id);

/** One fixture's level in a scene / in the cabin — the rig page's state. */
export type GroupLevel = RigFixtureState;

/** Levels for every fixture, keyed by fixture id. */
export type FixtureLevels = Record<string, GroupLevel>;

export interface LightScene {
  key: string;
  label: string;
  /** Every fixture; a missing one counts as off. */
  groups: FixtureLevels;
}

/** All fixtures off (the "off" state, and the base of every scene). */
export function offFixtures(): FixtureLevels {
  return Object.fromEntries(RIG_FIXTURES.map((f) => [f.id, { ...rigDefaultState(f), on: false, intensity: 0 }]));
}

const WARM = (intensity: number): GroupLevel => ({ on: true, intensity, bias: -100 });
const COLD = (intensity: number, bias = 100): GroupLevel => ({ on: true, intensity, bias });

/** Three scenes to start from — tuned in the cabin, saved from the console. Everything but the three interior groups starts off. */
export const DEFAULT_LIGHT_SCENES: LightScene[] = [
  { key: "standard", label: "Standard", groups: { ...offFixtures(), roofline: WARM(60), rooflight: WARM(100), floor: WARM(40) } },
  { key: "gemuetlich", label: "Gemütlich", groups: { ...offFixtures(), roofline: WARM(40), rooflight: WARM(30), floor: WARM(25) } },
  { key: "hell", label: "Hell", groups: { ...offFixtures(), roofline: COLD(80), rooflight: COLD(100), floor: COLD(50, 60) } },
];

/** The one cabin light state (hub-held, broadcast to seats and consoles). */
export interface CabinLightState {
  /** The active scene's key, "off", or null = free (a fixture was moved by hand). */
  scene: string | "off" | null;
  /** Every fixture's live level — the same object the console's rig page edits. */
  groups: FixtureLevels;
  /** The scenes as the CMS has them — so every menu renders the same names. */
  scenes: LightScene[];
  /** The last physical outcome (an iPad fired the URLs and the LPU-2 answered). */
  confirmed: boolean;
  /** "etwas dunkler / heller": the interior groups' brightness relative to
   *  the scene as stored (1 = as stored). A scene switch resets it. */
  dim: number;
}

export const DIM_STEP = 0.75;
export const DIM_MIN = 0.2;
export const DIM_MAX = 1.5;

/** Seat / console → hub: one change. Either a scene step or one fixture. */
export interface LightSetRequest {
  /** A scene key, "off", or "next" (the panel button, cycles the scenes). */
  scene?: string;
  /** "etwas heller / dunkler": dim the interior groups WITHIN the current
   *  scene (× DIM_STEP per step), or set the factor directly. */
  dim?: "brighter" | "darker" | number;
  /** One fixture (a rider may only send LIGHT_GROUPS ids). */
  group?: { id: string; on?: boolean; intensity?: number; bias?: number; rgb?: { red: number; green: number; blue: number }; mode?: string | null };
}

/** Console → hub: write the cabin's current levels into a scene (rename optional). */
export interface SceneSaveRequest {
  key: string;
  label?: string;
  /** Rename only — keep the scene's stored levels. */
  keepLevels?: boolean;
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

export function normalizeGroupLevel(v: Partial<GroupLevel> | undefined, base: GroupLevel): GroupLevel {
  const out: GroupLevel = {
    on: typeof v?.on === "boolean" ? v.on : base.on,
    intensity: Math.round(clamp(v?.intensity, 0, 100, base.intensity)),
    bias: Math.round(clamp(v?.bias, -100, 100, base.bias)),
  };
  const rgb = v?.rgb ?? base.rgb;
  if (rgb) out.rgb = { red: Math.round(clamp(rgb.red, 0, 100, 0)), green: Math.round(clamp(rgb.green, 0, 100, 0)), blue: Math.round(clamp(rgb.blue, 0, 100, 0)) };
  if (v?.mode !== undefined) out.mode = v.mode;
  else if (base.mode !== undefined) out.mode = base.mode;
  return out;
}

/** A scene's levels for every fixture (missing rows = off). */
export function sceneLevels(s: LightScene): FixtureLevels {
  const base = offFixtures();
  for (const id of SCENE_FIXTURES) if (s.groups[id]) base[id] = normalizeGroupLevel(s.groups[id], base[id]!);
  return base;
}

/** A scene's mean interior brightness — orders "brighter" / "darker". */
export function sceneBrightness(s: LightScene): number {
  return LIGHT_GROUPS.reduce((sum, g) => sum + (s.groups[g]?.on ? s.groups[g]!.intensity : 0), 0) / LIGHT_GROUPS.length;
}

function sameLevel(a: GroupLevel | undefined, b: GroupLevel | undefined): boolean {
  const x = a ?? { on: false, intensity: 0, bias: 0 };
  const y = b ?? { on: false, intensity: 0, bias: 0 };
  if (x.on !== y.on) return false;
  if (!x.on) return true;
  if (x.intensity !== y.intensity || x.bias !== y.bias) return false;
  const rx = x.rgb ?? { red: 0, green: 0, blue: 0 }, ry = y.rgb ?? { red: 0, green: 0, blue: 0 };
  if (rx.red !== ry.red || rx.green !== ry.green || rx.blue !== ry.blue) return false;
  return (x.mode ?? null) === (y.mode ?? null);
}

export function sameLevels(a: FixtureLevels, b: FixtureLevels): boolean {
  return SCENE_FIXTURES.every((id) => sameLevel(a[id], b[id]));
}

/* ── the CMS row shape (cabin-config → lightScenes) ─────────────────────── */

/** CMS field name per fixture id (array rows cannot use dashes freely). */
export const SCENE_FIELD: Record<string, string> = {
  roofline: "roofline", rooflight: "rooflight", floor: "floor", outer: "outer", headrests: "headrests",
  "reading-1": "reading1", "reading-2": "reading2", "reading-3": "reading3", "reading-4": "reading4", signals: "signals",
};

export interface SceneRowLevel { on?: boolean | null; intensity?: number | null; bias?: number | null; red?: number | null; green?: number | null; blue?: number | null; mode?: string | null }
export interface SceneRow { key?: string | null; label?: string | null; [field: string]: SceneRowLevel | string | null | undefined }

export function sceneToRow(s: LightScene): SceneRow {
  const row: SceneRow = { key: s.key, label: s.label };
  for (const id of SCENE_FIXTURES) {
    const lv = s.groups[id];
    const field = SCENE_FIELD[id]!;
    row[field] = lv
      ? { on: lv.on, intensity: lv.intensity, bias: lv.bias, ...(lv.rgb ? { red: lv.rgb.red, green: lv.rgb.green, blue: lv.rgb.blue } : {}), ...(lv.mode !== undefined ? { mode: lv.mode ?? "none" } : {}) }
      : { on: false, intensity: 0, bias: 0 };
  }
  return row;
}

export function rowToScene(r: SceneRow, fallback: LightScene): LightScene | null {
  const key = String(r.key ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!key) return null;
  const groups = offFixtures();
  for (const id of SCENE_FIXTURES) {
    const v = r[SCENE_FIELD[id]!];
    const base = fallback.groups[id] ?? groups[id]!;
    if (!v || typeof v !== "object") { groups[id] = base; continue; }
    const lvl: Partial<GroupLevel> = { on: v.on ?? undefined, intensity: v.intensity ?? undefined, bias: v.bias ?? undefined };
    if (id === "signals") {
      lvl.rgb = { red: v.red ?? 0, green: v.green ?? 0, blue: v.blue ?? 0 };
      lvl.mode = v.mode && v.mode !== "none" ? v.mode : null;
    }
    groups[id] = normalizeGroupLevel(lvl, base);
  }
  return { key, label: String(r.label ?? "").trim() || key, groups };
}
