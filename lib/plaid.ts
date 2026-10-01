import "server-only";

const BASE: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

/** POST to a Plaid endpoint with the server-side credentials. Throws with Plaid's message on failure. */
export async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Plaid keys are not set on this deployment");
  const base = BASE[(process.env.PLAID_ENV ?? "production").toLowerCase()] ?? BASE.production;

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message ?? `Plaid ${path} failed (${res.status})`);
  return data as T;
}
