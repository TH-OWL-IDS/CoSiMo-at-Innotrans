import HostConsole from "./HostConsole";
import Lock from "./Lock";

/** The live operator console — what booth staff have open during the show, behind the page lock. */
export default function App() {
  return (
    <Lock>
      <HostConsole />
    </Lock>
  );
}
