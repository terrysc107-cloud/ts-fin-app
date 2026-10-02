import Link from "next/link";
import { Outfit } from "next/font/google";
import { ArrowRight, CreditCard, Landmark, Wallet, CalendarDays, House } from "lucide-react";
import { getMoneyView, getBudgetView, type MoneyView, type BudgetView } from "@/lib/finance";
import { getHq, type Hq } from "@/lib/hq";
import { NetWorthTrend } from "@/components/money/NetWorthTrend";
import { HqSections } from "@/components/money/HqSections";
import { ConnectBank } from "@/components/money/ConnectBank";
import { BudgetSection } from "@/components/money/Budget";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(0)}%`);
const day = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "unknown";

/** Utilization tone: calm under 50%, a heads-up at 50%, firmer at 70% (same bands as the Money Brief). */
function tone(p: number | null) {
  if (p === null || p < 50) return { fg: "var(--m-accent)", bg: "var(--m-accent-soft)" };
  if (p < 70) return { fg: "var(--m-warn)", bg: "var(--m-warn-soft)" };
  return { fg: "var(--m-alert)", bg: "var(--m-alert-soft)" };
}

function Tile({ icon, label, value, children }: { icon: React.ReactNode; label: string; value: string; children?: React.ReactNode }) {
  return (
    <section className="money-card p-5">
      <div className="flex items-center gap-2 text-sm text-[var(--m-muted)]">
        {icon}
        <h2>{label}</h2>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children}
    </section>
  );
}

function UsageBar({ p }: { p: number | null }) {
  if (p === null) return null;
  const t = tone(p);
  return (
    <div className="mt-3 h-2 rounded-full" style={{ background: t.bg }} role="img" aria-label={`${pct(p)} used`}>
      <div className="h-2 rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: t.fg }} />
    </div>
  );
}

function MoneySection({ v }: { v: MoneyView }) {
  const trend = [...v.snapshots.filter((s) => s.date !== v.asOf), { date: v.asOf, netWorth: v.netWorth }];
  const monthDiff = v.mtdSpend - v.priorSamePointSpend;
  const lt = tone(v.locUtilization);
  const ct = tone(v.cardUtilization);

  const since = v.previous ? v.netWorth - v.previous.netWorth : null;

  return (
    <>
      <section className="money-card p-6">
        <h2 className="text-sm text-[var(--m-muted)]">Net worth</h2>
        <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{usd(v.netWorth)}</p>
        {since !== null && v.previous && (
          <p className="mt-1 text-sm" style={{ color: since >= 0 ? "var(--m-accent)" : "var(--m-warn)" }}>
            {since >= 0 ? "Up" : "Down"} {usd(Math.abs(since))} since {day(v.previous.date)}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--m-muted)]">What you own</dt>
            <dd className="text-lg font-medium tabular-nums">{usd(v.grossAssets)}</dd>
          </div>
          <div>
            <dt className="text-[var(--m-muted)]">What you owe</dt>
            <dd className="text-lg font-medium tabular-nums">{usd(v.totalDebt)}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <NetWorthTrend points={trend} />
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile icon={<Wallet size={16} strokeWidth={2} />} label="Cash in checking and savings" value={usd(v.cash)} />

        <Tile icon={<CalendarDays size={16} strokeWidth={2} />} label={`${v.monthLabel} spending so far`} value={usd(v.mtdSpend)}>
          <p className="mt-2 text-sm text-[var(--m-muted)]">
            {usd(v.priorSamePointSpend)} by day {v.throughDay} of {v.priorMonthLabel}.{" "}
            <span style={{ color: monthDiff <= 0 ? "var(--m-accent)" : "var(--m-warn)" }}>
              {usd(Math.abs(monthDiff))} {monthDiff <= 0 ? "less" : "more"}
            </span>
          </p>
          <p className="mt-2 text-sm text-[var(--m-muted)]">
            Yesterday: <span className="font-medium text-[var(--m-ink)]">{usd(v.yesterdaySpend)}</span>
            {v.yesterdayTop.length > 0 && ` (${v.yesterdayTop.map((t) => `${t.merchant} ${usd(t.amount)}`).join(", ")})`}
          </p>
        </Tile>

        <Tile icon={<CreditCard size={16} strokeWidth={2} />} label="Owed on cards" value={usd(v.cardBalance)}>
          <p className="mt-2 text-sm text-[var(--m-muted)]">
            Cards with a limit: {usd(v.cardLimitedBalance)} of {usd(v.cardLimit)},{" "}
            <span style={{ color: ct.fg }}>{pct(v.cardUtilization)} used</span>
          </p>
          <UsageBar p={v.cardUtilization} />
          <ul className="mt-4 space-y-2 text-sm">
            {v.cards.filter((c) => c.balance).map((c) => (
              <li key={`${c.name}${c.mask}`} className="flex justify-between gap-3">
                <span className="truncate">
                  {c.name} <span className="text-[var(--m-muted)]">•{c.mask}</span>
                  {c.limit === null && <span className="text-[var(--m-muted)]"> (no limit)</span>}
                </span>
                <span className="tabular-nums">{usd(c.balance)}</span>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile icon={<Landmark size={16} strokeWidth={2} />} label="Lines of credit" value={usd(v.locBalance)}>
          <p className="mt-2 text-sm text-[var(--m-muted)]">
            {usd(v.locBalance)} of {usd(v.locLimit)}, <span style={{ color: lt.fg }}>{pct(v.locUtilization)} used</span>
          </p>
          <UsageBar p={v.locUtilization} />
          {v.loans > 0 && <p className="mt-3 text-sm text-[var(--m-muted)]">Other loans: {usd(v.loans)}</p>}
        </Tile>
      </div>

      <section className="money-card mt-4 p-5 text-sm">
        <div className="flex items-center gap-2 text-[var(--m-muted)]">
          <House size={16} strokeWidth={2} />
          <h2>Real estate and investments</h2>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <div><dt className="text-[var(--m-muted)]">Property</dt><dd className="font-medium tabular-nums">{usd(v.realEstateValue)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Mortgages</dt><dd className="font-medium tabular-nums">{usd(v.mortgages)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Investments</dt><dd className="font-medium tabular-nums">{usd(v.investments)}</dd></div>
        </dl>
        <p className="mt-3 rounded-xl px-3 py-2" style={{ background: "var(--m-warn-soft)", color: "var(--m-warn)" }}>
          Property values and mortgage balances were last entered {day(v.freshness.propertyValuesAsOf)}. Update them to sharpen net worth.
        </p>
      </section>

      <p className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--m-muted)]">
        <span>
          Balances as of {day(v.freshness.balancesAsOf)}. Transactions through {day(v.freshness.transactionsThrough)}.
        </span>
        <Link href="/details" className="inline-flex items-center gap-1 font-medium text-[var(--m-accent)] active:scale-[0.98]">
          Spending details <ArrowRight size={16} strokeWidth={2} />
        </Link>
      </p>

      <ConnectBank linkedBanks={v.linkedBanks} accountNames={v.accountNames} />
    </>
  );
}

async function settle<T>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await p, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function Page() {
  const now = new Date();
  const [money, budget, hq] = await Promise.all([settle(getMoneyView(now)), settle<BudgetView>(getBudgetView(now)), settle<Hq>(getHq())]);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", timeZone: "America/New_York" });

  return (
    <div className={`money min-h-[100dvh] ${outfit.className}`}>
      <div className="mx-auto max-w-xl px-4 pb-16 pt-8 md:max-w-3xl">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-sm text-[var(--m-muted)]">Where you stand</p>
            <h1 className="text-xl font-semibold">Terry HQ</h1>
          </div>
          <p className="text-sm text-[var(--m-muted)]">
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}
          </p>
        </header>

        <AppNav current="/" />
        <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 text-xs text-[var(--m-muted)] [scrollbar-width:none]" aria-label="On this page">
          {[["#budget", "Budget"], ["#money", "Money"], ["#today", "Today"], ["#ventures", "Ventures"]].map(([href, label]) => (
            <a key={href} href={href} className="shrink-0 rounded-full border border-[var(--m-line)] px-3 py-1 active:scale-[0.98]">
              {label}
            </a>
          ))}
        </nav>

        <div id="budget" className="mb-4 scroll-mt-20">
          {budget.data ? (
            <BudgetSection b={budget.data} monthLabel={monthLabel} />
          ) : (
            <p className="money-card p-5 text-sm text-[var(--m-muted)]">Budget didn&apos;t load: {budget.error}</p>
          )}
        </div>

        <div id="money" className="scroll-mt-20">
          {money.data ? (
            <MoneySection v={money.data} />
          ) : (
            <div className="money-card p-6">
              <h2 className="text-lg font-semibold">Couldn&apos;t load your numbers</h2>
              <p className="mt-2 text-sm text-[var(--m-muted)]">The bank data didn&apos;t come through. Nothing is wrong with your accounts. Try again in a minute.</p>
              <p className="mt-3 font-mono text-xs text-[var(--m-muted)]">{money.error}</p>
            </div>
          )}
        </div>

        <HqSections hq={hq.data} now={now} />
        {hq.error && <p className="mt-4 text-xs text-[var(--m-muted)]">Today and Ventures failed to load: {hq.error}</p>}
      </div>
    </div>
  );
}
