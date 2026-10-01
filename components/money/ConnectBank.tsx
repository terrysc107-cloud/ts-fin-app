"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

type PlaidHandler = { open: () => void };
declare global {
  interface Window {
    Plaid?: {
      create: (cfg: {
        token: string;
        onSuccess: (publicToken: string, meta: { institution?: { name?: string } }) => void;
        onExit: (err: { display_message?: string; error_message?: string } | null) => void;
      }) => PlaidHandler;
    };
  }
}

// Plaid's own Link script, loaded on demand (no npm dependency).
function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Plaid"));
    document.head.appendChild(s);
  });
}

export function ConnectBank({ linkedBanks, accountNames }: { linkedBanks: number; accountNames: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function start() {
    setState("busy");
    setMsg("");
    try {
      const [tokenRes] = await Promise.all([fetch("/api/plaid/link-token", { method: "POST" }), loadPlaid()]);
      const { link_token, error } = await tokenRes.json();
      if (!link_token) throw new Error(error ?? "Couldn't start Plaid");

      window.Plaid!.create({
        token: link_token,
        onSuccess: async (public_token, meta) => {
          const res = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_token }),
          });
          const out = await res.json();
          if (!res.ok) {
            setState("error");
            setMsg(out.error ?? "Couldn't save the connection");
            return;
          }
          setState("done");
          setMsg(`${meta.institution?.name ?? "Bank"} connected. Its accounts appear after tonight's 2 AM sync.`);
        },
        onExit: (err) => {
          setState(err ? "error" : "idle");
          setMsg(err ? err.display_message ?? err.error_message ?? "Plaid closed with an error" : "");
        },
      }).open();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="money-card mt-4 p-5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Connect a bank</h2>
          <p className="mt-1 text-[var(--m-muted)]">
            {linkedBanks} bank logins connected. Linking one of those again creates a duplicate.
          </p>
        </div>
        <button
          onClick={start}
          disabled={state === "busy"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 font-medium active:scale-[0.98] disabled:opacity-50"
          style={{ background: "var(--m-accent)", color: "var(--m-card)" }}
        >
          <Plus size={16} strokeWidth={2} />
          {state === "busy" ? "Opening" : "Connect"}
        </button>
      </div>
      {accountNames.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[var(--m-muted)]">See the {accountNames.length} connected accounts</summary>
          <p className="mt-2 text-[var(--m-muted)]">{accountNames.join(", ")}</p>
        </details>
      )}
      {msg && (
        <p className="mt-3 rounded-xl px-3 py-2" style={state === "done" ? { background: "var(--m-accent-soft)", color: "var(--m-accent)" } : { background: "var(--m-warn-soft)", color: "var(--m-warn)" }}>
          {msg}
        </p>
      )}
    </section>
  );
}
