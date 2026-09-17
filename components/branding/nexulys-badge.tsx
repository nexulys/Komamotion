import { cn } from "@/lib/utils";

/**
 * Discreet mark for the Nexulys ecosystem. KomaMotion AI is SaaS #2
 * in the Nexulys product family — this badge is the shared attribution
 * unit reused across headers, footers, and export watermarks.
 */
export function NexulysBadge({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "compact";
}) {
  return (
    <a
      href="https://nexulys.com"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground",
        className
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full brand-gradient-bg opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full brand-gradient-bg" />
      </span>
      {variant === "default" ? (
        <span>
          Powered by{" "}
          <span className="font-semibold text-foreground/80 group-hover:brand-gradient-text">
            Nexulys Ecosystem
          </span>{" "}
          — SaaS #2
        </span>
      ) : (
        <span className="font-semibold text-foreground/80 group-hover:brand-gradient-text">
          Nexulys
        </span>
      )}
    </a>
  );
}
