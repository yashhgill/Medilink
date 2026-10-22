import { QueueTicket } from "@/components/Triage";
import { fmtDateTime, fmtDate } from "@/lib/utils";
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import AppShell from "@/components/AppShell";
import PatientBottomNav from "@/components/PatientBottomNav";
import api, { errMsg, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SlotPicker from "@/components/SlotPicker";
import { AttachmentList } from "@/components/Attachments";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Calendar, CreditCard, FileText, Pill, Plus, WaveTriangle } from "@phosphor-icons/react";
import { toast } from "sonner";

const downloadPdf = async (path, filename) => {
  const token = localStorage.getItem("ml_token");
  const r = await fetch(`${BACKEND_URL}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("download failed");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const STATUS_TEXT = { scheduled: "Booked", checked_in: "Waiting", in_progress: "With doctor", completed: "Seen", ready_for_pharmacy: "At pharmacy", dispensed: "Done", cancelled: "Cancelled" };
const statusColors = {
  scheduled: "bg-white text-[#10201D]",
  checked_in: "bg-[var(--ml-wash)] text-[var(--ml-primary-soft)]",
  in_progress: "bg-[#10262E] text-white",
  completed: "bg-[#DCE6F0] text-[#10262E]",
  ready_for_pharmacy: "bg-[var(--ml-primary)] text-white",
  dispensed: "bg-[#EEF3F1] text-[#566663]",
  cancelled: "bg-[#EEF3F1] text-[#566663] line-through",
};

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-[#DAE2DF] bg-white p-6 ${className}`}>{children}</div>
);

