import { useEffect, useRef, useState } from "react";
import { ALargeSmall, AudioLines, Check, ChevronLeft, Gauge, Lightbulb, Palette, Shapes, Sparkles, UserRound, Volume2, X } from "lucide-react";
import {
  SETTINGS_DEFAULTS,
  SETTINGS_IDLE_MS,
  TEXT_SIZES,
  VOICE_TONES,
  normalizeTextSize,
  type Accommodations,
  type CabinLightState,
  type LightSetRequest,
  type Locale,
  type SeatSettingsOpen,
  type SettingsSection,
  type VoiceTone,
  DEFAULT_VOICE_GENDER,
} from "@cosimo/shared";
import { CHARACTERS, schemes as SCHEMES, type ColorScheme } from "@cosimo/face";
import { Chip, SlitGrid, TAP } from "./SlitCard.js";

/**
 * The rider's settings menu in the slit. CoSiMo opens it (`open_settings`),
 * the rider taps through it alone:
 *
 *   root      ○ Textgröße  ○ Lautstärke  ○ Stimme  ○ Farbe   (icons only)
 *   Stimme    ○ Tempo  ○ Typ  ○ Stimmung
 *   leaves    a slider / the voices / the tones / the colour swatches
 *
 * No words: icons and controls only (labels stay as aria-labels). On the
 * right, always one round button: after a change the ✓ (keep it, go up one level),
 * otherwise ‹ back — from the root it closes the menu. A LONG press on
 * that button (800 ms, a ring fills) resets: a leaf resets its one
 * setting, the voice menu its three, the root everything. Every change is
 * applied at once (`settings:patch`) and CoSiMo confirms it aloud in the
 * new setting. 30 s without a tap closes the menu; so does the next
 * spoken turn (the socket hook clears it).
 */

const HOLD_MS = 800;

/** What a long press restores at each level. */
function defaultsFor(path: Path): Partial<Accommodations> {
  const d = SETTINGS_DEFAULTS;
  switch (path) {
    case "textSize": return { textSize: d.textSize };
    case "volume": return { volume: d.volume };
    case "voice.tempo": return { speechRate: d.speechRate };
    case "voice.type": return { voice: d.voice, voiceGender: d.voiceGender };
    case "voice.tone": return { voiceTone: d.voiceTone };
    case "voice": return { speechRate: d.speechRate, voice: d.voice, voiceGender: d.voiceGender, voiceTone: d.voiceTone };
    case "theme": return { theme: d.theme };
    case "character": return { character: d.character };
    case "root": return { ...d };
    default: return {}; // the light paths reset through the scene (see `reset`)
  }
}

/**
 * The round button on the right: a tap does `onTap`, holding it fills a
 * ring around the rim and fires `onHold` once (the following click is
 * swallowed). Pointer events only, so a touch and a mouse behave alike.
 */
