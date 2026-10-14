"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a `startPolling(tick, options)` helper backed by setInterval.
 * `tick` receives a `stop` callback to end its own loop once the job settles.
 * A loop that hasn't stopped after `timeoutMs` is ended and `onTimeout` runs,
 * and every loop still running is cleared when the component unmounts — so a
 * job that never settles can't keep hitting the server indefinitely.
 */
export function usePolling() {
  const intervalsRef = useRef(new Set<ReturnType<typeof setInterval>>());

  useEffect(() => {
    const intervals = intervalsRef.current;
    return () => {
      intervals.forEach(clearInterval);
      intervals.clear();
    };
  }, []);

  return useCallback(
    (
      tick: (stop: () => void) => void | Promise<void>,
      { intervalMs, timeoutMs, onTimeout }: { intervalMs: number; timeoutMs: number; onTimeout: () => void }
    ) => {
      const intervals = intervalsRef.current;
      const startedAt = Date.now();
      const stop = () => {
        clearInterval(id);
        intervals.delete(id);
      };
      const id = setInterval(() => {
        if (Date.now() - startedAt >= timeoutMs) {
          stop();
          onTimeout();
          return;
        }
        void tick(stop);
      }, intervalMs);
      intervals.add(id);
    },
    []
  );
}
