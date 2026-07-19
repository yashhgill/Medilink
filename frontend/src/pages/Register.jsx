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
    <div className="min-h-screen bg-[#F9F9F6] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-[#E2DDD7] rounded-3xl p-8 md:p-10">
        <Link to="/" className="flex items-center gap-2.5 mb-8" data-testid="brand-home">
          <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
            <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
          </div>
          <div className="font-display text-lg">MediLink</div>
        </Link>

        <div className="overline mb-3">Create account</div>
        <h2 className="font-display text-3xl tracking-tight mb-1">Join MediLink</h2>
        <p className="text-sm text-[#5C6661] mb-8">Select your role and fill in the details.</p>

        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={set("role")}>
              <SelectTrigger data-testid="reg-role" className="border-[#E2DDD7]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="patient">Patient</SelectItem>
                <SelectItem value="doctor">Doctor</SelectItem>
                <SelectItem value="admin">Reception / Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input data-testid="reg-name" value={form.name} onChange={set("name")} className="border-[#E2DDD7]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input data-testid="reg-email" type="email" value={form.email} onChange={set("email")} className="border-[#E2DDD7]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input data-testid="reg-password" type="password" value={form.password} onChange={set("password")} className="border-[#E2DDD7]" required />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input data-testid="reg-phone" value={form.phone} onChange={set("phone")} className="border-[#E2DDD7]" />
          </div>

          {form.role === "patient" && (
            <>
              <div className="space-y-1.5">
                <Label>IC Number</Label>
                <Input
                  data-testid="reg-ic"
                  placeholder="IC-YYMMDD-XX-NNNN"
                  value={form.ic_number}
                  onChange={set("ic_number")}
                  className="border-[#E2DDD7] font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" data-testid="reg-dob" value={form.dob} onChange={set("dob")} className="border-[#E2DDD7]" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={set("gender")}>
                  <SelectTrigger data-testid="reg-gender" className="border-[#E2DDD7]">
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
                <Input data-testid="reg-specialty" value={form.specialty} onChange={set("specialty")} className="border-[#E2DDD7]" />
              </div>
              <div className="space-y-1.5">
                <Label>License No.</Label>
                <Input data-testid="reg-license" value={form.license_no} onChange={set("license_no")} className="border-[#E2DDD7] font-mono" />
              </div>
            </>
          )}

          <Button
            data-testid="reg-submit"
            type="submit"
            disabled={loading}
            className="sm:col-span-2 h-11 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full lift-on-hover"
          >
            {loading ? "Creating account…" : (<>Create account <ArrowRight size={16} className="ml-1.5" /></>)}
          </Button>
        </form>

        <p className="text-sm text-[#5C6661] mt-8 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-[#1C3F39] font-medium underline-offset-2 hover:underline" data-testid="goto-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
