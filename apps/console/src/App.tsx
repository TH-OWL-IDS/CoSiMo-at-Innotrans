import HostConsole from "./HostConsole";
import Seat from "./Seat";

/**
 * The staff console — two tools behind one static bundle:
 *   /host  the live operator console (what booth staff have open)
 *   /seat  the seat emulator (a browser iPad, for development)
 * Plain path routing; nginx serves index.html for every path.
 */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/host") return <HostConsole />;
  if (path === "/seat") return <Seat />;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--panel)",
        color: "var(--panel-ink)",
        fontSize: 15,
      }}
    >
      <div style={{ display: "grid", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--panel-mute)" }}>COSIMO</div>
        <a href="/host" className="em-btn primary" style={{ minWidth: 240, textDecoration: "none" }}>
          Host console
        </a>
        <a href="/seat" className="em-btn" style={{ textAlign: "center", textDecoration: "none" }}>
          Seat emulator
        </a>
      </div>
    </main>
  );
}
