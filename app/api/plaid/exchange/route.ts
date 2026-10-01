import { NextRequest, NextResponse } from "next/server";
import { plaid } from "@/lib/plaid";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Saves a newly linked bank to public.plaid_tokens with an empty cursor.
// Founder OS plaid_sync.py picks it up on its next run: full history + balances.
export async function POST(req: NextRequest) {
  const { public_token } = (await req.json().catch(() => ({}))) as { public_token?: string };
  if (!public_token) return NextResponse.json({ error: "Missing public_token" }, { status: 400 });

  try {
    const { access_token, item_id } = await plaid<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token }
    );
    const { error } = await createServerClient().from("plaid_tokens").insert({ item_id, access_token, cursor: "" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
