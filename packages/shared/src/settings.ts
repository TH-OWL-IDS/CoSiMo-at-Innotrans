import type { Accommodations } from "./persona.js";
import type { Locale } from "./telemetry.js";

/**
 * The rider's settings menu IN THE SLIT. CoSiMo opens it (the `open_settings`
 * tool, optionally on one section); the rider taps through it alone — no
 * per-setting cards, no step-by-step wizard. Every tap patches the seat's
 * accommodations at once (`settings:patch`), CoSiMo confirms aloud in the
 * new setting, and the menu closes itself after 30 s without a tap, on the
 * next spoken turn, or via its back button.
 *
 *   Textgröße   → slider, three stops
 *   Lautstärke  → slider
 *   Stimme      → Tempo (slider) · Typ (the catalog, in the rider's language)
 *                 · Stimmung (neutral · warm · ruhig · lebhaft)
 *   Farbe       → the colour schemes
 */
export const SETTINGS_SECTIONS = ["textSize", "volume", "voice", "theme"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** One selectable voice, as the menu needs it (no vendor ids). */
export interface SettingsVoice {
  key: string;
  label: string;
  gender: "female" | "male";
  language: Locale;
}

/** Hub → seat: open the menu (a section, or the top level). */
export interface SeatSettingsOpen {
  sessionId: string;
  section?: SettingsSection;
  voices: SettingsVoice[];
  turn: number;
}

/** Seat → hub: one change from the menu. `speak` = CoSiMo confirms aloud. */
export interface SettingsPatch {
  sessionId: string;
  patch: Partial<Accommodations>;
  speak: boolean;
}

/** How long the menu stays without a tap. */
export const SETTINGS_IDLE_MS = 30_000;
