/**
 * Phase 0 landing placeholder. The real iPad kiosk experience (Face engine,
 * conversation, cabin controls, telemetry) is built in later phases; this just
 * confirms the PWA shell is alive and links to the admin/research dashboard.
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", margin: 0 }}>CoSiMo</h1>
      <p style={{ maxWidth: "32rem", opacity: 0.7, margin: 0 }}>
        Agentic AI for inclusive mobility — InnoTrans 2026 showcase. The iPad
        kiosk experience is under construction (Phase 0 shell).
      </p>
      <a href="/admin" style={{ color: "inherit" }}>
        Open admin / research dashboard →
      </a>
    </main>
  );
}
