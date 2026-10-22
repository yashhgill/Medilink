import React, { useEffect, useRef, useState } from "react";
import { errMsg } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Heartbeat,
  WaveTriangle,
  Cardholder,
  QrCode,
  CreditCard,
  Ticket,
  Pill,
  CheckCircle,
  ArrowLeft,
  Clock,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import PrintChit from "@/components/PrintChit";
import { API } from "@/lib/api";
import { PRODUCT } from "@/brand";
import { QueueTicket, TriageChip } from "@/components/Triage";

// Derive DOB, gender and birth-state from a Malaysian IC (YYMMDD-SS-NNNN).
function deriveFromIC(ic) {
  const d = (ic || "").replace(/\D/g, "");
  if (d.length !== 12) return null;
  const yy = +d.slice(0, 2), mm = +d.slice(2, 4), dd = +d.slice(4, 6);
  const cur = new Date().getFullYear() % 100;
  const year = yy > cur ? 1900 + yy : 2000 + yy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dob = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const gender = +d[11] % 2 === 1 ? "Male" : "Female";
  return { dob, gender };
}


const kioskAxios = axios.create({
  baseURL: API,
  headers: process.env.REACT_APP_KIOSK_TOKEN
    ? { "X-Kiosk-Token": process.env.REACT_APP_KIOSK_TOKEN }
    : {},
});

const statusBadge = {
  scheduled: "bg-[var(--ml-wash)] text-[var(--ml-primary)]",
  checked_in: "bg-[#0A6E62]/30 text-[var(--ml-primary)]",
  in_progress: "bg-[#10262E]/20 text-[#9B2226]",
  completed: "bg-[#0A6E62]/20 text-[var(--ml-primary)]",
  ready_for_pharmacy: "bg-[var(--ml-primary)] text-[#EEF2F1]",
  dispensed: "bg-[#0A6E62]/20 text-[var(--ml-primary)]",
};

/**
 * Public kiosk terminal page. No login required.
 * Three modes (tabs):
 *  1. Check-in: scan/enter IC -> book appointment / check-in -> print queue ticket
 *  2. Pay & Collect: scan IC -> pay outstanding -> print receipt + medicine chit
 *  3. Status: scan IC -> view today's appointments
 */
