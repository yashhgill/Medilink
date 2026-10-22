import React, { useRef } from "react";
import { fmtDateTime, fmtDate } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Heartbeat } from "@phosphor-icons/react";
import { PRODUCT } from "@/brand";

/**
 * Receipt / queue-ticket chit shown after a kiosk action.
 * Uses window.print() with a print-only stylesheet to "print" the chit.
 */
export default function PrintChit({ open, onOpenChange, chit, onClose, secondary }) {
  const ref = useRef(null);

  const doPrint = () => {
    // Mark chit area as print target via class on body
    document.body.classList.add("chit-print");
    window.print();
    setTimeout(() => document.body.classList.remove("chit-print"), 500);
  };

  if (!chit) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) onClose?.(); }}>
      <DialogContent
        data-testid="print-chit-dialog"
        className="bg-[#EEF2F1] border-[#DAE2DF] max-w-md p-0 overflow-hidden no-print-overlay"
        aria-describedby="chit-description"
      >
        <DialogTitle className="sr-only">Printable chit</DialogTitle>
        <DialogDescription id="chit-description" className="sr-only">
          Your ticket details. Click Print chit to print.
        </DialogDescription>
        <div ref={ref} className="chit-print-area bg-white p-8 m-4 rounded-2xl border border-dashed border-[#0A6E62]/40" data-testid="print-chit">
          <ChitContent chit={chit} />
          {secondary && (
            <>
              <div className="my-6 border-t border-dashed border-[#0A6E62]/30" />
              <ChitContent chit={secondary} />
            </>
          )}
        </div>
        <div className="flex justify-between gap-2 p-4 bg-[var(--ml-wash)] border-t border-[#DAE2DF]">
          <Button
            variant="outline"
            data-testid="chit-close"
            onClick={() => { onOpenChange(false); onClose?.(); }}
            className="border-[#DAE2DF] text-[var(--ml-primary)] hover:bg-white rounded-full"
          >
            <X size={14} className="mr-1.5" /> Close
          </Button>
          <Button
            data-testid="chit-print-btn"
            onClick={doPrint}
            className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1] rounded-full"
          >
            <Printer size={14} className="mr-1.5" /> Print chit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChitContent({ chit }) {
  const headline =
    chit.type === "QUEUE" ? "QUEUE TICKET" :
    chit.type === "RECEIPT" ? "PAYMENT RECEIPT" :
    chit.type === "MEDICINE" ? "MEDICINE COLLECTION" : "TICKET";

  return (
    <div className="font-mono text-[#10201D]">
      <div className="flex items-center justify-center gap-2 mb-1">
        <Heartbeat size={18} weight="duotone" color="#0A6E62" />
        <div className="font-display text-base font-semibold">{chit.clinic_name}</div>
      </div>
      <div className="text-center text-[10px] text-[#566663] mb-4">{headline}</div>

      {chit.type === "QUEUE" && (
        <>
          <div className="text-center">
            <div className="text-[10px] text-[#566663]">Queue Number</div>
            <div className="font-display text-7xl font-semibold text-[var(--ml-primary)] leading-none mt-1 tabular-nums">
              #{String(chit.queue_number).padStart(3, "0")}
            </div>
          </div>
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Doctor" value={chit.doctor_specialty ? `${chit.doctor_name} (${chit.doctor_specialty})` : chit.doctor_name} />
          <Row label="Reason" value={chit.reason} />
          {chit.triage_colour && (
            <Row label="Triage" value={`${chit.triage_colour}${chit.triage_category ? " — " + chit.triage_category : ""}`} />
          )}
          {chit.activation_code && (
            <div className="mt-3 pt-3 border-t border-dashed border-[#DAE2DF] text-center">
              <div className="text-[10px] text-[#566663]">App activation code</div>
              <div className="font-mono text-2xl tracking-[0.35em] font-semibold">{chit.activation_code}</div>
              <div className="text-[10px] text-[#566663]">Set your password at {chit.app_url || "the app"} · valid 72h</div>
            </div>
          )}
          {chit.app_qr && (
            <div className="mt-3 pt-3 border-t border-dashed border-[#DAE2DF] text-center">
              <img src={chit.app_qr} alt={`${PRODUCT.name} app QR`} className="w-24 h-24 mx-auto" />
              <div className="text-[10px] text-[#566663] mt-1">
                Scan to view your records &amp; pay bills
              </div>
              <div className="text-[10px] font-mono text-[#566663]">{chit.app_url}</div>
            </div>
          )}
          <Row label="Issued" value={fmtDateTime(chit.issued_at)} mono />
        </>
      )}

      {chit.type === "RECEIPT" && (
        <>
          <div className="text-center">
            <div className="text-[10px] text-[#566663]">Total Paid</div>
            <div className="font-display text-5xl font-semibold text-[var(--ml-primary)] mt-1">
              RM {Number(chit.amount).toFixed(2)}
            </div>
          </div>
          {chit.medication_lines && chit.medication_lines.length > 0 && (
            <div className="mt-3 pt-2 border-t border-dashed border-[#DAE2DF] space-y-1">
              <Row label="Consultation" value={`RM ${Number(chit.consultation_fee || 0).toFixed(2)}`} />
              {chit.medication_lines.map((l, i) => (
                <Row key={i} label={l.medicine} value={`RM ${Number(l.line_total).toFixed(2)}`} />
              ))}
            </div>
          )}
          <Row label="Method" value={chit.method.toUpperCase()} />
          <Row label="Txn Ref" value={chit.txn_ref} mono />
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Paid at" value={fmtDateTime(chit.paid_at)} mono />
          <div className="text-center mt-4 text-[10px] text-[#566663]">— Thank you —</div>
        </>
      )}

      {chit.type === "MEDICINE" && (
        <>
          <div className="text-center mb-3">
            <div className="text-[10px] text-[#566663]">Collect at Pharmacy</div>
            <div className="font-display text-4xl font-semibold text-[#10262E] mt-1 tabular-nums">
              #{String(chit.queue_number).padStart(3, "0")}
            </div>
          </div>
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Doctor" value={chit.doctor_name} />
          <Row label="Diagnosis" value={chit.diagnosis} />
          <div className="mt-3">
            <div className="text-[10px] text-[#566663] mb-1.5">Prescriptions</div>
            {(!chit.prescriptions || chit.prescriptions.length === 0) ? (
              <div className="text-xs text-[#566663]">No medicine prescribed.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {chit.prescriptions.map((p, i) => (
                  <li key={i}>
                    <span className="font-semibold">{p.medicine}</span> · {p.dosage} · {p.frequency} · {p.duration}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-center mt-4 text-[10px] text-[#566663]">Show this chit to the pharmacist</div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between text-xs mt-2 gap-3">
      <div className="text-[#566663] shrink-0">{label}</div>
      <div className={`text-right ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
