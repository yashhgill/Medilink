import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IdentificationCard, FileText, Stethoscope, WifiSlash, ArrowRight, Television } from "@phosphor-icons/react";
import api, { IS_PUBLIC } from "@/lib/api";
import { PRODUCT } from "@/brand";
import { ZONE_COLOUR, useQueueBoard, useClock } from "@/components/QueueBoard";

/* The clinic's front door. On a clinic machine this is the first screen anyone
   sees, so it names the clinic (from Branding), not the software, shows the
   queue as it stands (numbers only, never names), and sends each kind of
   visitor straight to the one thing they came to do. */
export default function Landing() {
  const nav = useNavigate();
  const [brand, setBrand] = useState(null);
  const board = useQueueBoard();
  const now = useClock();
  useEffect(() => {
    api.get("/branding").then((r) => setBrand(r.data)).catch(() => setBrand({}));
  }, []);
  const clinic = brand?.clinic_name || board?.clinic_name || "Your clinic";

  const doors = [
    !IS_PUBLIC && {
      icon: IdentificationCard, title: "Check in for a visit", body: "Use your MyKad at the kiosk and take a queue number.",
      cta: "Open the kiosk", go: "/kiosk", primary: true, testid: "landing-kiosk",
    },
    {
      icon: FileText, title: "See my records and bills", body: "Results, prescriptions, receipts and medical certificates.",
      cta: "Patient sign in", go: "/login?as=patient", testid: "landing-patient",
    },
    {
      icon: Stethoscope, title: "Clinic staff", body: "Doctors, reception, pharmacy and administrators.",
      cta: "Staff sign in", go: "/login", testid: "landing-staff",
    },
  ].filter(Boolean);

  const serving = board?.now_serving || [];
  const waiting = board?.waiting || [];

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-[#EEF2F1] text-[#10201D]">
      {/* The board side: who the clinic is, and the queue right now */}
      <section className="relative bg-[#10262E] text-white px-6 sm:px-10 lg:px-14 py-8 lg:py-12 flex flex-col overflow-hidden" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          {brand?.logo ? (
            <img src={brand.logo} alt="" className="w-10 h-10 rounded-xl object-contain bg-white p-0.5" />
          ) : (
            <img src={PRODUCT.logo} alt="" className="w-10 h-10 rounded-xl object-cover" />
          )}
          <span className="text-white/70 text-[15px]">{brand?.clinic_address || "Welcome"}</span>
        </div>

        <div className="mt-10 lg:mt-16">
          <div className="text-white/60 text-[17px]">
            {now.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}
            <span className="mx-2">·</span>
            <span className="tabular-nums">{now.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <h1 className="mt-2 text-white text-[44px] sm:text-[60px] lg:text-[72px] leading-[0.98]">{clinic}</h1>
          <p className="mt-4 text-white/70 text-[19px] max-w-[34ch]">{brand?.welcome_message || "Selamat datang. What would you like to do today?"}</p>
          {brand?.opening_hours && <p className="mt-3 text-white/55 text-[15px]">Open {brand.opening_hours}</p>}
        </div>

        <div className="mt-10 lg:mt-auto grid grid-cols-2 gap-3 max-w-[560px]">
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5">
            <div className="text-[14px] text-white/60">Now seeing</div>
            <div className="mt-2 flex flex-wrap gap-2 min-h-[56px] items-center">
              {serving.length === 0 ? <span className="text-white/50 text-[15px]">Doctors will call soon</span> :
                serving.map((s) => (
                  <span key={s.number} className="figure text-[44px]" >
                    {String(s.number).padStart(3, "0")}
                  </span>
                ))}
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5">
            <div className="text-[14px] text-white/60">Waiting now</div>
            <div className="figure text-[44px] mt-2" data-testid="landing-waiting">{waiting.length}</div>
          </div>
        </div>
        <button onClick={() => nav("/board")} className="mt-5 self-start flex items-center gap-2 text-[14px] text-white/60 hover:text-white">
          <Television size={18} /> Open the waiting-room screen
        </button>
      </section>

      {/* The doors */}
      <section className="px-6 sm:px-10 lg:px-14 py-10 lg:py-12 flex flex-col">
        <div className="flex justify-end">
          <button onClick={() => nav("/activate")} className="text-[15px] font-semibold text-[var(--ml-primary)] hover:underline">
            New patient app account
          </button>
        </div>
        <ul className="my-auto py-8 space-y-3 max-w-[560px] w-full mx-auto">
          {doors.map((d) => (
            <li key={d.go}>
              <button
                onClick={() => nav(d.go)}
                data-testid={d.testid}
                className={`group w-full text-left flex items-center gap-5 rounded-2xl border p-6 transition-colors ${
                  d.primary ? "bg-[var(--ml-primary)] border-[var(--ml-primary)] text-white hover:bg-[var(--ml-primary-soft)]" : "bg-white border-[#DAE2DF] hover:border-[var(--ml-primary)] shadow-[var(--shadow-card)]"
                }`}
              >
                <span className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${d.primary ? "bg-white/15" : "bg-[var(--ml-wash)]"}`}>
                  <d.icon size={30} className={d.primary ? "text-white" : "text-[var(--ml-primary)]"} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[20px] font-bold leading-snug">{d.title}</span>
                  <span className={`block text-[15px] mt-0.5 ${d.primary ? "text-white/80" : "text-[#566663]"}`}>{d.body}</span>
                  <span className={`sm:hidden block mt-2 text-[15px] font-semibold ${d.primary ? "text-white" : "text-[var(--ml-primary)]"}`}>{d.cta}</span>
                </span>
                <ArrowRight size={22} className={`hidden sm:block shrink-0 transition-transform group-hover:translate-x-0.5 ${d.primary ? "text-white" : "text-[var(--ml-primary)]"}`} />
              </button>
            </li>
          ))}
        </ul>
        <footer className="text-[13px] text-[#566663] flex flex-wrap items-start gap-x-6 gap-y-2">
          <span className="flex items-start gap-2 max-w-[46ch]">
            <WifiSlash size={18} className="mt-0.5 shrink-0" />
            Records are kept on this clinic's own computer, so check-in, consultations and payment keep working when the internet is down.
          </span>
          <span className="ml-auto">{brand?.clinic_phone}{brand?.clinic_phone ? " · " : ""}Runs on {PRODUCT.name}</span>
        </footer>
      </section>
    </div>
  );
}
