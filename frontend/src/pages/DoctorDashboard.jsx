import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtDateTime, fmtDate } from "@/lib/utils";
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
import { useLocation } from "react-router-dom";
import DoctorScheduler from "@/components/DoctorScheduler";
import ClinicalActions from "@/components/ClinicalActions";
import useQueueSocket from "@/hooks/useQueueSocket";
import {
  WaveTriangle,
  IdentificationCard,
  Stethoscope,
  Sparkle,
  Pill,
  Plus,
  Trash,
  Warning,
  FileText,
  ClipboardText,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { TriageChip, byTriage } from "@/components/Triage";

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

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [scope, setScope] = useState("mine");
  const _loc = useLocation();
  const view = _loc.pathname.split("/")[2] || "consult";
  const [appts, setAppts] = useState([]);
  const [activePatientId, setActivePatientId] = useState(null);
  const [activeApptId, setActiveApptId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [consentCode, setConsentCode] = useState(null);
  const requestAccess = async () => {
    try {
      const r = await api.post("/records/request-access", { patient_id: activePatientId });
      setConsentCode(r.data.code);
      toast.success("Ask the patient to approve code " + r.data.code + " in their app");
    } catch (e) { toast.error("Could not request access"); }
  };
  const breakGlass = async () => {
    const reason = window.prompt("Emergency access — reason (required, logged):");
    if (!reason || reason.trim().length < 4) return;
    try {
      await api.post("/records/break-glass", { patient_id: activePatientId, reason });
      toast.warning("Emergency access granted — logged");
      setConsentCode(null);
      openPatient(activePatientId);
    } catch (e) { toast.error("Break-glass failed"); }
  };
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiDrug, setAiDrug] = useState("");
  const [aiDrugLoading, setAiDrugLoading] = useState(false);
  const [icScanOpen, setIcScanOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [inventory, setInventory] = useState([]);

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
    // Today's clinic queue, already in triage order and bounded to the clinic's local day.
    const r = await api.get("/queue/today");
    setAppts(r.data);
    api.get("/inventory").then((iv) => setInventory((iv.data || []).filter((m) => m.active && (m.stock_qty || 0) > 0))).catch(() => {});
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
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to save record");
    }
  };

  const activeAppts = useMemo(() => appts.filter((a) => ["scheduled", "checked_in", "in_progress"].includes(a.status)), [appts]);
  const mineCount = activeAppts.filter((a) => !a.doctor_id || a.doctor_id === user.id).length;
  // Nothing booked to me yet but people are waiting: show the whole clinic, once.
  const autoScoped = useRef(false);
  useEffect(() => {
    if (!autoScoped.current && appts.length && mineCount === 0 && activeAppts.length > 0) {
      autoScoped.current = true; setScope("all");
    }
  }, [appts.length, mineCount, activeAppts.length]);

  const myQueue = useMemo(
    () => appts
      .filter((a) => ["scheduled", "checked_in", "in_progress"].includes(a.status))
      .filter((a) => scope === "all" || !a.doctor_id || a.doctor_id === user.id)
      .sort(byTriage),
    [appts, scope, user.id]
  );

  return (
    <AppShell title="Today's patients" subtitle={`${user.name} · ${user.specialty || "General practice"}`} navItems={[{ label: "Consultations", to: "/doctor" }, { label: "My availability", to: "/doctor/availability" }]}>
      {view === "consult" && (
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(360px,1fr)_2fr] gap-5">
        {/* Queue */}
        <div id="sec-queue" className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[24px]">Waiting <span className="text-[#566663] font-semibold">({myQueue.length})</span></h2>
              <div className="mt-1 inline-flex rounded-full border border-[#DAE2DF] p-0.5 text-[13px] font-semibold" role="group" aria-label="Whose patients">
                {[["mine", "My patients"], ["all", "Whole clinic"]].map(([k, l]) => (
                  <button key={k} onClick={() => setScope(k)} aria-pressed={scope === k}
                    className={`px-3 py-1 rounded-full ${scope === k ? "bg-[#10201D] text-white" : "text-[#566663]"}`}>{l}</button>
                ))}
              </div>
            </div>
            <Button
              data-testid="find-patient-btn"
              size="sm"
              onClick={() => setIcScanOpen(true)}
              className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full h-8"
            >
              <IdentificationCard size={16} className="mr-1.5" /> Find by IC
            </Button>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-300px)] min-h-[360px] overflow-y-auto -mx-1 px-1">
            {myQueue.length === 0 && <div className="text-[15px] text-[#566663] py-6">{scope === "mine" && activeAppts.length ? `No one is waiting for you. ${activeAppts.length} waiting in the whole clinic.` : "No one is waiting. New check-ins appear here instantly."}</div>}
            {myQueue.map((a) => (
              <button
                key={a.id}
                data-testid="queue-item"
                onClick={() => openPatient(a.patient_id, a.id)}
                className={`w-full text-left flex items-center gap-3 p-3 pl-0 rounded-xl border overflow-hidden transition-colors ${
                  activePatientId === a.patient_id ? "border-[var(--ml-primary)] bg-[var(--ml-wash)] ring-1 ring-[var(--ml-primary)]" : "border-[#DAE2DF] hover:bg-[#EEF2F1]"
                }`}
              >
                <span className="self-stretch w-1.5 -my-3 shrink-0" style={{ background: { Red: "#C0352B", Orange: "#D9661A", Yellow: "#E5A800", Green: "#2F7D45", Blue: "#2C6CB0" }[a.triage_colour] || "#C8D3CF" }} />
                <div className="w-14 text-center figure text-[26px] text-[#10201D]" aria-label={`Queue number ${a.queue_number}`}>
                  {String(a.queue_number ?? "").padStart(3, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold truncate">{a.patient?.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <TriageChip zone={a.triage_colour} short />
                    <span className="text-[13px] text-[#566663] truncate">{a.reason}</span>
                  </div>
                </div>
                <Badge className={statusColors[a.status]}>{(STATUS_TEXT[a.status] || a.status)}</Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Patient panel */}
        <div id="sec-patient" className="panel p-6 min-w-0">
          {!patient ? (
            <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center text-[#566663]">
              <Stethoscope size={36} className="mb-3" color="#0A6E62" />
              <div className="font-display text-[26px] text-[#10201D] mb-1">Choose a patient to start</div>
              <div className="text-sm max-w-sm">
                Most urgent patients are at the top. Their history, allergies and this visit's notes open here.
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="overline">Patient</div>
                  <h2 className="text-[30px] leading-tight mt-0.5">{patient.name}</h2>
                  <div className="text-sm text-[#566663] font-mono">{patient.ic_number}</div>
                  <div className="text-xs text-[#566663] mt-1">
                    {patient.gender || "—"} · DOB {patient.dob || "—"} · {patient.phone || ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    data-testid="ai-summary-btn"
                    onClick={aiSummarize}
                    disabled={aiSummaryLoading}
                    className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full"
                  >
                    <Sparkle size={14} weight="fill" className="mr-1.5" />
                    {aiSummaryLoading ? "Summarising…" : "AI Summary"}
                  </Button>
                  <Button
                    data-testid="new-record-btn"
                    onClick={() => setRecOpen(true)}
                    className="bg-[#10262E] hover:bg-[#0A1A20] text-[#EEF2F1] rounded-full"
                  >
                    <Plus size={14} className="mr-1.5" /> New record
                  </Button>
                </div>
              </div>

              {aiSummary && (
                <div data-testid="ai-summary-output" className="rounded-2xl border border-[#0A6E62]/20 bg-[var(--ml-wash)] p-5 mb-5">
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
                  className="text-[11px] px-2 py-1 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]"
                >
                  + Vaccination
                </button>
              </div>
              <div className="overline mb-3">Visit History · {records.length}</div>
              {records.some((r) => r.locked) && (
                <div className="mb-3 rounded-xl border border-[#B9C9D6] bg-[#EEF3F7] p-3">
                  <div className="text-[15px] font-bold text-[#10262E]">This patient has records at other clinics</div>
                  <div className="text-[13px] text-[#10262E] mt-0.5">Their history is private. Ask the patient to approve access, or use emergency override.</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button onClick={requestAccess} className="text-xs px-3 py-1.5 rounded-full bg-[var(--ml-primary)] text-white hover:bg-[var(--ml-primary-soft)]">Request patient consent</button>
                    <button onClick={breakGlass} className="text-xs px-3 py-1.5 rounded-full border border-[#B4442F] text-[#B4442F] hover:bg-[#B4442F]/10">Emergency access</button>
                    {consentCode && <span className="text-[13px] font-mono text-[#10262E]">Code for patient: <b>{consentCode}</b> — then reload</span>}
                  </div>
                </div>
              )}
              {records.length === 0 && <div className="text-sm text-[#566663]">No prior records.</div>}
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {records.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-[#DAE2DF] bg-[#EEF2F1]">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{r.diagnosis}</div>
                      <div className="text-[10px] font-mono text-[#566663] flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${r.sync_status === "cloud" ? "bg-[var(--ml-primary)]" : "bg-[var(--ml-primary)]"} breathe`} />
                        {r.sync_status}
                      </div>
                    </div>
                    <div className="text-xs text-[#566663] mt-1">
                      {fmtDateTime(r.created_at)} · {r.doctor?.name}
                      {r.external ? (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-700">
                          EXTERNAL · {r.facility_id}
                        </span>
                      ) : (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--ml-wash)] text-[#566663]">
                          {r.facility_id || "this clinic"}
                        </span>
                      )}
                    </div>
                    {r.notes && <div className="text-sm mt-2">{r.notes}</div>}
                    {r.vitals && (
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px] font-mono text-[var(--ml-primary)]">
                        {r.vitals.bp && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DAE2DF]">BP {r.vitals.bp}</span>}
                        {r.vitals.hr && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DAE2DF]">HR {r.vitals.hr}</span>}
                        {r.vitals.temp && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DAE2DF]">T {r.vitals.temp}°</span>}
                        {r.vitals.spo2 && <span className="px-2 py-0.5 rounded-full bg-white border border-[#DAE2DF]">SpO₂ {r.vitals.spo2}</span>}
                      </div>
                    )}
                    {r.prescriptions?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {r.prescriptions.map((p, i) => (
                          <div key={i} className="text-xs font-mono flex items-center gap-2 text-[var(--ml-primary)]">
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
                      className="mt-2 text-[11px] px-2 py-1 rounded-full border border-[#DAE2DF] hover:bg-[var(--ml-wash)] text-[var(--ml-primary)]"
                    >
                      Issue MC (PDF)
                    </button>
                  </div>
                ))}
              </div>
              {activePatientId && (
                <div className="mt-4">
                  <ClinicalActions patientId={activePatientId} recordId={null} />
                </div>
              )}
            </>
          )}
        </div>

      </div>
    )}

    {view === "availability" && (
      <div className="space-y-5">
        <AvailabilityCard doctorId={user.id} />
        <DoctorScheduler doctorId={user.id} />
      </div>
    )}

      <ICScanner open={icScanOpen} onOpenChange={setIcScanOpen} onMatch={onPatientFound} />

      {/* Record dialog */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent data-testid="record-dialog" className="bg-[#EEF2F1] border-[#DAE2DF] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <ClipboardText size={22} weight="duotone" color="#0A6E62" /> New medical record
            </DialogTitle>
            <DialogDescription>{patient?.name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Diagnosis *</Label>
              <Input data-testid="rec-diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="border-[#DAE2DF]" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea data-testid="rec-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border-[#DAE2DF]" />
            </div>
            <div className="space-y-1.5">
              <Label>Known allergies</Label>
              <Input data-testid="rec-allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="border-[#DAE2DF]" />
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
              <div className="space-y-1"><Label className="text-xs">BP</Label><Input data-testid="rec-bp" placeholder="120/80" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="border-[#DAE2DF] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">HR</Label><Input data-testid="rec-hr" value={form.hr} onChange={(e) => setForm({ ...form, hr: e.target.value })} className="border-[#DAE2DF] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">Temp °C</Label><Input data-testid="rec-temp" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} className="border-[#DAE2DF] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">Weight</Label><Input data-testid="rec-weight" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="border-[#DAE2DF] font-mono" /></div>
              <div className="space-y-1"><Label className="text-xs">SpO₂</Label><Input data-testid="rec-spo2" value={form.spo2} onChange={(e) => setForm({ ...form, spo2: e.target.value })} className="border-[#DAE2DF] font-mono" /></div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="overline">Prescriptions</div>
              <Button
                data-testid="ai-drug-btn"
                size="sm"
                onClick={aiDrugCheck}
                disabled={aiDrugLoading}
                variant="outline"
                className="border-[var(--ml-primary)] text-[var(--ml-primary)] hover:bg-[var(--ml-wash)] rounded-full h-8"
              >
                <Sparkle size={12} weight="fill" className="mr-1.5" /> {aiDrugLoading ? "Checking…" : "AI Drug Check"}
              </Button>
            </div>
            {aiDrug && (
              <div data-testid="ai-drug-output" className="rounded-xl border border-[#10262E]/40 bg-[#10262E]/10 p-3 text-sm whitespace-pre-wrap">
                <div className="flex items-center gap-1.5 text-xs text-[#9B2226] font-medium mb-1">
                  <Warning size={14} weight="duotone" /> Drug interaction analysis
                </div>
                {aiDrug}
              </div>
            )}
            <div className="space-y-2">
              <datalist id="rx-meds">
                {inventory.map((m) => (
                  <option key={m.id} value={m.name}>{m.stock_qty} in stock · RM{Number(m.unit_price || 0).toFixed(2)}</option>
                ))}
              </datalist>
              {form.prescriptions.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label className="text-[10px] overline">Medicine</Label>
                    <Input list="rx-meds" data-testid={`rx-med-${i}`} value={p.medicine} onChange={(e) => setRx(i, "medicine", e.target.value)} placeholder="Pick from pharmacy stock" className="border-[#DAE2DF]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] overline">Dosage</Label>
                    <Input data-testid={`rx-dose-${i}`} value={p.dosage} onChange={(e) => setRx(i, "dosage", e.target.value)} className="border-[#DAE2DF]" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px] overline">Frequency</Label>
                    <Input data-testid={`rx-freq-${i}`} value={p.frequency} onChange={(e) => setRx(i, "frequency", e.target.value)} className="border-[#DAE2DF]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] overline">Duration</Label>
                    <Input data-testid={`rx-dur-${i}`} value={p.duration} onChange={(e) => setRx(i, "duration", e.target.value)} className="border-[#DAE2DF]" />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeRx(i)} className="col-span-1">
                    <Trash size={14} />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addRx} className="border-[#DAE2DF]">
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
              className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"
            >
              Save & sync record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
