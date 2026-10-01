import "server-only";
import { createServerClient } from "@/lib/supabase";

// Shapes written by scripts/hq-push.mjs (hourly, from Terry's Mac).

export type TodayPayload = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  calendar: { title: string; start: string; end: string }[];
  conflicts: number;
  doing: { item: string; nextAction: string; priority: string; domain: string; due: string | null; status: string }[];
  counts: { doing?: number; planned?: number; waiting?: number; hold?: number; waitingDelegated?: number };
  workOrders: { request: string; property: string; urgency: string; status: string; due: string | null; safety: boolean }[];
  sourceErrors: unknown[];
  jobs: { total: number; failing: { name: string; lastRun: string | null; error: string; streak: number | null }[] };
  gateways: { name: string; running: boolean; lastExit: number }[];
};

export type VenturesPayload = {
  ok: boolean;
  error?: string;
  ventures: { key: string; title: string; level: string; score: number; reasons: string[]; notes: string[]; branch: string | null }[];
  deadlines: { date: string; label: string; venture: string; days: number }[];
};

export type Hq = {
  today: (TodayPayload & { updatedAt: string }) | null;
  ventures: (VenturesPayload & { updatedAt: string }) | null;
};

export async function getHq(): Promise<Hq> {
  const { data, error } = await createServerClient().from("hq_status").select("key,payload,updated_at");
  if (error) throw new Error(error.message);
  const row = (k: string) => {
    const r = data?.find((x) => x.key === k);
    return r ? { ...r.payload, updatedAt: r.updated_at as string } : null;
  };
  return { today: row("today"), ventures: row("ventures") };
}
