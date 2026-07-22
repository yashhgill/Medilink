import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import AppShell from "@/components/AppShell";
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

const statusColors = {
  scheduled: "bg-[#EAF5F5] text-[#0B7C8C]",
  checked_in: "bg-[#086788]/30 text-[#0B7C8C]",
  in_progress: "bg-[#0A3D62]/20 text-[#9B2226]",
  completed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
  ready_for_pharmacy: "bg-[#0B7C8C] text-[#F4F9F9]",
  dispensed: "bg-[#2D6A4F] text-[#F4F9F9]",
  cancelled: "bg-[#5A6B70]/15 text-[#5A6B70]",
};

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-[#DCE8E9] bg-white p-6 ${className}`}>{children}</div>
);

export default function PatientDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const view = loc.pathname.split("/")[2] || "overview";

  const [appts, setAppts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [vax, setVax] = useState([]);
  const [openBook, setOpenBook] = useState(false);
  const [openPay, setOpenPay] = useState(null);
  const [qrPay, setQrPay] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState({ email: "", phone: "" });
  const [booking, setBooking] = useState({ doctor_id: "", scheduled_at: "", reason: "" });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [a, d, r, rc, vx] = await Promise.all([
      api.get("/appointments"),
      api.get("/doctors"),
      api.get(`/records/patient/${user.id}`),
      api.get("/patient/receipts").catch(() => ({ data: [] })),
      api.get(`/patients/${user.id}/vaccinations`).catch(() => ({ data: [] })),
    ]);
    setAppts(a.data); setDoctors(d.data); setRecords(r.data);
    setReceipts(rc.data); setVax(vx.data);
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
      await api.post(`/patient/payments/${qrPay.ref}/confirm`);
      toast.success("Payment received — thank you"); setQrPay(null); setOpenPay(null); load();
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
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="overline">My Queue Number</div>
                <WaveTriangle size={18} weight="duotone" color="#0B7C8C" />
              </div>
              {nextAppt ? (
                <>
                  <div className="font-display text-7xl text-[#0B7C8C] font-mono tabular-nums leading-none">
                    #{String(nextAppt.queue_number).padStart(3, "0")}
                  </div>
                  <div className="text-sm text-[#5A6B70] mt-3">with <span className="font-medium text-[#12262B]">{nextAppt.doctor?.name}</span></div>
                  <Badge className={`mt-3 ${statusColors[nextAppt.status]}`}>{nextAppt.status.replaceAll("_", " ")}</Badge>
                </>
              ) : <div className="text-sm text-[#5A6B70]">No active visit right now.</div>}
            </Card>
            <div className="rounded-2xl border border-[#DCE8E9] bg-[#0B7C8C] text-[#F4F9F9] p-6 flex flex-col">
              <div className="overline text-white/60">Quick action</div>
              <h3 className="font-display text-2xl mt-2">Book your next visit</h3>
              <p className="text-sm text-white/70 mt-1 mb-5 flex-1">Choose a doctor, pick a time, and we&apos;ll assign you a token number instantly.</p>
              <Button onClick={() => setOpenBook(true)} className="bg-[#0A3D62] hover:bg-[#083150] text-[#F4F9F9] rounded-full self-start">
                <Plus size={16} className="mr-1.5" /> Book appointment
              </Button>
            </div>
          </div>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div><div className="overline">My Appointments</div><h3 className="font-display text-xl mt-1">{appts.length} total</h3></div>
              <Calendar size={18} weight="duotone" color="#0B7C8C" />
            </div>
            <div className="space-y-2">
              {appts.length === 0 && <div className="text-sm text-[#5A6B70]">No appointments yet.</div>}
              {appts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#DCE8E9] hover:bg-[#EAF5F5] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EAF5F5] flex items-center justify-center font-mono text-sm">#{a.queue_number}</div>
                    <div>
                      <div className="text-sm font-medium">{a.doctor?.name} · <span className="text-[#5A6B70] font-normal">{a.doctor?.specialty || "General"}</span></div>
                      <div className="text-xs text-[#5A6B70] font-mono">{new Date(a.scheduled_at).toLocaleString()}</div>
                      <div className="text-xs text-[#5A6B70]">{a.reason}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[a.status]}>{a.status.replaceAll("_", " ")}</Badge>
                    {a.payment_status === "paid"
                      ? <Badge className="bg-[#2D6A4F]/20 text-[#2D6A4F]">Paid · RM{a.paid_amount}</Badge>
                      : <Button size="sm" onClick={() => setOpenPay(a)} className="bg-[#0A3D62] hover:bg-[#083150] text-[#F4F9F9] rounded-full h-8 px-3"><CreditCard size={14} className="mr-1.5" /> Pay</Button>}
                  </div>
                </div>
              ))}
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
                className="text-xs px-3 py-1.5 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]">Download PDF</button>
              <button onClick={() => { setProfile({ email: user.email?.includes("@patient.medilink") ? "" : user.email, phone: user.phone || "" }); setProfileOpen(true); }}
                className="text-xs px-3 py-1.5 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]">Edit profile</button>
              <FileText size={18} weight="duotone" color="#0B7C8C" />
            </div>
          </div>
          {records.length === 0 && <div className="text-sm text-[#5A6B70]">No records yet.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {records.map((r) => (
              <div key={r.id} className="p-4 rounded-xl bg-[#EAF5F5] border border-[#DCE8E9]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#5A6B70]">
                  {new Date(r.created_at).toLocaleDateString()} · {r.doctor?.name}
                  {r.external && <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-700">{r.facility_id}</span>}
                </div>
                <div className="text-sm font-medium mt-1">{r.diagnosis}</div>
                {r.notes && <div className="text-xs text-[#5A6B70] mt-1">{r.notes}</div>}
                {r.prescriptions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.prescriptions.map((p, i) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-2 text-[#0B7C8C]"><Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency}</div>
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
          <div className="flex items-center justify-between mb-4"><div className="overline">Receipts</div><CreditCard size={18} weight="duotone" color="#0B7C8C" /></div>
          {receipts.length === 0 && <div className="text-sm text-[#5A6B70]">No payments yet.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {receipts.map((r) => (
              <div key={r.txn_ref} className="flex items-center justify-between p-4 rounded-xl border border-[#DCE8E9]">
                <div>
                  <div className="text-sm font-medium">RM {Number(r.amount).toFixed(2)} · {r.method}</div>
                  <div className="text-[11px] font-mono text-[#5A6B70]">{r.txn_ref}</div>
                  <div className="text-[11px] text-[#5A6B70]">{new Date(r.paid_at).toLocaleString()} · {r.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadPdf(`/patient/receipts/${r.txn_ref}/pdf`, `receipt-${r.txn_ref}.pdf`).catch(() => toast.error("Download failed"))}
                    className="text-[11px] px-2 py-1 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]">PDF</button>
                  <Badge className="bg-[#2D6A4F]/20 text-[#2D6A4F]">paid</Badge>
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
              className="text-xs px-3 py-1.5 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]">Certificate PDF</button>
          </div>
          {vax.length === 0 && <div className="text-sm text-[#5A6B70]">No vaccinations recorded.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {vax.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-4 rounded-xl border border-[#DCE8E9]">
                <div>
                  <div className="text-sm font-medium">{v.vaccine} · <span className="font-normal text-[#5A6B70]">{v.dose}</span></div>
                  <div className="text-[11px] text-[#5A6B70]">{(v.administered_at || "").slice(0, 10)} · {v.doctor_name}</div>
                </div>
                <Badge className="bg-[#2D6A4F]/20 text-[#2D6A4F]">done</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Book dialog */}
      <Dialog open={openBook} onOpenChange={setOpenBook}>
        <DialogContent className="bg-[#F4F9F9] border-[#DCE8E9] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">Book an appointment</DialogTitle><DialogDescription>Pick a doctor and time.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={booking.doctor_id} onValueChange={(v) => setBooking({ ...booking, doctor_id: v })}>
                <SelectTrigger className="border-[#DCE8E9]"><SelectValue placeholder="Choose a doctor" /></SelectTrigger>
                <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.specialty || "General"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Pick a slot</Label><SlotPicker doctorId={booking.doctor_id} value={booking.scheduled_at} onChange={(iso) => setBooking({ ...booking, scheduled_at: iso })} /></div>
            <div className="space-y-1.5"><Label>Reason for visit</Label><Textarea value={booking.reason} onChange={(e) => setBooking({ ...booking, reason: e.target.value })} placeholder="e.g. Persistent cough for 4 days" className="border-[#DCE8E9]" /></div>
          </div>
          <DialogFooter><Button disabled={!booking.doctor_id || !booking.scheduled_at || loading} onClick={book} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]">{loading ? "Booking…" : "Confirm booking"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!openPay} onOpenChange={(o) => !o && (setOpenPay(null), setQrPay(null))}>
        <DialogContent className="bg-[#F4F9F9] border-[#DCE8E9]">
          <DialogHeader><DialogTitle className="font-display text-2xl">Pay your bill</DialogTitle><DialogDescription>Scan the DuitNow QR with your banking app.</DialogDescription></DialogHeader>
          {openPay && !qrPay && (
            <div className="rounded-2xl border border-[#DCE8E9] bg-white p-5">
              <div className="overline">Amount</div>
              <div className="font-display text-4xl mt-1">RM {(openPay.fee || 50).toFixed(2)}</div>
              <div className="text-sm text-[#5A6B70] mt-2">{openPay.doctor?.name} · {new Date(openPay.scheduled_at).toLocaleString()}</div>
            </div>
          )}
          {qrPay && (
            <div className="rounded-2xl border border-[#DCE8E9] bg-white p-5 text-center">
              <img src={`data:image/png;base64,${qrPay.qr}`} alt="DuitNow QR" className="w-52 h-52 mx-auto rounded-xl border border-[#DCE8E9]" />
              <div className="font-mono text-xs text-[#5A6B70] mt-2">{qrPay.ref}</div>
              <div className="font-display text-2xl mt-1">RM {Number(qrPay.amount).toFixed(2)}</div>
            </div>
          )}
          <DialogFooter>
            {!qrPay
              ? <Button onClick={() => pay(openPay)} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]"><CreditCard size={16} className="mr-1.5" /> Show DuitNow QR</Button>
              : <Button onClick={confirmPay} disabled={confirming} className="bg-[#2D6A4F] hover:bg-[#064F5A] text-[#F4F9F9]">{confirming ? "Checking…" : "I've paid"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="bg-[#F4F9F9] border-[#DCE8E9]">
          <DialogHeader><DialogTitle className="font-display text-2xl">My profile</DialogTitle><DialogDescription>Add contact details for reminders and receipts. You always sign in with your IC.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Email (optional)</Label><Input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="you@email.com" className="border-[#DCE8E9]" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="012-345 6789" className="border-[#DCE8E9]" /></div>
          </div>
          <DialogFooter><Button onClick={saveProfile} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
