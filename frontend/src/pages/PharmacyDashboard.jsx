import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import useQueueSocket from "@/hooks/useQueueSocket";
import SyncIndicator from "@/components/SyncIndicator";
import { Pill, CheckCircle, Flask, ListChecks, Package } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PharmacyInventory from "./PharmacyInventory";

import { toast } from "sonner";

export default function PharmacyDashboard() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(null);

  const [expiry, setExpiry] = useState({ expired: [], expiring_soon: [] });

  const load = async () => {
    try {
      const r = await api.get("/pharmacy/queue");
      setQueue(r.data);
      const ex = await api.get("/pharmacy/expiry-alerts").catch(() => null);
      if (ex) setExpiry(ex.data);
    } catch (e) {
      toast.error("Failed to load pharmacy queue");
    }
  };

  useEffect(() => { load(); }, []);

  useQueueSocket((ev) => {
    if (ev?.type?.startsWith("appointment.")) load();
  });

  const dispense = async (appt) => {
    setBusy(appt.id);
    try {
      await api.post("/pharmacy/dispense", { appointment_id: appt.id, patient_id: appt.patient_id, items: (appt.record?.prescriptions || []).map(p => ({ name: p.medicine, qty: 1 })) });
      toast.success(`Dispensed to ${appt.patient?.name} · treatment complete`);
      setConfirmOpen(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark as dispensed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell title="Pharmacy · Dispense Queue" subtitle={`${user.name}`} navItems={[]}>
      {(expiry.expired.length > 0 || expiry.expiring_soon.length > 0) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5" data-testid="expiry-alerts">
          <div className="overline text-amber-700">Stock expiry alerts</div>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {expiry.expired.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-red-200">
                <div>
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-[11px] text-[#5C6661] font-mono">batch {m.batch_no || "—"} · {m.stock_qty} {m.unit || "units"}</div>
                </div>
                <span className="text-xs font-semibold text-red-600">EXPIRED {m.expiry_date?.slice(0,10)}</span>
              </div>
            ))}
            {expiry.expiring_soon.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-amber-200">
                <div>
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-[11px] text-[#5C6661] font-mono">batch {m.batch_no || "—"} · {m.stock_qty} {m.unit || "units"}</div>
                </div>
                <span className="text-xs font-semibold text-amber-700">{m.days_to_expiry}d left</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-[#E2DDD7] bg-[#1C3F39] text-[#F9F9F6] p-6">
          <div className="overline text-white/60">Waiting</div>
          <div className="font-display text-7xl tabular-nums mt-2 font-mono leading-none" data-testid="pharmacy-waiting-count">
            {queue.length}
          </div>
          <div className="text-sm text-white/70 mt-3">patient(s) ready to collect medicine</div>
        </div>

        <div className="rounded-2xl border border-[#E2DDD7] bg-white p-6 lg:col-span-2 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F3EFE9] flex items-center justify-center">
            <Flask size={26} weight="duotone" color="#1C3F39" />
          </div>
          <div className="flex-1">
            <div className="overline">How it works</div>
            <div className="text-sm text-[#5C6661] mt-1">
              When a patient pays at the kiosk, their prescription arrives here.
              Verify the meds, hand them over, then tap <span className="font-semibold text-[#0A0F0D]">Dispense</span> — the treatment is marked complete.
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-[#E2DDD7] bg-white p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="overline">Dispense queue</div>
              <h3 className="font-display text-xl mt-1">Live · {queue.length} pending</h3>
            </div>
            <ListChecks size={18} weight="duotone" color="#1C3F39" />
          </div>

          {queue.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#E2DDD7] bg-[#F9F9F6] p-8 text-center text-sm text-[#5C6661]">
              No patients waiting. Drink some water 🌿
            </div>
          )}

          <div className="space-y-3">
            {queue.map((a) => (
              <div
                key={a.id}
                data-testid="pharmacy-row"
                className="rounded-2xl border border-[#E2DDD7] bg-[#F9F9F6] p-5 grid md:grid-cols-[auto_1fr_auto] items-start gap-5"
              >
                <div className="w-14 h-14 rounded-full bg-[#1C3F39] text-[#F9F9F6] flex items-center justify-center font-mono text-lg">
                  #{a.queue_number}
                </div>

                <div>
                  <div className="font-display text-lg leading-tight">{a.patient?.name}</div>
                  <div className="text-xs text-[#5C6661] font-mono mt-0.5">{a.patient?.ic_number}</div>
                  <div className="text-xs text-[#5C6661] mt-1">
                    Prescribed by {a.doctor?.name} · paid RM{Number(a.paid_amount || a.fee || 0).toFixed(2)}
                  </div>
                  {a.record?.diagnosis && (
                    <div className="text-sm mt-2"><span className="text-[#5C6661]">Dx:</span> {a.record.diagnosis}</div>
                  )}

                  {a.record?.prescriptions?.length > 0 ? (
                    <div className="mt-3 grid sm:grid-cols-2 gap-2">
                      {a.record.prescriptions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-[#E2DDD7]">
                          <Pill size={16} weight="duotone" color="#1C3F39" className="mt-0.5 shrink-0" />
                          <div className="text-sm">
                            <div className="font-medium">{p.medicine}</div>
                            <div className="text-xs text-[#5C6661] font-mono">{p.dosage} · {p.frequency} · {p.duration}</div>
                            {p.notes && <div className="text-[10px] text-[#5C6661] mt-0.5">{p.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-[#5C6661] italic">No medicines listed in the record.</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <Badge className="bg-[#2D6A4F]/20 text-[#2D6A4F]">paid</Badge>
                  <Button
                    data-testid={`dispense-btn-${a.id}`}
                    onClick={() => setConfirmOpen(a)}
                    disabled={busy === a.id}
                    className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full"
                  >
                    <CheckCircle size={14} className="mr-1.5" weight="duotone" /> Dispense
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <SyncIndicator />
      </div>

      <Dialog open={!!confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <DialogContent data-testid="dispense-dialog" className="bg-[#F9F9F6] border-[#E2DDD7]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Confirm dispense?</DialogTitle>
            <DialogDescription>
              {confirmOpen?.patient?.name} · #{confirmOpen?.queue_number}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-[#E2DDD7] bg-white p-4 text-sm">
            <div className="overline mb-2">Medicines to hand over</div>
            {(confirmOpen?.record?.prescriptions || []).map((p, i) => (
              <div key={i} className="flex items-center gap-2 font-mono">
                <Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency} · {p.duration}
              </div>
            ))}
            {(!confirmOpen?.record?.prescriptions || confirmOpen.record.prescriptions.length === 0) && (
              <div className="text-[#5C6661] italic">No medicines listed.</div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(null)}
              className="border-[#E2DDD7] text-[#1C3F39]"
            >
              Cancel
            </Button>
            <Button
              data-testid="dispense-confirm-btn"
              onClick={() => dispense(confirmOpen)}
              disabled={!confirmOpen || busy === confirmOpen?.id}
              className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
            >
              <CheckCircle size={14} className="mr-1.5" weight="duotone" /> Confirm & complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
