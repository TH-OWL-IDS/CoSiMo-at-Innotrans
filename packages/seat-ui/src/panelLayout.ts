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

/**
 * Defaults measured against the real panel (2026-08-31): iPad mini (A17 Pro)
 * active screen 115.9 x 176.6 mm portrait (2266x1488 @ 326 ppi); cutouts
 * circle Ø 110 mm, slit 24 x 110 mm. Percentages = mm / screen mm. The Y
 * positions assume the cutout group sits vertically centred with equal
 * spacing (14 mm top / gap / bottom) — calibrate per device with `guides`,
 * the horizontal margin is only ~3 mm per side.
 */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  circleX: 50,
  circleY: 39.2,
  circleD: 94.9,
  slitX: 50,
  slitY: 85.2,
  slitW: 94.9,
  slitH: 13.6,
  slitR: 999,
  guides: false,
};

/** The iPad mini's portrait aspect ratio — the framed stage in a browser. */
export const IPAD_MINI_ASPECT = "744 / 1133";
