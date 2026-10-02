import { Tag } from "lucide-react";
import { DOMAIN_LABEL, ENTITY_LABEL, ENTITY_TONE, type Entity } from "@/lib/tags";
import type { Tagged } from "@/lib/tagged";
import { TagSheet, type Choices } from "@/components/transactions/TagSheet";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function Chip({ children, tone }: { children: React.ReactNode; tone?: { fg: string; bg: string } }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={tone ? { background: tone.bg, color: tone.fg } : { background: "var(--m-bg)", color: "var(--m-muted)" }}>
      {children}
    </span>
  );
}

/** One tappable transaction row. The whole row opens the tag sheet. */
export function TxnRow({ t, choices }: { t: Tagged; choices: Choices }) {
  const amount = Number(t.amount) || 0;
  const merchant = t.merchant_name ?? t.name ?? "Unknown";
  const review = t.flags?.needs_review && !t.overridden;
  return (
    <li>
      <TagSheet t={t} choices={choices}>
        <button type="button" className="flex w-full items-start justify-between gap-3 py-3 text-left active:bg-[var(--m-bg)]">
          <div className="min-w-0">
            <p className="truncate font-medium">{merchant}</p>
            <p className="truncate text-xs text-[var(--m-muted)]">
              {t.account_name ?? "Account"} •{t.mask}
              {t.pending && " · pending"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip tone={ENTITY_TONE[t.entity]}>{ENTITY_LABEL[t.entity as Entity] ?? t.entity}</Chip>
              <Chip>{DOMAIN_LABEL[t.domain_tag as keyof typeof DOMAIN_LABEL] ?? t.domain_tag}</Chip>
              {t.overridden && <Tag size={12} strokeWidth={2} style={{ color: "var(--m-accent)" }} aria-label="Tagged by you" />}
              {review && <Chip tone={{ fg: "var(--m-warn)", bg: "var(--m-warn-soft)" }}>Check</Chip>}
            </div>
          </div>
          <span className="shrink-0 tabular-nums" style={amount < 0 ? { color: "var(--m-accent)" } : undefined}>
            {amount < 0 ? `+${usd(-amount)}` : usd(amount)}
          </span>
        </button>
      </TagSheet>
    </li>
  );
}

/** Rows grouped by day, newest first. */
export function TxnList({ rows, choices }: { rows: Tagged[]; choices: Choices }) {
  if (rows.length === 0) return <p className="money-card p-5 text-sm text-[var(--m-muted)]">Nothing here for this filter.</p>;
  const days = new Map<string, Tagged[]>();
  for (const t of rows) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  return (
    <div className="space-y-4">
      {Array.from(days).map(([d, list]) => (
        <section key={d} className="money-card px-5 py-2">
          <h3 className="flex justify-between pt-2 text-xs font-medium text-[var(--m-muted)]">
            <span>{dayLabel(d)}</span>
            <span className="tabular-nums">{usd(list.reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0))} out</span>
          </h3>
          <ul className="divide-y divide-[var(--m-line)]">
            {list.map((t) => <TxnRow key={t.id} t={t} choices={choices} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
