"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { setOverride } from "@/app/actions";
import { DOMAIN_LABEL, DOMAIN_TAGS, ENTITIES, ENTITY_LABEL, ENTITY_TONE, type Entity } from "@/lib/tags";
import type { Tagged } from "@/lib/tagged";

export type Choices = { properties: { id: string; address: string }[]; budgetLines: { key: string; label: string }[] };

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/** Bottom sheet to tag one transaction. Submits the server action and closes. */
export function TagSheet({ t, choices, children }: { t: Tagged; choices: Choices; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [entity, setEntity] = useState<string>(t.overridden ? t.entity : "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const merchant = t.merchant_name ?? t.name ?? "Unknown";
  const amount = Number(t.amount) || 0;
  const mismatch = entity && entity !== t.account_entity;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="money fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] p-5 pb-8 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4"
          style={{ background: "var(--m-card)", color: "var(--m-ink)" }}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--m-line)]" />
          <Dialog.Title className="text-lg font-semibold">{merchant}</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-sm text-[var(--m-muted)]">
            {usd(Math.abs(amount))} {amount < 0 ? "in" : "out"} · {t.account_name ?? "Account"} •{t.mask} ({ENTITY_LABEL[t.account_entity as Entity] ?? t.account_entity} card) · {t.date}
          </Dialog.Description>

          <form
            className="mt-5 space-y-5"
            action={(fd) =>
              start(async () => {
                try {
                  setErr(null);
                  await setOverride(fd);
                  setOpen(false);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
              })
            }
          >
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="merchant" value={merchant} />

            <fieldset>
              <legend className="text-sm font-medium">Whose money</legend>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {ENTITIES.map((e) => {
                  const on = entity === e;
                  const tone = ENTITY_TONE[e];
                  return (
                    <label key={e} className="cursor-pointer">
                      <input type="radio" name="entity" value={e} checked={on} onChange={() => setEntity(e)} className="sr-only" />
                      <span
                        className="block min-h-11 rounded-xl border px-2 py-2.5 text-center text-sm font-medium leading-tight"
                        style={on ? { background: tone.bg, color: tone.fg, borderColor: tone.fg } : { borderColor: "var(--m-line)" }}
                      >
                        {ENTITY_LABEL[e].split(" ")[0]}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: mismatch ? "var(--m-warn)" : "var(--m-muted)" }}>
                {mismatch
                  ? `This is on a ${ENTITY_LABEL[t.account_entity as Entity]} card. Tagging it ${ENTITY_LABEL[entity as Entity]} moves it in reports only.`
                  : entity
                    ? "Matches the card it was paid with."
                    : `Leave blank to keep the card's default (${ENTITY_LABEL[t.account_entity as Entity] ?? t.account_entity}).`}
              </p>
            </fieldset>

            <Field label="What it was for">
              <select name="domain_tag" defaultValue={t.overridden ? t.domain_tag : ""} className={sel}>
                <option value="">Keep: {DOMAIN_LABEL[t.domain_tag as keyof typeof DOMAIN_LABEL] ?? t.domain_tag}</option>
                {DOMAIN_TAGS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABEL[d]}</option>
                ))}
              </select>
            </Field>

            <Field label="Budget line (personal only)">
              <select name="budget_key" defaultValue={t.budget_key ?? ""} className={sel}>
                <option value="">Keep: by Plaid category</option>
                {choices.budgetLines.map((b) => (
                  <option key={b.key} value={b.key}>{b.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Property (for rental costs)">
              <select name="property_id" defaultValue={t.property_id ?? ""} className={sel}>
                <option value="">None</option>
                {choices.properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </Field>

            <Field label="Note">
              <input name="note" defaultValue={t.note ?? ""} placeholder="Optional" className={sel} />
            </Field>

            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="always" className="h-5 w-5 accent-[var(--m-accent)]" />
              Always tag <span className="font-medium">{merchant}</span> like this
            </label>

            {err && <p className="text-sm" style={{ color: "var(--m-alert)" }}>{err}</p>}

            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="min-h-12 flex-1 rounded-xl font-semibold text-white active:scale-[0.99] disabled:opacity-60" style={{ background: "var(--m-accent)" }}>
                {pending ? "Saving…" : "Save"}
              </button>
              {t.overridden && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", t.id);
                    start(async () => {
                      await setOverride(fd);
                      setOpen(false);
                    });
                  }}
                  className="min-h-12 rounded-xl border px-4 text-sm font-medium"
                  style={{ borderColor: "var(--m-line)" }}
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const sel = "mt-1.5 block min-h-11 w-full rounded-xl border bg-transparent px-3 text-base [border-color:var(--m-line)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
