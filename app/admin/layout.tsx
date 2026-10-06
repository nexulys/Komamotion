import Link from "next/link";
import { LayoutDashboard, ShieldAlert, Users, Film } from "lucide-react";
import { requireAdmin } from "@/lib/admin/queries";
import { Logo } from "@/components/branding/logo";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/generations", label: "Generations", icon: Film },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-secondary/10 md:flex">
        <div className="flex h-16 items-center gap-2 px-6">
          <Link href="/admin">
            <Logo />
          </Link>
        </div>
        <div className="px-6 pb-4">
          <Badge variant="destructive" className="gap-1.5">
            <ShieldAlert className="size-3.5" />
            Admin
          </Badge>
        </div>
        <nav className="flex-1 space-y-1 px-3">
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
        <div className="border-t border-border/60 p-4">
          <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}
