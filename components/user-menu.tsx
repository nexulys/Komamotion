"use client";

import { Coins, LogOut, Settings } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

export function UserMenu({
  email,
  displayName,
  credits,
}: {
  email: string | null;
  displayName?: string | null;
  credits: number;
}) {
  const label = displayName || email || "Account";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline" className="gap-1.5 md:hidden">
        <Coins className="size-3 text-primary" />
        {credits}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger className="outline-none">
          <Avatar>
            <AvatarFallback className="brand-gradient-bg text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/billing">
              <Settings className="size-4" />
              Billing & credits
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOut} className="w-full">
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Log out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
