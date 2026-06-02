import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import SyncIndicator from "@/components/SyncIndicator";
import NFCScanner from "@/components/NFCScanner";
import SlotPicker from "@/components/SlotPicker";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WaveTriangle, Users, Calendar, ListChecks, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

const statusOptions = ["scheduled", "checked_in", "in_progress", "completed", "cancelled"];
const statusColors = {
  scheduled: "bg-[#F3EFE9] text-[#1C3F39]",
  checked_in: "bg-[#D4A373]/30 text-[#1C3F39]",
  in_progress: "bg-[#B55B49]/20 text-[#9B2226]",
  completed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
  cancelled: "bg-[#5C6661]/15 text-[#5C6661]",
};

export default function ReceptionDashboard() {
  const [queue, setQueue] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [nfcOpen, setNfcOpen] = useState(false);
  const [scannedPatient, setScannedPatient] = useState(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [booking, setBooking] = useState({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "" });

  const load = async () => {
    const [q, p, d] = await Promise.all([
      api.get("/queue/today"),
      api.get("/patients"),
      api.get("/doctors"),
    ]);
    setQueue(q.data);
    setPatients(p.data);
    setDoctors(d.data);
  };

  useEffect(() => {
    load();
  }, []);

  useQueueSocket((ev) => {
    if (ev?.type?.startsWith("appointment.")) load();
  });

  const setStatus = async (id, status) => {
    await api.patch(`/appointments/${id}`, { status });
    toast.success(`Updated → ${status.replace("_", " ")}`);
    load();
  };

  const triggerSync = async () => {
    await api.post("/sync/trigger");
    toast.info("Sync triggered");
    load();
  };

  const onNFCMatch = (data) => {
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

  const checkedIn = queue.filter((q) => q.status === "checked_in").length;
  const inProg = queue.filter((q) => q.status === "in_progress").length;
  const done = queue.filter((q) => q.status === "completed").length;
  const upcoming = queue.filter((q) => q.status === "scheduled").length;
  const next = queue.find((q) => ["checked_in", "scheduled"].includes(q.status));

  return (
    <AppShell title="Reception · Live Queue" subtitle="Admin · Operations" navItems={[]}>
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Now serving */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-[#1C3F39] text-[#F9F9F6] p-6">
          <div className="overline text-white/60">Now Serving</div>
          <div className="font-display text-7xl tabular-nums mt-2 font-mono leading-none" data-testid="now-serving">
            {next ? `#${String(next.queue_number).padStart(3, "0")}` : "—"}
          </div>
          {next && (
            <div className="text-sm text-white/70 mt-3">
              {next.patient?.name} → {next.doctor?.name}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="overline mb-3">Today&apos;s Stats</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Scheduled" value={upcoming} />
            <Stat label="Checked-in" value={checkedIn} />
            <Stat label="In progress" value={inProg} />
            <Stat label="Completed" value={done} />
          </div>
        </div>

        <SyncIndicator />

        {/* Actions */}
        <div className="lg:col-span-3 rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <div className="overline">Live Queue</div>
              <h3 className="font-display text-xl mt-1">{queue.length} appointment(s) today</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="recep-nfc-btn" onClick={() => setNfcOpen(true)} className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full">
                <WaveTriangle size={14} weight="duotone" className="mr-1.5" /> NFC Check-in
              </Button>
              <Button data-testid="recep-book-btn" onClick={() => setBookOpen(true)} variant="outline" className="border-[#E2DDD7] text-[#1C3F39] hover:bg-[#F3EFE9] rounded-full">
                <Plus size={14} className="mr-1.5" /> New booking
              </Button>
              <Button data-testid="trigger-sync-btn" onClick={triggerSync} variant="outline" className="border-[#E2DDD7] text-[#1C3F39] hover:bg-[#F3EFE9] rounded-full">
                Trigger sync
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
                <tr className="border-b border-[#E2DDD7]">
                  <th className="text-left py-3 pl-2">#</th>
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
                  <tr><td colSpan={7} className="py-6 text-center text-[#5C6661]">No appointments today.</td></tr>
                )}
                {queue.map((q) => (
                  <tr key={q.id} data-testid="queue-row" className="border-b border-[#E2DDD7]/60 hover:bg-[#F3EFE9]/50">
                    <td className="py-3 pl-2 font-mono text-[#1C3F39]">#{q.queue_number}</td>
                    <td className="py-3">
                      <div className="font-medium">{q.patient?.name}</div>
                      <div className="text-xs text-[#5C6661] font-mono">{q.patient?.ic_number}</div>
                    </td>
                    <td className="py-3">{q.doctor?.name}<div className="text-xs text-[#5C6661]">{q.doctor?.specialty}</div></td>
                    <td className="py-3 font-mono text-xs">{new Date(q.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-3 text-xs max-w-[180px] truncate">{q.reason}</td>
                    <td className="py-3">
                      <Badge className={q.payment_status === "paid" ? "bg-[#2D6A4F]/20 text-[#2D6A4F]" : "bg-[#5C6661]/15 text-[#5C6661]"}>
                        {q.payment_status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Select value={q.status} onValueChange={(v) => setStatus(q.id, v)}>
                        <SelectTrigger data-testid={`status-select-${q.id}`} className={`w-[140px] h-8 border-[#E2DDD7] ${statusColors[q.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patients table */}
        <div className="lg:col-span-3 rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="overline">Registered Patients</div>
              <h3 className="font-display text-xl mt-1">{patients.length} on file</h3>
            </div>
            <Users size={18} weight="duotone" color="#1C3F39" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {patients.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-[#E2DDD7] bg-[#F9F9F6]" data-testid="patient-card">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-[#5C6661] font-mono mt-1">{p.ic_number}</div>
                <div className="text-xs text-[#5C6661]">{p.phone || "—"} · {p.gender || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NFCScanner open={nfcOpen} onOpenChange={setNfcOpen} onMatch={onNFCMatch} />

      <Dialog open={bookOpen} onOpenChange={(o) => { setBookOpen(o); if (!o) setScannedPatient(null); }}>
        <DialogContent data-testid="recep-book-dialog" className="bg-[#F9F9F6] border-[#E2DDD7] max-w-3xl max-h-[90vh] overflow-y-auto">
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
                  <SelectTrigger data-testid="book-patient-select" className="border-[#E2DDD7]">
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
                <SelectTrigger data-testid="book-doctor-select-r" className="border-[#E2DDD7]"><SelectValue placeholder="Choose doctor" /></SelectTrigger>
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
              <Textarea data-testid="book-reason-r" value={booking.reason} onChange={(e) => setBooking({ ...booking, reason: e.target.value })} className="border-[#E2DDD7]" />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="book-confirm-r"
              disabled={!booking.patient_id || !booking.doctor_id || !booking.scheduled_at}
              onClick={createBooking}
              className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
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
    <div className="rounded-xl p-3 bg-[#F3EFE9] border border-[#E2DDD7]">
      <div className="overline">{label}</div>
      <div className="font-display text-3xl mt-1 text-[#1C3F39] tabular-nums">{value}</div>
    </div>
  );
}
