import React, { useState } from "react";
import { IS_PUBLIC } from "@/lib/api";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heartbeat, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#F4F9F9]">
      {/* Left visual */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src="https://images.pexels.com/photos/7789616/pexels-photo-7789616.jpeg"
          alt="Clinic"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0B7C8C]/70" />
        <div className="relative h-full p-12 flex flex-col justify-between text-[#F4F9F9]">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
              <Heartbeat size={20} color="#F4F9F9" weight="duotone" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">MediLink</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                Health Systems
              </div>
            </div>
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/60 mb-3">
              MediLink Health Systems
            </div>
            <div className="font-display text-4xl lg:text-5xl leading-tight max-w-md">
              Check in. Triage.<br />Treat.
            </div>
            <div className="text-white/70 mt-4 max-w-md">
              One system for the whole clinic — check-in, consultation, dispensing and records. Built for Malaysian clinics.
            </div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-[#0B7C8C] flex items-center justify-center">
              <Heartbeat size={20} color="#F4F9F9" weight="duotone" />
            </div>
            <div className="font-display text-lg">MediLink</div>
          </div>

          <div className="overline mb-3">Sign in</div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-1">
            Welcome back
          </h2>
          <p className="text-sm text-[#5A6B70] mb-8">
            Sign in to view your records and bills.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-email"
                type="text" autoComplete="username" inputMode="text"
                placeholder="you@email.com or 000000-00-0000"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-[#DCE8E9] focus-visible:ring-[#0B7C8C]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-[#DCE8E9] focus-visible:ring-[#0B7C8C]"
              />
            </div>
            <Button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9] rounded-full lift-on-hover"
            >
              {loading ? "Signing in…" : (<>Sign in <ArrowRight size={16} className="ml-1.5" /></>)}
            </Button>
          </form>

          <p className="text-sm text-[#5A6B70] mt-6 text-center">
            Forgot your password? Get a reset code at the clinic kiosk, then use{" "}
            <Link to="/activate" className="text-[#0B7C8C] font-medium underline-offset-2 hover:underline">Activate</Link>. First visit?{" "}
            <Link to="/activate" className="text-[#0B7C8C] font-medium underline-offset-2 hover:underline" data-testid="goto-activate">
              Activate your account
            </Link>{" "}
            with the code on your clinic slip.
          </p>
          {!IS_PUBLIC && (
          <p className="text-sm text-[#5A6B70] mt-2 text-center">
            New here?{" "}
            <Link to="/register" className="text-[#0B7C8C] font-medium underline-offset-2 hover:underline" data-testid="goto-register">
              Create an account
            </Link>
          </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function redirectFor(role) {
  if (role === "doctor") return "/doctor";
  if (role === "admin" || role === "super_admin" || role === "clinic_admin" || role === "receptionist") return "/reception";
  if (role === "pharmacist") return "/pharmacy";
  return "/patient";
}
