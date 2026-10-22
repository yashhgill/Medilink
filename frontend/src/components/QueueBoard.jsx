import { useEffect, useState } from "react";
import api from "@/lib/api";

export const ZONE_COLOUR = { Red: "#C0352B", Orange: "#D9661A", Yellow: "#E5A800", Green: "#2F7D45", Blue: "#2C6CB0" };

/* The public queue board (numbers and triage colour only, never names).
   Polls every 5 s; the waiting room should never need a refresh. */
export function useQueueBoard(intervalMs = 5000) {
  const [board, setBoard] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/queue/board").then((r) => alive && setBoard(r.data)).catch(() => {});
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return board;
}

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return now;
}
