import { Utensils } from "lucide-react";
import { FIXED_RENT, type BudgetLine } from "@/lib/budget";
import type { BudgetView } from "@/lib/finance";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const TONE = {
  ok: { fg: "var(--m-accent)", bg: "var(--m-accent-soft)" },
  ahead: { fg: "var(--m-warn)", bg: "var(--m-warn-soft)" },
  over: { fg: "var(--m-alert)", bg: "var(--m-alert-soft)" },
};

/** Bar of spend vs budget, with a tick where spending "should" be by today. */
function Bar({ spent, budget, pacePct, status }: { spent: number; budget: number; pacePct: number | null; status: BudgetLine["status"] }) {
  const t = TONE[status];
  const fill = budget > 0 ? Math.min((spent / budget) * 100, 100) : spent > 0 ? 100 : 0;
  return (
    <div className="relative mt-2 h-2.5 rounded-full" style={{ background: t.bg }} role="img" aria-label={`${usd(spent)} of ${usd(budget)}`}>
      <div className="h-2.5 rounded-full transition-[width] duration-500" style={{ width: `${fill}%`, background: t.fg }} />
      {pacePct !== null && (
        <div className="absolute w-0.5 rounded-full bg-[var(--m-ink)] opacity-50" style={{ left: `${pacePct}%`, top: -3, height: 16 }} />
      )}
    </div>
  );
}

function Row({ l, pacePct }: { l: BudgetLine; pacePct: number }) {
  const t = TONE[l.status];
  const note =
    l.status === "over"
      ? l.watch ?? `Over by ${usd(-l.left)}`
      : l.perDayLeft !== null
        ? `${usd(l.left)} left, about ${usd(l.perDayLeft)} a day`
        : `${usd(l.left)} left`;
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{l.label}</span>
        <span className="shrink-0 tabular-nums">
          {usd(l.spent)} <span className="text-[var(--m-muted)]">of {usd(l.budget)}</span>
        </span>
      </div>
      <Bar spent={l.spent} budget={l.budget} pacePct={l.budget > 0 && l.status !== "over" ? pacePct : null} status={l.status} />
      <p className="mt-1.5 text-xs" style={{ color: l.status === "ok" ? "var(--m-muted)" : t.fg }}>
        {note}
        {l.top.length > 0 && <span className="text-[var(--m-muted)]"> · {l.top.map((x) => `${x.merchant} ${usd(x.amount)}`).join(", ")}</span>}
      </p>
    </li>
  );
}

export function BudgetSection({ b, monthLabel }: { b: BudgetView; monthLabel: string }) {
  const pacePct = (b.day / b.daysInMonth) * 100;
  const left = b.totalBudget - b.lines.filter((l) => !l.watch).reduce((s, l) => s + l.spent, 0);
  const dining = b.lines.find((l) => l.key === "dining")!;
  const canEatOut = dining.status !== "over" && (dining.perDayLeft ?? 0) >= 15;
  const budgeted = b.lines.filter((l) => !l.watch);
  const watch = b.lines.filter((l) => l.watch && l.spent > 0);

  return (
    <section className="money-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm text-[var(--m-muted)]">{monthLabel} budget</h2>
        <span className="text-sm text-[var(--m-muted)]">
          Day {b.day} of {b.daysInMonth}
        </span>
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
        {usd(left)} <span className="text-base font-normal text-[var(--m-muted)]">left of {usd(b.totalBudget)}</span>
      </p>
      <Bar spent={b.totalBudget - left} budget={b.totalBudget} pacePct={pacePct} status={b.totalBudget - left > b.totalBudget ? "over" : b.totalBudget - left > b.monthPace * 1.1 ? "ahead" : "ok"} />

      <div className="mt-4 flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: canEatOut ? "var(--m-accent-soft)" : "var(--m-warn-soft)", color: canEatOut ? "var(--m-accent)" : "var(--m-warn)" }}>
        <Utensils size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
        <p>
          {canEatOut
            ? `Eating out tonight fits: ${usd(dining.left)} left this month, about ${usd(dining.perDayLeft ?? 0)} a day.`
            : dining.status === "over"
              ? `Eating out is over budget by ${usd(-dining.left)}. Cook tonight.`
              : `Eating out is tight: ${usd(dining.left)} left for ${b.daysLeft} days. Keep it small or cook.`}
        </p>
      </div>

      {watch.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" style={{ color: "var(--m-alert)" }}>
          {watch.map((l) => (
            <li key={l.key}>
              {l.label}: {usd(l.spent)}. {l.watch}
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
        {budgeted.map((l) => (
          <Row key={l.key} l={l} pacePct={pacePct} />
        ))}
      </ul>

      <p className="mt-3 text-xs text-[var(--m-muted)]">
        The tick on each bar is where spending should be by today. Rent ({usd(FIXED_RENT)}), taxes and transfers aren&apos;t counted. Card
        transactions through {b.through ?? "unknown"}; banks update overnight.
      </p>
    </section>
  );
}
