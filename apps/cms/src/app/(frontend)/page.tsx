import { redirect } from "next/navigation";

/**
 * The visitor kiosk is its own native app now (apps/kiosk); this server is
 * the Payload admin (login → edit personas, mockup data, operator config).
 * The operator console still lives at /host.
 */
export default function Home() {
  redirect("/admin");
}
