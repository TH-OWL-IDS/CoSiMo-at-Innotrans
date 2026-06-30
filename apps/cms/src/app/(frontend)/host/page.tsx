import HostConsole from "../../../components/HostConsole";

/**
 * Hidden operator console (/host) — the live control surface for the demo.
 * Config (personas, telemetry scenarios, recorded sessions) lives in /admin.
 */
export default function HostPage() {
  return <HostConsole />;
}
