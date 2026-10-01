import "server-only";
import { createServerClient } from "@/lib/supabase";
import { computeMoneyView } from "@/lib/money";

export type { MoneyView } from "@/lib/money";

export const getMoneyView = (now = new Date()) => computeMoneyView(createServerClient(), now);
