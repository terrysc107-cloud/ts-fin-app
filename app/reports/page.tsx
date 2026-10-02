import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Shell, usd } from "@/components/Shell";
import { Bars } from "@/components/reports/Bars";
import { TxnList } from "@/components/transactions/TxnList";
import { fetchTagged, monthLabel, monthRange, shiftMonth, tagChoices } from "@/lib/tagged";
import { easternToday } from "@/lib/money";
import { byCategory, byEntity, byMerchant, categoryOf, isSpendRow, samePoint, trend } from "@/lib/reports";
import { ENTITIES, ENTITY_LABEL, type Entity } from "@/lib/tags";

export const dynamic = "force-dynamic";

type Params = { month?: string; entity?: string; category?: string; merchant?: string };
const MONTHS = 6;

export default async function Page({ searchParams }: { searchParams: Params }) {
  const today = easternToday();
  const thisMonth = today.toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : thisMonth;
  // Personal by default. Business entities are explicit tabs, never mixed in.
  const entity: Entity | "all" = searchParams.entity === "all" ? "all" : ENTITIES.includes(searchParams.entity as Entity) ? (searchParams.entity as Entity) : "personal";
  const category = searchParams.category || null;
  const merchant = searchParams.merchant || null;

  const from = monthRange(shiftMonth(month, -(MONTHS - 1))).from;
  const { to } = monthRange(month);
  const [all, choices] = await Promise.all([fetchTagged(from, to, today), tagChoices()]);
  const scoped = entity === "all" ? all : all.filter((t) => t.entity === entity);
  const inMonth = scoped.filter((t) => t.date.startsWith(month));

  const total = inMonth.filter(isSpendRow).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const day = month === thisMonth ? today.getUTCDate() : new Date(`${to}T00:00:00Z`).getUTCDate();
  const pace = samePoint(scoped, month, day);
  const cats = byCategory(inMonth);
  const lineLabel = (k: string) => choices.budgetLines.find((b) => b.key === k)?.label ?? k;

  const drill = inMonth.filter((t) => isSpendRow(t) && (!category || categoryOf(t) === category) && (!merchant || (t.merchant_name ?? t.name ?? "Unknown") === merchant));
  const merchants = byMerchant(category ? drill : inMonth);

  const href = (p: Partial<Params>) => {
    const u = new URLSearchParams();
    const merged = { month, entity, category: category ?? undefined, merchant: merchant ?? undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/reports?${u}`;
  };
  const pill = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium active:scale-[0.98] ${on ? "" : "money-card"}`;
  const pillStyle = (on: boolean) => (on ? { background: "var(--m-ink)", color: "var(--m-card)" } : undefined);
  const diff = pace.current - pace.prior;

  return (
    <Shell
      current="/reports"
      kicker="Where the money went"
      title="Reports"
      aside={
        <div className="flex items-center gap-1 text-sm">
          <Link href={href({ month: shiftMonth(month, -1), category: undefined, merchant: undefined })} className="money-card rounded-full p-2" aria-label="Previous month"><ChevronLeft size={18} /></Link>
          <span className="min-w-[7rem] text-center font-medium">{monthLabel(month)}</span>
          <Link href={href({ month: shiftMonth(month, 1), category: undefined, merchant: undefined })} className="money-card rounded-full p-2" aria-label="Next month"><ChevronRight size={18} /></Link>
        </div>
      }
    >
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {ENTITIES.map((e) => (
          <Link key={e} href={href({ entity: e, category: undefined, merchant: undefined })} className={pill(entity === e)} style={pillStyle(entity === e)}>
            {ENTITY_LABEL[e].split(" ")[0]}
          </Link>
        ))}
        <Link href={href({ entity: "all", category: undefined, merchant: undefined })} className={pill(entity === "all")} style={pillStyle(entity === "all")}>Everything</Link>
      </div>

      <section className="money-card p-5">
        <h2 className="text-sm text-[var(--m-muted)]">{entity === "all" ? "All" : ENTITY_LABEL[entity]} spending in {monthLabel(month)}</h2>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{usd(total)}</p>
        <p className="mt-1 text-sm text-[var(--m-muted)]">
          {usd(pace.prior)} by day {day} of {monthLabel(pace.priorKey).split(" ")[0]}.{" "}
          <span style={{ color: diff <= 0 ? "var(--m-accent)" : "var(--m-warn)" }}>{usd(Math.abs(diff))} {diff <= 0 ? "less" : "more"}</span>
        </p>
        <div className="mt-4">
          <Bars points={trend(scoped, month, MONTHS).map((p) => ({ ...p, label: monthLabel(p.key).slice(0, 3) }))} highlight={month} />
        </div>
      </section>

      {entity === "all" && (
        <section className="money-card mt-4 p-5">
          <h2 className="text-sm font-medium">By business</h2>
          <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
            {byEntity(inMonth).map((e) => (
              <li key={e.key} className="flex justify-between py-2.5">
                <Link href={href({ entity: e.key })} className="font-medium">{ENTITY_LABEL[e.key as Entity] ?? e.key}</Link>
                <span className="tabular-nums">{usd(e.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="money-card mt-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">By category</h2>
          {category && <Link href={href({ category: undefined, merchant: undefined })} className="text-xs" style={{ color: "var(--m-accent)" }}>Clear</Link>}
        </div>
        <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
          {cats.map((c) => {
            const on = c.key === category;
            return (
              <li key={c.key}>
                <Link href={href({ category: on ? undefined : c.key, merchant: undefined })} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                  <span className={on ? "font-semibold" : "font-medium"}>{lineLabel(c.key)}</span>
                  <span className="flex items-center gap-3">
                    <span className="h-2 rounded-full" style={{ width: `${Math.max(6, (c.total / (cats[0]?.total || 1)) * 80)}px`, background: on ? "var(--m-ink)" : "var(--m-accent)" }} />
                    <span className="w-20 text-right tabular-nums">{usd(c.total)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {cats.length === 0 && <li className="py-2 text-[var(--m-muted)]">No spending this month.</li>}
        </ul>
      </section>

      <section className="money-card mt-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Top merchants{category ? ` in ${lineLabel(category)}` : ""}</h2>
          {merchant && <Link href={href({ merchant: undefined })} className="text-xs" style={{ color: "var(--m-accent)" }}>Clear</Link>}
        </div>
        <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
          {merchants.slice(0, 12).map((m) => (
            <li key={m.key}>
              <Link href={href({ merchant: m.key === merchant ? undefined : m.key })} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                <span className={`truncate ${m.key === merchant ? "font-semibold" : ""}`}>{m.key}</span>
                <span className="shrink-0 tabular-nums">{usd(m.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {(category || merchant) && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-medium">{drill.length} purchases{merchant ? ` at ${merchant}` : ""}. Tap one to retag.</h2>
          <TxnList rows={drill} choices={choices} />
        </div>
      )}
    </Shell>
  );
}
