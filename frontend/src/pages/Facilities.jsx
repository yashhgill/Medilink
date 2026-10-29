import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useMode } from "@/lib/mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Buildings, Plus, Tooth, FirstAid, Hospital, UserPlus, Users, ShieldCheck, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PRODUCT } from "@/brand";

const typeMeta = {
  clinic:   { label: "Clinic",   icon: FirstAid,  color: "bg-[#0A6E62]/15 text-[var(--ml-primary)]" },
  hospital: { label: "Hospital", icon: Hospital,  color: "bg-[#0A6E62]/15 text-[var(--ml-primary)]" },
  dental:   { label: "Dental",   icon: Tooth,     color: "bg-[#10262E]/15 text-[#10262E]" },
};

const roleMeta = {
  super_admin:  { label: "Administrator", color: "bg-[#10262E]/15 text-[#10262E]" },
  admin:        { label: "Administrator", color: "bg-[#10262E]/15 text-[#10262E]" },
  clinic_admin: { label: "Clinic admin", color: "bg-[#0A6E62]/15 text-[var(--ml-primary)]" },
  doctor:       { label: "Doctor",       color: "bg-[#0A6E62]/15 text-[var(--ml-primary)]" },
  receptionist: { label: "Reception",    color: "bg-[#566663]/15 text-[#566663]" },
  pharmacist:   { label: "Pharmacist",   color: "bg-[#0A6E62]/15 text-[var(--ml-primary)]" },
};

