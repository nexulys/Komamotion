import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, Film, FolderKanban } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { Logo } from "@/components/branding/logo";
import { NexulysBadge } from "@/components/branding/nexulys-badge";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";

const NAV_ITEMS = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/billing", label: "Billing", icon: Coins },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const credits = current.profile?.credits_balance ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-secondary/10 md:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/projects">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-border/60 p-4">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Coins className="size-3.5 text-primary" />
              Credits
            </span>
            <Badge variant="brand">{credits.toLocaleString()}</Badge>
          </div>
          <NexulysBadge variant="compact" className="w-full justify-center" />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-lg">
          <div className="flex items-center gap-2 md:hidden">
            <Film className="size-5 text-primary" />
            <span className="font-semibold">KomaMotion</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            KomaMotion — <span className="text-foreground">A Nexulys SaaS</span>
          </div>
          <UserMenu
            email={current.email}
            displayName={current.profile?.display_name}
            credits={credits}
          />
        </header>
        <main className="flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}
