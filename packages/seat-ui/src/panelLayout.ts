/**
 * Physical panel geometry. The iPad sits behind a panel with two cutouts —
 * a circle (the Face) and a slit (telemetry) — so only those regions of the
 * screen are visible. Values are percentages of the stage so they survive
 * device/scale changes. The *type and defaults* live here so every renderer
 * of a seat (native app, browser emulator) draws the same cutouts; how a
 * layout is persisted (Capacitor Preferences on the iPad) stays in the app.
 */
export interface PanelLayout {
  /** Circle centre, % of stage width/height. */
  circleX: number;
  circleY: number;
  /** Circle diameter, % of stage width. */
  circleD: number;
  /** Slit centre x, % of stage width. */
  slitX: number;
  /** Slit centre y, % of stage height. */
  slitY: number;
  /** Slit size, % of stage width/height. */
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

/** The iPad mini's portrait aspect ratio — the framed stage in a browser. */
export const IPAD_MINI_ASPECT = "744 / 1133";
