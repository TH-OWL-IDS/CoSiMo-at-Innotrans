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

export function memoryTrigger(text: string): MemoryTool | null {
  const t = text.trim();
  if (!t) return null;
  if (REMEMBER.test(t)) return "remember";
  if (FORGET.test(t)) return "forget";
  return null;
}
