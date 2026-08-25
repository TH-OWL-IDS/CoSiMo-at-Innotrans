import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Brand, Button, Input } from "@cosimo/ui";

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

export default function Lock({ children }: { children: (token: string, relock: () => void) => React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(remembered);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  /** The hub refused the token: forget it and ask again, with a hint. */
  const [refused, setRefused] = useState(false);
  const relock = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // fine
    }
    setRefused(true);
    setUnlocked(false);
  };

  // A wrong attempt shakes off after a moment so the next try starts clean.
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(false), 1200);
    return () => clearTimeout(t);
  }, [wrong]);

  if (unlocked) return <>{children(HASH, relock)}</>;

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
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <form
        onSubmit={submit}
        className="flex w-[min(360px,100%)] flex-col items-center gap-4 rounded-xl border border-line bg-white p-6 shadow-card"
      >
        <h1 className="m-0 text-2xl font-semibold" aria-label="CoSiMo Konsole">
          <Brand size={44} />
        </h1>
        <label className="flex w-full flex-col gap-1.5 text-sm uppercase tracking-caps opacity-55">
          Passwort
          <Input
            type="password"
            size="lg"
            autoFocus
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={wrong}
            className="normal-case tracking-normal opacity-100"
          />
        </label>
        <Button type="submit" variant="primary" size="lg">
          <LockKeyhole size={15} /> Entsperren
        </Button>
        <span role="status" className="min-h-4 text-sm text-accent">
          {wrong ? "Falsches Passwort" : refused ? "Der Hub hat das Passwort abgelehnt — stimmt HOST_TOKEN?" : ""}
        </span>
      </form>
    </main>
  );
}
