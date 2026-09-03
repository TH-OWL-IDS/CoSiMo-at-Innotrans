/**
 * Memory requests the model must not talk its way past. Once a session holds
 * a "Gemerkt: …" reply, the 35B tends to imitate its own confirmation WITHOUT
 * calling remember again (seen in prod 2026-08-28: turn 1 called the tool,
 * turns 2+ only said "Gemerkt"). A plain phrase match forces the tool via
 * tool_choice on the first step — the model still writes the note and the
 * confirmation, it just cannot skip the call.
 *
 * Deliberately narrow: only explicit keep-this-in-mind / un-remember phrasing.
 * "Vergiss es" (never mind) is NOT a forget trigger.
 */
const REMEMBER =
  /\b(merk(e)?\s+dir|denk\s+(dran|daran)|erinner(e)?\s+dich|notier(e)?\s+(dir|das)|vergiss\s+(bitte\s+)?nicht|nicht\s+vergessen|remember\b|keep\s+in\s+mind|don'?t\s+forget)/i;
const FORGET =
  /\b(vergiss\s+(das|den|die|dass)\b(?!\s+nicht)|wieder\s+vergessen|lösch(e)?\s+(das|den|die|meine|die\s+notiz)|streich(e)?\s+(das|den|die)|forget\s+(that|about|the|my|what)|delete\s+(that|the|my))/i;

export type MemoryTool = "remember" | "forget";

/**
 * Voice/speech-change requests get the same treatment: prod 2026-08-31 showed
 * the model claiming "Ich habe die Stimme auf Lea gestellt" with ZERO tool
 * calls once the history held a confirmed voice change. Only unambiguous
 * change imperatives force set_presentation — questions about voices don't.
 */
const PRESENTATION = [
  /\b(sprich|sprech\w*|rede|speak|talk)\b.{0,40}\b(lauter|leiser|langsamer|schneller|tiefer|höher|freundlicher|wärmer|ruhiger|weicher|sanfter|englisch|deutsch|english|german|louder|quieter|slower|faster|as a (man|woman)|als (mann|frau)|mit \w+ stimme|with a (male|female|deeper|softer) voice)/i,
  /\b(männlich\w*|weiblich\w*|tiefer\w*|heller\w*|ruhig\w*|beruhigend\w*|sanft\w*|warm\w*|ander\w*|neue)\b.{0,24}\b(stimme|voice)/i,
  /\b(stimme|voice)\b.{0,40}\b(wechseln?|ändern?|umstellen|change|switch)/i,
  /\b(lauter|leiser|louder|quieter)\b/i,
];

export function presentationTrigger(text: string): "set_presentation" | null {
  const t = text.trim();
  if (!t) return null;
  return PRESENTATION.some((r) => r.test(t)) ? "set_presentation" : null;
}

/**
 * Cabin-light requests, same trap: prod 2026-09-03 bake test — "Mach bitte
 * meine Leselampe an" → "Die Leselampe ist jetzt an." with zero tool calls
 * (Qwen3.6-35B). Only clear switch/dim imperatives about a light force
 * set_cabin_control; questions ("ist das Licht an?") don't.
 */
const CABIN = [
  /\b(licht\w*|lampe\w*|leselampe\w*|beleuchtung|innenlicht|deckenlicht|light\w*|lamp\w*|lighting)\b.{0,40}\b(an|aus|ein|einschalten|ausschalten|anmachen|ausmachen|dimmen|dunkler|heller|on|off|dim|brighter|darker)\b/i,
  /\b(mach|schalt\w*|stell\w*|dreh\w*|turn|switch|dim)\b.{0,40}\b(licht\w*|lampe\w*|leselampe\w*|beleuchtung|innenlicht|light\w*|lamp\w*)/i,
];

export function cabinTrigger(text: string): "set_cabin_control" | null {
  const t = text.trim();
  if (!t || /\?\s*$/.test(t)) return null;
  return CABIN.some((r) => r.test(t)) ? "set_cabin_control" : null;
}

export function memoryTrigger(text: string): MemoryTool | null {
  const t = text.trim();
  if (!t) return null;
  if (REMEMBER.test(t)) return "remember";
  if (FORGET.test(t)) return "forget";
  return null;
}
