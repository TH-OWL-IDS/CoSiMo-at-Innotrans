import type { Locale } from "./telemetry.js";

/**
 * The cabin light as the rider, CoSiMo, the panel button and the console
 * all speak about it: SCENES. A scene is a table — for each of the three
 * groups that are wired (installer, 2026-09-18: Lichtlinien, Deckenpaneel,
 * Boden) a brightness and a cold/warm bias, in the installer's own model
 * (rig.ts `splitBias`). Exactly one scene is active, or "off", or the
 * cabin is "free" (someone moved a group by hand).
 *
 * The scenes live in the CMS (operator-config → cabin → lightScenes) and
 * are SAVED FROM THE CONSOLE: set the sliders in the cabin, then "als
 * Szene speichern". Defaults below seed them.
 */

/** The fixture ids (rig.ts RIG_FIXTURES) a scene covers. */
export const LIGHT_GROUPS = ["roofline", "rooflight", "floor"] as const;
export type LightGroup = (typeof LIGHT_GROUPS)[number];

export const LIGHT_GROUP_LABEL: Record<LightGroup, Record<Locale, string>> = {
  roofline: { de: "Lichtlinien", en: "Light lines" },
  rooflight: { de: "Deckenpaneel", en: "Ceiling panel" },
  floor: { de: "Boden", en: "Floor" },
};

export interface GroupLevel {
  on: boolean;
  /** 0–100. */
  intensity: number;
  /** −100 … 100: 0 = both whites at the intensity, −x reduces cold white
   *  by x % (warmer), +x reduces warm white (colder). */
  bias: number;
}

export interface LightScene {
  key: string;
  label: string;
  groups: Record<LightGroup, GroupLevel>;
}

/** Three scenes to start from — tuned in the cabin, saved from the console. */
export const DEFAULT_LIGHT_SCENES: LightScene[] = [
  {
    key: "standard", label: "Standard",
    groups: { roofline: { on: true, intensity: 60, bias: -100 }, rooflight: { on: true, intensity: 100, bias: -100 }, floor: { on: true, intensity: 40, bias: -100 } },
  },
  {
    key: "gemuetlich", label: "Gemütlich",
    groups: { roofline: { on: true, intensity: 40, bias: -100 }, rooflight: { on: true, intensity: 30, bias: -100 }, floor: { on: true, intensity: 25, bias: -100 } },
  },
  {
    key: "hell", label: "Hell",
    groups: { roofline: { on: true, intensity: 80, bias: 100 }, rooflight: { on: true, intensity: 100, bias: 100 }, floor: { on: true, intensity: 50, bias: 60 } },
  },
];

export const OFF_GROUPS: Record<LightGroup, GroupLevel> = {
  roofline: { on: false, intensity: 0, bias: 0 },
  rooflight: { on: false, intensity: 0, bias: 0 },
  floor: { on: false, intensity: 0, bias: 0 },
};

/** The one cabin light state (hub-held, broadcast to seats and consoles). */
export interface CabinLightState {
  /** The active scene's key, "off", or null = free (a group was moved by hand). */
  scene: string | "off" | null;
  groups: Record<LightGroup, GroupLevel>;
  /** The scenes as the CMS has them — so every menu renders the same names. */
  scenes: LightScene[];
  /** The last physical outcome (an iPad fired the URLs and the LPU-2 answered). */
  confirmed: boolean;
}

/** Seat / console → hub: one change. Either a scene step or one group. */
export interface LightSetRequest {
  /** A scene key, "off", or a step: "next" (the panel button, cycles the
   *  scenes), "brighter" / "darker" (the scenes in brightness order). */
  scene?: string;
  group?: { id: LightGroup; on?: boolean; intensity?: number; bias?: number };
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
  return {
    on: typeof v?.on === "boolean" ? v.on : base.on,
    intensity: Math.round(clamp(v?.intensity, 0, 100, base.intensity)),
    bias: Math.round(clamp(v?.bias, -100, 100, base.bias)),
  };
}

/** A scene's mean brightness — orders "brighter" / "darker". */
export function sceneBrightness(s: LightScene): number {
  return LIGHT_GROUPS.reduce((sum, g) => sum + (s.groups[g].on ? s.groups[g].intensity : 0), 0) / LIGHT_GROUPS.length;
}

export function sameLevels(a: Record<LightGroup, GroupLevel>, b: Record<LightGroup, GroupLevel>): boolean {
  return LIGHT_GROUPS.every((g) => a[g].on === b[g].on && (!a[g].on || (a[g].intensity === b[g].intensity && a[g].bias === b[g].bias)));
}
