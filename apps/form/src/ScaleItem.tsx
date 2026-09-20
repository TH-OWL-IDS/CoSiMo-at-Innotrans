import { SURVEY_AGREE_ANCHORS, SURVEY_SCALE_MAX, type Locale, type SurveyItem } from "@cosimo/shared";
import { cn } from "@cosimo/ui";
import type { Strings } from "./i18n";

/**
 * One item: a fieldset with a legend and seven real radio buttons. The
 * radios are visually hidden; the dot beside each is its face (44 px, the
 * touch-target floor). Screen readers get the meaning of each number in
 * the aria-label ("Stimme zu, 6 von 7" / "1 von 7 – verwirrend"), and the
 * poles or end anchors sit ABOVE the row so seven dots still fit a 360 px
 * phone. Invalid = unanswered after a submit attempt.
 */
export default function ScaleItem({ item, index, lang, s, value, onChange, invalid }: {
  item: SurveyItem;
  index: number;
  lang: Locale;
  s: Strings;
  value: number | undefined;
  onChange: (v: number) => void;
  invalid: boolean;
}) {
  const anchors = SURVEY_AGREE_ANCHORS[lang];
  const poles = item.poles?.[lang];
  const left = item.kind === "agree" ? anchors[0]! : poles![0];
  const right = item.kind === "agree" ? anchors[SURVEY_SCALE_MAX - 1]! : poles![1];
  const labelFor = (n: number) =>
    item.kind === "agree"
      ? `${anchors[n - 1]}, ${n} ${s.of} ${SURVEY_SCALE_MAX}`
      : n === 1 ? `1 ${s.of} ${SURVEY_SCALE_MAX} – ${left}` : n === SURVEY_SCALE_MAX ? `${n} ${s.of} ${SURVEY_SCALE_MAX} – ${right}` : `${n} ${s.of} ${SURVEY_SCALE_MAX}`;
  const legend = item.text?.[lang];

  return (
    <fieldset
      id={`item-${item.id}`}
      aria-invalid={invalid || undefined}
      className={cn(
        "m-0 min-w-0 scroll-mt-24 rounded-xl border bg-white p-4",
        invalid ? "border-accent border-2" : "border-line",
      )}
    >
      <legend className="sr-only">{s.itemLabel(index)}: {legend ?? `${left} – ${right}`}</legend>
      <div className="mb-3 flex items-baseline gap-2">
        <span aria-hidden className="shrink-0 text-sm tabular-nums text-mute">{index}</span>
        {legend ? (
          <span className="text-base font-semibold leading-snug">{legend}</span>
        ) : (
          <span className="text-base font-semibold leading-snug">
            <span>{left}</span>
            <span aria-hidden className="mx-2 text-mute">…</span>
            <span>{right}</span>
          </span>
        )}
      </div>
      {/* the poles / end anchors above the row: left-aligned and right-aligned */}
      <div aria-hidden className="mb-1.5 flex justify-between gap-3 text-sm leading-snug text-mute">
        <span className="max-w-[48%]">{left}</span>
        <span className="max-w-[48%] text-right">{right}</span>
      </div>
      <div className="flex items-center justify-between gap-1" role="radiogroup" aria-label={legend ?? `${left} – ${right}`}>
        {Array.from({ length: SURVEY_SCALE_MAX }, (_, i) => i + 1).map((n) => (
          <label key={n} className="relative inline-flex cursor-pointer">
            <input
              type="radio"
              className="scale-radio"
              name={item.id}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={labelFor(n)}
            />
            <span
              aria-hidden
              className={cn(
                "scale-dot inline-flex size-11 items-center justify-center rounded-full border border-line-strong bg-white text-base font-semibold tabular-nums transition-colors",
                "hover:bg-well",
              )}
            >
              {n}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
