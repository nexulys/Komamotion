import { getAdminGenerations } from "@/lib/admin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminGenerationsPage() {
  const generations = await getAdminGenerations(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generations</h1>
        <p className="text-sm text-muted-foreground">
          {generations.length} most recent render jobs across all users.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Resolution</th>
                <th className="px-4 py-3 font-medium">Credits charged</th>
                <th className="px-4 py-3 font-medium">Est. AI cost</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {generations.map((g) => (
                <tr key={g.id}>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {new Date(g.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        g.status === "completed"
                          ? "success"
                          : g.status === "failed"
                          ? "destructive"
                          : "warning"
                      }
                    >
                      {g.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-muted-foreground">{g.provider}</td>
                  <td className="px-4 py-3 text-xs">{g.resolution}</td>
                  <td className="px-4 py-3">{g.credits_cost}</td>
                  <td className="px-4 py-3">
                    {g.estimated_cost_usd != null ? `$${g.estimated_cost_usd.toFixed(3)}` : "—"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-destructive">
                    {g.error_message ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {generations.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No generations yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
