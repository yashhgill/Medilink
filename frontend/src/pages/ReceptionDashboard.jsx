import { QueueTicket, TriageChip } from "@/components/Triage";
import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useMode } from "@/lib/mode";
import SyncIndicator from "@/components/SyncIndicator";
import ICScanner from "@/components/ICScanner";
import SlotPicker from "@/components/SlotPicker";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WaveTriangle, IdentificationCard, Users, Calendar, ListChecks, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

// What the front desk can move a visit to. Payment and the pharmacy move it on from there.
const statusOptions = ["scheduled", "checked_in", "in_progress", "completed", "cancelled"];
const ZONE_BG = { Red: "#C0352B", Orange: "#D9661A", Yellow: "#E5A800", Green: "#2F7D45", Blue: "#2C6CB0" };
const STATUS_LABEL = {
  scheduled: "Booked", checked_in: "Waiting", in_progress: "With doctor", completed: "Seen, to pay",
  ready_for_pharmacy: "At pharmacy", dispensed: "Done", cancelled: "Cancelled",
};
const statusColors = {
  scheduled: "bg-white text-[#10201D]",
  checked_in: "bg-[var(--ml-wash)] text-[var(--ml-primary-soft)]",
  in_progress: "bg-[#10262E] text-white",
  completed: "bg-[#DCE6F0] text-[#10262E]",
  ready_for_pharmacy: "bg-[var(--ml-primary)] text-white",
  dispensed: "bg-[#EEF3F1] text-[#566663]",
  cancelled: "bg-[#EEF3F1] text-[#566663] line-through",
};

