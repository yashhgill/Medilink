import { useEffect, useRef } from "react";
import { BACKEND_URL } from "@/lib/api";

/**
 * Subscribes to the backend WebSocket and calls `onEvent` for each message.
 * Auto-reconnects with exponential backoff (max 10s).
 */
export default function useQueueSocket(onEvent) {
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      const token = localStorage.getItem("ml_token");
      if (!token) return;
      const wsUrl =
        BACKEND_URL.replace(/^http/, "ws") + `/api/ws/queue?token=${encodeURIComponent(token)}`;
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          cbRef.current?.(data);
        } catch (_) {}
      };
      ws.onclose = () => {
        if (!stopped) scheduleRetry();
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    const scheduleRetry = () => {
      retryRef.current += 1;
      const delay = Math.min(10000, 500 * 2 ** retryRef.current);
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(timerRef.current);
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    };
  }, []);
}
