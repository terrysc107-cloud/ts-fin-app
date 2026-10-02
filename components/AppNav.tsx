import Link from "next/link";

const LINKS: [string, string][] = [
  ["/", "Home"],
  ["/transactions", "Spending"],
  ["/reports", "Reports"],
  ["/assets", "Assets"],
  ["/rent", "Rent"],
  ["/budget", "Budget"],
];

/** Sticky pill nav shared by every page. Scrolls sideways on a phone instead of wrapping. */
export function AppNav({ current }: { current: string }) {
  return (
    <nav
      className="sticky top-0 z-10 -mx-4 mb-4 mt-4 flex gap-2 overflow-x-auto px-4 py-3 text-sm backdrop-blur [scrollbar-width:none]"
      style={{ background: "color-mix(in srgb, var(--m-bg) 85%, transparent)" }}
      aria-label="Sections"
    >
      {LINKS.map(([href, label]) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="money-card shrink-0 rounded-full px-4 py-1.5 font-medium active:scale-[0.98]"
            style={active ? { background: "var(--m-ink)", color: "var(--m-card)" } : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
