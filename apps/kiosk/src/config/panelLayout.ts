import { Preferences } from "@capacitor/preferences";
import { DEFAULT_PANEL_LAYOUT, type PanelLayout } from "@cosimo/seat-ui";

/**
 * Per-device persistence of the panel-cutout geometry. The layout itself
 * (type + defaults) lives in @cosimo/seat-ui so the emulator draws the same
 * cutouts; this file is only the iPad's storage of its calibrated values,
 * edited in the hidden operator screen (3s hold on the slit).
 */
export { DEFAULT_PANEL_LAYOUT, type PanelLayout };

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