function HoldButton({ label, ink, bg, filled, onTap, onHold, children }: {
  label: string; ink: string; bg: string; filled: boolean; onTap: () => void; onHold: () => void; children: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    setHolding(true);
    timer.current = setTimeout(() => { fired.current = true; setHolding(false); onHold(); }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // the ring: a circle whose dash draws itself over HOLD_MS while holding
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => { if (fired.current) { fired.current = false; return; } onTap(); }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      title={label}
      style={{
        appearance: "none", position: "relative", width: TAP, height: TAP, borderRadius: "50%", flexShrink: 0,
        border: `max(1.5px, 2cqh) solid ${ink}`, background: filled ? ink : "transparent", color: filled ? bg : ink,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", touchAction: "manipulation", transition: "background 120ms, color 120ms, transform 120ms",
        transform: holding ? "scale(0.94)" : "none",
        WebkitTouchCallout: "none", userSelect: "none",
      }}
    >
      <svg aria-hidden viewBox="0 0 100 100" style={{ position: "absolute", inset: "-14%", width: "128%", height: "128%", pointerEvents: "none", transform: "rotate(-90deg)" }}>
        <circle
          cx="50" cy="50" r={R} fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={holding ? 0 : C}
          style={{ transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : "stroke-dashoffset 120ms ease", opacity: 0.9 }}
        />
      </svg>
      {children}
    </button>
  );
}

type Path = "root" | "textSize" | "volume" | "voice" | "voice.tempo" | "voice.type" | "voice.tone" | "theme" | "character" | "light";

const ROOT: { path: Path; icon: typeof ALargeSmall; de: string; en: string }[] = [
  { path: "textSize", icon: ALargeSmall, de: "Textgröße", en: "Text size" },
  { path: "volume", icon: Volume2, de: "Lautstärke", en: "Volume" },
  { path: "voice", icon: AudioLines, de: "Stimme", en: "Voice" },
  { path: "theme", icon: Palette, de: "Farbe", en: "Colour" },
  { path: "character", icon: Shapes, de: "Gestalt", en: "Shape" },
  { path: "light", icon: Lightbulb, de: "Licht", en: "Light" },
];
const VOICE: { path: Path; icon: typeof ALargeSmall; de: string; en: string }[] = [
  { path: "voice.tempo", icon: Gauge, de: "Tempo", en: "Tempo" },
  { path: "voice.type", icon: UserRound, de: "Typ", en: "Type" },
  { path: "voice.tone", icon: Sparkles, de: "Stimmung", en: "Mood" },
];
const TONE_LABEL: Record<VoiceTone, [string, string]> = {
  neutral: ["Neutral", "Neutral"], warm: ["Warm", "Warm"], ruhig: ["Ruhig", "Calm"], lebhaft: ["Lebhaft", "Lively"],
};

function titleOf(path: Path, lang: Locale): string {
  const de = lang === "de";
  if (path === "root") return de ? "Einstellungen" : "Settings";
  const item = [...ROOT, ...VOICE].find((i) => i.path === path);
  return item ? (de ? item.de : item.en) : "";
}
function parentOf(path: Path): Path | null {
  if (path === "root") return null;
  return path.startsWith("voice.") ? "voice" : "root";
}
function sectionPath(section?: SettingsSection): Path {
  return section ?? "root";
}

function Slider({ min, max, step, value, label, ink, onCommit, ends }: {
  min: number; max: number; step: number; value: number; label: string; ink: string;
  onCommit: (v: number) => void;
  /** Optional glyphs at both ends (the text size's small and large A). */
  ends?: [React.ReactNode, React.ReactNode];
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3cqh", flexShrink: 0 }}>
      {ends?.[0]}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        aria-label={label}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => onCommit(v)}
        onKeyUp={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") onCommit(v); }}
        style={{
          // a bare line with a knob — styled through accent-color + a track gradient
          width: "clamp(140px, 240cqh, 640px)",
          height: TAP,
          accentColor: ink,
          background: `linear-gradient(to right, ${ink} ${pct}%, transparent ${pct}%) no-repeat center / 100% 2px`,
          appearance: "auto",
          touchAction: "none",
          cursor: "pointer",
        }}
      />
      {ends?.[1]}
    </span>
  );
}

export function SlitSettings({ open, acc, scheme, textScale, lang, onPatch, onClose, light, onLight }: {
  open: SeatSettingsOpen;
  /** The seat's live accommodations (the current values). */
  acc: Accommodations | undefined;
  scheme: ColorScheme;
  textScale: number;
  lang: Locale;
  onPatch: (patch: Partial<Accommodations>, speak: boolean, reset?: boolean) => void;
  onClose: () => void;
  /** THE cabin light (scene + groups + the scene list), hub-held. */
  light: CabinLightState | null;
  /** A scene or one group — the same request the panel button and the console send. */
  onLight: (req: LightSetRequest) => void;
}) {
  const ink = scheme.ink;
  const de = lang === "de";
  const [path, setPath] = useState<Path>(() => sectionPath(open.section));
  const [dirty, setDirty] = useState(false);
  // a fresh open (new sessionId/turn) lands on its section again
  useEffect(() => { setPath(sectionPath(open.section)); setDirty(false); }, [open.sessionId, open.turn, open.section]);

  // idle: SETTINGS_IDLE_MS without a tap closes the menu
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(onClose, SETTINGS_IDLE_MS);
    return () => { if (idle.current) clearTimeout(idle.current); };
  }, [tick, path, onClose]);
  const touch = () => setTick((t) => t + 1);

  const go = (p: Path) => { touch(); setPath(p); setDirty(false); };
  const change = (patch: Partial<Accommodations>) => { touch(); setDirty(true); onPatch(patch, true); };
  const up = () => {
    const parent = parentOf(path);
    if (parent) go(parent); else onClose();
  };

  const RightIcon = dirty ? Check : path === "root" ? X : ChevronLeft;
  const rightLabel = (dirty ? (de ? "Übernehmen" : "Keep") : path === "root" ? (de ? "Schließen" : "Close") : (de ? "Zurück" : "Back")) + (de ? " · lange drücken: zurücksetzen" : " · hold: reset");
  const reset = () => {
    touch();
    setDirty(true);
    if (path === "light") {
      // the light's default is scene 1
      const first = light?.scenes[0];
      if (first) onLight({ scene: first.key });
      return;
    }
    onPatch(defaultsFor(path), true, true);
  };
  const lightChange = (req: LightSetRequest) => { touch(); setDirty(true); onLight(req); };
  const aside = (
    <HoldButton
      label={rightLabel}
      ink={ink}
      bg={scheme.bg}
      filled={dirty}
      onTap={() => { touch(); if (dirty) { setDirty(false); const parent = parentOf(path); if (parent) setPath(parent); else onClose(); } else up(); }}
      onHold={reset}
    >
      <RightIcon size="55%" strokeWidth={2.4} aria-hidden />
    </HoldButton>
  );

  const icons = (items: typeof ROOT) =>
    items.map((it) => {
      const Icon = it.icon;
      return (
        <Chip key={it.path} label={de ? it.de : it.en} ink={ink} textScale={textScale} onTap={() => go(it.path)}>
          <Icon size="1.2em" strokeWidth={2.2} aria-hidden />
        </Chip>
      );
    });

  const textIndex = TEXT_SIZES.indexOf(normalizeTextSize(acc?.textSize));
  const voices = open.voices.filter((v) => v.language === lang);
  const pool = voices.length ? voices : open.voices;

  let body: React.ReactNode;
  switch (path) {
    case "root":
      body = icons(ROOT);
      break;
    case "voice":
      body = icons(VOICE);
      break;
    case "textSize":
      body = (
        <Slider
          min={0} max={TEXT_SIZES.length - 1} step={1} value={textIndex < 0 ? TEXT_SIZES.length - 1 : textIndex}
          label={titleOf(path, lang)} ink={ink}
          onCommit={(v) => change({ textSize: TEXT_SIZES[Math.round(v)] ?? "l" })}
          ends={[
            <span key="s" aria-hidden style={{ fontWeight: 700, fontSize: "clamp(10px, 16cqh, 32px)" }}>A</span>,
            <span key="l" aria-hidden style={{ fontWeight: 700, fontSize: "clamp(14px, 28cqh, 56px)" }}>A</span>,
          ]}
        />
      );
      break;
    case "volume":
      body = <Slider min={0.2} max={1} step={0.05} value={acc?.volume ?? 1} label={titleOf(path, lang)} ink={ink} onCommit={(v) => change({ volume: v })} />;
      break;
    case "voice.tempo":
      body = <Slider min={0.7} max={1.3} step={0.05} value={acc?.speechRate ?? 1} label={titleOf(path, lang)} ink={ink} onCommit={(v) => change({ speechRate: v })} />;
      break;
    case "voice.type":
      body = pool.length
        ? pool.map((v) => (
            <Chip key={v.key} label={v.label} ink={ink} textScale={textScale} active={acc?.voice === v.key} onTap={() => change({ voice: v.key })} />
          ))
        : (["female", "male"] as const).map((g) => (
            <Chip key={g} label={g === "female" ? (de ? "Weiblich" : "Female") : de ? "Männlich" : "Male"} ink={ink} textScale={textScale} active={(acc?.voiceGender ?? DEFAULT_VOICE_GENDER) === g && !acc?.voice} onTap={() => change({ voiceGender: g })} />
          ));
      break;
    case "voice.tone":
      body = VOICE_TONES.map((t) => (
        <Chip key={t} label={TONE_LABEL[t][de ? 0 : 1]} ink={ink} textScale={textScale} active={(acc?.voiceTone ?? "neutral") === t} onTap={() => change({ voiceTone: t })} />
      ));
      break;
    case "light": {
      // the rider's light menu is the scenes and off — fine-tuning single
      // fixtures is the console's (and CoSiMo's, by voice)
      const scenes = light?.scenes ?? [];
      body = (
        <>
          {scenes.map((sc) => (
            <Chip key={sc.key} label={sc.label} ink={ink} textScale={textScale} active={light?.scene === sc.key} onTap={() => lightChange({ scene: sc.key })} />
          ))}
          <Chip label={de ? "Aus" : "Off"} ink={ink} textScale={textScale} active={light?.scene === "off"} onTap={() => lightChange({ scene: "off" })} />
        </>
      );
      break;
    }
    case "character":
      body = CHARACTERS.map((ch) => (
        <Chip key={ch.id} label={ch.label[lang]} ink={ink} textScale={textScale} active={(acc?.character ?? "face") === ch.id} onTap={() => change({ character: ch.id })} />
      ));
      break;
    case "theme":
      body = SCHEMES.map((sch) => (
        <button
          key={sch.id}
          onClick={() => change({ theme: sch.id })}
          aria-label={sch.label}
          aria-pressed={scheme.id === sch.id || undefined}
          title={sch.label}
          style={{
            appearance: "none", width: "clamp(28px, 38cqh, 80px)", height: "clamp(28px, 38cqh, 80px)",
            borderRadius: "50%", border: `max(2px, 2cqh) solid ${sch.ink}`, background: sch.bg,
            outline: scheme.id === sch.id ? `max(2px, 1.5cqh) solid ${ink}` : "none", outlineOffset: "max(2px, 1.5cqh)",
            cursor: "pointer", padding: 0, flexShrink: 0, touchAction: "manipulation",
          }}
        />
      ));
      break;
  }

  return (
    <SlitGrid label={titleOf(path, lang)} scheme={scheme} textScale={textScale} aside={aside} hideLabel>
      {body}
    </SlitGrid>
  );
}
