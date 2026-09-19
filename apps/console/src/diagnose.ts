import type { LogEvent } from "@cosimo/shared";
import type { CosimoState } from "@cosimo/client";

/**
 * The live diagnosis behind the Hilfe view's Fehlersuche: reads the same
 * socket state the Übersicht cards show and names what is wrong right now,
 * so a symptom in the list can say "trifft gerade zu" and the top of the
 * page can list the current findings. Pure and cheap — it runs on every
 * render of the page. Nothing here talks to the hub.
 */

export type FindingId =
  | "hub-down"
  | "no-kiosks"
  | "device-lost"
  | "device-stale"
  | "device-polling"
  | "network-down"
  | "llm-down"
  | "llm-fallback"
  | "offline-canned"
  | "cms-down"
  | "config-defaults"
  | "no-server-stt"
  | "no-server-tts"
  | "lpu2-unconfigured"
  | "lpu2-unmapped"
  | "light-unconfirmed"
  | "light-free"
  | "sim-paused"
  | "fault-active"
  | "service-down"
  | "turn-errors";

export interface Finding {
  id: FindingId;
  /** down = the demo is impaired now; warn = degraded or worth a look. */
  severity: "down" | "warn";
  title: string;
  detail: string;
}

export function diagnose(c: CosimoState): Finding[] {
  const out: Finding[] = [];
  const st = c.status;
  const cfg = c.hostConfig;

  if (!c.connected || !st) {
    out.push({ id: "hub-down", severity: "down", title: "Keine Verbindung zum Hub", detail: "Die Konsole bekommt keinen Status. Ohne Hub läuft kein Sitz." });
    return out;
  }

  const live = c.devices.filter((d) => d.health !== "lost");
  const kiosks = live.filter((d) => d.role === "kiosk");
  if (kiosks.length === 0) {
    out.push({ id: "no-kiosks", severity: "down", title: "Kein Sitz verbunden", detail: "Weder ein iPad noch ein Emulator hängt am Hub." });
  }
  const lost = c.devices.filter((d) => d.role === "kiosk" && d.health === "lost");
  if (lost.length) {
    out.push({ id: "device-lost", severity: "warn", title: `Verbindung verloren: ${lost.map((d) => d.deviceId).join(", ")}`, detail: "Ein Sitz ist gerade abgerissen; er bleibt 30 s in der Liste und 10 min geparkt." });
  }
  const stale = live.filter((d) => d.health === "stale");
  if (stale.length) {
    out.push({ id: "device-stale", severity: "warn", title: `Antwortet nicht: ${stale.map((d) => d.deviceId).join(", ")}`, detail: "Socket offen, aber zwei Pings ohne Antwort — eingefrorener Tab oder alte App-Version." });
  }
  const polling = live.filter((d) => d.transport === "polling");
  if (polling.length) {
    out.push({ id: "device-polling", severity: "warn", title: `Nur Polling: ${polling.map((d) => d.deviceId).join(", ")}`, detail: "Der WebSocket kam nicht zustande; es geht, aber träge." });
  }

  if (!st.network) {
    out.push({ id: "network-down", severity: "down", title: "Kein Internet am Hub", detail: "Der Verbindungs-Check schlägt fehl. Sprache und Gehirn sind weg, CoSiMo antwortet vorgefertigt." });
  }
  const lastSvc = [...c.logs].reverse().find((e): e is Extract<LogEvent, { kind: "service.status" }> => e.kind === "service.status" && "llmFallbackActive" in e.data);
  const fallbackActive = Boolean(lastSvc && lastSvc.data.llmFallbackActive);
  if (!st.llm) {
    out.push({ id: "llm-down", severity: "down", title: "Gehirn nicht erreichbar", detail: cfg?.llm.fallback ? "Weder das primäre Modell noch der Fallback antworten — alle Antworten sind vorgefertigt." : "Das Modell antwortet nicht und es ist kein Fallback konfiguriert — alle Antworten sind vorgefertigt." });
  } else if (fallbackActive) {
    out.push({ id: "llm-fallback", severity: "warn", title: "Fallback-Modell aktiv", detail: `Das primäre Modell ist weg, ${cfg?.llm.fallback ? `${cfg.llm.fallback.provider} · ${cfg.llm.fallback.model}` : "der Fallback"} antwortet stattdessen.` });
  }
  if (st.offlineCanned) {
    out.push({ id: "offline-canned", severity: "warn", title: "Demo- / Offline-Modus ist an", detail: "CoSiMo antwortet vorgefertigt — gewollt oder vergessen?" });
  }

  if (!st.cms) {
    out.push({ id: "cms-down", severity: "warn", title: "CMS nicht erreichbar", detail: "Profile, Route und Konfiguration kommen aus dem Cache oder den Defaults; Sessions werden nicht gespeichert." });
  }
  if (cfg && cfg.source !== "cms") {
    out.push({ id: "config-defaults", severity: "warn", title: "Konfiguration aus den env-Defaults", detail: "Der Hub hat die CMS-Konfiguration noch nie geladen — Routen, Stimmen und Szenen sind die eingebauten." });
  }
  if (!st.serverStt) {
    out.push({ id: "no-server-stt", severity: "warn", title: "Kein Server-STT", detail: "Die iPads diktieren lokal (Apple-Diktat). Funktioniert, aber ohne Deepgram-Qualität." });
  }
  if (!st.serverTts) {
    out.push({ id: "no-server-tts", severity: "warn", title: "Kein Server-TTS", detail: "Die iPads sprechen mit der Systemstimme — nicht CoSiMos Stimme." });
  }

  if (cfg && !cfg.cabin.lpu2BaseUrl) {
    out.push({ id: "lpu2-unconfigured", severity: "warn", title: "Keine LPU-2-Adresse", detail: "Das Licht ist rein simuliert: weder das CMS (cabin-config) noch die env nennen die Adresse des Controllers." });
  } else if (cfg && cfg.cabin.mapped === 0) {
    out.push({ id: "lpu2-unmapped", severity: "warn", title: "Keine Playbacks gemappt", detail: "Adresse bekannt, aber im CMS ist keinem Licht ein Playback zugeordnet." });
  } else if (cfg && kiosks.length > 0 && !st.light) {
    out.push({ id: "light-unconfirmed", severity: "warn", title: "Licht nicht bestätigt", detail: "Der letzte echte Schaltversuch wurde von keinem iPad als ok gemeldet — oder es gab noch keinen." });
  }
  if (c.light && c.light.scene === null) {
    out.push({ id: "light-free", severity: "warn", title: "Lichtszene „frei“", detail: "Jemand hat eine Leuchte von Hand bewegt; keine Szene ist aktiv, bis eine gewählt oder gespeichert wird." });
  }

  const t = c.telemetry;
  if (t?.simPaused) {
    out.push({ id: "sim-paused", severity: "warn", title: "Fahrt pausiert", detail: "Die Simulation steht — Tempo 0, keine ETAs." });
  }
  const fault = t?.faults?.[0];
  if (fault) {
    out.push({ id: "fault-active", severity: "warn", title: `Störung aktiv: ${fault.cause.de}`, detail: `Endet in ${fault.remainingSec} s oder über „Störung beenden“.` });
  }

  const down = c.services.filter((s) => s.status === "down");
  if (down.length) {
    out.push({ id: "service-down", severity: down.some((s) => s.id === "realtime" || s.id === "cms") ? "down" : "warn", title: `Service nicht erreichbar: ${down.map((s) => s.label).join(", ")}`, detail: "Der Hub erreicht den Container intern nicht." });
  }

  const recentErrors = c.logs.filter((e) => e.level === "error" && Date.now() - new Date(e.ts).getTime() < 10 * 60_000);
  if (recentErrors.length) {
    out.push({ id: "turn-errors", severity: "warn", title: `${recentErrors.length} Fehler in den letzten 10 Minuten`, detail: "Turns, die mit einem Fehler endeten — die Logs nennen den Grund." });
  }

  return out;
}

/** True when a symptom's finding is in the list. */
export const has = (findings: Finding[], ...ids: FindingId[]) => findings.some((f) => ids.includes(f.id));
