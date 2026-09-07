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
  const [setupOpen, setSetupOpen] = useState(false);
  /** Testing aid (reached via the hidden setup): text chat with CoSiMo. */
  const [testChat, setTestChat] = useState(false);

  useEffect(() => {
    void getServerUrl().then(setUrl);
    void getPanelLayout().then(setLayout);
    void getSeatNumber().then(setSeat);
    void getShowcase().then(setShowcaseState);
  }, []);

  const save = useCallback((url: string, nextLayout: PanelLayout, nextSeat: number, nextShowcase: boolean) => {
    void Promise.all([setServerUrl(url), setPanelLayout(nextLayout), setSeatNumber(nextSeat), setShowcase(nextShowcase)]).then(() => {
      setUrl(url);
      setLayout(nextLayout);
      setSeat(nextSeat);
      setShowcaseState(nextShowcase);
      setSetupOpen(false);
    });
  }, []);

  if (serverUrl === undefined) return null;
  // First launch: no server known yet — the setup stands alone.
  if (serverUrl === null) {
    return <ServerSetup current={null} layout={layout} seat={seat} showcase={showcase} onSave={save} />;
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
