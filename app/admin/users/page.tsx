import { getAdminUsers } from "@/lib/admin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAdminRow } from "@/components/admin/user-admin-row";

export default async function AdminUsersPage() {
  const users = await getAdminUsers(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">{users.length} most recent accounts.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Credits</th>
                <th className="px-4 py-3 font-medium">Subscription</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Grant credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {users.map((user) => (
                <UserAdminRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No users yet.</p>
          )}
        </CardContent>
      </Card>
      <Badge variant="outline" className="text-xs">
        Showing up to 100 most recent — pagination not implemented in this scaffold.
      </Badge>
    </div>
  );
}
