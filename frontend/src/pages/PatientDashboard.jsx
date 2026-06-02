import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SyncIndicator from "@/components/SyncIndicator";
import SlotPicker from "@/components/SlotPicker";
import { AttachmentList } from "@/components/Attachments";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Calendar, CreditCard, FileText, Pill, Plus, Stethoscope, WaveTriangle } from "@phosphor-icons/react";
import { toast } from "sonner";

const statusColors = {
  scheduled: "bg-[#F3EFE9] text-[#1C3F39]",
  checked_in: "bg-[#D4A373]/30 text-[#1C3F39]",
  in_progress: "bg-[#B55B49]/20 text-[#9B2226]",
  completed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
  ready_for_pharmacy: "bg-[#1C3F39] text-[#F9F9F6]",
  dispensed: "bg-[#2D6A4F] text-[#F9F9F6]",
  cancelled: "bg-[#5C6661]/15 text-[#5C6661]",
};

export default function PatientDashboard() {
  const { user } = useAuth();
  const [appts, setAppts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [openBook, setOpenBook] = useState(false);
  const [openPay, setOpenPay] = useState(null);
  const [booking, setBooking] = useState({ doctor_id: "", scheduled_at: "", reason: "" });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [a, d, r] = await Promise.all([
      api.get("/appointments"),
      api.get("/doctors"),
      api.get(`/records/patient/${user.id}`),
    ]);
    setAppts(a.data);
    setDoctors(d.data);
    setRecords(r.data);
  };

  useEffect(() => {
    load();
  }, []);

  useQueueSocket((ev) => {
    if (ev?.type?.startsWith("appointment.")) load();
  });

  const book = async () => {
    setLoading(true);
    try {
      await api.post("/appointments", {
        patient_id: user.id,
        doctor_id: booking.doctor_id,
        scheduled_at: booking.scheduled_at,
        reason: booking.reason,
        fee: 50,
      });
      toast.success("Appointment booked");
      setOpenBook(false);
      setBooking({ doctor_id: "", scheduled_at: "", reason: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  const pay = async (appt) => {
    try {
      await api.post("/payments/mock", {
        appointment_id: appt.id,
        amount: appt.fee || 50,
        method: "card",
      });
      toast.success("Payment successful");
      setOpenPay(null);
      load();
    } catch (e) {
      toast.error("Payment failed");
    }
  };

  const upcoming = appts.filter((a) => a.status !== "completed" && a.status !== "cancelled");
  const nextAppt = upcoming[upcoming.length - 1] || null;

  return (
    <AppShell
      title={`Hello, ${user.name.split(" ")[0]}.`}
      subtitle="Patient dashboard"
      navItems={[]}
    >
      {/* Bento grid */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* My Queue */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="overline">My Queue Number</div>
            <WaveTriangle size={18} weight="duotone" color="#1C3F39" />
          </div>
          {nextAppt ? (
            <>
              <div className="font-display text-7xl text-[#1C3F39] font-mono tabular-nums leading-none" data-testid="queue-number-display">
                #{String(nextAppt.queue_number).padStart(3, "0")}
              </div>
              <div className="text-sm text-[#5C6661] mt-3">
                with <span className="font-medium text-[#0A0F0D]">{nextAppt.doctor?.name}</span>
              </div>
              <Badge className={`mt-3 ${statusColors[nextAppt.status]}`}>{nextAppt.status.replace("_", " ")}</Badge>
            </>
          ) : (
            <div className="text-sm text-[#5C6661]">No upcoming appointments.</div>
          )}
        </div>

        {/* Sync indicator */}
        <SyncIndicator />

        {/* Quick actions */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-[#1C3F39] text-[#F9F9F6] p-6 flex flex-col">
          <div className="overline text-white/60">Quick action</div>
          <h3 className="font-display text-2xl mt-2">Book your next visit</h3>
          <p className="text-sm text-white/70 mt-1 mb-5 flex-1">
            Choose a doctor, pick a time, and we&apos;ll assign you a token number instantly.
          </p>
          <Button
            data-testid="book-appointment-btn"
            onClick={() => setOpenBook(true)}
            className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6] rounded-full self-start"
          >
            <Plus size={16} className="mr-1.5" /> Book appointment
          </Button>
        </div>

        {/* Appointments */}
        <div className="lg:col-span-2 rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="overline">My Appointments</div>
              <h3 className="font-display text-xl mt-1">{appts.length} total</h3>
            </div>
            <Calendar size={18} weight="duotone" color="#1C3F39" />
          </div>
          <div className="space-y-2">
            {appts.length === 0 && <div className="text-sm text-[#5C6661]">No appointments yet.</div>}
            {appts.map((a) => (
              <div key={a.id} data-testid="appt-row" className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#E2DDD7] hover:bg-[#F3EFE9] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F3EFE9] flex items-center justify-center font-mono text-sm">
                    #{a.queue_number}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{a.doctor?.name} · <span className="text-[#5C6661] font-normal">{a.doctor?.specialty || "General"}</span></div>
                    <div className="text-xs text-[#5C6661] font-mono">{new Date(a.scheduled_at).toLocaleString()}</div>
                    <div className="text-xs text-[#5C6661]">{a.reason}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[a.status]}>{a.status.replace("_", " ")}</Badge>
                  {a.payment_status === "paid" ? (
                    <Badge className="bg-[#2D6A4F]/20 text-[#2D6A4F]">Paid · RM{a.paid_amount}</Badge>
                  ) : (
                    <Button
                      data-testid={`pay-btn-${a.id}`}
                      size="sm"
                      onClick={() => setOpenPay(a)}
                      className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6] rounded-full h-8 px-3"
                    >
                      <CreditCard size={14} className="mr-1.5" /> Pay RM{a.fee || 50}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Records */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="overline">Medical Records</div>
            <FileText size={18} weight="duotone" color="#1C3F39" />
          </div>
          {records.length === 0 && <div className="text-sm text-[#5C6661]">No records yet.</div>}
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {records.map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-[#F3EFE9] border border-[#E2DDD7]" data-testid="record-card">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
                  {new Date(r.created_at).toLocaleDateString()} · {r.doctor?.name}
                </div>
                <div className="text-sm font-medium mt-1">{r.diagnosis}</div>
                {r.notes && <div className="text-xs text-[#5C6661] mt-1">{r.notes}</div>}
                {r.prescriptions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.prescriptions.map((p, i) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-2 text-[#1C3F39]">
                        <Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency}
                      </div>
                    ))}
                  </div>
                )}
                {r.attachments?.length > 0 && <AttachmentList files={r.attachments} />}
                <div className="mt-2 text-[10px] font-mono text-[#5C6661] flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.sync_status === "cloud" ? "bg-[#2D6A4F]" : "bg-[#D4A373]"} breathe`} />
                  {r.sync_status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Book dialog */}
      <Dialog open={openBook} onOpenChange={setOpenBook}>
        <DialogContent data-testid="book-dialog" className="bg-[#F9F9F6] border-[#E2DDD7] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Book an appointment</DialogTitle>
            <DialogDescription>Pick a doctor and time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={booking.doctor_id} onValueChange={(v) => setBooking({ ...booking, doctor_id: v })}>
                <SelectTrigger data-testid="book-doctor-select" className="border-[#E2DDD7]">
                  <SelectValue placeholder="Choose a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.specialty || "General"}
                    </SelectItem>
                  ))}
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
              <Label>Reason for visit</Label>
              <Textarea
                data-testid="book-reason"
                value={booking.reason}
                onChange={(e) => setBooking({ ...booking, reason: e.target.value })}
                placeholder="e.g. Persistent cough for 4 days"
                className="border-[#E2DDD7]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="book-confirm-btn"
              disabled={!booking.doctor_id || !booking.scheduled_at || loading}
              onClick={book}
              className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
            >
              {loading ? "Booking…" : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!openPay} onOpenChange={(o) => !o && setOpenPay(null)}>
        <DialogContent data-testid="pay-dialog" className="bg-[#F9F9F6] border-[#E2DDD7]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Mock payment</DialogTitle>
            <DialogDescription>Simulated card payment — no real charge.</DialogDescription>
          </DialogHeader>
          {openPay && (
            <div className="rounded-2xl border border-[#E2DDD7] bg-white p-5">
              <div className="overline">Amount</div>
              <div className="font-display text-4xl mt-1">RM {(openPay.fee || 50).toFixed(2)}</div>
              <div className="text-sm text-[#5C6661] mt-2">
                {openPay.doctor?.name} · {new Date(openPay.scheduled_at).toLocaleString()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              data-testid="pay-confirm-btn"
              onClick={() => pay(openPay)}
              className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6]"
            >
              <CreditCard size={16} className="mr-1.5" /> Pay now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
