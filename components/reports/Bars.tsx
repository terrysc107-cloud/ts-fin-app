"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { key: string; total: number; label?: string };

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Compact bar chart in the same tokens as NetWorthTrend. `highlight` marks one bar. */
export function Bars({ points, highlight, height = 140 }: { points: Point[]; highlight?: string; height?: number }) {
  if (points.length === 0) return <p className="text-sm text-[var(--m-muted)]">No spending to chart.</p>;
  return (
    <div style={{ height }} className="-mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey={(p: Point) => p.label ?? p.key} tick={{ fontSize: 11, fill: "var(--m-muted)" }} axisLine={false} tickLine={false} interval={0} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "var(--m-bg)" }}
            formatter={(v: number) => [money(v), "Spent"]}
            contentStyle={{ background: "var(--m-card)", border: "1px solid var(--m-line)", borderRadius: 12, fontSize: 13 }}
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.key} fill={p.key === highlight ? "var(--m-ink)" : "var(--m-accent)"} fillOpacity={highlight && p.key !== highlight ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
