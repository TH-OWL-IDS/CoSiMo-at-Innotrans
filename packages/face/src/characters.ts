import type { ComponentType } from "react";
import type { CharacterId, Locale } from "@cosimo/shared";
import CosimoFaceAnimated from "./CosimoFaceAnimated.js";
import ScribbleBlob from "./ScribbleBlob.js";
import ScribbleCircle from "./ScribbleCircle.js";
import ScribbleLine from "./ScribbleLine.js";
import type { ScribbleEntityProps } from "./shared.js";
import type { MouthDrive } from "./voice.js";

/**
 * The switchable "Gestalt" of CoSiMo: the face and three abstract scribble
 * creatures that speak the same eight emotions, each with its own rig
 * (emotion poses, idle physics, voice coupling). A rider picks one in the
 * slit menu or by voice (set_presentation gestalt=<id>); it is part of the
 * profile like the colour scheme.
 */
export type CharacterProps = ScribbleEntityProps & {
  mouthDrive?: MouthDrive;
  /** Only the face follows a finger; the others accept and ignore it. */
  gazeDrive?: () => { x: number; y: number } | null;
};

export interface Character {
  id: CharacterId;
  label: Record<Locale, string>;
  Component: ComponentType<CharacterProps>;
}

export const CHARACTERS: Character[] = [
  { id: "face", label: { de: "Gesicht", en: "Face" }, Component: CosimoFaceAnimated as ComponentType<CharacterProps> },
  { id: "blob", label: { de: "Knäuel", en: "Tangle" }, Component: ScribbleBlob },
  { id: "circle", label: { de: "Kreis", en: "Ring" }, Component: ScribbleCircle },
  { id: "line", label: { de: "Linie", en: "Line" }, Component: ScribbleLine },
];

export function characterById(id: string | undefined): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}