export default function PatientDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const view = loc.pathname.split("/")[2] || "overview";
  const [approveCode, setApproveCode] = React.useState("");
  const approveAccess = async () => {
    if (!approveCode.trim()) return;
    try {
      const r = await api.post("/consent/approve", { code: approveCode.trim() });
      toast.success("Access approved for " + (r.data.facility || "the clinic"));
      setApproveCode("");
    } catch (e) { toast.error("Invalid or expired code"); }
  };

  const [appts, setAppts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [vax, setVax] = useState([]);
  const [facilityMap, setFacilityMap] = useState({});
  const [openBook, setOpenBook] = useState(false);
  const [openPay, setOpenPay] = useState(null);
  const [qrPay, setQrPay] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({ email: "", phone: "" });
  const [booking, setBooking] = useState({ doctor_id: "", scheduled_at: "", reason: "" });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [a, d, r, rc, vx, facs] = await Promise.all([
      api.get("/appointments").catch(() => ({ data: [] })),
      api.get("/doctors").catch(() => ({ data: [] })),
      api.get(`/records/patient/${user.id}`).catch(() => ({ data: [] })),
      api.get("/patient/receipts").catch(() => ({ data: [] })),
      api.get(`/patients/${user.id}/vaccinations`).catch(() => ({ data: [] })),
      api.get("/facilities").catch(() => ({ data: [] })),
    ]);
    setAppts(a.data || []); setDoctors(d.data || []); setRecords(r.data || []);
    setReceipts(rc.data || []); setVax(vx.data || []);
    const fm = {};
    (facs.data || []).forEach(f => { fm[f.code] = f.name; });
    setFacilityMap(fm);
  };
  useEffect(() => { load(); }, []);
  useQueueSocket((ev) => { if (ev?.type?.startsWith("appointment.")) load(); });

  const book = async () => {
    setLoading(true);
    try {
      await api.post("/appointments", { patient_id: user.id, doctor_id: booking.doctor_id,
        scheduled_at: booking.scheduled_at, reason: booking.reason, fee: 50 });
      toast.success("Appointment booked");
      setOpenBook(false); setBooking({ doctor_id: "", scheduled_at: "", reason: "" }); load();
    } catch (e) { toast.error(errMsg(e, "Booking failed")); } finally { setLoading(false); }
  };
  const saveProfile = async () => {
    try {
      await api.patch(`/patients/${user.id}`, { email: profile.email || undefined, phone: profile.phone || undefined });
      toast.success("Profile updated"); setProfileOpen(false);
    } catch (e) { toast.error(errMsg(e, "Could not update profile")); }
  };
  const pay = async (appt) => {
    try { const r = await api.post(`/patient/bills/${appt.id}/pay`); setQrPay(r.data.payment); }
    catch (e) { toast.error(errMsg(e, "Could not start payment")); }
  };
  const confirmPay = async () => {
    if (!qrPay) return; setConfirming(true);
    try {
      const r = await api.post(`/patient/payments/${qrPay.ref}/confirm`);
      toast.success(r.data?.awaiting_staff
        ? "Thanks. The counter will confirm your payment, then your medicine will be ready."
        : "Payment received. Thank you.");
      setQrPay(null); setOpenPay(null); load();
    } catch (e) { toast.error(errMsg(e, "Confirmation failed")); } finally { setConfirming(false); }
  };

  const ACTIVE = ["scheduled", "checked_in", "in_progress", "ready_for_pharmacy"];
  const nextAppt = appts.filter((a) => ACTIVE.includes(a.status)).slice(-1)[0] || null;

  const titles = { overview: `Hello, ${user.name.split(" ")[0]}.`, records: "Medical Records",
    billing: "Receipts & Billing", vaccines: "Vaccinations" };

  return (
    <AppShell
      title={titles[view] || titles.overview}
      subtitle="Patient portal"
      navItems={[
        { label: "Overview", to: "/patient" },
        { label: "Medical Records", to: "/patient/records" },
        { label: "Receipts & Billing", to: "/patient/billing" },
        { label: "Vaccinations", to: "/patient/vaccines" },
      ]}
    >
      {view === "overview" && (
        <div className="space-y-6">
          {nextAppt ? (
            <section>
              <h2 className="text-lg font-bold mb-3">Your visit today</h2>
              <QueueTicket number={nextAppt.queue_number} zone={nextAppt.triage_colour}>
                <div className="text-[15px] text-[#566663]">Doctor</div>
                <div className="text-lg font-bold">{nextAppt.doctor?.name}</div>
                <div className="mt-2 text-[15px] font-semibold text-[var(--ml-primary-soft)]">
                  {{ scheduled: "Booked. Check in at the kiosk when you arrive.",
                     checked_in: "Waiting to be called.",
                     in_progress: "With the doctor now.",
                     ready_for_pharmacy: "Collect your medicine at the pharmacy." }[nextAppt.status] || ""}
                </div>
              </QueueTicket>
            </section>
          ) : (
            <section className="rounded-2xl border border-[#DAE2DF] bg-white p-5 flex flex-wrap items-center gap-4 justify-between">
              <div>
                <h2 className="text-lg font-bold">No visit today</h2>
                <p className="text-[15px] text-[#566663]">Book a time, or just walk in and check in at the kiosk.</p>
              </div>
              <Button onClick={() => setOpenBook(true)} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-full h-11 px-5">
                <Plus size={16} className="mr-1.5" /> Book a visit
              </Button>
            </section>
          )}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">My visits <span className="text-[#566663] font-semibold">({appts.length})</span></h2>
              {nextAppt && <Button size="sm" variant="outline" onClick={() => setOpenBook(true)} className="rounded-full border-[#C8D3CF]"><Plus size={14} className="mr-1" /> Book</Button>}
            </div>
            <div className="space-y-2">
              {appts.length === 0 && <div className="text-sm text-[#566663]">No appointments yet.</div>}
              {appts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#DAE2DF] hover:bg-[var(--ml-wash)] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-12 text-center font-mono text-lg font-bold">{String(a.queue_number ?? "").padStart(3, "0")}</div>
                    <div>
                      <div className="text-sm font-medium">{a.doctor?.name} · <span className="text-[#566663] font-normal">{a.doctor?.specialty || "General"}</span></div>
                      <div className="text-xs text-[#566663] font-mono">{fmtDateTime(a.scheduled_at)}</div>
                      <div className="text-xs text-[#566663]">{a.reason}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[a.status]}>{(STATUS_TEXT[a.status] || a.status)}</Badge>
                    {a.payment_status === "paid"
                      ? <span className="text-[13px] font-semibold text-[var(--ml-primary)]">Paid · RM{Number(a.paid_amount || 0).toFixed(2)}</span>
                      : a.payment_status === "pending"
                      ? <span className="text-[13px] font-semibold text-[#10262E]">Payment being checked</span>
                      : a.status === "completed"
                      ? <Button size="sm" onClick={() => setOpenPay(a)} className="bg-[#10262E] hover:bg-[#0A1A20] text-white rounded-full h-9 px-4"><CreditCard size={14} className="mr-1.5" /> Pay</Button>
                      : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold mb-1">Share my records with another clinic</h2>
            <div className="text-sm text-[#566663] mb-3">If a doctor at another clinic asks to see your history, enter the 6-digit code they give you.</div>
            <div className="flex items-center gap-2">
              <input value={approveCode} onChange={(e) => setApproveCode(e.target.value)} inputMode="numeric" maxLength={6}
                placeholder="6-digit code" className="flex-1 rounded-xl border border-[#DAE2DF] bg-[#EEF2F1] px-3 py-2.5 text-sm font-mono outline-none focus:border-[var(--ml-primary)]" />
              <button onClick={approveAccess} className="px-4 py-2.5 rounded-xl bg-[var(--ml-primary)] text-white text-sm hover:bg-[var(--ml-primary-soft)]">Approve</button>
            </div>
          </Card>
        </div>
      )}

      {view === "records" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="overline">Medical Records</div>
            <div className="flex items-center gap-2">
              <button onClick={() => downloadPdf("/patient/history/pdf", "medical-history.pdf").catch(() => toast.error("Download failed"))}
                className="text-xs px-3 py-1.5 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]">Download PDF</button>
              <button onClick={() => { setProfile({ email: user.email?.includes("@patient.medilink") ? "" : user.email, phone: user.phone || "" }); setProfileOpen(true); }}
                className="text-xs px-3 py-1.5 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]">Edit profile</button>
              <FileText size={18} weight="duotone" color="#0A6E62" />
            </div>
          </div>
          {records.length === 0 && <div className="text-sm text-[#566663]">No records yet.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {records.map((r) => (
              <div key={r.id} className="p-4 rounded-xl bg-[var(--ml-wash)] border border-[#DAE2DF]">
                <div className="text-[10px] text-[#566663]">
                  {fmtDate(r.created_at)} · {r.doctor?.name || (r.external ? (r.facility_name || facilityMap[r.facility_id] || r.facility_id) : "Clinic Staff")}
                  {r.external && <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-700">{r.facility_name || facilityMap[r.facility_id] || r.facility_id}</span>}
                </div>
                <div className="text-sm font-medium mt-1">{r.diagnosis}</div>
                {r.notes && <div className="text-xs text-[#566663] mt-1">{r.notes}</div>}
                {r.prescriptions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.prescriptions.map((p, i) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-2 text-[var(--ml-primary)]"><Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency}</div>
                    ))}
                  </div>
                )}
                {r.attachments?.length > 0 && <AttachmentList files={r.attachments} />}

              </div>
            ))}
          </div>
        </Card>
      )}

      {view === "billing" && (
        <Card>
          <div className="flex items-center justify-between mb-4"><div className="overline">Receipts</div><CreditCard size={18} weight="duotone" color="#0A6E62" /></div>
          {receipts.length === 0 && <div className="text-sm text-[#566663]">No payments yet.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {receipts.map((r) => (
              <div key={r.txn_ref} className="flex items-center justify-between p-4 rounded-xl border border-[#DAE2DF]">
                <div>
                  <div className="text-sm font-medium">RM {Number(r.amount).toFixed(2)} · {r.method}</div>
                  <div className="text-[11px] font-mono text-[#566663]">{r.txn_ref}</div>
                  <div className="text-[11px] text-[#566663]">{fmtDateTime(r.paid_at)} · {r.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadPdf(`/patient/receipts/${r.txn_ref}/pdf`, `receipt-${r.txn_ref}.pdf`).catch(() => toast.error("Download failed"))}
                    className="text-[11px] px-2 py-1 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]">PDF</button>
                  <Badge className="bg-[#0A6E62]/20 text-[var(--ml-primary)]">paid</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view === "vaccines" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="overline">Vaccinations</div>
            <button onClick={() => downloadPdf(`/patients/${user.id}/vaccinations/pdf`, "vaccination-certificate.pdf").catch(() => toast.error("Download failed"))}
              className="text-xs px-3 py-1.5 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]">Certificate PDF</button>
          </div>
          {vax.length === 0 && <div className="text-sm text-[#566663]">No vaccinations recorded.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {vax.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-4 rounded-xl border border-[#DAE2DF]">
                <div>
                  <div className="text-sm font-medium">{v.vaccine} · <span className="font-normal text-[#566663]">{v.dose}</span></div>
                  <div className="text-[11px] text-[#566663]">{(v.administered_at || "").slice(0, 10)} · {v.doctor_name}</div>
                </div>
                <Badge className="bg-[#0A6E62]/20 text-[var(--ml-primary)]">done</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Book dialog */}
      <Dialog open={openBook} onOpenChange={setOpenBook}>
        <DialogContent className="bg-[#EEF2F1] border-[#DAE2DF] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">Book an appointment</DialogTitle><DialogDescription>Pick a doctor and time.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={booking.doctor_id} onValueChange={(v) => setBooking({ ...booking, doctor_id: v })}>
                <SelectTrigger className="border-[#DAE2DF]"><SelectValue placeholder="Choose a doctor" /></SelectTrigger>
                <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.specialty || "General"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Pick a slot</Label><SlotPicker doctorId={booking.doctor_id} value={booking.scheduled_at} onChange={(iso) => setBooking({ ...booking, scheduled_at: iso })} /></div>
            <div className="space-y-1.5"><Label>Reason for visit</Label><Textarea value={booking.reason} onChange={(e) => setBooking({ ...booking, reason: e.target.value })} placeholder="e.g. Persistent cough for 4 days" className="border-[#DAE2DF]" /></div>
          </div>
          <DialogFooter><Button disabled={!booking.doctor_id || !booking.scheduled_at || loading} onClick={book} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]">{loading ? "Booking…" : "Confirm booking"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!openPay} onOpenChange={(o) => !o && (setOpenPay(null), setQrPay(null))}>
        <DialogContent className="bg-[#EEF2F1] border-[#DAE2DF]">
          <DialogHeader><DialogTitle className="font-display text-2xl">Pay your bill</DialogTitle><DialogDescription>Scan the DuitNow QR with your banking app.</DialogDescription></DialogHeader>
          {openPay && !qrPay && (
            <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5">
              <div className="overline">Amount</div>
              <div className="font-display text-4xl mt-1">RM {(openPay.fee || 50).toFixed(2)}</div>
              <div className="text-sm text-[#566663] mt-2">{openPay.doctor?.name} · {fmtDateTime(openPay.scheduled_at)}</div>
            </div>
          )}
          {qrPay && (
            <div className="rounded-2xl border border-[#DAE2DF] bg-white p-5 text-center">
              <img src={`data:image/png;base64,${qrPay.qr}`} alt="DuitNow QR" className="w-52 h-52 mx-auto rounded-xl border border-[#DAE2DF]" />
              <div className="font-mono text-xs text-[#566663] mt-2">{qrPay.ref}</div>
              <div className="font-display text-2xl mt-1">RM {Number(qrPay.amount).toFixed(2)}</div>
            </div>
          )}
          <DialogFooter>
            {!qrPay
              ? <Button onClick={() => pay(openPay)} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"><CreditCard size={16} className="mr-1.5" /> Show DuitNow QR</Button>
              : <Button onClick={confirmPay} disabled={confirming} className="bg-[var(--ml-primary)] hover:bg-[#064F5A] text-[#EEF2F1]">{confirming ? "Sending…" : "I've paid"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="bg-[#EEF2F1] border-[#DAE2DF]">
          <DialogHeader><DialogTitle className="font-display text-2xl">My profile</DialogTitle><DialogDescription>Add contact details for reminders and receipts. You always sign in with your IC.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Email (optional)</Label><Input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="you@email.com" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="012-345 6789" className="border-[#DAE2DF]" /></div>
          </div>
          <DialogFooter><Button onClick={saveProfile} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <PatientBottomNav onProfile={() => setProfileOpen(true)} />
    </AppShell>
  );
}
