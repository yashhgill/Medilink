import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Heartbeat, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { redirectFor } from "./Login";
import { PRODUCT } from "@/brand";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "patient",
    ic_number: "",
    phone: "",
    dob: "",
    gender: "",
    specialty: "",
    license_no: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Account created — welcome ${u.name}`);
      nav(redirectFor(u.role));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF2F1] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-[#DAE2DF] rounded-3xl p-8 md:p-10">
        <Link to="/" className="flex items-center gap-2.5 mb-8" data-testid="brand-home">
          <img src={PRODUCT.logo} alt={PRODUCT.name} className="w-11 h-11 rounded-xl object-cover" />
          <div className="font-display text-lg">{PRODUCT.name}</div>
        </Link>

        
        <h2 className="font-display text-3xl tracking-tight mb-1">Create a patient account</h2>
        <p className="text-sm text-[#566663] mb-8">For patients of this clinic. Staff accounts are created by the clinic administrator.</p>

        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          

          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input data-testid="reg-name" value={form.name} onChange={set("name")} className="border-[#DAE2DF]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input data-testid="reg-email" type="email" value={form.email} onChange={set("email")} className="border-[#DAE2DF]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input data-testid="reg-password" type="password" value={form.password} onChange={set("password")} className="border-[#DAE2DF]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input data-testid="reg-phone" value={form.phone} onChange={set("phone")} className="border-[#DAE2DF]" />
          </div>

          {form.role === "patient" && (
            <>
              <div className="space-y-1.5">
                <Label>IC Number</Label>
                <Input
                  data-testid="reg-ic"
                  placeholder="000000-00-0000"
                  value={form.ic_number}
                  onChange={set("ic_number")}
                  className="border-[#DAE2DF] font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" data-testid="reg-dob" value={form.dob} onChange={set("dob")} className="border-[#DAE2DF]" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={set("gender")}>
                  <SelectTrigger data-testid="reg-gender" className="border-[#DAE2DF]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {form.role === "doctor" && (
            <>
              <div className="space-y-1.5">
                <Label>Specialty</Label>
                <Input data-testid="reg-specialty" value={form.specialty} onChange={set("specialty")} className="border-[#DAE2DF]" />
              </div>
              <div className="space-y-1.5">
                <Label>License No.</Label>
                <Input data-testid="reg-license" value={form.license_no} onChange={set("license_no")} className="border-[#DAE2DF] font-mono" />
              </div>
            </>
          )}

          <Button
            data-testid="reg-submit"
            type="submit"
            disabled={loading}
            className="sm:col-span-2 h-11 bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full lift-on-hover"
          >
            {loading ? "Creating account…" : (<>Create account <ArrowRight size={16} className="ml-1.5" /></>)}
          </Button>
        </form>

        <p className="text-sm text-[#566663] mt-8 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-[var(--ml-primary)] font-medium underline-offset-2 hover:underline" data-testid="goto-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
