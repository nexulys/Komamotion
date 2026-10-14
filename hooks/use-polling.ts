"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a `startPolling(tick, intervalMs)` helper backed by setInterval.
 * `tick` receives a `stop` callback to end its own loop once the job settles;
 * every loop still running is cleared when the component unmounts, so a job
 * that never finishes doesn't keep hitting the server after the user leaves.
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

  return useCallback((tick: (stop: () => void) => void | Promise<void>, intervalMs: number) => {
    const intervals = intervalsRef.current;
    const id = setInterval(() => {
      void tick(() => {
        clearInterval(id);
        intervals.delete(id);
      });
    }, intervalMs);
    intervals.add(id);
  }, []);
}