export default function Facilities() {
  const { isSuperAdmin, user } = useAuth();
  const { isNetworked } = useMode();
  const [facilities, setFacilities] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ code: "", name: "", type: "clinic", address: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const staffRoles = isSuperAdmin
    ? ["clinic_admin", "doctor", "receptionist", "pharmacist"]
    : ["doctor", "receptionist", "pharmacist"];
  const [sf, setSf] = useState({ name: "", email: "", password: "", role: "doctor", facility_id: "", specialty: "" });
  const [savingStaff, setSavingStaff] = useState(false);

  const load = async () => {
    try {
      const [f, st] = await Promise.all([
        api.get("/facilities"),
        api.get("/admin/staff").catch(() => ({ data: [] })),
      ]);
      setFacilities(f.data);
      setStaff(st.data || []);
      if (!sf.facility_id && f.data[0]) setSf((s) => ({ ...s, facility_id: f.data[0].code }));
    } catch (e) { toast.error("Could not load network data"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const addFacility = async () => {
    if (!form.code || !form.name) return toast.error("Code and name are required");
    setSaving(true);
    try {
      await api.post("/facilities", form);
      toast.success(form.name + " added");
      setForm({ code: "", name: "", type: "clinic", address: "", phone: "" });
      load();
    } catch (e) { toast.error(errMsg(e, "Could not add facility")); }
    finally { setSaving(false); }
  };

  const addStaff = async () => {
    if (!sf.name || !sf.email || !sf.password) return toast.error("Name, email and password are required");
    // Staff log in with a real email (used for receipts/reminders too).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sf.email))
      return toast.error("Enter a valid email, e.g. dr.raju@medilink.io");
    if (sf.password.length < 6)
      return toast.error("Password must be at least 6 characters");
    if (isSuperAdmin && !sf.facility_id)
      return toast.error("Choose a facility for this staff member");
    setSavingStaff(true);
    try {
      const payload = { name: sf.name, email: sf.email, password: sf.password, role: sf.role };
      if (isSuperAdmin) payload.facility_id = sf.facility_id;
      if (sf.role === "doctor" && sf.specialty) payload.specialty = sf.specialty;
      await api.post("/admin/staff", payload);
      toast.success(sf.name + " added");
      setSf({ ...sf, name: "", email: "", password: "", specialty: "" });
      load();
    } catch (e) { toast.error(errMsg(e, "Could not add staff")); }
    finally { setSavingStaff(false); }
  };

  const removeStaff = async (s) => {
    if (!window.confirm("Deactivate " + s.name + "? They will no longer be able to sign in.")) return;
    try {
      await api.delete("/admin/staff/" + s.id);
      toast.success(s.name + " deactivated");
      load();
    } catch (e) { toast.error(errMsg(e, "Could not deactivate")); }
  };

  const facCode = (code) => facilities.find((f) => f.code === code);
  const navItems = [{ label: "Operations", to: "/reception" }, { label: isSuperAdmin ? "Network" : "My clinic", to: "/facilities" }, { label: "Clinic settings", to: "/branding" }, ...(isSuperAdmin && isNetworked ? [{ label: "Monitoring", to: "/monitoring" }] : [])];

  return (
    <AppShell
      title={!isNetworked ? "Clinic and staff" : isSuperAdmin ? "Network administration" : "My clinic"}
      subtitle={!isNetworked ? "Manage your clinic" : isSuperAdmin ? "Network" : "Clinic"}
      navItems={navItems}>

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#DAE2DF] bg-[#EEF2F1] px-5 py-4">
        <ShieldCheck size={22} weight="duotone" color="#10262E" />
        <div>
          <div className="font-display text-base text-[#10262E]">
            {!isNetworked ? "This clinic" : isSuperAdmin ? "Every clinic in your network" : "Your clinic: " + (user?.facility_id || "this clinic")}
          </div>
          <div className="text-xs text-[#566663]">
            {!isNetworked
              ? "Add your doctors, reception and pharmacy staff here. Each person signs in with their own email and password."
              : isSuperAdmin
              ? "Add clinics and their administrators, and see every clinic. A patient's records follow them between clinics by IC number, with their consent."
              : "You manage staff, patients and cash for your own clinic. Clinics are added by the network administrator."}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {isSuperAdmin && isNetworked && (
          <div className="rounded-2xl border border-[#DAE2DF] bg-white p-6 h-fit">
            <div className="flex items-center gap-2 mb-4">
              <Plus size={18} weight="bold" color="#0A6E62" />
              <div className="overline">Add a facility</div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Facility code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="klinik-sunway" className="font-mono border-[#DAE2DF]" /></div>
              <div className="space-y-1.5"><Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Klinik Sunway" className="border-[#DAE2DF]" /></div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="border-[#DAE2DF]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="hospital">Hospital</SelectItem>
                    <SelectItem value="dental">Dental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Bandar Sunway, Selangor" className="border-[#DAE2DF]" /></div>
              <div className="space-y-1.5"><Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03-1234 5678" className="border-[#DAE2DF]" /></div>
              <Button onClick={addFacility} disabled={saving} className="w-full bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]">
                {saving ? "Adding…" : "Add facility"}
              </Button>
            </div>
          </div>
        )}

        {isNetworked && <div className={(isSuperAdmin ? "lg:col-span-2" : "lg:col-span-3") + " rounded-2xl border border-[#DAE2DF] bg-white p-6"}>
          <div className="flex items-center gap-2 mb-4">
            <Buildings size={18} weight="duotone" color="#0A6E62" />
            <div className="overline">{isSuperAdmin ? "Clinics (" + facilities.length + ")" : "My clinic"}</div>
          </div>
          {facilities.length === 0 && <div className="text-sm text-[#566663]">No facilities yet.</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            {facilities.map((f) => {
              const m = typeMeta[f.type] || typeMeta.clinic;
              const Icon = m.icon;
              const count = staff.filter((s) => s.facility_id === f.code).length;
              return (
                <div key={f.id} className="p-4 rounded-xl border border-[#DAE2DF]">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[var(--ml-wash)] flex items-center justify-center">
                      <Icon size={20} weight="duotone" color="#0A6E62" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={m.color}>{m.label}</Badge>
                      {f.active ? <Badge className="bg-[#0A6E62]/15 text-[var(--ml-primary)]">active</Badge> : <Badge className="bg-[#566663]/15 text-[#566663]">off</Badge>}
                    </div>
                  </div>
                  <div className="font-display text-lg mt-3">{f.name}</div>
                  {f.address
                    ? <div className="text-xs text-[#566663] mt-0.5">{f.address}</div>
                    : <div className="text-[11px] font-mono text-[#566663] mt-0.5">{f.code}</div>}

                  {f.phone && <div className="text-xs text-[#566663]">{f.phone}</div>}
                  <div className="text-[11px] text-[var(--ml-primary)] mt-2">{count} staff</div>
                </div>
              );
            })}
          </div>
        </div>}
      </div>

      <div className={"grid lg:grid-cols-3 gap-6" + (isNetworked ? " mt-6" : "")}>
        <div className="rounded-2xl border border-[#DAE2DF] bg-white p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={18} weight="bold" color="#0A6E62" />
            <div className="overline">Add staff</div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label>
              <Input value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} placeholder="Dr. Wei Tan" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Login email</Label>
              <Input value={sf.email} onChange={(e) => setSf({ ...sf, email: e.target.value })} placeholder="name@yourclinic.my" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Temporary password</Label>
              <Input value={sf.password} onChange={(e) => setSf({ ...sf, password: e.target.value })} placeholder="Set a strong password" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={sf.role} onValueChange={(v) => setSf({ ...sf, role: v })}>
                <SelectTrigger className="border-[#DAE2DF]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {staffRoles.map((r) => <SelectItem key={r} value={r}>{roleMeta[r].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {sf.role === "doctor" && (
              <div className="space-y-1.5"><Label>Specialty</Label>
                <Input value={sf.specialty} onChange={(e) => setSf({ ...sf, specialty: e.target.value })} placeholder="General Physician" className="border-[#DAE2DF]" /></div>
            )}
            {isSuperAdmin && isNetworked && (
              <div className="space-y-1.5"><Label>Clinic</Label>
                <Select value={sf.facility_id} onValueChange={(v) => setSf({ ...sf, facility_id: v })}>
                  <SelectTrigger className="border-[#DAE2DF]"><SelectValue placeholder="Choose a clinic" /></SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => <SelectItem key={f.code} value={f.code}>{f.name} ({f.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={addStaff} disabled={savingStaff} className="w-full bg-[#10262E] hover:bg-[#0A1A20] text-[#EEF2F1]">
              {savingStaff ? "Adding…" : "Add staff"}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[#DAE2DF] bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} weight="duotone" color="#0A6E62" />
            <div className="overline">Staff ({staff.length})</div>
          </div>
          {staff.length === 0 && <div className="text-sm text-[#566663]">No staff yet. Add your first team member.</div>}
          <div className="divide-y divide-[#DAE2DF]">
            {staff.map((s) => {
              const rm = roleMeta[s.role] || { label: s.role, color: "bg-[#566663]/15 text-[#566663]" };
              const fac = facCode(s.facility_id);
              const canRemove = s.id !== user?.id && !(s.role === "super_admin" || s.role === "admin");
              return (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-[#10262E]">{s.name}
                      {s.activated === false && <span className="ml-2 text-[11px] text-[#B4442F]">deactivated</span>}
                    </div>
                    <div className="text-xs text-[#566663]">{s.email}{fac || s.facility_id ? " · " + (fac ? fac.name : s.facility_id) : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={rm.color}>{rm.label}</Badge>
                    {canRemove && (
                      <button onClick={() => removeStaff(s)} className="text-[#B4442F] hover:opacity-70" title="Deactivate">
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#566663] mt-5 leading-relaxed">
            {isNetworked
              ? "Receipts, medical certificates and letters are issued by each clinic. A patient's medical record follows them between clinics by IC number, with their consent."
              : "The bin icon switches off someone's sign-in. Their past records stay, with their name on them."}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
