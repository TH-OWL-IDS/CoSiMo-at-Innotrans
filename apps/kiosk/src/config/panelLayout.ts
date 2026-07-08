import { Preferences } from "@capacitor/preferences";

/**
 * Physical panel geometry. The iPad sits behind a panel with two cutouts —
 * a circle (the Face) and a slit (telemetry) — so only those regions of the
 * screen are visible. Values are percentages of the viewport so they survive
 * device/scale changes; they are calibrated per device via the hidden
 * operator screen (3s hold on the slit) and persisted on the iPad.
 */
export interface PanelLayout {
  /** Circle centre, % of viewport width/height. */
  circleX: number;
  circleY: number;
  /** Circle diameter, % of viewport width. */
  circleD: number;
  /** Slit centre x, % of viewport width. */
  slitX: number;
  /** Slit centre y, % of viewport height. */
  slitY: number;
  /** Slit size, % of viewport width/height. */
  slitW: number;
  slitH: number;
  /** Slit corner radius in px (999 = fully rounded pill). */
  slitR: number;
  /** Draw cutout outlines for aligning the panel (operator aid). */
  guides: boolean;
}

/** Rough defaults for a portrait iPad mini behind the MonoCab panel. */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  circleX: 50,
  circleY: 36,
  circleD: 82,
  slitX: 50,
  slitY: 78,
  slitW: 78,
  slitH: 5,
  slitR: 999,
  guides: false,
};

const KEY = "cosimo.panelLayout";

export async function getPanelLayout(): Promise<PanelLayout> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return DEFAULT_PANEL_LAYOUT;
    return { ...DEFAULT_PANEL_LAYOUT, ...(JSON.parse(value) as Partial<PanelLayout>) };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export async function setPanelLayout(layout: PanelLayout): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(layout) });
}