export default function ReceptionDashboard() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { isNetworked } = useMode();   // cloud features only in networked mode
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const _loc = useLocation();
  const view = _loc.pathname.split("/")[2] || "operations";
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedPatient, setScannedPatient] = useState(null);
  useEffect(() => {
    if (isAdmin) api.get("/admin/analytics").then((r) => setStats(r.data)).catch(() => {});
  }, [isAdmin]);
  const [bookOpen, setBookOpen] = useState(false);
  const [booking, setBooking] = useState({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "" });

  const [pending, setPending] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const load = async () => {
    const [q, p, d, pp] = await Promise.all([
      api.get("/queue/today"),
      api.get("/patients"),
      api.get("/doctors"),
      api.get("/payments/pending").catch(() => ({ data: [] })),
    ]);
    setQueue(q.data);
    setPatients(p.data);
    setDoctors(d.data);
    setPending(pp.data || []);
  };

  const confirmPayment = async (ref) => {
    setConfirming(ref);
    try {
      const r = await api.post(`/payments/${ref}/confirm`);
      toast.success(r.data?.next === "ready_for_pharmacy" ? "Payment confirmed. Medicine sent to the pharmacy." : "Payment confirmed.");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not confirm payment");
    } finally {
      setConfirming(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useQueueSocket((ev) => {
    if (ev?.type?.startsWith("appointment.")) load();
  });

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/appointments/${id}`, { status });
      toast.success(`Status changed to ${STATUS_LABEL[status] || status}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not change the status");
    }
    load();
  };

  const triggerSync = async () => {
    await api.post("/sync/trigger");
    toast.info("Sync triggered");
    load();
  };

  const onPatientFound = (data) => {
    setScannedPatient(data.patient);
    setBooking({ ...booking, patient_id: data.patient.id });
    setBookOpen(true);
  };

  const createBooking = async () => {
    try {
      await api.post("/appointments", { ...booking, fee: 50 });
      toast.success("Appointment created");
      setBookOpen(false);
      setBooking({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "" });
      setScannedPatient(null);
      load();
    } catch (e) {
      toast.error("Failed to create appointment");
    }
  };

  // Tiles cover every live visit, so they add up to the queue (cancelled aside).
  const waiting = queue.filter((q) => ["scheduled", "checked_in"].includes(q.status)).length;
  const inProg = queue.filter((q) => q.status === "in_progress").length;
  const toPay = queue.filter((q) => q.status === "completed").length;
  const done = queue.filter((q) => ["ready_for_pharmacy", "dispensed"].includes(q.status)).length;
  const waitingList = queue.filter((q) => ["checked_in", "scheduled"].includes(q.status));
  const next = waitingList[0];
  const upNext = waitingList.slice(1, 4);

  return (
    <AppShell
      title="Today's queue"
      subtitle={isAdmin ? "Clinic operations" : "Front desk"}
      navItems={[
        { label: "Today's queue", to: "/reception" },
        { label: "Patients", to: "/reception/patients" },
        ...(isAdmin ? [{ label: isSuperAdmin ? "Network" : "My clinic", to: "/facilities" }] : []),
        ...(isAdmin ? [{ label: "Clinic settings", to: "/branding" }] : []),
        ...(isSuperAdmin && isNetworked ? [{ label: "Monitoring", to: "/monitoring" }] : []),
      ]}>
      {view === "operations" && (<>
      {isAdmin && stats && (
        <div className="mb-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Visits today", value: stats.visits_today },
            { label: "Visits · 7d", value: stats.visits_7d },
            { label: "Revenue today", value: `RM ${Number(stats.revenue_today).toFixed(0)}` },
            { label: "Revenue · 7d", value: `RM ${Number(stats.revenue_7d).toFixed(0)}` },
          ].map((c) => (
            <div key={c.label} className="panel p-4">
              <div className="text-[13px] text-[#566663]">{c.label}</div>
              <div className="figure text-[30px] mt-1.5 text-[#10201D]">{c.value}</div>
            </div>
          ))}
          <div className="panel p-4">
            <div className="text-[13px] text-[#566663]">Triage, last 7 days</div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {["Red", "Yellow", "Green"].map((z) => (
                <span key={z} className={`triage triage-${z}`}>{stats.triage_mix?.[z] || 0}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "operations" && isAdmin && (
        <div className="mb-5 flex flex-col sm:flex-row gap-3">
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem("ml_token");
                const resp = await fetch("/api/admin/cash-report/pdf", { headers: { Authorization: `Bearer ${token}` } });
                if (!resp.ok) throw new Error();
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "cash-report.pdf"; a.click();
                URL.revokeObjectURL(url);
              } catch (e) { toast.error("Report failed"); }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border border-[#DAE2DF] bg-white text-[var(--ml-primary)] font-medium hover:bg-[var(--ml-wash)] active:scale-[0.99] transition"
          >
            <ListChecks size={18} weight="duotone" /> Daily cash report (PDF)
          </button>
          {isSuperAdmin && isNetworked && (
          <button
            onClick={async () => {
              toast.message("Pushing all records to cloud…");
              try {
                const r = await api.post("/sync/full");
                const total = Object.values(r.data.pushed).reduce((a, b) => a + b, 0);
                toast.success(`Synced ${total} records to cloud`);
              } catch (e) { toast.error("Sync failed"); }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-[var(--ml-primary)] text-white font-medium hover:bg-[var(--ml-primary-soft)] active:scale-[0.99] transition"
          >
            <WaveTriangle size={18} weight="duotone" /> Sync all to cloud
          </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-3 gap-5">
        {/* Queue board: what the waiting room is watching, at a glance */}
        <section className="lg:col-span-3 rounded-[20px] bg-[#10262E] text-white overflow-hidden" aria-label="Queue board">
          <div className="grid lg:grid-cols-[1.35fr_1fr_auto]">
            <div className="p-6 md:p-7 flex items-center gap-6 min-w-0">
              {next ? (
                <>
                  <div className="shrink-0 rounded-2xl px-5 py-4 text-center" style={{ background: ZONE_BG[next.triage_colour] || "#1C3A44", color: next.triage_colour === "Yellow" ? "#2A2000" : "#fff" }}>
                    <div className="text-[12px] font-semibold opacity-80">Next</div>
                    <div className="figure text-[64px] md:text-[76px]">{String(next.queue_number).padStart(3, "0")}</div>
                  </div>
                  <div className="min-w-0">
                    <div data-testid="now-serving" className="sr-only">#{String(next.queue_number).padStart(3, "0")}</div>
                    <div className="text-[13px] text-white/60 font-semibold">Next to be called</div>
                    <div className="font-display text-[26px] md:text-[30px] leading-tight truncate">{next.patient?.name}</div>
                    <div className="text-[15px] text-white/70 mt-0.5 truncate">with {next.doctor?.name || "the next free doctor"}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <TriageChip zone={next.triage_colour} />
                      {next.reason && <span className="text-[14px] text-white/70 truncate max-w-[28ch]">{next.reason}</span>}
                    </div>
                  </div>
                </>
              ) : (
                <div data-testid="now-serving">
                  <div className="font-display text-[26px]">Nobody is waiting</div>
                  <div className="text-[15px] text-white/70 mt-1">Patients appear here as soon as they check in at the kiosk.</div>
                </div>
              )}
            </div>
            <div className="px-6 md:px-7 py-5 lg:py-7 border-t lg:border-t-0 lg:border-l border-white/10">
              <div className="text-[13px] text-white/60 font-semibold mb-3">Up next</div>
              {upNext.length === 0 ? <div className="text-[15px] text-white/50">No one else waiting.</div> : (
                <ol className="space-y-2">
                  {upNext.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: ZONE_BG[q.triage_colour] || "#56707A" }} />
                      <span className="figure text-[22px] w-12 shrink-0">{String(q.queue_number).padStart(3, "0")}</span>
                      <span className="truncate text-[15px]">{q.patient?.name}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <dl className="grid grid-cols-2 border-t lg:border-t-0 lg:border-l border-white/10">
              {[["Waiting", waiting], ["With doctor", inProg], ["Seen, to pay", toPay], ["Paid", done]].map(([l, v], i) => (
                <div key={l} className={`px-5 py-4 lg:px-6 lg:py-5 lg:min-w-[8.5rem] border-white/10 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t" : ""}`}>
                  <dt className="text-[13px] text-white/60">{l}</dt>
                  <dd className="figure text-[36px] mt-1">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {pending.length > 0 && (
          <section className="lg:col-span-3 panel p-6 border-l-[6px] border-l-[#E5A800]" data-testid="pending-payments">
            <h2 className="text-[24px]">Payments to confirm <span className="text-[#566663] font-semibold">({pending.length})</span></h2>
            <p className="text-[13px] text-[#566663] mb-4">Confirm only once you have the cash, or can see the DuitNow transfer with this reference. Confirming sends the medicine to the pharmacy.</p>
            <ul className="divide-y divide-[#DAE2DF]">
              {pending.map((p) => (
                <li key={p.txn_ref} className="py-3 flex flex-wrap items-center gap-4" data-testid="pending-payment-row">
                  <span className="figure text-[26px] w-16">{String(p.appointment?.queue_number ?? "").padStart(3, "0")}</span>
                  <span className="flex-1 min-w-[12rem]">
                    <span className="block font-semibold">{p.appointment?.patient?.name}</span>
                    <span className="block text-[13px] text-[#566663]">
                      {p.method === "duitnow" ? "DuitNow QR" : p.method === "cash" ? "At the counter" : p.method} · ref <span className="font-mono">{p.txn_ref}</span>
                    </span>
                  </span>
                  <span className="figure text-[26px]">RM {Number(p.amount || 0).toFixed(2)}</span>
                  <Button onClick={() => confirmPayment(p.txn_ref)} disabled={confirming === p.txn_ref}
                    data-testid={`confirm-payment-${p.txn_ref}`}
                    className="bg-[#10262E] hover:bg-[#0A1A20] text-white rounded-full h-10 px-5">
                    {confirming === p.txn_ref ? "Confirming…" : "Money received"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Actions */}
        <div className="lg:col-span-3 panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[24px]">Everyone today <span className="text-[#566663] font-semibold">({queue.length})</span></h2>
              <p className="text-[13px] text-[#566663]">Most urgent first. Change a status to move a patient along.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="recep-find-btn" onClick={() => setScanOpen(true)} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full">
                <IdentificationCard size={16} className="mr-1.5" /> Find patient
              </Button>
              <Button data-testid="recep-book-btn" onClick={() => setBookOpen(true)} variant="outline" className="border-[#DAE2DF] text-[var(--ml-primary)] hover:bg-[var(--ml-wash)] rounded-full">
                <Plus size={14} className="mr-1.5" /> New booking
              </Button>
              <Button data-testid="trigger-sync-btn" onClick={triggerSync} variant="outline" className="border-[#DAE2DF] text-[var(--ml-primary)] hover:bg-[var(--ml-wash)] rounded-full">
                Sync now
              </Button>
            </div>
          </div>

          {/* Phones: one card per patient instead of a crushed table */}
          <ul className="md:hidden divide-y divide-[#E8EEEC]">
            {queue.length === 0 && <li className="py-6 text-center text-[#566663]">No one has checked in today yet.</li>}
            {queue.map((q) => (
              <li key={q.id} className="py-3.5 flex items-start gap-3" data-testid="queue-card">
                <span className="w-1 self-stretch rounded-full" style={{ background: ZONE_BG[q.triage_colour] || "#C8D3CF" }} />
                <span className="figure text-[26px] w-14 shrink-0">{String(q.queue_number ?? "").padStart(3, "0")}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{q.patient?.name}</span>
                  <span className="block text-[13px] text-[#566663] truncate">{q.doctor?.name} · {q.reason}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className={`inline-flex items-center h-7 px-2.5 rounded-md text-[13px] font-semibold ${statusColors[q.status] || ""}`}>
                      {q.payment_status === "pending" ? "Payment to confirm" : STATUS_LABEL[q.status] || q.status}
                    </span>
                    <span className={`text-[13px] font-semibold ${q.payment_status === "paid" ? "text-[var(--ml-primary)]" : "text-[#566663]"}`}>
                      {q.payment_status === "paid" ? "Paid" : q.payment_status === "pending" ? "To confirm" : "Not paid"}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="text-[13px] text-[#566663]">
                <tr className="border-b border-[#DAE2DF]">
                  <th className="text-left py-3 pl-2">No.</th>
                  <th className="text-left py-3">Triage</th>
                  <th className="text-left py-3">Patient</th>
                  <th className="text-left py-3">Doctor</th>
                  <th className="text-left py-3">Time</th>
                  <th className="text-left py-3">Reason</th>
                  <th className="text-left py-3">Pay</th>
                  <th className="text-left py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-[#566663]">No one has checked in today yet.</td></tr>
                )}
                {queue.map((q) => (
                  <tr key={q.id} data-testid="queue-row" className="border-b border-[#E8EEEC] hover:bg-[#EEF2F1]">
                    <td className="py-3.5 pl-0 pr-3"><span className="flex items-center gap-3"><span className="w-1 h-9 rounded-full" style={{ background: ZONE_BG[q.triage_colour] || "#C8D3CF" }} /><span className="figure text-[22px]">{String(q.queue_number ?? "").padStart(3, "0")}</span></span></td>
                    <td className="py-3"><TriageChip zone={q.triage_colour} short /></td>
                    <td className="py-3">
                      <div className="font-semibold">{q.patient?.name}</div>
                      <div className="text-xs text-[#566663] font-mono">{q.patient?.ic_number}</div>
                    </td>
                    <td className="py-3">{q.doctor?.name}<div className="text-xs text-[#566663]">{q.doctor?.specialty}</div></td>
                    <td className="py-3 font-mono text-xs">{new Date(q.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-3 text-[13px] max-w-[200px] truncate">{q.reason}</td>
                    <td className="py-3">
                      <span className={`text-[13px] font-semibold ${q.payment_status === "paid" ? "text-[var(--ml-primary)]" : q.payment_status === "pending" ? "text-[#10262E]" : "text-[#566663]"}`}>
                        {q.payment_status === "paid" ? "Paid" : q.payment_status === "pending" ? "To confirm" : "Not paid"}
                      </span>
                    </td>
                    <td className="py-3">
                      {statusOptions.includes(q.status) && q.payment_status !== "pending" ? (
                      <Select value={q.status} onValueChange={(v) => setStatus(q.id, v)}>
                        <SelectTrigger data-testid={`status-select-${q.id}`} className={`w-[180px] h-9 border-[#DAE2DF] text-[13px] font-semibold ${statusColors[q.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      ) : (
                        <span className={`inline-flex items-center w-[180px] h-9 px-3 rounded-md text-[13px] font-semibold ${statusColors[q.status] || ""}`} data-testid={`status-select-${q.id}`}>
                          {q.payment_status === "pending" ? "Payment to confirm" : STATUS_LABEL[q.status] || q.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </>
      )}

      {view === "patients" && (
        <div className="rounded-2xl border border-[#DAE2DF] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="overline">Registered Patients</div>
              <h3 className="font-display text-xl mt-1">{patients.length} on file</h3>
            </div>
            <Users size={18} weight="duotone" color="#0A6E62" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {patients.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-[#DAE2DF] bg-[#EEF2F1]" data-testid="patient-card">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-[#566663] font-mono mt-1">{p.ic_number}</div>
                <div className="text-xs text-[#566663]">{p.phone || "—"} · {p.gender || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ICScanner open={scanOpen} onOpenChange={setScanOpen} onMatch={onPatientFound} />

      <Dialog open={bookOpen} onOpenChange={(o) => { setBookOpen(o); if (!o) setScannedPatient(null); }}>
        <DialogContent data-testid="recep-book-dialog" className="bg-[#EEF2F1] border-[#DAE2DF] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">New appointment</DialogTitle>
            <DialogDescription>
              {scannedPatient ? `Patient: ${scannedPatient.name} (${scannedPatient.ic_number})` : "Walk-in / phone booking"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!scannedPatient && (
              <div className="space-y-1.5">
                <Label>Patient</Label>
                <Select value={booking.patient_id} onValueChange={(v) => setBooking({ ...booking, patient_id: v })}>
                  <SelectTrigger data-testid="book-patient-select" className="border-[#DAE2DF]">
                    <SelectValue placeholder="Choose patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} · {p.ic_number}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={booking.doctor_id} onValueChange={(v) => setBooking({ ...booking, doctor_id: v })}>
                <SelectTrigger data-testid="book-doctor-select-r" className="border-[#DAE2DF]"><SelectValue placeholder="Choose doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name} · {d.specialty || "General"}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pick a slot</Label>
              <SlotPicker
                doctorId={booking.doctor_id}
                value={booking.scheduled_at}
                onChange={(iso) => setBooking({ ...booking, scheduled_at: iso })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea data-testid="book-reason-r" value={booking.reason} onChange={(e) => setBooking({ ...booking, reason: e.target.value })} className="border-[#DAE2DF]" />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="book-confirm-r"
              disabled={!booking.patient_id || !booking.doctor_id || !booking.scheduled_at}
              onClick={createBooking}
              className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"
            >
              Create & assign token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl p-3 bg-[var(--ml-wash)] border border-[#DAE2DF]">
      <div className="overline">{label}</div>
      <div className="font-display text-3xl mt-1 text-[var(--ml-primary)] tabular-nums">{value}</div>
    </div>
  );
}
