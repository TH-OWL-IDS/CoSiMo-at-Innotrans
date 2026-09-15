import { useCallback, useEffect, useState } from "react";
import CosimoKiosk from "./components/CosimoKiosk";
import ServerSetup from "./components/ServerSetup";
import { getServerUrl, setServerUrl } from "./config/serverUrl";
import {
  DEFAULT_PANEL_LAYOUT,
  getPanelLayout,
  setPanelLayout,
  type PanelLayout,
} from "./config/panelLayout";
import { getSeatNumber, setSeatNumber } from "./config/seatNumber";
import { getShowcase, setShowcase } from "./config/showcase";
import { DEFAULT_SLIT_MOTION, getSlitMotion, setSlitMotion, type SlitMotion } from "./config/slitMotion";

/**
 * App shell: resolves the server URL (stored override → baked default →
 * same-origin on web) and the panel-cutout geometry, gates on the setup
 * screen when no server is known. The operator reaches the setup at runtime
 * with a 3-second hold on the telemetry slit.
 */
export default function App() {
  // undefined = still loading from Preferences; null = unknown, must ask.
  const [serverUrl, setUrl] = useState<string | null | undefined>(undefined);
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_PANEL_LAYOUT);
  /** Physical seat position 1-4 (0 = not configured) — reading-lamp mapping. */
  const [seat, setSeat] = useState(0);
  /** Showcase: the silent endless performance (operator setting). */
  const [showcase, setShowcaseState] = useState(false);
  /** Timing of the slit's rest rotation (operator setting). */
  const [slitMotion, setSlitMotionState] = useState<SlitMotion>(DEFAULT_SLIT_MOTION);
  const [setupOpen, setSetupOpen] = useState(false);
  /** Testing aid (reached via the hidden setup): text chat with CoSiMo. */
  const [testChat, setTestChat] = useState(false);

  useEffect(() => {
    void getServerUrl().then(setUrl);
    void getPanelLayout().then(setLayout);
    void getSeatNumber().then(setSeat);
    void getShowcase().then(setShowcaseState);
    void getSlitMotion().then(setSlitMotionState);
  }, []);

  const save = useCallback((url: string, nextLayout: PanelLayout, nextSeat: number, nextShowcase: boolean, nextMotion: SlitMotion) => {
    void Promise.all([setServerUrl(url), setPanelLayout(nextLayout), setSeatNumber(nextSeat), setShowcase(nextShowcase), setSlitMotion(nextMotion)]).then(() => {
      setUrl(url);
      setLayout(nextLayout);
      setSeat(nextSeat);
      setShowcaseState(nextShowcase);
      setSlitMotionState(nextMotion);
      setSetupOpen(false);
    });
  }, []);

  if (serverUrl === undefined) return null;
  // First launch: no server known yet — the setup stands alone.
  if (serverUrl === null) {
    return <ServerSetup current={null} layout={layout} seat={seat} showcase={showcase} slitMotion={slitMotion} onSave={save} />;
  }

  // Afterwards the setup is an overlay on the running kiosk, so the seat's
  // socket stays connected — the operator's light buttons need it.
  return (
    <CosimoKiosk
      key={serverUrl}
      serverUrl={serverUrl}
      layout={layout}
      seatNumber={seat}
      showcase={showcase}
      slitMotion={slitMotion}
      onOpenSetup={() => setSetupOpen(true)}
      setup={
        setupOpen
          ? {
              onSave: save,
              onCancel: () => setSetupOpen(false),
              onOpenTestChat: () => {
                setTestChat(true);
                setSetupOpen(false);
              },
            }
          : null
      }
      testChat={testChat}
      onCloseTestChat={() => setTestChat(false)}
    />
  );
}
