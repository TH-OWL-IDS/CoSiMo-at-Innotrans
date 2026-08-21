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
  const [setupOpen, setSetupOpen] = useState(false);
  /** Testing aid (reached via the hidden setup): text chat with CoSiMo. */
  const [testChat, setTestChat] = useState(false);

  useEffect(() => {
    void getServerUrl().then(setUrl);
    void getPanelLayout().then(setLayout);
  }, []);

  const save = useCallback((url: string, nextLayout: PanelLayout) => {
    void Promise.all([setServerUrl(url), setPanelLayout(nextLayout)]).then(() => {
      setUrl(url);
      setLayout(nextLayout);
      setSetupOpen(false);
    });
  }, []);

  if (serverUrl === undefined) return null;
  if (serverUrl === null || setupOpen) {
    return (
      <ServerSetup
        current={serverUrl}
        layout={layout}
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
      onOpenSetup={() => setSetupOpen(true)}
      testChat={testChat}
      onCloseTestChat={() => setTestChat(false)}
    />
  );
}
