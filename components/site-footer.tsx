import Link from "next/link";
import { Logo } from "@/components/branding/logo";
import { NexulysBadge } from "@/components/branding/nexulys-badge";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-sm text-sm text-muted-foreground">
              KomaMotion — A Nexulys SaaS. Turn static manga pages into
              cinematic video sequences with image-to-video AI.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <p className="font-medium text-foreground">Product</p>
              <Link href="/projects" className="block text-muted-foreground hover:text-foreground">
                Projects
              </Link>
              <Link href="/billing" className="block text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Account</p>
              <Link href="/login" className="block text-muted-foreground hover:text-foreground">
                Log in
              </Link>
              <Link href="/register" className="block text-muted-foreground hover:text-foreground">
                Create account
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Ecosystem</p>
              <a
                href="https://nexulys.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-muted-foreground hover:text-foreground"
              >
                Nexulys.com
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} KomaMotion — A Nexulys SaaS. All rights reserved.
          </p>
          <NexulysBadge />
        </div>
      </div>
    </footer>
  );
}
