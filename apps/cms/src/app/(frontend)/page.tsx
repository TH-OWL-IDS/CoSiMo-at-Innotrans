import { redirect } from "next/navigation";

/**
 * The CMS is a UI for the database and nothing else: the Payload admin
 * (profiles, route, operator config, recorded sessions) plus its REST API.
 * Every live surface is its own app — kiosk (native), console (/host + /seat).
 */
export default function Home() {
  redirect("/admin");
}
