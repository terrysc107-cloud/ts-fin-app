import { Shell, usd } from "@/components/Shell";
import { NetWorthTrend } from "@/components/money/NetWorthTrend";
import { getMoneyView } from "@/lib/finance";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { deleteManualAccount, updateProperty, upsertInvestment, upsertManualAccount } from "@/app/actions";
import { ENTITIES, ENTITY_LABEL, type Entity } from "@/lib/tags";

export const dynamic = "force-dynamic";

const day = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "never");
const input = "mt-1 block min-h-11 w-full rounded-xl border bg-transparent px-3 text-base [border-color:var(--m-line)]";
const save = "mt-3 min-h-11 w-full rounded-xl text-sm font-semibold text-white active:scale-[0.99]";

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-medium text-[var(--m-muted)] ${className}`}>
      {label}
      {children}
    </label>
  );
}

export default async function Page() {
  const sb = createServerClient();
  const [v, props, invest, plaid] = await Promise.all([
    getMoneyView(),
    sb.from("properties").select("id,address,current_value,debt_balance,mortgage_rate,debt_in_plaid,notes,last_updated").eq("client_id", CLIENT_ID).order("address"),
    sb.from("investment_accounts").select("id,account_name,account_type,current_balance,in_plaid,last_updated").eq("client_id", CLIENT_ID).order("account_name"),
    sb.from("plaid_accounts").select("account_id,account_name,mask").order("account_name"),
  ]);
  for (const r of [props, invest, plaid]) if (r.error) throw new Error(r.error.message);
  const trend = [...v.snapshots.filter((s) => s.date !== v.asOf), { date: v.asOf, netWorth: v.netWorth }];

  return (
    <Shell current="/assets" kicker="What you own and owe" title="Assets">
      <section className="money-card p-6">
        <h2 className="text-sm text-[var(--m-muted)]">Net worth</h2>
        <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{usd(v.netWorth)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-[var(--m-muted)]">What you own</dt><dd className="text-lg font-medium tabular-nums">{usd(v.grossAssets)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">What you owe</dt><dd className="text-lg font-medium tabular-nums">{usd(v.totalDebt)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Cash</dt><dd className="font-medium tabular-nums">{usd(v.cash)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Investments</dt><dd className="font-medium tabular-nums">{usd(v.investments)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Property</dt><dd className="font-medium tabular-nums">{usd(v.realEstateValue)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Mortgages</dt><dd className="font-medium tabular-nums">{usd(v.mortgages)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Cards</dt><dd className="font-medium tabular-nums">{usd(v.cardBalance)}</dd></div>
          <div><dt className="text-[var(--m-muted)]">Lines of credit & loans</dt><dd className="font-medium tabular-nums">{usd(v.locBalance + v.loans)}</dd></div>
        </dl>
        <div className="mt-5"><NetWorthTrend points={trend} /></div>
        <p className="mt-3 text-xs text-[var(--m-muted)]">Whole-picture number: personal and business accounts together. Business balances are labeled below so they are never mistaken for personal.</p>
      </section>

      <section className="money-card mt-4 p-5">
        <h2 className="text-sm font-medium">Linked through Plaid</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">{v.linkedBanks} bank logins, {v.accountNames.length} accounts{v.duplicateAccountsHidden > 0 && `, ${v.duplicateAccountsHidden} mirrored duplicates hidden`}. Balances as of {day(v.freshness.balancesAsOf)}.</p>
        <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
          {v.cards.filter((c) => c.mask).map((c) => (
            <li key={`${c.name}${c.mask}`} className="flex justify-between py-2"><span className="truncate">{c.name} <span className="text-[var(--m-muted)]">•{c.mask}</span></span><span className="tabular-nums">{usd(c.balance)}</span></li>
          ))}
        </ul>
      </section>

      <section className="money-card mt-4 p-5">
        <h2 className="text-sm font-medium">Accounts you track by hand</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">Citi Simplicity, Citi AAdvantage, Apple Card, PFCU 6450 live here until Plaid can see them. Type the balance from the statement. If Plaid links one later, pick it under “Now linked as” and this row stops counting.</p>
        <ul className="mt-3 space-y-4">
          {v.manualAccounts.map((m) => (
            <li key={m.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--m-line)" }}>
              <form action={upsertManualAccount}>
                <input type="hidden" name="id" value={m.id} />
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{m.name}</p>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--m-bg)", color: "var(--m-muted)" }}>{ENTITY_LABEL[m.entity as Entity] ?? m.entity} · {m.kind}</span>
                </div>
                <input type="hidden" name="name" value={m.name} />
                <input type="hidden" name="kind" value={m.kind} />
                <input type="hidden" name="entity" value={m.entity} />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <F label="Balance"><input name="balance" inputMode="decimal" defaultValue={m.balance} className={input} /></F>
                  <F label="Limit"><input name="limit_balance" inputMode="decimal" defaultValue={m.limit_balance ?? ""} placeholder="none" className={input} /></F>
                </div>
                <F label="Now linked as (optional)" className="mt-2">
                  <select name="plaid_account_id" defaultValue="" className={input}>
                    <option value="">Not in Plaid</option>
                    {(plaid.data ?? []).map((a) => <option key={a.account_id} value={a.account_id}>{a.account_name} •{a.mask}</option>)}
                  </select>
                </F>
                <p className="mt-2 text-xs text-[var(--m-muted)]">Updated {day(m.updated_at)}</p>
                <button className={save} style={{ background: "var(--m-accent)" }}>Save balance</button>
              </form>
              <form action={deleteManualAccount} className="mt-2 text-right">
                <input type="hidden" name="id" value={m.id} />
                <button className="min-h-9 text-xs" style={{ color: "var(--m-alert)" }}>Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--m-accent)" }}>Add an account</summary>
          <form action={upsertManualAccount} className="mt-3 grid grid-cols-2 gap-3">
            <F label="Name" className="col-span-2"><input name="name" required placeholder="Citi Simplicity •5517" className={input} /></F>
            <F label="Type">
              <select name="kind" className={input} defaultValue="credit">
                {["credit", "loan", "cash", "crypto", "other"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </F>
            <F label="Whose">
              <select name="entity" className={input} defaultValue="personal">
                {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
              </select>
            </F>
            <F label="Balance"><input name="balance" inputMode="decimal" placeholder="0" className={input} /></F>
            <F label="Limit"><input name="limit_balance" inputMode="decimal" placeholder="none" className={input} /></F>
            <F label="Notes" className="col-span-2"><input name="notes" placeholder="0% until March 2027" className={input} /></F>
            <button className={`${save} col-span-2`} style={{ background: "var(--m-accent)" }}>Add</button>
          </form>
        </details>
      </section>

      <section className="money-card mt-4 p-5">
        <h2 className="text-sm font-medium">Properties</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">Values and mortgage balances last entered {day(v.freshness.propertyValuesAsOf)}. Saving a row stamps today. “Debt is in Plaid” means the loan already shows as a linked account (the 58th St HELOC), so it isn&apos;t counted twice.</p>
        <ul className="mt-3 space-y-4">
          {(props.data ?? []).map((p) => (
            <li key={p.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--m-line)" }}>
              <form action={updateProperty}>
                <input type="hidden" name="id" value={p.id} />
                <p className="font-medium">{p.address}</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <F label="Value"><input name="current_value" inputMode="decimal" defaultValue={p.current_value ?? ""} className={input} /></F>
                  <F label="Mortgage balance"><input name="debt_balance" inputMode="decimal" defaultValue={p.debt_balance ?? ""} className={input} /></F>
                  <F label="Rate %"><input name="mortgage_rate" inputMode="decimal" defaultValue={p.mortgage_rate ?? ""} className={input} /></F>
                  <label className="flex min-h-11 items-end gap-2 pb-2 text-sm"><input type="checkbox" name="debt_in_plaid" defaultChecked={!!p.debt_in_plaid} className="h-5 w-5 accent-[var(--m-accent)]" /> Debt is in Plaid</label>
                </div>
                <F label="Notes" className="mt-2"><input name="notes" defaultValue={p.notes ?? ""} className={input} /></F>
                <p className="mt-2 text-xs text-[var(--m-muted)]">Last updated {day(p.last_updated)}</p>
                <button className={save} style={{ background: "var(--m-accent)" }}>Save</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="money-card mt-4 p-5">
        <h2 className="text-sm font-medium">Investments & crypto</h2>
        <p className="mt-1 text-xs text-[var(--m-muted)]">“In Plaid” rows are already counted through the linked account and are shown for reference only.</p>
        <ul className="mt-3 space-y-4">
          {(invest.data ?? []).map((i) => (
            <li key={i.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--m-line)" }}>
              <form action={upsertInvestment}>
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="account_name" value={i.account_name} />
                <input type="hidden" name="account_type" value={i.account_type ?? "other"} />
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{i.account_name}</p>
                  <span className="text-xs text-[var(--m-muted)]">{i.account_type}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <F label="Balance"><input name="current_balance" inputMode="decimal" defaultValue={i.current_balance ?? ""} className={input} /></F>
                  <label className="flex min-h-11 items-end gap-2 pb-2 text-sm"><input type="checkbox" name="in_plaid" defaultChecked={!!i.in_plaid} className="h-5 w-5 accent-[var(--m-accent)]" /> In Plaid</label>
                </div>
                <p className="mt-2 text-xs text-[var(--m-muted)]">Last updated {day(i.last_updated)}</p>
                <button className={save} style={{ background: "var(--m-accent)" }}>Save</button>
              </form>
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--m-accent)" }}>Add an investment or crypto</summary>
          <form action={upsertInvestment} className="mt-3 grid grid-cols-2 gap-3">
            <F label="Name" className="col-span-2"><input name="account_name" required placeholder="Bitcoin (Coinbase)" className={input} /></F>
            <F label="Type">
              <select name="account_type" className={input} defaultValue="crypto">
                {["crypto", "brokerage", "retirement", "other"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </F>
            <F label="Balance"><input name="current_balance" inputMode="decimal" placeholder="0" className={input} /></F>
            <button className={`${save} col-span-2`} style={{ background: "var(--m-accent)" }}>Add</button>
          </form>
        </details>
      </section>
    </Shell>
  );
}
