import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { STATUS_LABEL } from "@/components/editor/editor-constants";
import type { GenerationRow } from "@/lib/supabase/types";

export function RenderHistoryCard({ generations }: { generations: GenerationRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Render history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {generations.map((g) => (
          <div key={g.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {new Date(g.created_at).toLocaleString()} · {g.camera_movement.replace("_", " ")}
                {g.batch_id && " · batch"}
              </span>
              <Badge
                variant={
                  g.status === "completed"
                    ? "success"
                    : g.status === "failed"
                    ? "destructive"
                    : "warning"
                }
              >
                {STATUS_LABEL[g.status]}
              </Badge>
            </div>
            <Separator className="mt-3" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
