import { cn } from "@/lib/utils";
import { Clapperboard } from "lucide-react";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold", className)}>
      <span className="relative flex size-7 items-center justify-center rounded-lg brand-gradient-bg text-white shadow-lg shadow-fuchsia-500/20">
        <Clapperboard className="size-4" strokeWidth={2.4} />
      </span>
      <span className="text-base tracking-tight">
        Koma<span className="brand-gradient-text">Motion</span>
      </span>
    </div>
  );
}
