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
    <AppShell title="Ready to collect" subtitle="Pharmacy" navItems={[{ label: "Dispensing", to: "/pharmacy" }, { label: "Stock", to: "/pharmacy/inventory" }]}>
      {(expiry.expired.length > 0 || expiry.expiring_soon.length > 0) && (
        <div className="mb-5 rounded-2xl border border-[#EBC9B3] bg-[#FBF1EA] p-5" data-testid="expiry-alerts">
          <h2 className="text-[15px] font-bold text-[#7A3410]">Check these batches before dispensing</h2>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {expiry.expired.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#E7B4A8]">
                <div>
                  <div className="text-[15px] font-semibold">{m.name}</div>
                  <div className="text-[11px] text-[#566663] font-mono">batch {m.batch_no || "—"} · {m.stock_qty} {m.unit || "units"}</div>
                </div>
                <span className="text-[13px] font-bold text-[#B4231C]">Expired {m.expiry_date?.slice(0,10)}</span>
              </div>
            ))}
            {expiry.expiring_soon.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#EBC9B3]">
                <div>
                  <div className="text-[15px] font-semibold">{m.name}</div>
                  <div className="text-[11px] text-[#566663] font-mono">batch {m.batch_no || "—"} · {m.stock_qty} {m.unit || "units"}</div>
                </div>
                <span className="text-[13px] font-bold text-[#7A3410]">Expires in {m.days_to_expiry} days</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-3 rounded-2xl border border-[#DAE2DF] bg-white p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold">Paid and waiting <span className="text-[#566663] font-semibold" data-testid="pharmacy-waiting-count">({queue.length})</span></h3>
              <p className="text-[13px] text-[#566663]">Check the medicines against the prescription, hand them over, then press Dispense.</p>
            </div>
          </div>

          {queue.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#DAE2DF] bg-[#EEF2F1] p-8 text-center text-sm text-[#566663]">
              Nobody is waiting. Prescriptions appear here once the patient has paid.
            </div>
          )}

          <div className="space-y-3">
            {queue.map((a) => (
              <div
                key={a.id}
                data-testid="pharmacy-row"
                className="rounded-2xl border border-[#DAE2DF] bg-[#EEF2F1] p-5 grid md:grid-cols-[auto_1fr_auto] items-start gap-5"
              >
                <div className="w-16 text-center font-mono text-2xl font-bold" aria-label={`Queue number ${a.queue_number}`}>
                  {String(a.queue_number ?? "").padStart(3, "0")}
                </div>

                <div>
                  <div className="text-lg font-bold leading-tight">{a.patient?.name}</div>
                  <div className="text-xs text-[#566663] font-mono mt-0.5">{a.patient?.ic_number}</div>
                  <div className="text-xs text-[#566663] mt-1">
                    Prescribed by {a.doctor?.name} · paid RM{Number(a.paid_amount || a.fee || 0).toFixed(2)}
                  </div>
                  {a.record?.allergies && !/^(none|nil|nkda|-)/i.test(a.record.allergies.trim()) && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#E7B4A8] bg-[#FBEDEA] px-2.5 py-1 text-[15px] font-semibold text-[#8E1F17]" data-testid="pharmacy-allergy">
                      Allergy: {a.record.allergies}
                    </div>
                  )}
                  {a.record?.diagnosis && (
                    <div className="text-[15px] mt-2"><span className="text-[#566663]">Diagnosis:</span> {a.record.diagnosis}</div>
                  )}

                  {a.record?.prescriptions?.length > 0 ? (
                    <div className="mt-3 grid sm:grid-cols-2 gap-2">
                      {a.record.prescriptions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-[#DAE2DF]">
                          <Pill size={16} weight="duotone" color="#0A6E62" className="mt-0.5 shrink-0" />
                          <div className="text-[15px]">
                            <div className="font-semibold">{p.medicine}</div>
                            <div className="text-[13px] text-[#566663] font-mono">{p.dosage} · {p.frequency} · {p.duration}</div>
                            {p.notes && <div className="text-[13px] text-[#566663] mt-0.5">{p.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-[#566663] italic">No medicines listed in the record.</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <span className="text-[13px] font-semibold text-[var(--ml-primary)]">Paid</span>
                  <Button
                    data-testid={`dispense-btn-${a.id}`}
                    onClick={() => setConfirmOpen(a)}
                    disabled={busy === a.id}
                    className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full"
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
        <DialogContent data-testid="dispense-dialog" className="bg-[#EEF2F1] border-[#DAE2DF]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Confirm dispense?</DialogTitle>
            <DialogDescription>
              {confirmOpen?.patient?.name} · #{confirmOpen?.queue_number}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-[#DAE2DF] bg-white p-4 text-sm">
            <div className="overline mb-2">Medicines to hand over</div>
            {(confirmOpen?.record?.prescriptions || []).map((p, i) => (
              <div key={i} className="flex items-center gap-2 font-mono">
                <Pill size={12} weight="duotone" /> {p.medicine} · {p.dosage} · {p.frequency} · {p.duration}
              </div>
            ))}
            {(!confirmOpen?.record?.prescriptions || confirmOpen.record.prescriptions.length === 0) && (
              <div className="text-[#566663] italic">No medicines listed.</div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(null)}
              className="border-[#DAE2DF] text-[var(--ml-primary)]"
            >
              Cancel
            </Button>
            <Button
              data-testid="dispense-confirm-btn"
              onClick={() => dispense(confirmOpen)}
              disabled={!confirmOpen || busy === confirmOpen?.id}
              className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]"
            >
              <CheckCircle size={14} className="mr-1.5" weight="duotone" /> Confirm & complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
