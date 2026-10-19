"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type MobileNavItem = { href: string; label: string };

/**
 * Horizontal tab bar shown under the header on phones, where the desktop
 * sidebar is hidden. Scrolls sideways rather than wrapping if items overflow.
 */
export function MobileNav({ items, exact = [] }: { items: MobileNavItem[]; exact?: string[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border/60 bg-background/80 px-4 py-2 md:hidden">
      {items.map((item) => {
        const active = exact.includes(item.href) ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
