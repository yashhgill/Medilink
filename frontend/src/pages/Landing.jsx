import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Heartbeat,
  WaveTriangle,
  CloudCheck,
  HardDrives,
  Sparkle,
  ShieldCheck,
  ArrowRight,
  Stethoscope,
  Cardholder,
} from "@phosphor-icons/react";

const features = [
  {
    icon: WaveTriangle,
    title: "NFC IC Tap",
    body: "Walk in, tap the chip on your IC — your full health record opens instantly at reception.",
  },
  {
    icon: Stethoscope,
    title: "AI Triage (Gemini)",
    body: "Symptom checker, history summarizer, and drug-interaction safety net for every clinician.",
  },
  {
    icon: HardDrives,
    title: "SSD + Cloud",
    body: "Writes hit your local NVMe first, then mirror to cloud. Zero downtime — clinics keep running offline.",
  },
  {
    icon: ShieldCheck,
    title: "Role-aware PHR",
    body: "Patients, doctors, and reception each see what they need — with token queues and mock payments built-in.",
  },
];

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#F9F9F6]">
      {/* Grid bg */}
      <div className="absolute inset-0 bg-lines opacity-60 pointer-events-none" />

      {/* Top nav */}
      <nav className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
          <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
            <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
          </div>
          <div>
            <div className="font-display text-lg leading-none">MediLink</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
              Cloud · AI · IoT
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            data-testid="cta-login-nav"
            variant="ghost"
            onClick={() => nav("/login")}
            className="text-[#1C3F39] hover:bg-[#F3EFE9]"
          >
            Sign in
          </Button>
          <Button
            data-testid="cta-register-nav"
            onClick={() => nav("/register")}
            className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full px-5"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-8 pt-16 pb-20 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#E2DDD7] bg-white text-xs font-mono text-[#5C6661] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] breathe" />
            Final-year project · Cloud + AI + IoT
          </div>

          <h1 className="font-display font-semibold tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-[#0A0F0D]">
            Personal health records that{" "}
            <span className="text-[#1C3F39]">never go down.</span>
          </h1>

          <p className="mt-6 text-lg text-[#5C6661] max-w-xl leading-relaxed">
            MediLink unifies the patient&apos;s journey — from an NFC tap at the door
            to an AI-assisted prescription — and keeps every record safe across
            your <span className="text-[#0A0F0D] font-medium">local NVMe SSD</span>{" "}
            and the <span className="text-[#0A0F0D] font-medium">cloud</span>.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              data-testid="cta-get-started"
              onClick={() => nav("/register")}
              className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full px-6 h-12 lift-on-hover"
            >
              Get Started <ArrowRight size={16} className="ml-1.5" />
            </Button>
            <Button
              data-testid="cta-demo-login"
              variant="outline"
              onClick={() => nav("/login")}
              className="rounded-full px-6 h-12 border-[#E2DDD7] hover:bg-[#F3EFE9] text-[#1C3F39]"
            >
              <Cardholder size={16} className="mr-1.5" weight="duotone" /> Try a demo login
            </Button>
            <Button
              data-testid="cta-kiosk"
              variant="outline"
              onClick={() => nav("/kiosk")}
              className="rounded-full px-6 h-12 border-[#1C3F39] text-[#1C3F39] hover:bg-[#1C3F39] hover:text-[#F9F9F6]"
            >
              Open Kiosk <ArrowRight size={16} className="ml-1.5" />
            </Button>
          </div>

          <div className="mt-10 flex items-center gap-6 text-xs text-[#5C6661] font-mono">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} /> Role-aware access
            </div>
            <div className="flex items-center gap-1.5">
              <CloudCheck size={14} /> SSD-first sync
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkle size={14} /> Gemini 3 Flash
            </div>
          </div>
        </div>

        {/* Hero card */}
        <div className="lg:col-span-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative rounded-3xl border border-[#E2DDD7] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(28,63,57,0.35)]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="overline">Reception · Live</div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#2D6A4F]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] breathe" />
                Online
              </div>
            </div>

            <div className="inset-card flex flex-col items-center justify-center py-10">
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="relative w-28 h-28 rounded-full bg-white border-2 border-[#1C3F39] flex items-center justify-center nfc-pulse"
              >
                <WaveTriangle size={48} weight="duotone" color="#1C3F39" />
              </motion.div>
              <div className="overline mt-5">Tap IC to check-in</div>
              <div className="font-display text-3xl mt-1 text-[#1C3F39]">Patient #042</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl p-3 bg-[#F3EFE9] border border-[#E2DDD7]">
                <div className="flex items-center gap-1.5 text-xs text-[#1C3F39]">
                  <HardDrives size={14} weight="duotone" /> NVMe SSD
                </div>
                <div className="font-mono text-lg mt-1">12 local</div>
              </div>
              <div className="rounded-xl p-3 bg-white border border-[#E2DDD7]">
                <div className="flex items-center gap-1.5 text-xs text-[#1C3F39]">
                  <CloudCheck size={14} weight="duotone" /> Cloud
                </div>
                <div className="font-mono text-lg mt-1">8,402 mirrored</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-8 pb-24">
        <div className="overline mb-3">What&apos;s inside</div>
        <h2 className="font-display text-3xl sm:text-4xl mb-10 max-w-2xl tracking-tight">
          A clinic-grade workflow, packed into a final-year project.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl border border-[#E2DDD7] bg-white p-6 hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F3EFE9] flex items-center justify-center mb-4">
                <f.icon size={20} weight="duotone" color="#1C3F39" />
              </div>
              <div className="font-display text-lg mb-1.5">{f.title}</div>
              <p className="text-sm text-[#5C6661] leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#E2DDD7]">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-6 flex items-center justify-between text-xs text-[#5C6661] font-mono">
          <div>© 2026 MediLink · Final-Year Project</div>
          <div>Built with FastAPI · MongoDB · Gemini 3 · React</div>
        </div>
      </footer>
    </div>
  );
}
