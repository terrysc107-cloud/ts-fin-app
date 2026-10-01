import { NextResponse } from "next/server";
import { plaid } from "@/lib/plaid";

export const dynamic = "force-dynamic";

// Starts Plaid Link. The new bank is synced by Founder OS (02:00), not by this app.
export async function POST() {
  try {
    const { link_token } = await plaid<{ link_token: string }>("/link/token/create", {
      user: { client_user_id: "terry" },
      client_name: "Terry HQ",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });
    return NextResponse.json({ link_token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
