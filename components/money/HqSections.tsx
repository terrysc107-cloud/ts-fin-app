import { AlertTriangle, CalendarClock, CheckCircle2, Hammer, Server } from "lucide-react";
import type { Hq, TodayPayload, VenturesPayload } from "@/lib/hq";

const TZ = "America/New_York";
const etDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

function when(iso: string, now: Date) {
  const d = new Date(iso);
  const day = etDay(d) === etDay(now) ? "Today" : etDay(d) === etDay(new Date(now.getTime() + 86_400_000)) ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
  return `${day} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;
}

function ago(iso: string, now: Date) {
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  return min < 60 ? `${Math.max(min, 0)} min ago` : `${Math.round(min / 60)} h ago`;
}

/** Shown when the Mac hasn't pushed for 3+ hours, or the section failed to collect. */
function Freshness({ updatedAt, ok, error, now }: { updatedAt: string; ok: boolean; error?: string; now: Date }) {
  const stale = now.getTime() - new Date(updatedAt).getTime() > 3 * 3_600_000;
  if (ok && !stale) return <p className="text-xs text-[var(--m-muted)]">Updated {ago(updatedAt, now)}</p>;
  return (
    <p className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--m-warn-soft)", color: "var(--m-warn)" }}>
      {ok ? `The Mac last checked in ${ago(updatedAt, now)}. It may be asleep or off.` : `Couldn't collect this section: ${error}`}
    </p>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="money-card p-5">
      <div className="flex items-center gap-2 text-sm text-[var(--m-muted)]">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Today({ t, now }: { t: TodayPayload & { updatedAt: string }; now: Date }) {
  const todayIso = etDay(now);
  const downGateways = (t.gateways ?? []).filter((g) => !g.running);
  const failing = t.jobs?.failing ?? [];
  const urgent = (t.workOrders ?? []).filter((w) => w.safety || /urgent/i.test(w.urgency));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card icon={<CalendarClock size={16} strokeWidth={2} />} title="Coming up">
        {t.calendar?.length ? (
          <ul className="space-y-2 text-sm">
            {t.calendar.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-36 shrink-0 whitespace-nowrap tabular-nums text-[var(--m-muted)]">{when(e.start, now)}</span>
                <span>{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--m-muted)]">Nothing on the calendar in the next day and a half.</p>
        )}
        {t.conflicts > 0 && <p className="mt-2 text-sm" style={{ color: "var(--m-warn)" }}>{t.conflicts} overlapping events</p>}
      </Card>

      <Card icon={<CheckCircle2 size={16} strokeWidth={2} />} title="What you're working on">
        {t.doing?.length ? (
          <ul className="space-y-3 text-sm">
            {t.doing.map((d, i) => {
              const overdue = d.due && d.due < todayIso;
              return (
                <li key={i}>
                  <p className="font-medium">{d.item}</p>
                  {d.nextAction && <p className="text-[var(--m-muted)]">Next: {d.nextAction}</p>}
                  <p className="text-xs text-[var(--m-muted)]">
                    {d.domain}
                    {d.due && (
                      <span style={overdue ? { color: "var(--m-warn)" } : undefined}>
                        {" "}· due {d.due}{overdue ? " (past due)" : ""}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-[var(--m-muted)]">Nothing marked Doing in Notion.</p>
        )}
        <p className="mt-3 text-xs text-[var(--m-muted)]">
          {t.counts?.planned ?? 0} planned, {t.counts?.waiting ?? 0} waiting, {t.counts?.waitingDelegated ?? 0} delegated, {t.counts?.hold ?? 0} on hold
        </p>
      </Card>

      <Card icon={<Hammer size={16} strokeWidth={2} />} title="Property work orders">
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums">{t.workOrders?.length ?? 0}</span> open
          {urgent.length > 0 && <span style={{ color: "var(--m-warn)" }}>, {urgent.length} urgent or safety</span>}
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(t.workOrders ?? []).slice(0, 3).map((w, i) => (
            <li key={i}>
              <p>{w.request}</p>
              <p className="text-xs text-[var(--m-muted)]">{w.property} · {w.status}{w.due ? ` · due ${w.due}` : ""}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card icon={<Server size={16} strokeWidth={2} />} title="Hermes">
        {failing.length === 0 && downGateways.length === 0 ? (
          <p className="text-sm">All {t.jobs?.total ?? 0} jobs and every gateway look healthy.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {downGateways.length > 0 && (
              <li style={{ color: "var(--m-warn)" }}>
                {downGateways.length} gateway{downGateways.length > 1 ? "s" : ""} down: {downGateways.map((g) => g.name).join(", ")}
              </li>
            )}
            {failing.map((j, i) => (
              <li key={i}>
                <p style={{ color: "var(--m-warn)" }}>{j.name} failed</p>
                <p className="truncate text-xs text-[var(--m-muted)]">{j.error}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[var(--m-muted)]">{t.jobs?.total ?? 0} scheduled jobs watched</p>
      </Card>
    </div>
  );
}

const LEVEL: Record<string, { fg: string; bg: string; label: string }> = {
  critical: { fg: "var(--m-alert)", bg: "var(--m-alert-soft)", label: "Needs you" },
  elevated: { fg: "var(--m-warn)", bg: "var(--m-warn-soft)", label: "Watch" },
};

function Ventures({ v }: { v: VenturesPayload }) {
  const top = v.ventures.filter((x) => x.level === "critical" || x.level === "elevated").slice(0, 5);
  const rest = v.ventures.filter((x) => !top.includes(x));
  const overdue = (v.deadlines ?? []).filter((d) => d.days < 0);
  const upcoming = (v.deadlines ?? []).filter((d) => d.days >= 0);

  return (
    <div className="space-y-4">
      {(overdue.length > 0 || upcoming.length > 0) && (
        <section className="money-card p-5 text-sm">
          {overdue.map((d) => (
            <p key={d.label} className="flex gap-2" style={{ color: "var(--m-alert)" }}>
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>{d.label}: {-d.days} days past its {d.date} deadline</span>
            </p>
          ))}
          {upcoming.map((d) => (
            <p key={d.label}>{d.label}: in {d.days} days ({d.date})</p>
          ))}
        </section>
      )}

      <ul className="space-y-3">
        {top.map((x) => {
          const l = LEVEL[x.level] ?? LEVEL.elevated;
          return (
            <li key={x.key} className="money-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{x.title}</h3>
                <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ color: l.fg, background: l.bg }}>
                  {l.label}
                </span>
              </div>
              {x.notes[0] && <p className="mt-2 text-sm">Next: {x.notes[0]}</p>}
              <p className="mt-2 text-xs text-[var(--m-muted)]">{x.reasons.join(", ")}</p>
            </li>
          );
        })}
      </ul>

      {rest.length > 0 && (
        <details className="money-card p-5 text-sm">
          <summary className="cursor-pointer text-[var(--m-muted)]">{rest.length} more, in good shape</summary>
          <ul className="mt-3 space-y-1">
            {rest.map((x) => (
              <li key={x.key} className="flex justify-between gap-3">
                <span>{x.title}</span>
                <span className="text-xs text-[var(--m-muted)]">{x.reasons[0] ?? "clean"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SectionHead({ id, title, sub }: { id: string; title: string; sub?: React.ReactNode }) {
  return (
    <div id={id} className="mb-3 mt-10 scroll-mt-20">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub}
    </div>
  );
}

export function HqSections({ hq, now }: { hq: Hq | null; now: Date }) {
  return (
    <>
      <SectionHead
        id="today"
        title="Today"
        sub={hq?.today && <Freshness updatedAt={hq.today.updatedAt} ok={hq.today.ok} error={hq.today.error} now={now} />}
      />
      {hq?.today?.ok ? (
        <Today t={hq.today} now={now} />
      ) : (
        !hq?.today && <p className="text-sm text-[var(--m-muted)]">Waiting for the Mac's first check-in.</p>
      )}

      <SectionHead
        id="ventures"
        title="Ventures"
        sub={hq?.ventures && <Freshness updatedAt={hq.ventures.updatedAt} ok={hq.ventures.ok} error={hq.ventures.error} now={now} />}
      />
      {hq?.ventures?.ok ? (
        <Ventures v={hq.ventures} />
      ) : (
        !hq?.ventures && <p className="text-sm text-[var(--m-muted)]">Waiting for the Mac's first check-in.</p>
      )}
    </>
  );
}

