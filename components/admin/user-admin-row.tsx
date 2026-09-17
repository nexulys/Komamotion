"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toggleUserAdmin, grantCredits } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { UserRow } from "@/lib/supabase/types";

export function UserAdminRow({ user }: { user: UserRow }) {
  const [isTogglePending, startToggle] = useTransition();
  const [isGrantPending, startGrant] = useTransition();

  return (
    <tr>
      <td className="px-6 py-3">
        <p className="font-medium">{user.display_name || user.email}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="capitalize">
          {user.plan}
        </Badge>
      </td>
      <td className="px-4 py-3">{user.credits_balance.toLocaleString()}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {user.stripe_subscription_status ?? "none"}
      </td>
      <td className="px-4 py-3">
        <Switch
          checked={user.is_admin}
          disabled={isTogglePending}
          onCheckedChange={(checked) =>
            startToggle(async () => {
              await toggleUserAdmin(user.id, checked);
              toast.success(checked ? "Granted admin access" : "Revoked admin access");
            })
          }
        />
      </td>
      <td className="px-4 py-3">
        <form
          action={(formData) =>
            startGrant(async () => {
              await grantCredits(formData);
              toast.success("Credits granted");
            })
          }
          className="flex items-center gap-2"
        >
          <input type="hidden" name="userId" value={user.id} />
          <Input
            name="amount"
            type="number"
            placeholder="±100"
            className="h-8 w-24"
            required
          />
          <input type="hidden" name="reason" value="Admin manual adjustment" />
          <Button type="submit" size="sm" variant="outline" disabled={isGrantPending}>
            {isGrantPending && <Loader2 className="size-3.5 animate-spin" />}
            Apply
          </Button>
        </form>
      </td>
    </tr>
  );
}
