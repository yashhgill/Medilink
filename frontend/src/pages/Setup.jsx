import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PRODUCT } from "@/brand";

/**
 * First-run setup wizard — two steps only:
 *   Step 1: Clinic details (name, address, phone)
 *   Step 2: Administrator account
 *
 * Licence activation is intentionally removed from the wizard. In networked
 * (demo) mode the deployment mode itself unlocks Connect features; there is
 * no code to enter. Admins who need to manage licences can do so in Settings.
 */
export default function Setup() {
  const nav = useNavigate();
  const { completeSetup } = useAuth();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1); // 1 = clinic, 2 = admin

  const [f, setF] = useState({
    clinic_name: "", clinic_address: "", clinic_phone: "",
    admin_name: "", admin_email: "", admin_password: "", confirm: "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    api.get("/setup/status")
      .then((r) => { if (!r.data.needs_setup) nav("/login", { replace: true }); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [nav]);

  const submit = async (e) => {
    e.preventDefault();
    if (f.admin_password.length < 8) return toast.error("Password must be at least 8 characters");
    if (f.admin_password !== f.confirm) return toast.error("Passwords don't match");
    setSaving(true);
    try {
      await completeSetup({
        clinic_name: f.clinic_name,
        clinic_address: f.clinic_address,
        clinic_phone: f.clinic_phone,
        admin_name: f.admin_name,
        admin_email: f.admin_email,
        admin_password: f.admin_password,
      });
      toast.success(`Clinic ready — welcome to ${PRODUCT.name}!`);
      setTimeout(() => window.location.assign("/"), 400);
    } catch (err) {
      toast.error(errMsg(err, "Setup failed"));
    } finally {
      setSaving(false);
    }
  };

  if (checking) return null;

  const input =
    "w-full border border-[#DAE2DF] rounded-xl px-4 py-3 text-[#10201D] focus:outline-none focus:ring-2 focus:ring-[#0A6E62]/30";
  const label = "text-xs font-semibold tracking-wide text-[#566663] uppercase";

  const Dots = () => (
    <div className="flex items-center justify-center gap-2 mb-5">
      {[1, 2].map((n) => (
        <span key={n}
          className={`h-1.5 rounded-full transition-all ${
            n === step ? "w-7 bg-[var(--ml-primary)]" : n < step ? "w-4 bg-[#0A6E62]/40" : "w-4 bg-[#DAE2DF]"
          }`} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF2F1] p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <img src={PRODUCT.logo} alt={PRODUCT.name}
               className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md"
               onError={(e) => { e.target.style.display = "none"; }} />
          <h1 className="font-display text-3xl text-[#10262E]">Welcome to {PRODUCT.name}</h1>
          <p className="text-sm text-[#566663] mt-1">
            Two quick steps and your clinic is ready. Everything runs on this machine.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DAE2DF] p-6">
          <Dots />

          {/* ── STEP 1 — CLINIC ───────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <div className={label}>Step 1 of 2</div>
                <h2 className="text-xl font-semibold text-[#10201D] mt-1">Set up your clinic</h2>
                <p className="text-sm text-[#566663] mt-1">
                  This appears on receipts, medicine labels, and medical certificates.
                </p>
              </div>
              <input className={input} placeholder="Clinic name (e.g. Klinik Sihat)"
                     value={f.clinic_name} onChange={set("clinic_name")} autoFocus />
              <input className={input} placeholder="Address (optional)"
                     value={f.clinic_address} onChange={set("clinic_address")} />
              <input className={input} placeholder="Phone number (optional)"
                     value={f.clinic_phone} onChange={set("clinic_phone")} />
              <div className="flex gap-3 pt-1">
                <button type="button"
                        onClick={() => f.clinic_name.trim() ? setStep(2) : toast.error("Please enter your clinic name")}
                        className="flex-1 bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-xl py-3 font-medium">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — ADMIN ────────────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <div className={label}>Step 2 of 2</div>
                <h2 className="text-xl font-semibold text-[#10201D] mt-1">Administrator account</h2>
                <p className="text-sm text-[#566663] mt-1">
                  You'll use this to log in and manage staff.
                </p>
              </div>
              <input className={input} placeholder="Your full name"
                     value={f.admin_name} onChange={set("admin_name")} required autoFocus />
              <input className={input} type="email" placeholder="Login email"
                     value={f.admin_email} onChange={set("admin_email")} required />
              <div className="grid grid-cols-2 gap-3">
                <input className={input} type="password" placeholder="Password (min 8)"
                       value={f.admin_password} onChange={set("admin_password")} required />
                <input className={input} type="password" placeholder="Confirm password"
                       value={f.confirm} onChange={set("confirm")} required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep(1)}
                        className="px-5 border border-[#DAE2DF] rounded-xl py-3 text-[#566663] font-medium">
                  Back
                </button>
                <button type="submit" disabled={saving}
                        className="flex-1 bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-xl py-3 font-medium disabled:opacity-60">
                  {saving ? "Setting up…" : "Create my clinic →"}
                </button>
              </div>
              <p className="text-[11px] text-[#8AA0A8] text-center">
                Your patient data stays on this machine.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