export default function Kiosk() {
  const nav = useNavigate();
  const [mode, setMode] = useState("checkin");
  const [chitOpen, setChitOpen] = useState(false);
  const [chit, setChit] = useState(null);
  const [secondaryChit, setSecondaryChit] = useState(null);

  const showChits = (primary, secondary) => {
    setChit(primary);
    setSecondaryChit(secondary || null);
    setChitOpen(true);
  };

  // ── PHR privacy: auto-clear the kiosk after inactivity so the next patient
  // never sees the previous person's data. Any touch resets the timer. ──
  useEffect(() => {
    const IDLE_MS = 40000;      // 40s of no interaction
    let t;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => window.location.reload(), IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#10262E] relative">
      <header className="relative z-10 max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <img src={PRODUCT.logo} alt="" className="w-14 h-14 rounded-xl object-cover" />
          <div className="text-xl font-bold leading-none">{PRODUCT.name}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav("/")}
          data-testid="kiosk-exit"
          className="text-white/75 hover:text-white hover:bg-white/10 rounded-full"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Exit kiosk
        </Button>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-6 landscape:pt-4 pb-8">
        <h1 className="text-white leading-tight">
          <span className="block text-4xl sm:text-5xl landscape:text-4xl font-bold tracking-tight">Selamat datang.</span>
          <span className="block text-2xl sm:text-3xl landscape:text-2xl font-normal text-white/75 mt-1">Welcome. Check in with your MyKad.</span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 landscape:mt-4 rounded-3xl bg-[#EEF2F1] p-2"
        >
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid grid-cols-3 w-full bg-[var(--ml-wash)] border border-[#DAE2DF] rounded-full p-1 h-14">
              <TabsTrigger value="checkin" data-testid="kiosk-tab-checkin" className="data-[state=active]:bg-[var(--ml-primary)] data-[state=active]:text-white rounded-full text-[17px] font-semibold h-12">
                <Ticket size={20} className="mr-2" /> Check in
              </TabsTrigger>
              <TabsTrigger value="pay" data-testid="kiosk-tab-pay" className="data-[state=active]:bg-[var(--ml-primary)] data-[state=active]:text-white rounded-full text-[17px] font-semibold h-12">
                <CreditCard size={20} className="mr-2" /> Pay and collect medicine
              </TabsTrigger>
              <TabsTrigger value="status" data-testid="kiosk-tab-status" className="data-[state=active]:bg-[var(--ml-primary)] data-[state=active]:text-white rounded-full text-[17px] font-semibold h-12">
                <Clock size={20} className="mr-2" /> Where am I in the queue?
              </TabsTrigger>
            </TabsList>

            <div className="p-4 md:p-6">
              <TabsContent value="checkin"><CheckinFlow onPrint={(c) => showChits(c)} /></TabsContent>
              <TabsContent value="pay"><PayFlow onPrint={(r, m) => showChits(r, m)} /></TabsContent>
              <TabsContent value="status"><StatusFlow /></TabsContent>
            </div>
          </Tabs>
        </motion.div>
      </main>

      <PrintChit
        open={chitOpen}
        onOpenChange={setChitOpen}
        chit={chit}
        secondary={secondaryChit}
      />
    </div>
  );
}

/* ----------------------------------------------------- */
/* Check-in flow                                          */
/* ----------------------------------------------------- */
function CheckinFlow({ onPrint }) {
  const [ic, setIc] = useState("");
  const [step, setStep] = useState("scan"); // scan | found | register | booked
  const [data, setData] = useState(null); // lookup or checkin response
  const [tapping, setTapping] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const scannedNameRef = useRef("");
  const canvasRef = useRef(null);
  const [registering, setRegistering] = useState(false);
  const [regForm, setRegForm] = useState({ name: "", phone: "", gender: "", dob: "" });
  const [symptoms, setSymptoms] = useState("");
  const [resetCode, setResetCode] = useState(null);
  const [painScore, setPainScore] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const lookup = async (icValue) => {
    setTapping(true);
    try {
      const r = await kioskAxios.get(`/kiosk/lookup/${encodeURIComponent(icValue)}`);
      setData(r.data);
      setStep("found");
    } catch (e) {
      // No patient → offer registration
      if (e?.response?.status === 404) {
        const derived = deriveFromIC(ic) || {};
        setStep("register");
        setRegForm({ name: scannedNameRef.current || "", phone: "", gender: derived.gender || "", dob: derived.dob || "" });
      } else {
        toast.error(errMsg(e, "Lookup failed"));
      }
    } finally {
      setTapping(false);
    }
  };

  const registerAndCheckin = async () => {
    if (!regForm.name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setRegistering(true);
    try {
      const reg = await kioskAxios.post("/kiosk/register", {
        ic_number: ic,
        name: regForm.name,
        phone: regForm.phone || null,
        gender: regForm.gender || null,
        dob: regForm.dob || null,
      });
      toast.success("Registered · tell us how you're feeling");
      // Show the symptom / triage screen next (same as an existing patient),
      // so new patients also get triaged before the ticket is printed.
      setData(reg.data || { patient: { name: regForm.name, ic_number: ic } });
      setStep("found");
    } catch (e) {
      toast.error(errMsg(e, "Registration failed"));
    } finally {
      setRegistering(false);
    }
  };

  const confirmCheckin = async () => {
    setTapping(true);
    try {
      const r = await kioskAxios.post("/kiosk/checkin", { ic_number: ic, symptoms: symptoms || null, pain_score: painScore });
      setData((d) => ({ ...d, ...r.data }));
      setStep("booked");
      onPrint(r.data.chit);
    } catch (e) {
      toast.error("Could not check in");
    } finally {
      setTapping(false);
    }
  };

  const loadTesseract = () => new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const el = document.createElement("script");
    el.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    el.onload = () => resolve(window.Tesseract);
    el.onerror = reject;
    document.head.appendChild(el);
  });

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setScanning(true);
    } catch (e) {
      toast.error("Camera blocked — enter your IC manually");
    }
  };

  // Capture a frame and OCR the MyKad: pull the IC number + name.
  const captureAndRead = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast.error("Camera not ready yet"); return; }
    setOcrBusy(true);
    try {
      const cvs = canvasRef.current || document.createElement("canvas");
      cvs.width = v.videoWidth; cvs.height = v.videoHeight;
      cvs.getContext("2d").drawImage(v, 0, 0);
      const T = await loadTesseract();
      const { data } = await T.recognize(cvs, "eng");
      const text = (data.text || "").toUpperCase();
      // IC: 6-2-4 digits with optional separators
      const m = text.match(/(\d{6})[\s-]?(\d{2})[\s-]?(\d{4})/);
      if (!m) { toast.error("Couldn't read the IC — try again or type it"); return; }
      const icNum = `${m[1]}-${m[2]}-${m[3]}`;
      // Name: longest all-letters line that isn't a label
      const nameLine = (data.text || "").split("\n")
        .map((l) => l.trim())
        .filter((l) => /^[A-Za-z@/'.\s-]{6,}$/.test(l) && !/MYKAD|KAD|PENGENALAN|WARGANEGARA|LELAKI|PEREMPUAN|MALAYSIA|ISLAM/i.test(l))
        .sort((a, b) => b.length - a.length)[0] || "";
      scannedNameRef.current = nameLine;
      toast.success(`Read IC ${icNum}${nameLine ? " · " + nameLine : ""}`);
      stopCam();
      setIc(icNum);
      lookup(icNum);
    } catch (e) {
      toast.error("Scan failed — please type your IC");
    } finally {
      setOcrBusy(false);
    }
  };
  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => () => stopCam(), []);

  const reset = () => {
    // Clear everything the last patient typed: this screen is shared.
    setIc("");
    setStep("scan");
    setData(null);
    setSymptoms("");
    setPainScore(null);
    setResetCode(null);
  };

  if (step === "register") {
    return (
      <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} data-testid="kiosk-register-screen">
        <div className="overline">First time here</div>
        <h2 className="font-display text-3xl mt-1">Quick register</h2>
        <p className="text-sm text-[#566663] mt-1 mb-6">
          We couldn&apos;t find your IC <span className="font-mono text-[#10201D]">{ic}</span> in our system.
          Fill these basics and we&apos;ll check you in right after.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label>Full name *</Label>
            <Input
              data-testid="kiosk-reg-name"
              value={regForm.name}
              onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
              className="border-[#DAE2DF]"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              data-testid="kiosk-reg-phone"
              value={regForm.phone}
              onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
              placeholder="+60 12-345 6789"
              className="border-[#DAE2DF]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date of birth <span className="text-[#566663] font-normal">(from IC)</span></Label>
            <Input
              type="date"
              data-testid="kiosk-reg-dob"
              value={regForm.dob}
              readOnly
              className="border-[#DAE2DF] bg-[var(--ml-wash)] text-[#566663]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <select
              data-testid="kiosk-reg-gender"
              value={regForm.gender}
              onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-[#DAE2DF] bg-white text-sm"
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button
            variant="outline"
            data-testid="kiosk-reg-back"
            onClick={reset}
            className="border-[#DAE2DF] text-[var(--ml-primary)] rounded-full"
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <Button
            data-testid="kiosk-reg-submit"
            onClick={registerAndCheckin}
            disabled={!regForm.name || registering}
            className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-full flex-1 h-14 text-[17px] font-semibold"
          >
            <Ticket size={14} className="mr-1.5" /> {registering ? "Setting up…" : "Register & continue"}
          </Button>
        </div>
      </motion.div>
    );
  }

  if (step === "found") {
    const existing = (data.today_appointments || []).find(
      (a) => ["scheduled", "checked_in"].includes(a.status)
    );
    return (
      <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} data-testid="kiosk-found-screen">
        <p className="text-[17px] text-[#566663]">Hello,</p>
        <h2 className="text-3xl font-bold">{data.patient.name}</h2>
        <div className="text-[15px] text-[#566663] font-mono mt-1">{data.patient.ic_number}</div>

        {existing ? (
          <div className="mt-6 rounded-2xl border border-[#DAE2DF] bg-[var(--ml-wash)] p-5">
            <div className="text-[15px] font-semibold text-[var(--ml-primary-soft)]">You have an appointment today</div>
            <div className="mt-1 text-2xl font-bold">{existing.doctor?.name || "Doctor"}</div>
            <div className="text-sm text-[#566663]">{existing.reason}</div>
            <Badge className={`mt-3 ${statusBadge[existing.status]}`}>{existing.status.replaceAll("_", " ")}</Badge>
            <div className="text-xs text-[#566663] mt-2">Queue #{String(existing.queue_number).padStart(3, "0")}</div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-[#C8D3CF] bg-[#EEF2F1] p-5 text-[17px] text-[#566663]">
            No appointment today, so you'll join as a walk-in with the first free doctor.
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-[#DAE2DF] bg-white p-5">
          <label htmlFor="kiosk-symptoms" className="text-xl font-bold">What's wrong today?</label>
          <p className="text-[15px] text-[#566663]">Malay or English is fine. This helps the doctor see the most urgent patients first.</p>
          <textarea
            id="kiosk-symptoms"
            data-testid="kiosk-symptoms"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g. demam dan sakit tekak sejak semalam / fever and sore throat since yesterday"
            rows={3}
            className="mt-3 w-full rounded-xl border border-[#C8D3CF] bg-[#EEF2F1] p-4 text-[17px] outline-none focus:border-[var(--ml-primary)] resize-none"
          />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="w-full text-[15px] font-semibold">How much pain? <span className="font-normal text-[#566663]">0 is none, 10 is the worst. Optional.</span></span>
            {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
              <motion.button
                key={n}
                type="button"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                onClick={() => setPainScore(painScore === n ? null : n)}
                aria-pressed={painScore === n}
                className={`w-11 h-11 rounded-full text-[15px] font-mono font-bold border transition-colors ${
                  painScore === n
                    ? "bg-[var(--ml-primary)] text-white border-[var(--ml-primary)]"
                    : "bg-white text-[#566663] border-[#DAE2DF] hover:border-[var(--ml-primary)]"
                }`}
              >
                {n}
              </motion.button>
            ))}
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              const r = await kioskAxios.post("/kiosk/reset-code", { ic_number: ic });
              setResetCode(r.data);
            } catch (e) { toast.error(errMsg(e, "Could not issue reset code")); }
          }}
          className="mt-4 text-xs px-3 py-1.5 rounded-full border border-[#DAE2DF] hover:bg-white text-[#566663]"
        >
          Forgot your app password? Get a reset code
        </button>
        {resetCode && (
          <div className="mt-3 rounded-xl border border-[#DAE2DF] bg-white p-4" role="status">
            <div className="text-[15px]">Your reset code</div>
            <div className="font-mono text-3xl font-bold tracking-wider">{resetCode.reset_code}</div>
            <div className="text-[13px] text-[#566663] mt-1">Valid for {resetCode.valid_minutes} minutes. In the patient app, choose "Set your password" and enter your IC, this code and a new password.</div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Button
            variant="outline"
            data-testid="kiosk-back-btn"
            onClick={reset}
            className="border-[#C8D3CF] text-[#10201D] rounded-full h-14 px-6 text-[17px]"
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <Button
            data-testid="kiosk-confirm-checkin"
            onClick={confirmCheckin}
            disabled={tapping}
            className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-full flex-1 h-14 text-[17px] font-semibold"
          >
            <Ticket size={18} className="mr-2" /> {existing ? "Check in and get my ticket" : "Get my queue ticket"}
          </Button>
        </div>
      </motion.div>
    );
  }

  if (step === "booked") {
    return (
      <div className="max-w-2xl mx-auto" data-testid="kiosk-booked-screen">
        <h2 className="text-3xl font-bold text-center">You're checked in</h2>
        <p className="text-center text-[17px] text-[#566663] mt-2 mb-6">Take your ticket. We'll call this number.</p>
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
        >
          <QueueTicket number={data.chit.queue_number} zone={data.chit.triage_colour} size="lg">
            <div data-testid="kiosk-queue-number" className="sr-only">#{String(data.chit.queue_number).padStart(3, "0")}</div>
            <div className="text-[15px] text-[#566663]">Your doctor</div>
            <div className="text-xl font-bold">{data.doctor?.name || "Next available doctor"}</div>
            {data.chit.triage_colour && (
              <div className="mt-4">
                <TriageChip zone={data.chit.triage_colour} />
                <p className="text-[15px] text-[#566663] mt-2">
                  {data.chit.triage_colour === "Red" ? "A nurse will see you right away. Please stay near the counter."
                    : data.chit.triage_colour === "Yellow" ? "You'll be seen sooner than the routine queue."
                    : "Please wait to be called. Tell the counter if you feel worse."}
                </p>
              </div>
            )}
          </QueueTicket>
        </motion.div>
        <div className="flex gap-2 mt-8 justify-center">
          <Button
            variant="outline"
            onClick={reset}
            data-testid="kiosk-done-btn"
            className="border-[#DAE2DF] text-[var(--ml-primary)] rounded-full"
          >
            Done
          </Button>
          <Button
            onClick={() => onPrint(data.chit)}
            data-testid="kiosk-reprint-btn"
            className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full"
          >
            Print ticket again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold">Enter your IC number</h2>
      <p className="text-[17px] text-[#566663] mt-1 mb-6">Type the 12 digits on your MyKad, or hold the card up to the camera.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Manual IC entry — primary */}
        <div className="inset-card p-6 md:p-8 flex flex-col justify-center">
          <label htmlFor="kiosk-ic" className="text-[15px] font-semibold text-[#10201D]">IC number</label>
          <Input
            id="kiosk-ic"
            data-testid="kiosk-ic-input"
            value={ic}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 12);
              let out = digits;
              if (digits.length > 8) out = `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`;
              else if (digits.length > 6) out = `${digits.slice(0,6)}-${digits.slice(6)}`;
              setIc(out);
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000000-00-0000"
            className="mt-3 h-16 text-2xl tracking-widest text-center font-mono border-[#DAE2DF] bg-white rounded-2xl"
          />
          <Button
            data-testid="kiosk-lookup-btn"
            onClick={() => ic && lookup(ic)}
            disabled={ic.replace(/[^0-9]/g, "").length !== 12 || tapping}
            className="w-full mt-4 h-12 text-base bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-2xl btn-shimmer"
          >
            {tapping ? "Checking…" : "Continue"}
          </Button>
          <div className="text-[11px] text-[#566663] mt-3 text-center">
            12 digits, as printed on your MyKad
          </div>
        </div>

        {/* QR camera */}
        <div className="rounded-2xl border border-[#DAE2DF] bg-white p-4 flex flex-col">
          <div className="overline mb-2 flex items-center gap-1.5"><QrCode size={12} weight="duotone" /> Scan IC card</div>
          <div className="relative rounded-2xl overflow-hidden border border-[#DAE2DF] bg-black aspect-[4/3] flex-1">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-sm">
                Point your MyKad at the camera
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[var(--ml-primary)] shadow-[0_0_12px_#0A6E62] animate-pulse" />
                <div className="absolute inset-6 border-2 border-[var(--ml-primary)] rounded-xl" />
              </>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button
                data-testid="kiosk-qr-start"
                onClick={startCam}
                variant="outline"
                className="flex-1 border-[#DAE2DF] text-[var(--ml-primary)] hover:bg-[var(--ml-wash)]"
              >
                Open camera
              </Button>
            ) : (
              <>
                <Button
                  data-testid="kiosk-ic-read"
                  onClick={captureAndRead}
                  disabled={ocrBusy}
                  className="flex-1 bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"
                >
                  {ocrBusy ? "Reading…" : "Read IC"}
                </Button>
                <Button onClick={stopCam} variant="outline" className="border-[#DAE2DF] text-[#566663]">Cancel</Button>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- */
/* Pay flow                                               */
/* ----------------------------------------------------- */
function PayFlow({ onPrint }) {
  const [ic, setIc] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [started, setStarted] = useState(null);   // { appt, payment } once a payment is started

  const lookup = async () => {
    setBusy(true);
    try {
      const r = await kioskAxios.get(`/kiosk/lookup/${encodeURIComponent(ic)}`);
      setData(r.data);
    } catch (e) {
      toast.error(errMsg(e, "We couldn't find that IC number. Check it, or ask the counter."));
    } finally {
      setBusy(false);
    }
  };

  // Start a payment. Nothing is "paid" here: the counter confirms the money
  // has arrived, and only then is the medicine released to the pharmacy.
  const pay = async (appt, method) => {
    setPaying(appt.id);
    try {
      const r = await kioskAxios.post("/kiosk/pay", { ic_number: ic, appointment_id: appt.id, method });
      setStarted({ appt, payment: r.data.payment, receipt: r.data.receipt });
      lookup();
    } catch (e) {
      toast.error(errMsg(e, "Payment could not be started"));
    } finally {
      setPaying(null);
    }
  };

  const reset = () => { setIc(""); setData(null); setStarted(null); };

  const todays = data?.today_appointments || [];
  const payable = todays.filter((a) => a.status === "completed" && a.payment_status !== "paid" && a.payment_status !== "pending");
  const waitingConsult = todays.filter((a) => ["scheduled", "checked_in", "in_progress"].includes(a.status));
  const awaiting = todays.filter((a) => a.payment_status === "pending");
  const paid = todays.filter((a) => a.payment_status === "paid");

  if (!data) {
    return (
      <div className="max-w-md">
        <h2 className="text-2xl font-bold">Pay for today's visit</h2>
        <p className="text-[17px] text-[#566663] mt-1 mb-5">Enter your IC number to see your bill.</p>
        <label htmlFor="kiosk-pay-ic" className="text-[15px] font-semibold">IC number</label>
        <Input
          id="kiosk-pay-ic"
          data-testid="kiosk-pay-ic"
          value={ic}
          onChange={(e) => setIc(e.target.value)}
          placeholder="000000-00-0000"
          inputMode="numeric"
          className="mt-1.5 h-14 text-xl font-mono border-[#C8D3CF]"
        />
        <Button
          data-testid="kiosk-pay-lookup"
          onClick={lookup}
          disabled={!ic || busy}
          className="w-full mt-3 h-14 text-[17px] font-semibold bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-xl"
        >
          {busy ? "Looking up…" : "Show my bill"}
        </Button>
      </div>
    );
  }

  if (started) {
    const isQr = started.payment?.type === "DuitNow QR";
    return (
      <div className="max-w-xl mx-auto text-center" data-testid="kiosk-pay-started">
        <h2 className="text-3xl font-bold">{isQr ? "Scan to pay" : "Pay at the counter"}</h2>
        <div className="mt-2 text-4xl font-bold font-mono">RM {Number(started.payment?.amount ?? started.receipt?.amount ?? 0).toFixed(2)}</div>
        {isQr && started.payment?.qr && (
          <img src={started.payment.qr.startsWith("data:") ? started.payment.qr : `data:image/png;base64,${started.payment.qr}`} alt="DuitNow QR code" className="w-60 h-60 mx-auto mt-5 rounded-xl border border-[#DAE2DF] bg-white p-2" />
        )}
        <p className="text-[17px] text-[#566663] mt-5 max-w-[40ch] mx-auto">
          {isQr ? "Scan with any banking or e-wallet app. Then show your phone at the counter."
                : "Pay the counter in cash or by card."}
          {" "}Your medicine is released as soon as the counter confirms your payment.
        </p>
        <div className="mt-3 text-[15px] text-[#566663]">Reference <span className="font-mono font-semibold text-[#10201D]">{started.payment?.ref}</span></div>
        <Button onClick={reset} className="mt-8 h-14 px-10 text-[17px] font-semibold bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-full" data-testid="kiosk-pay-done">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[17px] text-[#566663]">Bill for</p>
          <h2 className="text-2xl font-bold">{data.patient.name}</h2>
        </div>
        <Button variant="outline" onClick={reset} className="border-[#C8D3CF] rounded-full h-12 px-5" data-testid="kiosk-pay-back">
          <ArrowLeft size={16} className="mr-1.5" /> Back
        </Button>
      </div>

      {payable.length === 0 && awaiting.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#C8D3CF] p-5 text-[17px] text-[#566663]">
          {waitingConsult.length > 0 ? "Your bill will be ready after you have seen the doctor." : "Nothing to pay right now."}
        </div>
      )}

      <div className="space-y-3">
        {payable.map((a) => (
          <div key={a.id} data-testid="kiosk-pay-row" className="rounded-2xl border border-[#DAE2DF] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold">{a.doctor?.name}</div>
                <div className="text-[15px] text-[#566663]">Ticket <span className="font-mono">{String(a.queue_number).padStart(3, "0")}</span> · {a.reason}</div>
              </div>
              <div className="text-right">
                <div className="text-[13px] text-[#566663]">Consultation from</div>
                <div className="text-2xl font-bold font-mono">RM {Number(a.fee || 50).toFixed(2)}</div>
                <div className="text-[13px] text-[#566663]">medicine added at payment</div>
              </div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              <Button data-testid={`kiosk-pay-btn-${a.id}`} onClick={() => pay(a, "duitnow")} disabled={paying === a.id}
                className="h-14 text-[17px] font-semibold bg-[#10262E] hover:bg-[#0A1A20] text-white rounded-xl">
                <QrCode size={20} className="mr-2" /> DuitNow QR
              </Button>
              <Button data-testid={`kiosk-pay-counter-${a.id}`} onClick={() => pay(a, "cash")} disabled={paying === a.id} variant="outline"
                className="h-14 text-[17px] font-semibold border-[#C8D3CF] rounded-xl">
                <CreditCard size={20} className="mr-2" /> Pay at the counter
              </Button>
            </div>
          </div>
        ))}

        {awaiting.map((a) => (
          <div key={a.id} className="rounded-2xl border border-[#DAE2DF] bg-[var(--ml-wash)] p-5">
            <div className="text-lg font-bold">Waiting for the counter to confirm</div>
            <div className="text-[15px] text-[#566663]">Ticket <span className="font-mono">{String(a.queue_number).padStart(3, "0")}</span> · RM {Number(a.paid_amount || 0).toFixed(2)} · ref <span className="font-mono">{a.payment_ref}</span></div>
          </div>
        ))}
      </div>

      {paid.length > 0 && (
        <>
          <h3 className="text-lg font-bold mt-6">Paid today</h3>
          <div className="space-y-2 mt-2">
            {paid.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4 rounded-xl border border-[#DAE2DF] bg-white">
                <div>
                  <div className="text-[15px] font-semibold">{a.doctor?.name}</div>
                  <div className="text-[13px] text-[#566663] font-mono">{String(a.queue_number).padStart(3, "0")}</div>
                </div>
                <span className="text-[15px] font-semibold text-[var(--ml-primary)]">
                  {a.status === "ready_for_pharmacy" ? "Collect your medicine at the pharmacy" : a.status === "dispensed" ? "Medicine collected" : "Paid"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------- */
/* Status flow                                            */
/* ----------------------------------------------------- */
function StatusFlow() {
  const [ic, setIc] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setBusy(true);
    try {
      const r = await kioskAxios.get(`/kiosk/lookup/${encodeURIComponent(ic)}`);
      setData(r.data);
    } catch (e) {
      toast.error(errMsg(e, "Patient not found"));
    } finally {
      setBusy(false);
    }
  };

  // auto-refresh status every 4s when viewing
  useEffect(() => {
    if (!data || !ic) return;
    const t = setInterval(() => lookup(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.patient?.id]);

  if (!data) {
    return (
      <div className="max-w-md">
        <div className="overline">Track your visit</div>
        <h2 className="font-display text-2xl mt-1">Enter your IC</h2>
        <Input
          data-testid="kiosk-status-ic"
          value={ic}
          onChange={(e) => setIc(e.target.value)}
          placeholder="880421-14-5567"
          className="font-mono border-[#DAE2DF] mt-4"
        />
        <Button
          data-testid="kiosk-status-lookup"
          onClick={lookup}
          disabled={!ic || busy}
          className="w-full mt-3 bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"
        >
          {busy ? "Loading…" : "View status"}
        </Button>
      </div>
    );
  }

  const appts = data.today_appointments || [];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="overline">Status</div>
          <h2 className="font-display text-2xl mt-1">{data.patient.name}</h2>
        </div>
        <Button
          variant="outline"
          onClick={() => { setIc(""); setData(null); }}
          className="border-[#DAE2DF] text-[var(--ml-primary)] rounded-full"
          data-testid="kiosk-status-back"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
      </div>
      {appts.length === 0 && (
        <div className="text-sm text-[#566663]">No appointments today.</div>
      )}
      <div className="space-y-2">
        <AnimatePresence>
          {appts.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl border border-[#DAE2DF] bg-white"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--ml-primary)] text-[#EEF2F1] flex items-center justify-center font-mono">
                #{a.queue_number}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{a.doctor?.name}</div>
                <div className="text-xs text-[#566663]">{a.reason}</div>
              </div>
              <Badge className={statusBadge[a.status]} data-testid={`kiosk-status-pill-${a.id}`}>
                {a.status.replaceAll("_", " ")}
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
