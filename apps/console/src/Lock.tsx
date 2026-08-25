import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import logoUrl from "./assets/monocab-logo.svg";

/**
 * The page lock — a password gate in front of the console so a visitor who
 * finds the URL doesn't get the operator controls. The password is compared
 * as a SHA-256 hash (no plaintext in the bundle) and the unlock is kept in
 * localStorage, so staff type it once per device, not once per reload.
 *
 * This guards the page only: the hub still accepts any `role: "host"`
 * socket. The real fix remains a host token checked on `hello`.
 */
const HASH = "3bb21893fb23828e7ae7a66a38d67ae119525d12867310adfcb622d2742bb540";
const KEY = "cosimo.console.unlocked";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) === HASH;
  } catch {
    return false;
  }
}

export default function Lock({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(remembered);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  // A wrong attempt shakes off after a moment so the next try starts clean.
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(false), 1200);
    return () => clearTimeout(t);
  }, [wrong]);

  if (unlocked) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((await sha256(value.trim())) === HASH) {
      try {
        localStorage.setItem(KEY, HASH);
      } catch {
        // private mode — the session still unlocks
      }
      setUnlocked(true);
    } else {
      setWrong(true);
      setValue("");
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#fff" }}>
      <form
        onSubmit={submit}
        style={{
          width: "min(360px, 100%)",
          border: "1px solid #e4e4e4",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 1px 2px rgba(24,24,23,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoUrl} alt="MonoCab" width={40} height={40} style={{ display: "block" }} />
          <h1 style={{ fontSize: 18, margin: 0, fontWeight: 600, letterSpacing: 0.5 }}>Konsole</h1>
        </div>
        <label style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55 }}>
          Passwort
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={wrong}
            style={{
              font: "inherit",
              fontSize: 16,
              textTransform: "none",
              letterSpacing: 0,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${wrong ? "#e40041" : "#d9d9d9"}`,
              background: "#fff",
              color: "#181817",
              outline: "none",
            }}
          />
        </label>
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #181817",
            background: "#181817",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <LockKeyhole size={15} /> Entsperren
        </button>
        <span role="status" style={{ fontSize: 12, color: "#e40041", minHeight: 16 }}>
          {wrong ? "Falsches Passwort" : ""}
        </span>
      </form>
    </main>
  );
}
