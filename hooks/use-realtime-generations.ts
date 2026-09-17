"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to live INSERT/UPDATE/DELETE events on `generations` for a
 * project via Supabase Realtime (see migration 0002 — the table is added
 * to the `supabase_realtime` publication; RLS still applies, so this only
 * ever sees the current user's own rows). Realtime payloads carry raw
 * column values (private-bucket paths, not signed URLs), so rather than
 * trusting them directly we just use them as a "something changed" signal
 * and let the caller re-fetch the fully resolved row server-side.
 */
export function useRealtimeGenerations({
  projectId,
  onChange,
  onDelete,
}: {
  projectId: string;
  onChange: (generationId: string) => void;
  onDelete?: (generationId: string) => void;
}) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`generations-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "generations",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (old.id) onDelete?.(old.id);
            return;
          }
          const row = payload.new as { id: string };
          onChange(row.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
}
