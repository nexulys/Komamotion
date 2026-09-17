import Link from "next/link";
import { Logo } from "@/components/branding/logo";
import { NexulysBadge } from "@/components/branding/nexulys-badge";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(ellipse_at_top,_var(--brand-violet)_0%,_transparent_60%)] opacity-25"
      />
      <Link href="/" className="relative mb-8">
        <Logo />
      </Link>
      <div className="relative w-full max-w-sm">{children}</div>
      <div className="relative mt-8">
        <NexulysBadge />
      </div>
    </div>
  );
}
