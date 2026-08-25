import HostConsole from "./HostConsole";
import Lock from "./Lock";

/**
 * The live operator console — what booth staff have open during the show,
 * behind the page lock. The lock's hash is also the hub token: the hub
 * checks it on hello and refuses host:* commands without it; a refusal
 * locks the page again.
 */
export default function App() {
  return (
    <Lock>
      {(token, relock) => <HostConsole token={token} onUnauthorized={relock} />}
    </Lock>
  );
}
