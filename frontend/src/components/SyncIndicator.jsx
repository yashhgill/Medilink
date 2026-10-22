import { useAuth } from "@/contexts/AuthContext";
import { fmtDateTime, fmtDate } from "@/lib/utils";
import React, { useEffect, useState } from "react";
import { CloudCheck, HardDrives, ArrowsClockwise } from "@phosphor-icons/react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { useMode } from "@/lib/mode";
import { PRODUCT } from "@/brand";

// Admin-only gate + standalone gate: the cloud sync indicator is meaningless in
// a local-only (standalone) install, so it renders nothing there.
export default function SyncIndicator(props) {
  const { user } = useAuth();
  const { isStandalone } = useMode();
  const adminTiers = ["super_admin", "clinic_admin", "admin"];
  if (isStandalone) return null;
  if (!user || !adminTiers.includes(user.role)) return null;
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
    // Plain words for clinic staff: is today's work safely in the cloud yet?
    const pending = data.pending_sync || 0;
    const label = !data.cloud_connected ? "Saved on this computer"
      : pending > 0 ? `${pending} waiting to upload` : "Cloud up to date";
    const dot = !data.cloud_connected ? "bg-white/50" : pending > 0 ? "bg-[#F0C24B]" : "bg-[#5FD3A8]";
    return (
      <div data-testid="sync-indicator-compact" title={data.last_synced ? `Last upload ${fmtDateTime(data.last_synced)}` : label}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/85 text-[13px] font-semibold">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        {label}
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
        <div className="flex items-center gap-2 text-xs font-mono text-[#566663]">
          <span
            className={`w-1.5 h-1.5 rounded-full breathe ${
              syncing ? "bg-[var(--ml-primary)]" : "bg-[var(--ml-primary)]"
            }`}
          />
          {syncing ? "syncing" : "stable"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-4 border bg-[var(--ml-wash)]" style={{ borderColor: "var(--ml-border)" }}>
          <div className="flex items-center gap-2 mb-2 text-[var(--ml-primary)]">
            <HardDrives size={18} weight="duotone" />
            <span className="text-sm font-medium">Local NVMe SSD</span>
          </div>
          <div className="font-display text-3xl text-[var(--ml-primary)]" data-testid="ssd-count">
            {data.local_ssd}
          </div>
          <div className="text-xs text-[#566663] mt-1">records on disk</div>
        </div>

        <div className="rounded-xl p-4 border bg-white relative overflow-hidden" style={{ borderColor: "var(--ml-border)" }}>
          <div className="flex items-center gap-2 mb-2 text-[var(--ml-primary)]">
            <CloudCheck size={18} weight="duotone" />
            <span className="text-sm font-medium">{PRODUCT.cloudName}</span>
          </div>
          <div className="font-display text-3xl text-[var(--ml-primary)]" data-testid="cloud-count">
            {data.cloud}
          </div>
          <div className="text-xs text-[#566663] mt-1">{cloudPct}% mirrored</div>
        </div>
      </div>

      {syncing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 flex items-center gap-2 text-xs text-[#10262E] font-mono"
        >
          <ArrowsClockwise size={14} className="animate-spin" />
          {data.pending_sync} record(s) syncing to cloud…
        </motion.div>
      )}

      {data.last_synced && (
        <div className="mt-3 text-[11px] text-[#566663] font-mono">
          Last sync: {fmtDateTime(data.last_synced)}
        </div>
      )}
    </div>
  );
}
