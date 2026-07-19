import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast, Toaster } from "sonner";
import { ShieldCheck, ArrowRight } from "@phosphor-icons/react";

export default function Activate() {
  const nav = useNavigate();
  const [ic, setIc] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const fmtIc = (v) => {
    const d = v.replace(/[^0-9]/g, "").slice(0, 12);
    if (d.length > 8) return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
    if (d.length > 6) return `${d.slice(0, 6)}-${d.slice(6)}`;
    return d;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("Passwords don't match");
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      const r = await api.post("/auth/activate", { ic_number: ic, code, password: pw });
      localStorage.setItem("ml_token", r.data.token);
      toast.success("Account activated — welcome to MediLink");
      window.location.href = "/patient";
    } catch (err) {
      toast.error(errMsg(err, "Activation failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F6] flex items-center justify-center px-6">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-md">
        <div className="w-12 h-12 rounded-2xl bg-[#1C3F39] flex items-center justify-center mb-6">
          <ShieldCheck size={24} weight="duotone" color="#F9F9F6" />
        </div>
        <div className="overline">Activate your account</div>
        <h1 className="font-display text-4xl mt-1">Set or reset your password</h1>
        <p className="text-sm text-[#5C6661] mt-2">
          Use the 6-digit activation code printed on your clinic slip.
          Codes are valid for 72 hours — visit the kiosk for a fresh one anytime. Afterwards, sign in with your IC number and this password.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label>IC number</Label>
            <Input
              data-testid="act-ic"
              value={ic}
              onChange={(e) => setIc(fmtIc(e.target.value))}
              placeholder="000000-00-0000"
              inputMode="numeric"
              className="font-mono border-[#E2DDD7] h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Activation code</Label>
            <Input
              data-testid="act-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="6-digit code from your slip"
              inputMode="numeric"
              className="font-mono border-[#E2DDD7] h-11 tracking-[0.3em]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input data-testid="act-pw" type="password" value={pw}
              onChange={(e) => setPw(e.target.value)} className="border-[#E2DDD7] h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input data-testid="act-pw2" type="password" value={pw2}
              onChange={(e) => setPw2(e.target.value)} className="border-[#E2DDD7] h-11" />
          </div>
          <Button
            data-testid="act-submit"
            type="submit"
            disabled={busy || ic.replace(/[^0-9]/g, "").length !== 12 || code.length !== 6}
            className="w-full h-11 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full"
          >
            {busy ? "Activating…" : (<>Activate <ArrowRight size={16} className="ml-1.5" /></>)}
          </Button>
        </form>

        <p className="text-sm text-[#5C6661] mt-6 text-center">
          Already activated?{" "}
          <Link to="/login" className="text-[#1C3F39] font-medium underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
