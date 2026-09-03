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
  const [setupOpen, setSetupOpen] = useState(false);
  /** Testing aid (reached via the hidden setup): text chat with CoSiMo. */
  const [testChat, setTestChat] = useState(false);

  useEffect(() => {
    void getServerUrl().then(setUrl);
    void getPanelLayout().then(setLayout);
    void getSeatNumber().then(setSeat);
  }, []);

  const save = useCallback((url: string, nextLayout: PanelLayout, nextSeat: number) => {
    void Promise.all([setServerUrl(url), setPanelLayout(nextLayout), setSeatNumber(nextSeat)]).then(() => {
      setUrl(url);
      setLayout(nextLayout);
      setSeat(nextSeat);
      setSetupOpen(false);
    });
  }, []);

  if (serverUrl === undefined) return null;
  if (serverUrl === null || setupOpen) {
    return (
      <ServerSetup
        current={serverUrl}
        layout={layout}
        seat={seat}
        onSave={save}
        onCancel={serverUrl !== null ? () => setSetupOpen(false) : undefined}
        onOpenTestChat={
          serverUrl !== null
            ? () => {
                setTestChat(true);
                setSetupOpen(false);
              }
            : undefined
        }
      />
    );
  }

  return (
    <CosimoKiosk
      key={serverUrl}
      serverUrl={serverUrl}
      layout={layout}
      seatNumber={seat}
      onOpenSetup={() => setSetupOpen(true)}
      testChat={testChat}
      onCloseTestChat={() => setTestChat(false)}
    />
  );
}
