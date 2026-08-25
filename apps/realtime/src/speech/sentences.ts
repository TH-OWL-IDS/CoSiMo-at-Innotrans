/**
 * Sentence boundaries for streaming TTS. The LLM stream is cut at the end of
 * each sentence so synthesis starts while the model is still writing the
 * next one. Conservative on purpose: a late cut costs a few hundred ms, a
 * wrong cut ("z. B." → two clips) sounds broken.
 */

/** Abbreviations whose trailing dot is not a sentence end (de + en). */
const ABBREVIATION =
  /(?:^|[\s(])(?:z\.\s?B|u\.\s?a|d\.\s?h|bzw|ca|evtl|usw|ggf|inkl|zzgl|Dr|Prof|Hr|Fr|Nr|St|Mio|Mrd|Min|Sek|Std|Tel|Abs|Str|Mr|Mrs|Ms|e\.\s?g|i\.\s?e|vs|etc|No|approx)\.$/i;

/** Sentence-final punctuation plus any closing quotes/brackets. */
const TERMINAL = /[.!?…]+["'»“”‘’)\]]*$/;

/**
 * Split `buffer` into complete sentences and the unfinished remainder.
 * A sentence ends at terminal punctuation that is followed by whitespace
 * and preceded by at least `minChars` of text (so a clip is never a
 * single word). Ordinal/number dots ("14. August", "Nr. 3", "1.5") do not
 * end a sentence.
 */
export function takeSentences(buffer: string, minChars = 20): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i]!;
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    // swallow the whole punctuation run + closing quotes/brackets
    let end = i + 1;
    while (end < buffer.length && /[.!?…"'»“”‘’)\]]/.test(buffer[end]!)) end++;
    // must be followed by whitespace — otherwise it's mid-token ("1.5", still streaming)
    if (end >= buffer.length || !/\s/.test(buffer[end]!)) {
      i = end - 1;
      continue;
    }
    const candidate = buffer.slice(start, end).trim();
    if (candidate.length < minChars || !TERMINAL.test(candidate)) {
      i = end - 1;
      continue;
    }
    if (ch === ".") {
      const head = buffer.slice(start, i + 1);
      // "14. August", "Nr. 3": an ordinal/number before the dot with more
      // lower/upper text right after is not a sentence end
      const wordBefore = /(\S+)\.$/.exec(head)?.[1] ?? "";
      const nextChar = buffer.slice(end).trimStart()[0] ?? "";
      if (/^\d+$/.test(wordBefore) && /[a-zäöüß]/i.test(nextChar)) {
        i = end - 1;
        continue;
      }
      if (ABBREVIATION.test(head)) {
        i = end - 1;
        continue;
      }
      // a lowercase continuation after the dot is not a new sentence
      if (/[a-zäöüß]/.test(nextChar)) {
        i = end - 1;
        continue;
      }
    }
    sentences.push(candidate);
    start = end;
    i = end - 1;
  }
  return { sentences, rest: buffer.slice(start) };
}
