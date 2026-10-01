"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; netWorth: number };

const short = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function NetWorthTrend({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-[var(--m-muted)]">
        The trend line fills in as nightly snapshots arrive.
      </p>
    );
  }
  return (
    <div className="h-36 -mx-2" aria-label="Net worth over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--m-accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--m-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 11, fill: "var(--m-muted)" }} axisLine={false} tickLine={false} minTickGap={40} interval="preserveStartEnd" />
          <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
          <Tooltip
            formatter={(v: number) => [money(v), "Net worth"]}
            labelFormatter={short}
            contentStyle={{ background: "var(--m-card)", border: "1px solid var(--m-line)", borderRadius: 12, fontSize: 13 }}
          />
          <Area type="monotone" dataKey="netWorth" stroke="var(--m-accent)" strokeWidth={2} fill="url(#nw-fill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
