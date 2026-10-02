import { Shell, usd } from "@/components/Shell";
import { BudgetSection } from "@/components/money/Budget";
import { getBudgetView, budgetRows } from "@/lib/finance";
import { createServerClient } from "@/lib/supabase";
import { updateBudgetLine } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const now = new Date();
  const [b, rows] = await Promise.all([getBudgetView(now), budgetRows(createServerClient())]);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", timeZone: "America/New_York" });
  const total = rows.filter((r) => !r.watch).reduce((s, r) => s + (Number(r.monthly) || 0), 0);

  return (
    <Shell current="/budget" kicker="Set the lines, then live inside them" title="Budget">
      <BudgetSection b={b} monthLabel={monthLabel} />

      <section className="money-card mt-4 p-5">
        <h2 className="text-sm font-medium">Monthly amounts</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">
          {usd(total)} a month across the budgeted lines. Lumpy lines (bills, travel, car) are judged against the full month, not today&apos;s pace. $0 watch lines flag anything that lands in them.
        </p>
        <ul className="mt-2 divide-y divide-[var(--m-line)]">
          {rows.map((r) => (
            <li key={r.key} className="py-3">
              <form action={updateBudgetLine} className="flex items-center gap-3">
                <input type="hidden" name="key" value={r.key} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <label className="mt-1 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                    <input type="checkbox" name="lumpy" defaultChecked={!!r.lumpy} className="h-4 w-4 accent-[var(--m-accent)]" /> Lumpy
                    {r.watch && <span>· watch line</span>}
                  </label>
                </div>
                <div className="flex items-center rounded-xl border px-2" style={{ borderColor: "var(--m-line)" }}>
                  <span className="text-sm text-[var(--m-muted)]">$</span>
                  <input name="monthly" inputMode="decimal" defaultValue={Number(r.monthly) || 0} className="min-h-11 w-20 bg-transparent text-right text-base tabular-nums outline-none" aria-label={`${r.label} monthly budget`} />
                </div>
                <button className="min-h-11 rounded-xl px-3 text-sm font-semibold text-white active:scale-[0.98]" style={{ background: "var(--m-accent)" }}>Save</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
