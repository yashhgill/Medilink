import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heartbeat, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

const demoAccounts = [
  { role: "Patient", email: "patient1@medilink.io", pwd: "Patient@123" },
  { role: "Doctor", email: "dr.tan@medilink.io", pwd: "Doctor@123" },
  { role: "Reception", email: "admin@medilink.io", pwd: "Admin@123" },
];

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

  const quick = async (acc) => {
    setEmail(acc.email);
    setPassword(acc.pwd);
    setLoading(true);
    try {
      const u = await login(acc.email, acc.pwd);
      toast.success(`Signed in as ${u.name}`);
      nav(redirectFor(u.role));
    } catch (err) {
      toast.error("Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#F9F9F6]">
      {/* Left visual */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src="https://images.pexels.com/photos/7789616/pexels-photo-7789616.jpeg"
          alt="Clinic"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#1C3F39]/70" />
        <div className="relative h-full p-12 flex flex-col justify-between text-[#F9F9F6]">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
              <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">MediLink</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                Cloud · AI · IoT
              </div>
            </div>
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/60 mb-3">
              Final-year project
            </div>
            <div className="font-display text-4xl lg:text-5xl leading-tight max-w-md">
              Tap. Triage. Treat. <br />Zero downtime.
            </div>
            <div className="text-white/70 mt-4 max-w-md">
              An NFC-enabled PHR system that mirrors every record between your local
              NVMe SSD and the cloud — so your clinic keeps running even when the
              internet doesn&apos;t.
            </div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
              <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
            </div>
            <div className="font-display text-lg">MediLink</div>
          </div>

          <div className="overline mb-3">Sign in</div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-1">
            Welcome back
          </h2>
          <p className="text-sm text-[#5C6661] mb-8">
            Use a demo account or your own credentials.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-email"
                type="email"
                placeholder="you@medilink.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-[#E2DDD7] focus-visible:ring-[#1C3F39]"
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
                className="border-[#E2DDD7] focus-visible:ring-[#1C3F39]"
              />
            </div>
            <Button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full lift-on-hover"
            >
              {loading ? "Signing in…" : (<>Sign in <ArrowRight size={16} className="ml-1.5" /></>)}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-8 text-[10px] uppercase tracking-[0.2em] text-[#5C6661]">
            <div className="h-px flex-1 bg-[#E2DDD7]" /> Demo accounts <div className="h-px flex-1 bg-[#E2DDD7]" />
          </div>

          <div className="grid gap-2">
            {demoAccounts.map((d) => (
              <button
                key={d.email}
                data-testid={`demo-login-${d.role.toLowerCase()}`}
                onClick={() => quick(d)}
                disabled={loading}
                className="text-left p-3 rounded-xl border border-[#E2DDD7] bg-white hover:bg-[#F3EFE9] transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{d.role}</div>
                  <div className="text-xs font-mono text-[#5C6661]">{d.email}</div>
                </div>
                <ArrowRight size={16} className="text-[#1C3F39]" />
              </button>
            ))}
          </div>

          <p className="text-sm text-[#5C6661] mt-8 text-center">
            New here?{" "}
            <Link to="/register" className="text-[#1C3F39] font-medium underline-offset-2 hover:underline" data-testid="goto-register">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function redirectFor(role) {
  if (role === "doctor") return "/doctor";
  if (role === "admin") return "/reception";
  return "/patient";
}
