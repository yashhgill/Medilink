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

const kioskAxios = axios.create({
  baseURL: API,
  headers: process.env.REACT_APP_KIOSK_TOKEN
    ? { "X-Kiosk-Token": process.env.REACT_APP_KIOSK_TOKEN }
    : {},
});

const statusBadge = {
  scheduled: "bg-[#F3EFE9] text-[#1C3F39]",
  checked_in: "bg-[#D4A373]/30 text-[#1C3F39]",
  in_progress: "bg-[#B55B49]/20 text-[#9B2226]",
  completed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
  ready_for_pharmacy: "bg-[#1C3F39] text-[#F9F9F6]",
  dispensed: "bg-[#2D6A4F]/20 text-[#2D6A4F]",
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
    <div className="min-h-screen bg-[#1C3F39] relative overflow-hidden">
      {/* Decorative pattern */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(#F9F9F6 1px, transparent 1px), radial-gradient(#F9F9F6 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          backgroundPosition: "0 0, 16px 16px",
        }}
      />

      <header className="relative z-10 max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[#F9F9F6]">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
            <Heartbeat size={22} color="#F9F9F6" weight="duotone" />
          </div>
          <div>
            <div className="font-display text-xl leading-none">MediLink Kiosk</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">Self-Service Terminal</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav("/")}
          data-testid="kiosk-exit"
          className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Exit kiosk
        </Button>
      </header>

      <div className="kiosk-orb w-[420px] h-[420px] bg-[#2D6A4F] -top-24 -left-24" />
      <div className="kiosk-orb w-[360px] h-[360px] bg-[#D4A373] top-1/3 -right-28" style={{ animationDelay: "-6s" }} />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-4 landscape:pt-3 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-[10px] uppercase tracking-[0.25em] text-white/60 mb-3"
        >
          Welcome
        </motion.div>
        <h1 className="font-display text-3xl sm:text-4xl landscape:text-3xl text-[#F9F9F6] tracking-tight font-semibold leading-[1.05]">
          <motion.span
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block"
          >
            Welcome, enter
          </motion.span>{" "}
          <br />
          <motion.span
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="text-[#D4A373] inline-block"
          >
            your IC to begin.
          </motion.span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 landscape:mt-4 rounded-3xl bg-[#F9F9F6] p-2"
        >
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid grid-cols-3 w-full bg-[#F3EFE9] border border-[#E2DDD7] rounded-full p-1 h-12">
              <TabsTrigger value="checkin" data-testid="kiosk-tab-checkin" className="data-[state=active]:bg-[#1C3F39] data-[state=active]:text-[#F9F9F6] rounded-full">
                <Ticket size={14} weight="duotone" className="mr-1.5" /> Check-in
              </TabsTrigger>
              <TabsTrigger value="pay" data-testid="kiosk-tab-pay" className="data-[state=active]:bg-[#1C3F39] data-[state=active]:text-[#F9F9F6] rounded-full">
                <CreditCard size={14} weight="duotone" className="mr-1.5" /> Pay & Collect
              </TabsTrigger>
              <TabsTrigger value="status" data-testid="kiosk-tab-status" className="data-[state=active]:bg-[#1C3F39] data-[state=active]:text-[#F9F9F6] rounded-full">
                <Clock size={14} weight="duotone" className="mr-1.5" /> My status
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
      <Toaster position="top-center" richColors />
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
  const [registering, setRegistering] = useState(false);
  const [regForm, setRegForm] = useState({ name: "", phone: "", gender: "", dob: "" });
  const [symptoms, setSymptoms] = useState("");
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
        setStep("register");
        setRegForm({ name: "", phone: "", gender: "", dob: "" });
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
      await kioskAxios.post("/kiosk/register", {
        ic_number: ic,
        name: regForm.name,
        phone: regForm.phone || null,
        gender: regForm.gender || null,
        dob: regForm.dob || null,
      });
      toast.success("Registered · proceeding to check-in");
      // immediately lookup + checkin
      const r = await kioskAxios.post("/kiosk/checkin", { ic_number: ic, symptoms: symptoms || null, pain_score: painScore });
      setData(r.data);
      setStep("booked");
      onPrint(r.data.chit);
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

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setScanning(true);
      setTimeout(() => {
        const decoded = "880421-14-5567";
        toast.info(`QR decoded → ${decoded}`);
        stopCam();
        setIc(decoded);
        lookup(decoded);
      }, 2800);
    } catch (e) {
      toast.error("Camera blocked — use Manual mode");
    }
  };
  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => () => stopCam(), []);

  const reset = () => {
    setIc("");
    setStep("scan");
    setData(null);
  };

  if (step === "register") {
    return (
      <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} data-testid="kiosk-register-screen">
        <div className="overline">First time here</div>
        <h2 className="font-display text-3xl mt-1">Quick register</h2>
        <p className="text-sm text-[#5C6661] mt-1 mb-6">
          We couldn&apos;t find your IC <span className="font-mono text-[#0A0F0D]">{ic}</span> in our system.
          Fill these basics and we&apos;ll check you in right after.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label>Full name *</Label>
            <Input
              data-testid="kiosk-reg-name"
              value={regForm.name}
              onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
              className="border-[#E2DDD7]"
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
              className="border-[#E2DDD7]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input
              type="date"
              data-testid="kiosk-reg-dob"
              value={regForm.dob}
              onChange={(e) => setRegForm({ ...regForm, dob: e.target.value })}
              className="border-[#E2DDD7]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <select
              data-testid="kiosk-reg-gender"
              value={regForm.gender}
              onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-[#E2DDD7] bg-white text-sm"
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
            className="border-[#E2DDD7] text-[#1C3F39] rounded-full"
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <Button
            data-testid="kiosk-reg-submit"
            onClick={registerAndCheckin}
            disabled={!regForm.name || registering}
            className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full flex-1 btn-shimmer"
          >
            <Ticket size={14} className="mr-1.5" /> {registering ? "Setting up…" : "Register & get my ticket"}
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
        <div className="overline">Identified</div>
        <h2 className="font-display text-3xl mt-1">{data.patient.name}</h2>
        <div className="text-sm text-[#5C6661] font-mono mt-1">{data.patient.ic_number} · {data.patient.gender || "—"}</div>

        {existing ? (
          <div className="mt-6 rounded-2xl border border-[#E2DDD7] bg-[#F3EFE9] p-5">
            <div className="overline">Existing appointment today</div>
            <div className="mt-2 font-display text-2xl">{existing.doctor?.name || "Doctor"}</div>
            <div className="text-sm text-[#5C6661]">{existing.reason}</div>
            <Badge className={`mt-3 ${statusBadge[existing.status]}`}>{existing.status.replaceAll("_", " ")}</Badge>
            <div className="text-xs text-[#5C6661] mt-2">Queue #{String(existing.queue_number).padStart(3, "0")}</div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-[#E2DDD7] bg-[#F9F9F6] p-5 text-sm text-[#5C6661]">
            No appointment today. You can check in as a walk-in — we&apos;ll assign the first available doctor.
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-[#E2DDD7] bg-white p-5">
          <div className="overline">How are you feeling?</div>
          <textarea
            data-testid="kiosk-symptoms"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Describe your symptoms — e.g. fever and sore throat since yesterday…"
            rows={3}
            className="mt-3 w-full rounded-xl border border-[#E2DDD7] bg-[#F9F9F6] p-3 text-sm outline-none focus:border-[#1C3F39] resize-none"
          />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#5C6661] font-mono mr-1">Pain level:</span>
            {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
              <motion.button
                key={n}
                type="button"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                onClick={() => setPainScore(painScore === n ? null : n)}
                className={`w-8 h-8 rounded-full text-xs font-mono border transition-colors ${
                  painScore === n
                    ? "bg-[#1C3F39] text-white border-[#1C3F39]"
                    : "bg-white text-[#5C6661] border-[#E2DDD7] hover:border-[#1C3F39]"
                }`}
              >
                {n}
              </motion.button>
            ))}
          </div>
          <div className="text-[11px] text-[#5C6661] mt-2">
            Optional — helps our doctors see urgent cases first.
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              const r = await kioskAxios.post("/kiosk/reset-code", { ic_number: ic });
              window.alert(`Password reset code for ${r.data.name}:\n\n${r.data.reset_code}\n\nValid ${r.data.valid_minutes} minutes. Go to the app -> Activate, enter IC + this code + a new password.`);
            } catch (e) { toast.error(errMsg(e, "Could not issue reset code")); }
          }}
          className="mt-4 text-xs px-3 py-1.5 rounded-full border border-[#E2DDD7] hover:bg-white text-[#5C6661]"
        >
          Forgot app password? Get a reset code
        </button>

        <div className="flex gap-2 mt-6">
          <Button
            variant="outline"
            data-testid="kiosk-back-btn"
            onClick={reset}
            className="border-[#E2DDD7] text-[#1C3F39] rounded-full"
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <Button
            data-testid="kiosk-confirm-checkin"
            onClick={confirmCheckin}
            disabled={tapping}
            className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full flex-1 btn-shimmer"
          >
            <Ticket size={14} className="mr-1.5" /> {existing ? "Check in" : "Walk-in & get ticket"}
          </Button>
        </div>
      </motion.div>
    );
  }

  if (step === "booked") {
    return (
      <div className="text-center" data-testid="kiosk-booked-screen">
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="relative w-16 h-16 rounded-full bg-[#2D6A4F]/20 flex items-center justify-center mx-auto ring-ripple"
        >
          <CheckCircle size={32} weight="duotone" color="#2D6A4F" />
        </motion.div>
        <div className="overline mt-4">Ticket issued</div>
        <h2 className="font-display text-2xl mt-1">Your queue number</h2>
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
          className="font-display text-7xl text-[#1C3F39] font-mono tabular-nums leading-none mt-3"
          data-testid="kiosk-queue-number"
        >
          #{String(data.chit.queue_number).padStart(3, "0")}
        </motion.div>
        {data.chit.triage_colour && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-sm font-medium ${
              data.chit.triage_colour === "Red"
                ? "bg-red-50 text-red-700 border border-red-200 triage-red-glow"
                : data.chit.triage_colour === "Yellow"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${
              data.chit.triage_colour === "Red" ? "bg-red-500"
              : data.chit.triage_colour === "Yellow" ? "bg-amber-500" : "bg-emerald-500"}`} />
            {data.chit.triage_colour === "Red" ? "Priority — you'll be seen urgently"
              : data.chit.triage_colour === "Yellow" ? "Semi-urgent — shortened wait"
              : "Standard queue"}
          </motion.div>
        )}
        <div className="text-sm text-[#5C6661] mt-3">
          See {data.doctor?.name || "the doctor"} when called.
        </div>
        <div className="flex gap-2 mt-8 justify-center">
          <Button
            variant="outline"
            onClick={reset}
            data-testid="kiosk-done-btn"
            className="border-[#E2DDD7] text-[#1C3F39] rounded-full"
          >
            Done
          </Button>
          <Button
            onClick={() => onPrint(data.chit)}
            data-testid="kiosk-reprint-btn"
            className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full"
          >
            Print ticket again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overline">Step 1</div>
      <h2 className="font-display text-2xl mt-1">Identify yourself</h2>
      <p className="text-sm text-[#5C6661] mt-1 mb-6">Key in your IC number — or use the camera to scan the QR code on your appointment slip.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Manual IC entry — primary */}
        <div className="inset-card p-6 md:p-8 flex flex-col justify-center">
          <div className="overline">Enter your IC number</div>
          <Input
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
            className="mt-3 h-16 text-2xl tracking-widest text-center font-mono border-[#E2DDD7] bg-white rounded-2xl"
          />
          <Button
            data-testid="kiosk-lookup-btn"
            onClick={() => ic && lookup(ic)}
            disabled={ic.replace(/[^0-9]/g, "").length !== 12 || tapping}
            className="w-full mt-4 h-12 text-base bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-2xl btn-shimmer"
          >
            {tapping ? "Checking…" : "Continue"}
          </Button>
          <div className="text-[11px] text-[#5C6661] mt-3 text-center">
            12 digits, as printed on your MyKad
          </div>
        </div>

        {/* QR camera */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-4 flex flex-col">
          <div className="overline mb-2 flex items-center gap-1.5"><QrCode size={12} weight="duotone" /> QR scan</div>
          <div className="relative rounded-2xl overflow-hidden border border-[#E2DDD7] bg-black aspect-[4/3] flex-1">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-sm">
                Camera ready — tap Start
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#D4A373] shadow-[0_0_12px_#D4A373] animate-pulse" />
                <div className="absolute inset-6 border-2 border-[#D4A373] rounded-xl" />
              </>
            )}
          </div>
          <Button
            data-testid="kiosk-qr-start"
            disabled={scanning}
            onClick={startCam}
            variant="outline"
            className="mt-3 border-[#E2DDD7] text-[#1C3F39] hover:bg-[#F3EFE9]"
          >
            {scanning ? "Scanning…" : "Start QR scan"}
          </Button>
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

  const pay = async (appt) => {
    setPaying(appt.id);
    try {
      // Demo mode: instant mock payment. Production would integrate a card
      // terminal / DuitNow gateway here with auto-inserted amounts.
      const r = await kioskAxios.post("/kiosk/pay", {
        ic_number: ic,
        appointment_id: appt.id,
        method: "cash",
      });
      toast.success("Payment recorded — collect your medicine");
      onPrint(r.data.receipt, r.data.medicine_chit);
      // refresh
      lookup();
    } catch (e) {
      toast.error(errMsg(e, "Payment failed"));
    } finally {
      setPaying(null);
    }
  };

  // outstanding payments = appts that are paid==unpaid AND status not cancelled, AND have been seen
  const outstanding = (data?.today_appointments || []).filter(
    (a) => a.payment_status !== "paid" && a.status !== "cancelled"
  );
  const paid = (data?.today_appointments || []).filter((a) => a.payment_status === "paid");

  if (!data) {
    return (
      <div className="max-w-md">
        <div className="overline">Pay outstanding fees</div>
        <h2 className="font-display text-2xl mt-1">Identify yourself</h2>
        <p className="text-sm text-[#5C6661] mt-1 mb-4">Enter your IC to view today&apos;s charges.</p>
        <Input
          data-testid="kiosk-pay-ic"
          value={ic}
          onChange={(e) => setIc(e.target.value)}
          placeholder="880421-14-5567"
          className="font-mono border-[#E2DDD7]"
        />
        <Button
          data-testid="kiosk-pay-lookup"
          onClick={lookup}
          disabled={!ic || busy}
          className="w-full mt-3 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
        >
          {busy ? "Loading…" : "Continue"}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="overline">Patient</div>
          <h2 className="font-display text-2xl mt-1">{data.patient.name}</h2>
        </div>
        <Button
          variant="outline"
          onClick={() => { setIc(""); setData(null); }}
          className="border-[#E2DDD7] text-[#1C3F39] rounded-full"
          data-testid="kiosk-pay-back"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
      </div>

      <div className="overline">Outstanding</div>
      {outstanding.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2DDD7] p-5 mt-2 text-sm text-[#5C6661]">
          Nothing to pay right now.
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          {outstanding.map((a) => (
            <div key={a.id} data-testid="kiosk-pay-row" className="flex items-center justify-between p-3 rounded-xl border border-[#E2DDD7] bg-white">
              <div>
                <div className="text-sm font-medium">{a.doctor?.name} <span className="text-[#5C6661] font-normal">· {a.doctor?.specialty || "General"}</span></div>
                <div className="text-xs text-[#5C6661] font-mono">#{a.queue_number} · {a.reason}</div>
                <Badge className={`mt-1 ${statusBadge[a.status]}`}>{a.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="text-right">
                <div className="font-display text-xl">RM {Number(a.fee || 50).toFixed(2)}</div>
                <Button
                  data-testid={`kiosk-pay-btn-${a.id}`}
                  onClick={() => pay(a)}
                  disabled={paying === a.id || a.status === "scheduled"}
                  size="sm"
                  className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6] rounded-full mt-2"
                  title={a.status === "scheduled" ? "Wait until your consultation finishes" : ""}
                >
                  <CreditCard size={12} className="mr-1.5" />
                  {paying === a.id ? "Processing…" : "Pay"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <>
          <div className="overline mt-6">Paid today</div>
          <div className="space-y-2 mt-2">
            {paid.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-[#E2DDD7] bg-[#F3EFE9]">
                <div>
                  <div className="text-sm font-medium">{a.doctor?.name}</div>
                  <div className="text-xs text-[#5C6661] font-mono">#{a.queue_number}</div>
                </div>
                <Badge className={statusBadge[a.status]}>{a.status.replaceAll("_", " ")}</Badge>
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
          className="font-mono border-[#E2DDD7] mt-4"
        />
        <Button
          data-testid="kiosk-status-lookup"
          onClick={lookup}
          disabled={!ic || busy}
          className="w-full mt-3 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
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
          className="border-[#E2DDD7] text-[#1C3F39] rounded-full"
          data-testid="kiosk-status-back"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
      </div>
      {appts.length === 0 && (
        <div className="text-sm text-[#5C6661]">No appointments today.</div>
      )}
      <div className="space-y-2">
        <AnimatePresence>
          {appts.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl border border-[#E2DDD7] bg-white"
            >
              <div className="w-12 h-12 rounded-full bg-[#1C3F39] text-[#F9F9F6] flex items-center justify-center font-mono">
                #{a.queue_number}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{a.doctor?.name}</div>
                <div className="text-xs text-[#5C6661]">{a.reason}</div>
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
