// Hourly push from Terry's Mac to the dashboard (run by launchd: com.terry.hq-push).
//   - Money: today's net worth snapshot (same math as the page, from lib/money.ts)
//   - Today: calendar, Notion "doing" items, work orders, Hermes job + gateway health
//   - Ventures: Terry OS risk sweep + deadlines
// Each section fails on its own; a failure is recorded in that section's payload.
// Usage: node scripts/hq-push.mjs [--dry-run]
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { computeMoneyView, snapshotRow } from "../lib/money.ts";
import { applyRules } from "../lib/tags.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = homedir();
const DRY = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const firstLine = (s) => String(s ?? "").split("\n").find((l) => l.trim()) ?? "";

async function money() {
  const v = await computeMoneyView(sb);
  const row = snapshotRow(v);
  if (!DRY) {
    const { error } = await sb.from("net_worth_snapshots").upsert(row, { onConflict: "client_id,snapshot_date" });
    if (error) throw new Error(error.message);
  }
  return { netWorth: v.netWorth, date: row.snapshot_date };
}

/** Apply Terry's "always tag X like this" rules to transactions that have no tag yet. Manual tags win. */
async function tags() {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [rulesRes, txRes] = await Promise.all([
    sb.from("tag_rules").select("id,pattern,entity,domain_tag,budget_key,property_id").order("created_at"),
    sb.from("transactions_tagged").select("id,merchant_name,name").eq("overridden", false).gte("date", since).limit(10000),
  ]);
  for (const r of [rulesRes, txRes]) if (r.error) throw new Error(r.error.message);
  const rows = applyRules(rulesRes.data, txRes.data);
  if (!DRY) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("transaction_overrides").upsert(rows.slice(i, i + 500), { onConflict: "public_transaction_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }
  return { rules: rulesRes.data.length, tagged: rows.length };
}

function hermesJobs() {
  const files = [join(HOME, ".hermes/cron/jobs.json")];
  const profiles = join(HOME, ".hermes/profiles");
  if (existsSync(profiles)) {
    for (const p of execFileSync("ls", [profiles], { encoding: "utf8" }).split("\n").filter(Boolean)) {
      const f = join(profiles, p, "cron/jobs.json");
      if (existsSync(f)) files.push(f);
    }
  }
  const failing = [];
  let total = 0;
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const jobs = Array.isArray(j) ? j : Array.isArray(j.jobs) ? j.jobs : Object.values(j.jobs ?? j);
    for (const job of jobs) {
      if (job.enabled === false) continue;
      total++;
      if (job.last_status === "error") {
        failing.push({ name: job.name, lastRun: job.last_run_at, error: firstLine(job.last_error).slice(0, 160), streak: job.failure_streak ?? null });
      }
    }
  }
  return { total, failing };
}

function hermesGateways() {
  // launchctl list: "PID  LastExit  Label". No PID = not running.
  return execFileSync("launchctl", ["list"], { encoding: "utf8" })
    .split("\n")
    .filter((l) => /\tai\.hermes\.gateway/.test(l))
    .map((l) => {
      const [pid, exit, label] = l.split("\t");
      return { name: label.replace("ai.hermes.gateway-", "").replace("ai.hermes.gateway", "main"), running: pid !== "-", lastExit: Number(exit) };
    });
}

async function today() {
  const res = await fetch("http://127.0.0.1:9120/api/dashboard?refresh=1", { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`command dashboard HTTP ${res.status}`);
  const d = await res.json();
  const o = d.overview ?? {};
  const item = (x) => ({ item: x.item, nextAction: x.next_action, priority: x.priority, domain: x.domain, due: x.due || null, status: x.status });
  return {
    generatedAt: d.generated_at,
    // Titles and times only: meeting links carry passcodes.
    calendar: (o.calendar ?? []).map((e) => ({ title: e.title, start: e.start, end: e.end })),
    conflicts: (o.conflicts ?? []).length,
    doing: (o.outcomes ?? []).map(item),
    counts: { ...(o.productivity ?? {}), waitingDelegated: Number(o.waiting_delegated_count ?? 0) },
    workOrders: (d.operations?.open_work_orders ?? []).map((w) => ({
      request: w.request, property: w.property_name || w.property, urgency: w.urgency, status: w.status, due: w.due_date || null, safety: w.safety_flag === true || w.safety_flag === "True",
    })),
    sourceErrors: d.source_errors ?? [],
    jobs: hermesJobs(),
    gateways: hermesGateways(),
  };
}

function ventures() {
  const core = createRequire(import.meta.url)(join(HOME, "code/terry-os/lib/core.js"));
  const reg = core.loadRegistry();
  return {
    ventures: core.sweep(reg).map((v) => ({
      key: v.key, title: v.title, level: v.level, score: v.score, reasons: v.reasons ?? [], notes: v.notes ?? [], branch: v.branch ?? null,
    })),
    deadlines: core.upcomingDeadlines(reg),
  };
}

async function put(key, fn) {
  let payload;
  try {
    payload = { ok: true, ...(await fn()) };
  } catch (e) {
    payload = { ok: false, error: String(e?.message ?? e) };
  }
  if (DRY) console.log(key, JSON.stringify(payload).slice(0, 400));
  else if (key !== "money" && key !== "tags") {
    const { error } = await sb.from("hq_status").upsert({ key, payload, updated_at: new Date().toISOString() });
    if (error) payload = { ok: false, error: error.message };
  }
  console.log(`${new Date().toISOString()} ${key}: ${payload.ok ? "ok" : `FAILED ${payload.error}`}`);
  return payload.ok;
}

const results = [await put("money", money), await put("tags", tags), await put("today", today), await put("ventures", ventures)];
process.exit(results.every(Boolean) ? 0 : 1);
