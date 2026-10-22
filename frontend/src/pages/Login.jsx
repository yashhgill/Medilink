import React, { useEffect, useState } from "react";
import api, { IS_PUBLIC } from "@/lib/api";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PRODUCT } from "@/brand";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState(null);
  useEffect(() => { api.get("/branding").then((r) => setBrand(r.data)).catch(() => {}); }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.name}`);
      nav(redirectFor(u.role));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const loc = useLocation();
  const asPatient = new URLSearchParams(loc.search).get("as") === "patient";

  return (
    <div className="min-h-screen bg-[#EEF2F1] grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <aside className="hidden lg:flex flex-col bg-[#10262E] text-white px-14 py-12">
        <Link to="/" className="flex items-center gap-3" data-testid="brand-home">
          {brand?.logo ? <img src={brand.logo} alt="" className="w-10 h-10 rounded-xl object-contain bg-white p-0.5" />
            : <img src={PRODUCT.logo} alt="" className="w-10 h-10 rounded-xl object-cover" />}
          <span className="text-white/70 text-[15px]">Back to the front door</span>
        </Link>
        <div className="mt-auto">
          <h2 className="text-white text-[52px] leading-[1]">{brand?.clinic_name || PRODUCT.name}</h2>
          <p className="mt-4 text-white/65 text-[18px] max-w-[34ch]">
            {asPatient ? "Your visits, results, bills and medical certificates from this clinic."
              : "Queue, consultations, payments and pharmacy, kept on this clinic's own computer."}
          </p>
        </div>
      </aside>
      <main className="flex flex-col px-6 sm:px-10 py-8">
        <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-10" data-testid="brand-home-mobile">
          <img src={PRODUCT.logo} alt="" className="w-9 h-9 rounded-lg object-cover" />
          <span className="font-display text-[19px]">{brand?.clinic_name || PRODUCT.name}</span>
        </Link>
        <div className="w-full max-w-[420px] m-auto">
          <h1 className="text-[40px] leading-tight">{asPatient ? "Patient sign in" : "Staff sign in"}</h1>
          <p className="text-[16px] text-[#566663] mt-1 mb-8">
            {asPatient ? "Use the IC number on your MyKad." : "Doctors, reception, pharmacy and administrators."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[15px]">{asPatient ? "IC number" : "Email"}</Label>
              <Input
                id="email"
                data-testid="login-email"
                type="text" autoComplete="username" inputMode={asPatient ? "numeric" : "email"}
                placeholder={asPatient ? "000000-00-0000" : "name@clinic.my"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`h-12 text-[17px] border-[#C8D3CF] ${asPatient ? "font-mono" : ""}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[15px]">Password</Label>
              <Input
                id="password"
                data-testid="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-[17px] border-[#C8D3CF]"
              />
            </div>
            <Button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full h-12 text-[17px] font-semibold bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white rounded-xl"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {asPatient ? (
            <p className="text-[15px] text-[#566663] mt-6">
              First time, or forgot your password? Ask the counter or kiosk for a code, then{" "}
              <Link to="/activate" className="text-[var(--ml-primary)] font-semibold hover:underline" data-testid="goto-activate">set your password</Link>.
            </p>
          ) : (
            <p className="text-[15px] text-[#566663] mt-6">
              Forgot your password? Your clinic administrator can reset it.{" "}
              <Link to="/login?as=patient" className="text-[var(--ml-primary)] font-semibold hover:underline">I'm a patient</Link>
            </p>
          )}
          {asPatient && !IS_PUBLIC && (
            <p className="text-[15px] text-[#566663] mt-2">
              No account yet? <Link to="/register" className="text-[var(--ml-primary)] font-semibold hover:underline" data-testid="goto-register">Register</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function redirectFor(role) {
  if (role === "doctor") return "/doctor";
  if (role === "admin" || role === "super_admin" || role === "clinic_admin" || role === "receptionist") return "/reception";
  if (role === "pharmacist") return "/pharmacy";
  return "/patient";
}
