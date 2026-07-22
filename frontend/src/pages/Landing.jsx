import React from "react";
import { IS_PUBLIC } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heartbeat, WaveTriangle, Stethoscope, CloudCheck, ShieldCheck,
  ArrowRight, Pill, IdentificationCard, Broadcast, Lock,
} from "@phosphor-icons/react";

/* Malaysian healthcare palette */
const C = {
  teal: "#0B7C8C", tealDark: "#075F6C", navy: "#0A3D62",
  mist: "#EAF5F5", ink: "#12262B", slate: "#5A6B70", red: "#D64550",
};

const features = [
  { icon: IdentificationCard, title: "Kiosk IC Check-in",
    body: "Patients walk in and enter their IC — registered, AI-triaged and queued in under a minute. No receptionist required." },
  { icon: Stethoscope, title: "Clinician Workspace",
    body: "AI pre-consult briefings, live Bluetooth vitals, e-prescriptions and one-tap medical certificates for every doctor." },
  { icon: Pill, title: "Pharmacy & Inventory",
    body: "Prescriptions flow straight to the dispensary with a full stock ledger, low-stock and expiry alerts." },
  { icon: CloudCheck, title: "Local-first, Cloud-mirrored",
    body: "Records write to the clinic's own storage first, then mirror to the cloud. Care never stops when the internet does." },
  { icon: ShieldCheck, title: "Encrypted & Auditable",
    body: "IC numbers are encrypted at rest with a searchable blind index. Every record access is logged — PDPA-ready." },
  { icon: Broadcast, title: "One Patient, One Record",
    body: "Records follow the patient across every connected clinic, labelled by facility — a truly national health record." },
];

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: "#FFFFFF", color: C.ink }}>
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.9)", borderBottom: `1px solid ${C.mist}` }}>
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.teal }}>
              <Heartbeat size={20} color="#fff" weight="duotone" />
            </div>
            <div>
              <div className="font-display text-lg leading-none" style={{ color: C.navy }}>MediLink</div>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: C.slate }}>Health Systems</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => nav("/login")} className="px-4 py-2 rounded-full text-sm font-medium hover:bg-[#EAF5F5]" style={{ color: C.navy }}>
              Sign in
            </button>
            {!IS_PUBLIC && (
              <button onClick={() => nav("/kiosk")} className="px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ background: C.teal }}>
                Open Kiosk
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${C.mist} 0%, #FFFFFF 60%)` }}>
        <div className="max-w-[1200px] mx-auto px-6 pt-20 pb-24 text-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
            style={{ background: "#fff", color: C.teal, border: `1px solid ${C.mist}` }}>
            <span className="w-1.5 h-1.5 rounded-full breathe" style={{ background: C.teal }} />
            The operating system for Malaysian clinics
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="font-display font-semibold tracking-tight leading-[1.05]"
            style={{ fontSize: "clamp(2.4rem,6vw,4.4rem)", color: C.navy }}>
            Run the whole clinic.<br />
            <span style={{ color: C.teal }}>Check-in to prescription.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 max-w-2xl mx-auto text-lg leading-relaxed" style={{ color: C.slate }}>
            MediLink runs the front desk, the doctor's room, the pharmacy and the patient app as one system —
            local-first so it keeps working when the internet doesn't, and mirrored to a national cloud record.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-9 flex flex-wrap gap-3 justify-center">
            <button onClick={() => nav("/login")} className="px-7 h-12 rounded-full text-white font-semibold inline-flex items-center gap-2"
              style={{ background: C.teal }}>
              Get started <ArrowRight size={18} />
            </button>
            <button onClick={() => nav("/activate")} className="px-7 h-12 rounded-full font-semibold"
              style={{ background: "#fff", color: C.navy, border: `1px solid ${C.mist}` }}>
              Activate patient account
            </button>
          </motion.div>
          <div className="mt-10 flex items-center gap-6 justify-center text-xs font-medium flex-wrap" style={{ color: C.slate }}>
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} weight="duotone" /> PDPA-ready</span>
            <span className="flex items-center gap-1.5"><Lock size={14} weight="duotone" /> Encrypted records</span>
            <span className="flex items-center gap-1.5"><CloudCheck size={14} weight="duotone" /> Works offline</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: C.teal }}>What's inside</div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight" style={{ color: C.navy }}>Everything a modern clinic needs</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="rounded-2xl p-6" style={{ background: "#fff", border: `1px solid ${C.mist}` }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: C.mist }}>
                <f.icon size={22} weight="duotone" color={C.teal} />
              </div>
              <div className="font-display text-lg mb-1.5" style={{ color: C.navy }}>{f.title}</div>
              <p className="text-sm leading-relaxed" style={{ color: C.slate }}>{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section style={{ background: C.navy }}>
        <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl text-white tracking-tight">Ready when your clinic is.</h2>
          <p className="mt-3 max-w-xl mx-auto" style={{ color: "#B9CDD8" }}>
            One system for check-in, consultation, dispensing and patient records — deployable on a single machine.
          </p>
          <button onClick={() => nav("/login")} className="mt-8 px-8 h-12 rounded-full font-semibold inline-flex items-center gap-2"
            style={{ background: C.teal, color: "#fff" }}>
            Sign in <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#fff", borderTop: `1px solid ${C.mist}` }}>
        <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ color: C.slate }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: C.teal }}>
              <Heartbeat size={13} color="#fff" weight="duotone" />
            </div>
            <span className="font-medium" style={{ color: C.navy }}>MediLink Health Systems</span>
          </div>
          <div>© {new Date().getFullYear()} MediLink · All rights reserved to <a href="https://harnova.my" style={{ color: C.teal }}>harnova.my</a></div>
        </div>
      </footer>
    </div>
  );
}
