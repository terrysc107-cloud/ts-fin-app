import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Shell, usd } from "@/components/Shell";
import { TxnList } from "@/components/transactions/TxnList";
import { fetchRules, fetchTagged, monthLabel, monthRange, shiftMonth, tagChoices } from "@/lib/tagged";
import { easternToday } from "@/lib/money";
import { ENTITIES, ENTITY_LABEL, DOMAIN_LABEL, type Entity } from "@/lib/tags";
import { deleteRule } from "@/app/actions";

export const dynamic = "force-dynamic";

type Params = { month?: string; entity?: string; q?: string; needs?: string };

export default async function Page({ searchParams }: { searchParams: Params }) {
  const today = easternToday();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : today.toISOString().slice(0, 7);
  const { from, to } = monthRange(month);
  const entity = ENTITIES.includes(searchParams.entity as Entity) ? (searchParams.entity as Entity) : null;
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const needs = searchParams.needs === "review";

  const [all, choices, rules] = await Promise.all([fetchTagged(from, to, today), tagChoices(), fetchRules()]);
  const rows = all.filter(
    (t) =>
      (!entity || t.entity === entity) &&
      (!needs || (t.flags?.needs_review && !t.overridden) || t.domain_tag === "uncategorized") &&
      (!q || (t.merchant_name ?? "").toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q)),
  );
  const out = rows.reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
  const reviewCount = all.filter((t) => (t.flags?.needs_review && !t.overridden) || t.domain_tag === "uncategorized").length;

  const href = (p: Partial<Params>) => {
    const u = new URLSearchParams();
    const merged = { month, entity: entity ?? undefined, q: q || undefined, needs: needs ? "review" : undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/transactions?${u}`;
  };
  const pill = (on: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium active:scale-[0.98] ${on ? "" : "money-card"}`;
  const pillStyle = (on: boolean) => (on ? { background: "var(--m-ink)", color: "var(--m-card)" } : undefined);

  return (
    <Shell
      current="/transactions"
      kicker="Tap any purchase to tag it"
      title="Spending"
      aside={
        <div className="flex items-center gap-1 text-sm">
          <Link href={href({ month: shiftMonth(month, -1) })} className="money-card rounded-full p-2" aria-label="Previous month"><ChevronLeft size={18} /></Link>
          <span className="min-w-[7rem] text-center font-medium">{monthLabel(month)}</span>
          <Link href={href({ month: shiftMonth(month, 1) })} className="money-card rounded-full p-2" aria-label="Next month"><ChevronRight size={18} /></Link>
        </div>
      }
    >
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <Link href={href({ entity: undefined, needs: undefined })} className={pill(!entity && !needs)} style={pillStyle(!entity && !needs)}>All</Link>
        {ENTITIES.map((e) => (
          <Link key={e} href={href({ entity: e, needs: undefined })} className={pill(entity === e)} style={pillStyle(entity === e)}>
            {ENTITY_LABEL[e].split(" ")[0]}
          </Link>
        ))}
        <Link href={href({ needs: "review", entity: undefined })} className={pill(needs)} style={pillStyle(needs)}>
          Check {reviewCount > 0 && `(${reviewCount})`}
        </Link>
      </div>

      <form className="mb-4 flex gap-2" action="/transactions">
        <input type="hidden" name="month" value={month} />
        {entity && <input type="hidden" name="entity" value={entity} />}
        <input name="q" defaultValue={q} placeholder="Search merchants" inputMode="search" className="money-card min-h-11 flex-1 rounded-full px-4 text-base" />
      </form>

      <p className="mb-3 text-sm text-[var(--m-muted)]">
        <span className="font-medium text-[var(--m-ink)]">{usd(out)}</span> out across {rows.length} transactions
        {entity && ` on ${ENTITY_LABEL[entity]}`}. Inflows show green.
      </p>

      <TxnList rows={rows} choices={choices} />

      <section className="money-card mt-6 p-5">
        <h2 className="text-sm font-medium">Your rules</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">Saved from “Always tag like this”. New purchases get tagged within the hour. Deleting a rule untags only what it tagged.</p>
        {rules.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--m-muted)]">No rules yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">“{r.pattern}”</p>
                  <p className="truncate text-xs text-[var(--m-muted)]">
                    {[r.entity && ENTITY_LABEL[r.entity as Entity], r.domain_tag && DOMAIN_LABEL[r.domain_tag as keyof typeof DOMAIN_LABEL], r.budget_key && `budget: ${choices.budgetLines.find((b) => b.key === r.budget_key)?.label ?? r.budget_key}`, r.property_id && choices.properties.find((p) => p.id === r.property_id)?.address]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · {r.matches} tagged
                  </p>
                </div>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="min-h-10 rounded-full border px-3 text-xs font-medium" style={{ borderColor: "var(--m-line)", color: "var(--m-alert)" }}>Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
