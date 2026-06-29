/**
 * Two-colour app schemes, ported from CoSiMo-mockup. `bg` is the background,
 * `ink` is the foreground used for text and the Face's `currentColor` strokes.
 * Phase 3 maps personas to these for high-contrast / themed presentation.
 */
export interface ColorScheme {
  id: string;
  label: string;
  bg: string;
  ink: string;
}

export const schemes: ColorScheme[] = [
  { id: "classic", label: "Klassisch", bg: "#ffffff", ink: "#141414" },
  { id: "night", label: "Nacht", bg: "#16181c", ink: "#f3f4f6" },
  { id: "ocean", label: "Ozean", bg: "#eef6fb", ink: "#0d4a6b" },
  { id: "forest", label: "Wald", bg: "#eef6ef", ink: "#1f5132" },
  { id: "sun", label: "Sonne", bg: "#fff7e9", ink: "#7a4a00" },
  { id: "berry", label: "Beere", bg: "#fdeff5", ink: "#7c1d49" },
  { id: "slate", label: "Schiefer", bg: "#eef0f3", ink: "#28323d" },
];

export const defaultSchemeId = schemes[0]!.id;

export function schemeById(id: string): ColorScheme {
  return schemes.find((s) => s.id === id) ?? schemes[0]!;
}
