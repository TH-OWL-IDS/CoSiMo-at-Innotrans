import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Button, Card, Chip, cn } from "@cosimo/ui";

/**
 * The reading primitives for the Hilfe and Demo views — long-form text on
 * the console's tokens. Kept small on purpose: a section with an anchor, a
 * sticky sub-navigation, paragraphs, numbered steps, a key cap, a spoken
 * example, a code block and the Symptom card of the troubleshooting list.
 * No markdown renderer: the pages are TSX so they can read live state.
 */

/** Sticky chips that jump to the sections of one page; the active one follows the scroll. */
export function SubNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;
    // The section whose top is closest above the header line wins.
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);
  return (
    <nav aria-label="Abschnitte" className="print-hide sticky top-[57px] z-sticky -mx-2 flex gap-2 overflow-x-auto bg-bg px-2 py-2">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            setActive(i.id);
          }}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm no-underline",
            active === i.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-well",
          )}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

/** One chapter: a heading with an anchor and air above it, so the sub-nav lands cleanly. */
export function Section({ id, title, lead, children, className }: { id: string; title: string; lead?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("flex scroll-mt-[110px] flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5 border-b border-line pb-2">
        <h2 className="m-0 text-2xl font-black">{title}</h2>
        {lead && <p className="m-0 max-w-[68ch] text-base leading-relaxed text-mute">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export function H3({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("m-0 mt-2 text-lg font-semibold", className)}>{children}</h3>;
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-0 max-w-[68ch] text-base leading-relaxed", className)}>{children}</p>;
}

/** Numbered steps — a checklist reads as one. */
export function Steps({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("m-0 flex max-w-[68ch] list-none flex-col gap-2 p-0", className)}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-base leading-relaxed">
          <span className="mt-[3px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs font-bold tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Plain bullets. */
export function Bullets({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("m-0 flex max-w-[68ch] list-none flex-col gap-1.5 p-0", className)}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-base leading-relaxed">
          <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** A key cap — the panel buttons and their keyboard letters. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-block rounded-md border border-line bg-well px-1.5 py-px font-mono text-sm font-semibold leading-snug shadow-[0_1px_0_var(--color-ink)]">{children}</kbd>;
}

/** A term with its short explanation on the same line — the glossary row. */
export function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 text-base leading-relaxed sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 font-semibold">{name}</dt>
      <dd className="m-0 min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** Something a visitor might say — German first, the English twin small beneath. */
export function Say({ de, en, note }: { de: string; en?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-white px-3 py-2">
      <span className="text-base font-semibold">„{de}“</span>
      {en && <span className="text-sm text-mute">“{en}”</span>}
      {note && <span className="text-sm text-mute">{note}</span>}
    </div>
  );
}

/** A block of machine text: a command, a path, a log line. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <pre className={cn("m-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-well p-3 text-sm leading-snug", className)}>{children}</pre>;
}

/** Inline machine text. */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-well px-1 py-px text-[0.92em]">{children}</code>;
}

/** A small table: header row + rows, first column emphasised. */
export function Table({ head, rows, className }: { head: string[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full border-collapse text-sm leading-snug">
        <thead>
          <tr className="bg-well text-left">
            {head.map((h) => (
              <th key={h} className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-caps text-mute">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line-soft last:border-b-0 align-top">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-3 py-2", j === 0 && "font-semibold")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One troubleshooting entry: the symptom as the title, then what to check
 * and what to do. `live` marks it as matching the hub's state right now —
 * the card lifts its border to accent and carries a chip — and `go` offers
 * the jump to the view where the fix lives.
 */
export function Symptom({ title, live, check, fix, go, id }: {
  id?: string;
  title: string;
  live?: boolean;
  check: ReactNode;
  fix: ReactNode;
  go?: { label: string; onClick: () => void }[];
}) {
  return (
    <Card id={id} active={live} className="scroll-mt-[110px] gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{title}</span>
        {live && (
          <Chip size="xs" active className="text-accent">
            <CircleAlert size={12} /> trifft gerade zu
          </Chip>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-caps text-mute">Prüfen</span>
          <div className="text-base leading-relaxed">{check}</div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-caps text-mute">Beheben</span>
          <div className="text-base leading-relaxed">{fix}</div>
        </div>
      </div>
      {go && go.length > 0 && (
        <div className="print-hide flex flex-wrap gap-2 border-t border-line-soft pt-2.5">
          {go.map((g) => (
            <Button key={g.label} size="xs" variant="secondary" onClick={g.onClick}>
              {g.label} <ArrowRight size={12} />
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

/** A callout — the one thing to remember in a section. */
export function Note({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warn"; className?: string }) {
  return (
    <div className={cn("max-w-[68ch] rounded-lg border-l-[3px] px-3.5 py-2.5 text-base leading-relaxed", tone === "warn" ? "border-warn bg-warn-soft" : "border-ink bg-well", className)}>
      {children}
    </div>
  );
}
