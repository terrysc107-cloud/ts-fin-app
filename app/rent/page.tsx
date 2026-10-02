import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Shell, usd } from "@/components/Shell";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { easternToday } from "@/lib/money";
import { monthLabel, shiftMonth, TAGGED_COLS, type Tagged } from "@/lib/tagged";
import { addRenovationCost, deleteRenovationCost, deleteUnit, recordRent, upsertUnit } from "@/app/actions";

export const dynamic = "force-dynamic";

type Unit = { id: string; property_id: string; name: string; tenant_name: string | null; monthly_rent: number | string; status: string; lease_end: string | null; notes: string | null };
type Ledger = { unit_id: string; period: string; due: number | string; received: number | string; received_on: string | null; note: string | null };
type Reno = { id: string; property_id: string; date: string; vendor: string | null; amount: number | string; note: string | null };

const n = (v: unknown) => Number(v ?? 0) || 0;
const input = "mt-1 block min-h-11 w-full rounded-xl border bg-transparent px-3 text-base [border-color:var(--m-line)]";
const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  occupied: { fg: "var(--m-accent)", bg: "var(--m-accent-soft)" },
  vacant: { fg: "var(--m-alert)", bg: "var(--m-alert-soft)" },
  renovating: { fg: "var(--m-warn)", bg: "var(--m-warn-soft)" },
};

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-xs font-medium text-[var(--m-muted)] ${className}`}>{label}{children}</label>;
}

export default async function Page({ searchParams }: { searchParams: { month?: string } }) {
  const today = easternToday();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : today.toISOString().slice(0, 7);
  const sb = createServerClient();
  const [props, units, ledger, reno, tagged] = await Promise.all([
    sb.from("properties").select("id,address,monthly_rent,vacancy_status").eq("client_id", CLIENT_ID).order("address"),
    sb.from("property_units").select("id,property_id,name,tenant_name,monthly_rent,status,lease_end,notes").order("name"),
    sb.from("rent_ledger").select("unit_id,period,due,received,received_on,note").eq("period", month),
    sb.from("renovation_costs").select("id,property_id,date,vendor,amount,note").order("date", { ascending: false }),
    sb.from("transactions_tagged").select(TAGGED_COLS).not("property_id", "is", null).order("date", { ascending: false }).limit(2000),
  ]);
  for (const r of [props]) if (r.error) throw new Error(r.error.message);
  // The rent tables may not exist yet (migration pending): show empty state instead of failing.
  const unitRows = (units.data ?? []) as Unit[];
  const ledgerRows = (ledger.data ?? []) as Ledger[];
  const renoRows = (reno.data ?? []) as Reno[];
  const taggedRows = (tagged.data ?? []) as Tagged[];
  const pending = units.error || ledger.error || reno.error;

  const occupied = unitRows.filter((u) => u.status === "occupied");
  const due = occupied.reduce((s, u) => s + n(ledgerRows.find((l) => l.unit_id === u.id)?.due ?? u.monthly_rent), 0);
  const received = ledgerRows.reduce((s, l) => s + n(l.received), 0);
  const vacant = unitRows.filter((u) => u.status !== "occupied").length;

  return (
    <Shell
      current="/rent"
      kicker="Units, rent and renovation"
      title="Rent"
      aside={
        <div className="flex items-center gap-1 text-sm">
          <Link href={`/rent?month=${shiftMonth(month, -1)}`} className="money-card rounded-full p-2" aria-label="Previous month"><ChevronLeft size={18} /></Link>
          <span className="min-w-[7rem] text-center font-medium">{monthLabel(month)}</span>
          <Link href={`/rent?month=${shiftMonth(month, 1)}`} className="money-card rounded-full p-2" aria-label="Next month"><ChevronRight size={18} /></Link>
        </div>
      }
    >
      {pending && (
        <p className="money-card mb-4 p-4 text-sm" style={{ color: "var(--m-warn)" }}>
          The rent tables aren&apos;t in the database yet. Apply the migration 20261004000000_rent.sql and this page fills in.
        </p>
      )}

      <section className="money-card p-5">
        <h2 className="text-sm text-[var(--m-muted)]">{monthLabel(month)} rent</h2>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
          {usd(received)} <span className="text-base font-normal text-[var(--m-muted)]">of {usd(due)} received</span>
        </p>
        <div className="mt-3 h-2.5 rounded-full" style={{ background: "var(--m-accent-soft)" }}>
          <div className="h-2.5 rounded-full" style={{ width: `${due > 0 ? Math.min(100, (received / due) * 100) : 0}%`, background: "var(--m-accent)" }} />
        </div>
        <p className="mt-2 text-sm text-[var(--m-muted)]">
          {occupied.length} occupied, {vacant} {vacant === 1 ? "unit" : "units"} not renting{unitRows.length === 0 && ". Add units under each property to start tracking"}.
        </p>
      </section>

      {(props.data ?? []).map((p) => {
        const pu = unitRows.filter((u) => u.property_id === p.id);
        const costs = renoRows.filter((r) => r.property_id === p.id);
        const cardSpend = taggedRows.filter((t) => t.property_id === p.id);
        const renoTotal = costs.reduce((s, r) => s + n(r.amount), 0) + cardSpend.reduce((s, t) => s + Math.max(0, n(t.amount)), 0);
        return (
          <section key={p.id} className="money-card mt-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{p.address}</h2>
              <span className="text-sm tabular-nums text-[var(--m-muted)]">{usd(pu.filter((u) => u.status === "occupied").reduce((s, u) => s + n(u.monthly_rent), 0))}/mo</span>
            </div>

            <ul className="mt-3 space-y-3">
              {pu.map((u) => {
                const l = ledgerRows.find((x) => x.unit_id === u.id);
                const uDue = n(l?.due ?? u.monthly_rent);
                const uRec = n(l?.received);
                const tone = STATUS_TONE[u.status] ?? STATUS_TONE.vacant;
                return (
                  <li key={u.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--m-line)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{u.name}{u.tenant_name && <span className="text-[var(--m-muted)]"> · {u.tenant_name}</span>}</p>
                        <p className="text-xs text-[var(--m-muted)]">{usd(n(u.monthly_rent))}/mo{u.lease_end && ` · lease ends ${u.lease_end}`}</p>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: tone.bg, color: tone.fg }}>{u.status}</span>
                    </div>

                    {u.status === "occupied" && (
                      <form action={recordRent} className="mt-3 flex items-end gap-2">
                        <input type="hidden" name="unit_id" value={u.id} />
                        <input type="hidden" name="period" value={month} />
                        <input type="hidden" name="due" value={uDue} />
                        <F label={`Received of ${usd(uDue)}`} className="flex-1"><input name="received" inputMode="decimal" defaultValue={uRec || ""} placeholder="0" className={input} /></F>
                        <button className="min-h-11 rounded-xl border px-3 text-sm font-medium" style={{ borderColor: "var(--m-line)" }}>Save</button>
                        <button name="paid_in_full" value="1" className="min-h-11 rounded-xl px-3 text-sm font-semibold text-white" style={{ background: uRec >= uDue && uDue > 0 ? "var(--m-muted)" : "var(--m-accent)" }}>
                          {uRec >= uDue && uDue > 0 ? "Paid" : "Mark paid"}
                        </button>
                      </form>
                    )}

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs" style={{ color: "var(--m-accent)" }}>Edit unit</summary>
                      <form action={upsertUnit} className="mt-2 grid grid-cols-2 gap-3">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="property_id" value={p.id} />
                        <F label="Unit"><input name="name" defaultValue={u.name} required className={input} /></F>
                        <F label="Tenant"><input name="tenant_name" defaultValue={u.tenant_name ?? ""} className={input} /></F>
                        <F label="Rent /mo"><input name="monthly_rent" inputMode="decimal" defaultValue={n(u.monthly_rent)} className={input} /></F>
                        <F label="Status">
                          <select name="status" defaultValue={u.status} className={input}>
                            {["occupied", "vacant", "renovating"].map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </F>
                        <F label="Lease ends"><input type="date" name="lease_end" defaultValue={u.lease_end ?? ""} className={input} /></F>
                        <F label="Notes"><input name="notes" defaultValue={u.notes ?? ""} className={input} /></F>
                        <button className="col-span-2 min-h-11 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--m-accent)" }}>Save unit</button>
                      </form>
                      <form action={deleteUnit} className="mt-2 text-right">
                        <input type="hidden" name="id" value={u.id} />
                        <button className="min-h-9 text-xs" style={{ color: "var(--m-alert)" }}>Remove unit</button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--m-accent)" }}>Add a unit</summary>
              <form action={upsertUnit} className="mt-2 grid grid-cols-2 gap-3">
                <input type="hidden" name="property_id" value={p.id} />
                <F label="Unit"><input name="name" required placeholder="1st floor" className={input} /></F>
                <F label="Tenant"><input name="tenant_name" placeholder="Optional" className={input} /></F>
                <F label="Rent /mo"><input name="monthly_rent" inputMode="decimal" placeholder="0" className={input} /></F>
                <F label="Status">
                  <select name="status" defaultValue="vacant" className={input}>
                    {["occupied", "vacant", "renovating"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </F>
                <button className="col-span-2 min-h-11 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--m-accent)" }}>Add unit</button>
              </form>
            </details>

            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--m-line)" }}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium">Renovation costs</h3>
                <span className="text-sm font-semibold tabular-nums">{usd(renoTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--m-muted)]">Card purchases you tagged to this property plus anything typed here.</p>
              <ul className="mt-2 divide-y divide-[var(--m-line)] text-sm">
                {cardSpend.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex justify-between py-2">
                    <span className="truncate">{t.merchant_name ?? t.name} <span className="text-xs text-[var(--m-muted)]">{t.date} · card</span></span>
                    <span className="tabular-nums">{usd(n(t.amount))}</span>
                  </li>
                ))}
                {costs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate">{r.vendor ?? r.note ?? "Cost"} <span className="text-xs text-[var(--m-muted)]">{r.date}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{usd(n(r.amount))}</span>
                      <form action={deleteRenovationCost}><input type="hidden" name="id" value={r.id} /><button className="text-xs" style={{ color: "var(--m-alert)" }} aria-label="Remove cost">×</button></form>
                    </span>
                  </li>
                ))}
                {cardSpend.length > 8 && <li className="py-2 text-xs text-[var(--m-muted)]">+{cardSpend.length - 8} more tagged purchases</li>}
              </ul>
              <form action={addRenovationCost} className="mt-2 grid grid-cols-3 gap-2">
                <input type="hidden" name="property_id" value={p.id} />
                <F label="Vendor"><input name="vendor" placeholder="Contractor" className={input} /></F>
                <F label="Amount"><input name="amount" inputMode="decimal" required placeholder="0" className={input} /></F>
                <F label="Date"><input type="date" name="date" className={input} /></F>
                <button className="col-span-3 min-h-11 rounded-xl border text-sm font-medium" style={{ borderColor: "var(--m-line)" }}>Add cost</button>
              </form>
            </div>
          </section>
        );
      })}
    </Shell>
  );
}
