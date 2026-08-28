import type { SchemeId } from "@cosimo/shared";

/**
 * Two-colour app schemes, ported from CoSiMo-mockup. `bg` is the background,
 * `ink` is the foreground used for text and the Face's `currentColor` strokes.
 * Profiles select schemes by id; the id vocabulary is SCHEME_IDS in
 * @cosimo/shared (typed here, validated by the agent's set_presentation).
 */
/** The circle's state colours (the glow at its rim), tuned per scheme so
 *  they read against that background: listening (mic live), thinking
 *  (the orbiting dot), speaking (voice playing), error (mic/turn failed). */
export interface StateColors {
  listening: string;
  thinking: string;
  speaking: string;
  error: string;
}

export interface ColorScheme {
  id: SchemeId;
  label: string;
  bg: string;
  ink: string;
  states: StateColors;
}

export const schemes: ColorScheme[] = [
  { id: "weiss", label: "Weiß", bg: "#ffffff", ink: "#141414", states: { listening: "#22a55b", thinking: "#8a908c", speaking: "#3b7dd8", error: "#d92d20" } },
  { id: "dunkel", label: "Dunkel", bg: "#16181c", ink: "#f3f4f6", states: { listening: "#4ade80", thinking: "#9aa3ad", speaking: "#60a5fa", error: "#f87171" } },
  { id: "blau", label: "Blau", bg: "#eef6fb", ink: "#0d4a6b", states: { listening: "#1f9d6a", thinking: "#6f8fa3", speaking: "#0d7fc2", error: "#c8362b" } },
  { id: "gruen", label: "Grün", bg: "#eef6ef", ink: "#1f5132", states: { listening: "#2f9e44", thinking: "#7d9a85", speaking: "#2a7fb8", error: "#c23b2b" } },
  { id: "gelb", label: "Gelb", bg: "#fff7e9", ink: "#7a4a00", states: { listening: "#2e9e5a", thinking: "#a58a5c", speaking: "#c77a00", error: "#d13a1e" } },
  { id: "rosa", label: "Rosa", bg: "#fdeff5", ink: "#7c1d49", states: { listening: "#2a9a63", thinking: "#a07a8c", speaking: "#b0407a", error: "#d1274f" } },
  { id: "grau", label: "Grau", bg: "#eef0f3", ink: "#28323d", states: { listening: "#2e9d5c", thinking: "#8592a0", speaking: "#3b78c9", error: "#d0342c" } },
];

export const defaultSchemeId = schemes[0]!.id;

export function schemeById(id: string): ColorScheme {
  return schemes.find((s) => s.id === id) ?? schemes[0]!;
}

/** `#rrggbb` → `rgba(r, g, b, a)` — for gradients built from a scheme colour. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
