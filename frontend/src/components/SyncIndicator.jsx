import { useAuth } from "@/contexts/AuthContext";
import React, { useEffect, useState } from "react";
import { CloudCheck, HardDrives, ArrowsClockwise } from "@phosphor-icons/react";
import api from "@/lib/api";
import { motion } from "framer-motion";

// Admin-only gate: hooks-safe wrapper — the inner component's hooks
// only mount when the user is an admin, so hook order never changes.
export default function SyncIndicator(props) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  return <SyncIndicatorInner {...props} />;
}

function SyncIndicatorInner({ compact = false }) {
  const [data, setData] = useState(null);

  const load = async () => {
    try {
      const r = await api.get("/sync/status");
      setData(r.data);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;

  const syncing = (data.pending_sync || 0) > 0;
  const synced = data.synced_to_cloud ?? data.cloud ?? 0;
  const total = data.total_records ?? 0;
  const cloudPct = total > 0 ? Math.round((synced / total) * 100) : 0;

  if (compact) {
    return (
      <div
        data-testid="sync-indicator-compact"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white text-xs font-mono"
        style={{ borderColor: "var(--ml-border)" }}
      >
        <span
          className={`w-2 h-2 rounded-full breathe ${
            syncing ? "bg-[#D4A373]" : "bg-[#2D6A4F]"
          }`}
        />
        <span className="text-[#5C6661]">
          {syncing ? "Syncing…" : "Synced"} · {cloudPct}%
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="sync-indicator"
      className={`relative rounded-2xl bg-white p-5 border ${
        syncing ? "tracing-beam" : ""
      }`}
      style={{ borderColor: "var(--ml-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="overline">Storage Sync</div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#5C6661]">
          <span
            className={`w-1.5 h-1.5 rounded-full breathe ${
              syncing ? "bg-[#D4A373]" : "bg-[#2D6A4F]"
            }`}
          />
          {syncing ? "syncing" : "stable"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-4 border bg-[#F3EFE9]" style={{ borderColor: "var(--ml-border)" }}>
          <div className="flex items-center gap-2 mb-2 text-[#1C3F39]">
            <HardDrives size={18} weight="duotone" />
            <span className="text-sm font-medium">Local NVMe SSD</span>
          </div>
          <div className="font-display text-3xl text-[#1C3F39]" data-testid="ssd-count">
            {data.local_ssd}
          </div>
          <div className="text-xs text-[#5C6661] mt-1">records on disk</div>
        </div>

        <div className="rounded-xl p-4 border bg-white relative overflow-hidden" style={{ borderColor: "var(--ml-border)" }}>
          <div className="flex items-center gap-2 mb-2 text-[#1C3F39]">
            <CloudCheck size={18} weight="duotone" />
            <span className="text-sm font-medium">MediLink Cloud</span>
          </div>
          <div className="font-display text-3xl text-[#1C3F39]" data-testid="cloud-count">
            {data.cloud}
          </div>
          <div className="text-xs text-[#5C6661] mt-1">{cloudPct}% mirrored</div>
        </div>
      </div>

      {syncing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 flex items-center gap-2 text-xs text-[#B55B49] font-mono"
        >
          <ArrowsClockwise size={14} className="animate-spin" />
          {data.pending_sync} record(s) syncing to cloud…
        </motion.div>
      )}

      {data.last_synced && (
        <div className="mt-3 text-[11px] text-[#5C6661] font-mono">
          Last sync: {new Date(data.last_synced).toLocaleString()}
        </div>
      )}
    </div>
  );
}
