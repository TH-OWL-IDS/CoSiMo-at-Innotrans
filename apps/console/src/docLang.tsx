import { useEffect, useState } from "react";
import { cn } from "@cosimo/ui";

/**
 * The reading language of the Hilfe and Begleiten views — German or
 * English, switched on the page itself and remembered per device. Content
 * is written as pairs (`t("Deutsch", "English")`), so each page carries
 * both languages in one file. `<html lang>` follows while a page is open,
 * for screen readers and hyphenation.
 */
export type DocLang = "de" | "en";
const KEY = "cosimo.console.docLang";

export function useDocLang(): [DocLang, (l: DocLang) => void] {
  const [lang, setLangState] = useState<DocLang>(() => {
    try {
      return localStorage.getItem(KEY) === "en" ? "en" : "de";
    } catch {
      return "de";
    }
  });
  const setLang = (l: DocLang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // fine
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "de";
    };
  }, [lang]);
  return [lang, setLang];
}

/** `t(de, en)` for the current language. */
export const picker = (lang: DocLang) => <T,>(de: T, en: T): T => (lang === "de" ? de : en);

export function LangToggle({ lang, onChange }: { lang: DocLang; onChange: (l: DocLang) => void }) {
  return (
    <div role="group" aria-label={lang === "de" ? "Sprache" : "Language"} className="print-hide inline-flex overflow-hidden rounded-lg border border-line">
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={cn("focus-ring min-h-9 cursor-pointer border-0 px-3 font-mono text-sm font-semibold uppercase", lang === l ? "bg-ink text-white" : "bg-white text-mute hover:bg-well")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
