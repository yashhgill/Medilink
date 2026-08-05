import { useEffect, useRef } from "react";
import { BACKEND_URL } from "@/lib/api";

/**
 * Subscribes to the backend WebSocket and calls `onEvent` for each message.
 * Auto-reconnects with exponential backoff (max 10s). Also polls every 5s as a
 * safety net so the queue still refreshes even if the WebSocket can't connect
 * (e.g. dev server on :3000 has no WS — the backend is on :8000).
 */
export default function useQueueSocket(onEvent) {
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let stopped = false;

    // Resolve the WebSocket base:
    //  - explicit BACKEND_URL (cloud/prod, e.g. http://IP:8000) → ws://IP:8000
    //  - dev on :3000 → the backend is on :8000, so target host:8000, NOT :3000
    //  - otherwise same-origin
    const wsBase = () => {
      if (BACKEND_URL) return BACKEND_URL.replace(/^http/, "ws");
      const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
      let host = window.location.host;
      if (/:3000$/.test(host)) host = host.replace(/:3000$/, ":8000");
      return proto + host;
    };

    const connect = () => {
      const token = localStorage.getItem("ml_token");
      if (!token) return;
      const wsUrl = wsBase() + `/api/ws/queue?token=${encodeURIComponent(token)}`;
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

    // Safety-net poll: even if the WebSocket never connects, nudge the page to
    // refetch every 5s so the queue stays live (fires a synthetic refresh event).
    pollRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== 1) {
        cbRef.current?.({ type: "appointment.poll" });
      }
    }, 5000);

    return () => {
      stopped = true;
      clearTimeout(timerRef.current);
      clearInterval(pollRef.current);
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    };
  }, []);
}
