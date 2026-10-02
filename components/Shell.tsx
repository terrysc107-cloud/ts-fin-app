import { Outfit } from "next/font/google";
import { AppNav } from "@/components/AppNav";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

export const usd = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 }).format(n);

/** Page frame for every non-home page: warm-depth theme, header, sticky nav. */
export function Shell({ current, kicker, title, aside, children }: { current: string; kicker: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`money min-h-[100dvh] ${outfit.className}`}>
      <div className="mx-auto max-w-xl px-4 pb-16 pt-8 md:max-w-3xl">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--m-muted)]">{kicker}</p>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          {aside}
        </header>
        <AppNav current={current} />
        {children}
      </div>
    </div>
  );
}
