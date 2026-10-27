import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/** Shared shell for the legal pages: readable column, last-updated line. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>
        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A publisher detail, or a neutral notice while it hasn't been configured yet. */
export function LegalValue({ value }: { value: string | null }) {
  return <>{value ?? "information en cours de mise à jour"}</>;
}
