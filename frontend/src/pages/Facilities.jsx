import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api, { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Buildings, Plus, Tooth, FirstAid, Hospital } from "@phosphor-icons/react";
import { toast } from "sonner";

const typeMeta = {
  clinic:   { label: "Clinic",   icon: FirstAid,  color: "bg-[#2D6A4F]/15 text-[#2D6A4F]" },
  hospital: { label: "Hospital", icon: Hospital,  color: "bg-[#086788]/15 text-[#086788]" },
  dental:   { label: "Dental",   icon: Tooth,     color: "bg-[#B55B49]/15 text-[#B55B49]" },
};

export default function Facilities() {
  const [facilities, setFacilities] = useState([]);
  const [form, setForm] = useState({ code: "", name: "", type: "clinic", address: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const r = await api.get("/facilities"); setFacilities(r.data); }
    catch (e) { toast.error("Could not load facilities"); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.code || !form.name) return toast.error("Code and name are required");
    setSaving(true);
    try {
      await api.post("/facilities", form);
      toast.success(`${form.name} added`);
      setForm({ code: "", name: "", type: "clinic", address: "", phone: "" });
      load();
    } catch (e) { toast.error(errMsg(e, "Could not add facility")); }
    finally { setSaving(false); }
  };

  return (
    <AppShell title="Facilities" subtitle="Network administration"
      navItems={[{ label: "Operations", to: "/reception" }, { label: "Facilities", to: "/facilities" }]}>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Add facility */}
        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={18} weight="bold" color="#1C3F39" />
            <div className="overline">Add a facility</div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Facility code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="klinik-sunway" className="font-mono border-[#E2DDD7]" /></div>
            <div className="space-y-1.5"><Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Klinik MediLink Sunway" className="border-[#E2DDD7]" /></div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="border-[#E2DDD7]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="dental">Dental (MediDental)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Bandar Sunway, Selangor" className="border-[#E2DDD7]" /></div>
            <div className="space-y-1.5"><Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03-1234 5678" className="border-[#E2DDD7]" /></div>
            <Button onClick={add} disabled={saving} className="w-full bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]">
              {saving ? "Adding…" : "Add facility"}
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2 rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Buildings size={18} weight="duotone" color="#1C3F39" />
            <div className="overline">Network ({facilities.length})</div>
          </div>
          {facilities.length === 0 && <div className="text-sm text-[#5C6661]">No facilities yet. Add your first one.</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            {facilities.map((f) => {
              const m = typeMeta[f.type] || typeMeta.clinic;
              const Icon = m.icon;
              return (
                <div key={f.id} className="p-4 rounded-xl border border-[#E2DDD7]">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#F3EFE9] flex items-center justify-center">
                      <Icon size={20} weight="duotone" color="#1C3F39" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={m.color}>{m.label}</Badge>
                      {f.active ? <Badge className="bg-[#2D6A4F]/15 text-[#2D6A4F]">active</Badge> : <Badge className="bg-[#5C6661]/15 text-[#5C6661]">off</Badge>}
                    </div>
                  </div>
                  <div className="font-display text-lg mt-3">{f.name}</div>
                  <div className="text-[11px] font-mono text-[#5C6661]">{f.code}</div>
                  {f.address && <div className="text-xs text-[#5C6661] mt-1">{f.address}</div>}
                  {f.phone && <div className="text-xs text-[#5C6661]">{f.phone}</div>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#5C6661] mt-5 leading-relaxed">
            Each facility runs its own MediLink node with this code as <span className="font-mono">FACILITY_ID</span>.
            Receipts, medical certificates and chits are generated by that facility with its own name and doctors,
            while patient records unify across the network by IC.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
