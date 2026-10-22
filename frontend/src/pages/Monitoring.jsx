import React, { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import api, { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cloud, CheckCircle, WarningCircle, ArrowsClockwise, Buildings, Pulse, ChartBar } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell } from "recharts";
import { toast } from "sonner";
import { PRODUCT } from "@/brand";

const Stat = ({ label, value, tone = "teal", sub }) => {
  const c = tone === "green" ? "#0A6E62" : tone === "amber" ? "#C08A00" : tone === "red" ? "#B4442F" : "#0A6E62";
  return (
    <div className="rounded-2xl border border-[#DAE2DF] bg-white p-4">
      <div className="text-[10px] text-[#566663]">{label}</div>
      <div className="font-display text-2xl mt-1" style={{ color: c }}>{value}</div>
      {sub && <div className="text-xs text-[#566663] mt-0.5">{sub}</div>}
    </div>
  );
};

export default function Monitoring() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [cw, setCw] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/monitoring"); setData(r.data);
      api.get("/admin/monitoring/cloudwatch").then((c) => setCw(c.data)).catch(() => setCw({ available: false }));
    }
    catch (e) { toast.error(errMsg(e, "Could not load monitoring")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // auto-refresh every 10s
    return () => clearInterval(t);
  }, [load]);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const r = await api.post("/admin/monitoring/reconcile");
      toast.success(`Reconciled: ${r.data.pushed || 0} row(s) uploaded, ${r.data.reconciled_patients || 0} corrected`);
      load();
    } catch (e) { toast.error(errMsg(e, "Reconcile failed")); }
    finally { setReconciling(false); }
  };

  const nav = [{ label: "Operations", to: "/reception" }, { label: "Network", to: "/facilities" }, { label: "Monitoring", to: "/monitoring" }];
  const cloud = data?.cloud || {};
  const sync = data?.sync || {};

  return (
    <AppShell title="Sync and cloud health" subtitle="Monitoring" navItems={nav}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-[#566663]">Auto-refreshing every 10s{data ? ` · updated ${new Date(data.generated_at).toLocaleTimeString()}` : ""}</div>
        <Button size="sm" onClick={reconcile} disabled={reconciling} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white">
          <ArrowsClockwise size={15} className="mr-1.5" /> {reconciling ? "Reconciling…" : "Force reconcile"}
        </Button>
      </div>

      {data && data.is_cloud_node && (
        <div className="mb-4 rounded-2xl border border-[#0A6E62]/30 bg-[var(--ml-wash)] px-5 py-3 text-sm text-[#10262E]">
          You are viewing the <b>cloud node</b> — this is the shared mirror every clinic replicates to.
          Local-vs-cloud comparison applies on a <b>clinic</b> node. Here, the counts below are authoritative.
        </div>
      )}
      {loading && !data ? (
        <div className="text-sm text-[#566663]">Loading network status…</div>
      ) : (
        <>
          {/* Top status strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Stat label="Cloud mirror"
                  value={data.is_cloud_node ? "This node" : (cloud.online ? "Online" : "Offline")}
                  tone={data.is_cloud_node || cloud.online ? "green" : "red"}
                  sub={data.is_cloud_node ? "source of truth" : (cloud.online ? `${cloud.latency_ms} ms round-trip` : (cloud.configured ? "unreachable, changes are queued" : "not set up on this clinic"))} />
            <Stat label="Branches" value={`${(data.facilities || []).filter(f => f.active).length}`}
                  sub={`${(data.facilities || []).length} total`} />
            <Stat label="Pending sync" value={sync.pending ?? "—"} tone={sync.pending ? "amber" : "green"}
                  sub={sync.errors ? `${sync.errors} errored` : (sync.pending ? "waiting to upload" : "queue clear")} />
            <Stat label="Data match" value={data.all_in_sync == null ? "—" : (data.all_in_sync ? "In sync" : "Drift")}
                  tone={data.all_in_sync ? "green" : (data.all_in_sync == null ? "teal" : "red")}
                  sub="local vs cloud" />
          </div>

          {/* Data integrity table */}
          <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5 mb-5">
            <div className="flex items-center gap-2 mb-3"><Pulse size={16} weight="duotone" color="#0A6E62" /><h2 className="text-lg font-bold">Clinic copy compared with cloud copy</h2></div>
            <div className="divide-y divide-[var(--ml-wash)]">
              {(data.data_match || []).map((m) => (
                <div key={m.table} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-[#10262E]">{m.table}</span>
                  <span className="text-[#566663]">local <b className="text-[#10262E]">{m.local}</b> · cloud <b className="text-[#10262E]">{m.cloud ?? "—"}</b></span>
                  {data.is_cloud_node
                    ? <span className="flex items-center gap-1 text-[var(--ml-primary)] text-xs"><CheckCircle size={14} weight="fill" /> source of truth</span>
                    : m.cloud == null
                    ? <span className="text-[#566663] text-[13px]">no cloud to compare</span>
                    : m.in_sync
                    ? <span className="flex items-center gap-1 text-[var(--ml-primary)] text-[13px] font-semibold"><CheckCircle size={14} weight="fill" /> Matches</span>
                    : <span className="flex items-center gap-1 text-[#B4442F] text-[13px] font-semibold"><WarningCircle size={14} weight="fill" /> {m.local - (m.cloud || 0)} not yet in cloud</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5">
              <div className="flex items-center gap-2 mb-3"><ChartBar size={16} weight="duotone" color="#0A6E62" /><h2 className="text-lg font-bold">Rows per table</h2></div>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={(data.data_match || []).map(m => ({ name: m.table.replace("_"," "), local: m.local, cloud: m.cloud ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E1F0EC" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#566663" }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10, fill: "#566663" }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="local" fill="#0A6E62" radius={[4,4,0,0]} />
                    <Bar dataKey="cloud" fill="#10262E" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5">
              <div className="flex items-center gap-2 mb-3"><Buildings size={16} weight="duotone" color="#0A6E62" /><h2 className="text-lg font-bold">Records per clinic</h2></div>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={(data.facilities || []).map(f => ({ name: f.name?.replace(`Klinik ${PRODUCT.name} `,"") || f.code, records: f.records_cloud ?? f.records_local ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E1F0EC" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#566663" }} interval={0} height={40} />
                    <YAxis tick={{ fontSize: 10, fill: "#566663" }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="records" radius={[4,4,0,0]}>
                      {(data.facilities || []).map((f, i) => <Cell key={i} fill={["#0A6E62","#10262E","#566663","#8FB8AA"][i % 4]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Per-branch */}
          <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5">
            <div className="flex items-center gap-2 mb-3"><Buildings size={16} weight="duotone" color="#0A6E62" /><h2 className="text-lg font-bold">Clinics</h2></div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(data.facilities || []).map((f) => (
                <div key={f.code} className="p-4 rounded-xl border border-[#DAE2DF]">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-lg">{f.name}</div>
                    {f.active ? <Badge className="bg-[#0A6E62]/15 text-[var(--ml-primary)]">active</Badge> : <Badge className="bg-[#566663]/15 text-[#566663]">off</Badge>}
                  </div>
                  <div className="text-[11px] font-mono text-[#566663]">{f.code} · {f.type}</div>
                  <div className="text-sm text-[#10262E] mt-2">
                    Records — local <b>{f.records_local}</b> · cloud <b>{f.records_cloud ?? "—"}</b>
                    {f.records_cloud != null && f.records_cloud >= f.records_local
                      ? <span className="ml-2 text-[var(--ml-primary)] text-xs">✓</span>
                      : <span className="ml-2 text-[#C08A00] text-xs">⟳</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CloudWatch: only shown on deployments that actually run on AWS */}
          {cw && cw.available && (
          <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5 mt-5">
            <div className="flex items-center gap-2 mb-3"><Cloud size={16} weight="duotone" color="#0A6E62" /><h2 className="text-lg font-bold">AWS infrastructure (last 30 min)</h2>{cw && cw.source === "cloud-node" && <span className="text-[10px] text-[#566663] ml-auto">via cloud node</span>}</div>
            {!cw ? <div className="text-sm text-[#566663]">Loading CloudWatch…</div>
             : !cw.available ? <div className="text-sm text-[#566663]">CloudWatch metrics not available on this node.</div>
             : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  ["RDS CPU", cw.rds.cpu_percent != null ? cw.rds.cpu_percent + " %" : "—"],
                  ["DB connections", cw.rds.connections ?? "—"],
                  ["Free storage", cw.rds.free_storage_mb != null ? (cw.rds.free_storage_mb/1024).toFixed(1) + " GB" : "—"],
                  ["Freeable memory", cw.rds.freeable_mem_mb != null ? cw.rds.freeable_mem_mb + " MB" : "—"],
                  ["Read latency", cw.rds.read_latency_ms != null ? cw.rds.read_latency_ms + " ms" : "—"],
                  ["Write latency", cw.rds.write_latency_ms != null ? cw.rds.write_latency_ms + " ms" : "—"],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-[#DAE2DF] p-3">
                    <div className="text-[10px] text-[#566663]">{l}</div>
                    <div className="font-display text-xl mt-0.5 text-[var(--ml-primary)]">{v}</div>
                  </div>
                ))}
                {cw.ec2 && (
                  <div className="rounded-xl border border-[#DAE2DF] p-3">
                    <div className="text-[10px] text-[#566663]">EC2 CPU</div>
                    <div className="font-display text-xl mt-0.5 text-[var(--ml-primary)]">{cw.ec2.cpu_percent != null ? cw.ec2.cpu_percent + " %" : "—"}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          <p className="text-xs text-[#566663] mt-5 leading-relaxed">
            Offline branches keep working locally; queued changes auto-recover when they reconnect.
            <b> Force reconcile</b> pushes any drifted or queued rows to the cloud immediately for fast recovery.
          </p>
        </>
      )}
    </AppShell>
  );
}
