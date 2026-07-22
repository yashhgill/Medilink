import React, { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ICScanner from "@/components/ICScanner";
import BluetoothVitals from "@/components/BluetoothVitals";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import SyncIndicator from "@/components/SyncIndicator";
import { AttachmentUploader, AttachmentList } from "@/components/Attachments";
import AvailabilityCard from "@/components/AvailabilityCard";
import DoctorScheduler from "@/components/DoctorScheduler";
import useQueueSocket from "@/hooks/useQueueSocket";
import {
  WaveTriangle,
  Sparkle,
  Pill,
  Plus,
  Trash,
  Warning,
  FileText,
  ClipboardText,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const statusColors = {
  scheduled: "bg-[#EAF5F5] text-[#0B7C8C]",
  checked_in: "bg-[#086788]/30 text-[#0B7C8C]",
  in_progress: "bg-[#0A3D62]/20 text-[#9B2226]",
  completed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
  ready_for_pharmacy: "bg-[#0B7C8C] text-[#F4F9F9]",
  dispensed: "bg-[#2D6A4F] text-[#F4F9F9]",
  cancelled: "bg-[#5A6B70]/15 text-[#5A6B70]",
};

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [appts, setAppts] = useState([]);
  const [activePatientId, setActivePatientId] = useState(null);
  const [activeApptId, setActiveApptId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiDrug, setAiDrug] = useState("");
  const [aiDrugLoading, setAiDrugLoading] = useState(false);
  const [icScanOpen, setIcScanOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  const [form, setForm] = useState({
    diagnosis: "",
    notes: "",
    allergies: "",
    bp: "",
    hr: "",
    temp: "",
    weight: "",
    spo2: "",
    prescriptions: [{ medicine: "", dosage: "", frequency: "", duration: "" }],
    attachments: [],
  });

  const load = async () => {
    const r = await api.get("/appointments");
    setAppts(r.data);
  };

  useEffect(() => {
    load();
  }, []);

  useQueueSocket((ev) => {
    if (ev?.type?.startsWith("appointment.")) load();
  });

  const openPatient = async (pid, apptId = null) => {
    setActiveApptId(apptId);
    try {
    setActivePatientId(pid);
    setAiSummary("");
    setAiDrug("");
    const [p, rec] = await Promise.all([
      api.get(`/patients/${pid}`),
      api.get(`/records/patient/${pid}`),
    ]);
      setPatient(p.data);
      setRecords(rec.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not open this patient's file");
    }
  };

  const onPatientFound = (data) => {
    openPatient(data.patient.id);
    toast.success(`Loaded ${data.patient.name}`);
  };

  const updateAppt = async (id, status) => {
    await api.patch(`/appointments/${id}`, { status });
    load();
  };

  const aiSummarize = async () => {
    if (!activePatientId) return;
    setAiSummaryLoading(true);
    try {
      const r = await api.post("/ai/summary", { patient_id: activePatientId });
      setAiSummary(r.data.summary);
    } catch (e) {
      toast.error("AI summary failed");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const aiDrugCheck = async () => {
    const meds = form.prescriptions.map((p) => p.medicine).filter(Boolean);
    if (meds.length === 0) {
      toast.info("Add at least one medicine first");
      return;
    }
    setAiDrugLoading(true);
    try {
      const r = await api.post("/ai/drug-check", { medicines: meds });
      setAiDrug(r.data.analysis);
    } catch (e) {
      toast.error("Drug check failed");
    } finally {
      setAiDrugLoading(false);
    }
  };

  const addRx = () =>
    setForm({
      ...form,
      prescriptions: [...form.prescriptions, { medicine: "", dosage: "", frequency: "", duration: "" }],
    });

  const setRx = (i, k, v) => {
    const copy = [...form.prescriptions];
    copy[i] = { ...copy[i], [k]: v };
    setForm({ ...form, prescriptions: copy });
  };

  const removeRx = (i) => {
    const copy = [...form.prescriptions];
    copy.splice(i, 1);
    setForm({ ...form, prescriptions: copy.length ? copy : [{ medicine: "", dosage: "", frequency: "", duration: "" }] });
  };

  const saveRecord = async () => {
    if (!activePatientId || !form.diagnosis) {
      toast.error("Diagnosis is required");
      return;
    }
    try {
      await api.post("/records", {
        patient_id: activePatientId,
        diagnosis: form.diagnosis,
        notes: form.notes,
        allergies: form.allergies,
        vitals: {
          bp: form.bp || null,
          hr: form.hr ? Number(form.hr) : null,
          temp: form.temp ? Number(form.temp) : null,
          weight: form.weight ? Number(form.weight) : null,
          spo2: form.spo2 ? Number(form.spo2) : null,
        },
        prescriptions: form.prescriptions.filter((p) => p.medicine),
        attachment_ids: form.attachments.map((a) => a.id),
        appointment_id: activeApptId,
      });
      toast.success("Record saved · syncing to cloud");
      setRecOpen(false);
      setForm({
        diagnosis: "",
        notes: "",
        allergies: "",
        bp: "",
        hr: "",
        temp: "",
        weight: "",
        spo2: "",
        prescriptions: [{ medicine: "", dosage: "", frequency: "", duration: "" }],
        attachments: [],
      });
      openPatient(activePatientId);
    } catch (e) {
      toast.error("Failed to save record");
    }
  };

  const myQueue = useMemo(
    () => appts.filter((a) => ["scheduled", "checked_in", "in_progress"].includes(a.status)),
    [appts]
  );

  return (
    <AppShell title={`Dr. ${user.name.split(" ").slice(-1)[0]}`} subtitle={`${user.specialty || "General"} · Doctor`} sections={[{ id: "sec-queue", label: "Today\u2019s Queue" }, { id: "sec-patient", label: "Patient Record" }]}>
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Queue */}
        <div id="sec-queue" className="rounded-2xl border border-[#DCE8E9] bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="overline">Today&apos;s Queue</div>
            <Button
              data-testid="find-patient-btn"
              size="sm"
              onClick={() => setIcScanOpen(true)}
              className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9] rounded-full h-8"
            >
              <WaveTriangle size={14} weight="duotone" className="mr-1.5" /> Find by IC
            </Button>
          </div>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {myQueue.length === 0 && <div className="text-sm text-[#5A6B70]">No active patients.</div>}
            {myQueue.map((a) => (
              <button
                key={a.id}
                data-testid="queue-item"
                onClick={() => openPatient(a.patient_id, a.id)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  activePatientId === a.patient_id ? "border-[#0B7C8C] bg-[#EAF5F5]" : "border-[#DCE8E9] hover:bg-[#EAF5F5]"
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-[#0B7C8C] text-[#F4F9F9] flex items-center justify-center font-mono">
                  #{a.queue_number}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.patient?.name}</div>
                  <div className="text-xs text-[#5A6B70] flex items-center gap-2">
                    {a.triage_colour && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        a.triage_colour === "Red" ? "bg-red-100 text-red-700"
                        : a.triage_colour === "Yellow" ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"}`}>
                        {a.triage_colour.toUpperCase()}
                      </span>
                    )}
                    <span>{a.reason}</span>
                  </div>
                </div>
                <Badge className={statusColors[a.status]}>{a.status.replaceAll("_", " ")}</Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Patient panel */}
        <div id="sec-patient" className="lg:col-span-2 rounded-2xl border border-[#DCE8E9] bg-white p-6">
          {!patient ? (
            <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center text-[#5A6B70]">
              <WaveTriangle size={36} weight="duotone" className="mb-3" color="#0B7C8C" />
              <div className="font-display text-xl text-[#12262B] mb-1">Select a patient from the queue</div>
              <div className="text-sm max-w-sm">
                Tap a name on the left, or find a patient by IC. You&apos;ll see their full record, AI summary, and can record this visit.
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="overline">Patient</div>
                  <h3 className="font-display text-2xl mt-1">{patient.name}</h3>
                  <div className="text-sm text-[#5A6B70] font-mono">{patient.ic_number}</div>
                  <div className="text-xs text-[#5A6B70] mt-1">
                    {patient.gender || "—"} · DOB {patient.dob || "—"} · {patient.phone || ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="ai-summary-btn"
                    onClick={aiSummarize}
                    disabled={aiSummaryLoading}
                    className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9] rounded-full"
                  >
                    <Sparkle size={14} weight="fill" className="mr-1.5" />
                    {aiSummaryLoading ? "Summarising…" : "AI Summary"}
                  </Button>
                  <Button
                    data-testid="new-record-btn"
                    onClick={() => setRecOpen(true)}
                    className="bg-[#0A3D62] hover:bg-[#083150] text-[#F4F9F9] rounded-full"
                  >
                    <Plus size={14} className="mr-1.5" /> New record
                  </Button>
                </div>
              </div>

              {aiSummary && (
                <div data-testid="ai-summary-output" className="rounded-2xl border border-[#0B7C8C]/20 bg-[#EAF5F5] p-5 mb-5">
                  <div className="overline flex items-center gap-1.5">
                    <Sparkle size={12} weight="fill" /> AI Summary
                  </div>
                  <div className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{aiSummary}</div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={async () => {
                    const vaccine = window.prompt("Vaccine name (e.g. Influenza, Hepatitis B):");
                    if (!vaccine) return;
                    const dose = window.prompt("Dose (e.g. Dose 1 / Booster):", "Dose 1") || "Dose 1";
                    try {
                      await api.post(`/patients/${activePatientId}/vaccinations`, { vaccine, dose });
                      toast.success("Vaccination recorded");
                    } catch (e) { toast.error("Failed to record vaccination"); }
                  }}
                  className="text-[11px] px-2 py-1 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]"
                >
                  + Vaccination
                </button>
              </div>
              <div className="overline mb-3">Visit History · {records.length}</div>
              {records.length === 0 && <div className="text-sm text-[#5A6B70]">No prior records.</div>}
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {records.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-[#DCE8E9] bg-[#F4F9F9]">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{r.diagnosis}</div>
                      <div className="text-[10px] font-mono text-[#5A6B70] flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${r.sync_status === "cloud" ? "bg-[#2D6A4F]" : "bg-[#086788]"} breathe`} />
                        {r.sync_status}
                      </div>
                    </div>
                    <div className="text-xs text-[#5A6B70] mt-1">
                      {new Date(r.created_at).toLocaleString()} · {r.doctor?.name}
                      {r.external ? (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-700">
                          EXTERNAL · {r.facility_id}
                        </span>
                      ) : (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#EAF5F5] text-[#5A6B70]">
                          {r.facility_id || "this clinic"}
                        </span>
                      )}
                    </div>
                    {r.notes && <div className="text-sm mt-2">{r.notes}</div>}
                    {r.vitals && (
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px] font-mono text-[#0B7C8C]">
                        {r.vitals.bp && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DCE8E9]">BP {r.vitals.bp}</span>}
                        {r.vitals.hr && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DCE8E9]">HR {r.vitals.hr}</span>}
                        {r.vitals.temp && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DCE8E9]">T {r.vitals.temp}°</span>}
                        {r.vitals.spo2 && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DCE8E9]">SpO₂ {r.vitals.spo2}</span>}
                      </div>
                    )}
                    {r.prescriptions?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {r.prescriptions.map((p, i) => (
                          <div key={i} className="text-xs font-mono flex items-center gap-2 text-[#0B7C8C]">
                            <Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency} · {p.duration}
                          </div>
                        ))}
                      </div>
                    )}
                    {r.attachments?.length > 0 && <AttachmentList files={r.attachments} />}
                    <button
                      onClick={async () => {
                        const days = window.prompt("MC days:", "1");
                        if (!days) return;
                        try {
                          const token = localStorage.getItem("ml_token");
                          const resp = await fetch(`/api/records/${r.id}/mc/pdf?days=${encodeURIComponent(days)}`, { headers: { Authorization: `Bearer ${token}` } });
                          if (!resp.ok) throw new Error();
                          const blob = await resp.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = `mc-${r.id.slice(0,8)}.pdf`; a.click();
                          URL.revokeObjectURL(url);
                        } catch (e) { toast.error("MC download failed"); }
                      }}
                      className="mt-2 text-[11px] px-2 py-1 rounded-full border border-[#DCE8E9] hover:bg-[#EAF5F5] text-[#0B7C8C]"
                    >
                      Issue MC (PDF)
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <SyncIndicator />
        <AvailabilityCard doctorId={user.id} />

        <div className="lg:col-span-3">
          <DoctorScheduler doctorId={user.id} />
        </div>
      </div>

      <ICScanner open={icScanOpen} onOpenChange={setIcScanOpen} onMatch={onPatientFound} />

      {/* Record dialog */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent data-testid="record-dialog" className="bg-[#F4F9F9] border-[#DCE8E9] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <ClipboardText size={22} weight="duotone" color="#0B7C8C" /> New medical record
            </DialogTitle>
            <DialogDescription>{patient?.name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Diagnosis *</Label>
              <Input data-testid="rec-diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="border-[#DCE8E9]" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea data-testid="rec-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border-[#DCE8E9]" />
            </div>
            <div className="space-y-1.5">
              <Label>Known allergies</Label>
              <Input data-testid="rec-allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="border-[#DCE8E9]" />
            </div>

            <div className="overline">Vitals</div>
            <BluetoothVitals
              onVital={(p) =>
                setForm((f) => ({
                  ...f,
                  hr: p.hr != null ? String(p.hr) : f.hr,
                  temp: p.temp != null ? String(p.temp) : f.temp,
                  spo2: p.spo2 != null ? String(p.spo2) : f.spo2,
                }))
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="space-y-1"><Label className="text-xs">BP</Label><Input data-testid="rec-bp" placeholder="120/80" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="border-[#DCE8E9] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">HR</Label><Input data-testid="rec-hr" value={form.hr} onChange={(e) => setForm({ ...form, hr: e.target.value })} className="border-[#DCE8E9] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">Temp °C</Label><Input data-testid="rec-temp" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} className="border-[#DCE8E9] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">Weight</Label><Input data-testid="rec-weight" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="border-[#DCE8E9] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">SpO₂</Label><Input data-testid="rec-spo2" value={form.spo2} onChange={(e) => setForm({ ...form, spo2: e.target.value })} className="border-[#DCE8E9] font-mono" /></div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="overline">Prescriptions</div>
              <Button
                data-testid="ai-drug-btn"
                size="sm"
                onClick={aiDrugCheck}
                disabled={aiDrugLoading}
                variant="outline"
                className="border-[#0B7C8C] text-[#0B7C8C] hover:bg-[#EAF5F5] rounded-full h-8"
              >
                <Sparkle size={12} weight="fill" className="mr-1.5" /> {aiDrugLoading ? "Checking…" : "AI Drug Check"}
              </Button>
            </div>
            {aiDrug && (
              <div data-testid="ai-drug-output" className="rounded-xl border border-[#0A3D62]/40 bg-[#0A3D62]/10 p-3 text-sm whitespace-pre-wrap">
                <div className="flex items-center gap-1.5 text-xs text-[#9B2226] font-medium mb-1">
                  <Warning size={14} weight="duotone" /> Drug interaction analysis
                </div>
                {aiDrug}
              </div>
            )}
            <div className="space-y-2">
              {form.prescriptions.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label className="text-[10px] overline">Medicine</Label>
                    <Input data-testid={`rx-med-${i}`} value={p.medicine} onChange={(e) => setRx(i, "medicine", e.target.value)} className="border-[#DCE8E9]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] overline">Dosage</Label>
                    <Input data-testid={`rx-dose-${i}`} value={p.dosage} onChange={(e) => setRx(i, "dosage", e.target.value)} className="border-[#DCE8E9]" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px] overline">Frequency</Label>
                    <Input data-testid={`rx-freq-${i}`} value={p.frequency} onChange={(e) => setRx(i, "frequency", e.target.value)} className="border-[#DCE8E9]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] overline">Duration</Label>
                    <Input data-testid={`rx-dur-${i}`} value={p.duration} onChange={(e) => setRx(i, "duration", e.target.value)} className="border-[#DCE8E9]" />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeRx(i)} className="col-span-1">
                    <Trash size={14} />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addRx} className="border-[#DCE8E9]">
                <Plus size={14} className="mr-1" /> Add medicine
              </Button>
            </div>

            <AttachmentUploader
              value={form.attachments}
              onChange={(atts) => setForm((f) => ({ ...f, attachments: atts }))}
            />
          </div>

          <DialogFooter>
            <Button
              data-testid="rec-save-btn"
              onClick={saveRecord}
              className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]"
            >
              Save & sync record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
