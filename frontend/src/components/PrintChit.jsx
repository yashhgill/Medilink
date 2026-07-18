import React, { useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Heartbeat } from "@phosphor-icons/react";

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
        className="bg-[#F9F9F6] border-[#E2DDD7] max-w-md p-0 overflow-hidden no-print-overlay"
        aria-describedby="chit-description"
      >
        <DialogTitle className="sr-only">Printable chit</DialogTitle>
        <DialogDescription id="chit-description" className="sr-only">
          Your ticket details. Click Print chit to print.
        </DialogDescription>
        <div ref={ref} className="chit-print-area bg-white p-8 m-4 rounded-2xl border border-dashed border-[#1C3F39]/40" data-testid="print-chit">
          <ChitContent chit={chit} />
          {secondary && (
            <>
              <div className="my-6 border-t border-dashed border-[#1C3F39]/30" />
              <ChitContent chit={secondary} />
            </>
          )}
        </div>
        <div className="flex justify-between gap-2 p-4 bg-[#F3EFE9] border-t border-[#E2DDD7]">
          <Button
            variant="outline"
            data-testid="chit-close"
            onClick={() => { onOpenChange(false); onClose?.(); }}
            className="border-[#E2DDD7] text-[#1C3F39] hover:bg-white rounded-full"
          >
            <X size={14} className="mr-1.5" /> Close
          </Button>
          <Button
            data-testid="chit-print-btn"
            onClick={doPrint}
            className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full"
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
    <div className="font-mono text-[#0A0F0D]">
      <div className="flex items-center justify-center gap-2 mb-1">
        <Heartbeat size={18} weight="duotone" color="#1C3F39" />
        <div className="font-display text-base font-semibold">{chit.clinic_name}</div>
      </div>
      <div className="text-center text-[10px] uppercase tracking-[0.25em] text-[#5C6661] mb-4">{headline}</div>

      {chit.type === "QUEUE" && (
        <>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">Queue Number</div>
            <div className="font-display text-7xl font-semibold text-[#1C3F39] leading-none mt-1 tabular-nums">
              #{String(chit.queue_number).padStart(3, "0")}
            </div>
          </div>
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Doctor" value={`${chit.doctor_name} (${chit.doctor_specialty})`} />
          <Row label="Reason" value={chit.reason} />
          {chit.triage_colour && (
            <Row label="Triage" value={`${chit.triage_colour}${chit.triage_category ? " — " + chit.triage_category : ""}`} />
          )}
          {chit.app_qr && (
            <div className="mt-3 pt-3 border-t border-dashed border-[#E2DDD7] text-center">
              <img src={chit.app_qr} alt="MediLink app QR" className="w-24 h-24 mx-auto" />
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661] mt-1">
                Scan to view your records &amp; pay bills
              </div>
              <div className="text-[10px] font-mono text-[#5C6661]">{chit.app_url}</div>
            </div>
          )}
          <Row label="Issued" value={new Date(chit.issued_at).toLocaleString()} mono />
        </>
      )}

      {chit.type === "RECEIPT" && (
        <>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">Total Paid</div>
            <div className="font-display text-5xl font-semibold text-[#2D6A4F] mt-1">
              RM {Number(chit.amount).toFixed(2)}
            </div>
          </div>
          <Row label="Method" value={chit.method.toUpperCase()} />
          <Row label="Txn Ref" value={chit.txn_ref} mono />
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Paid at" value={new Date(chit.paid_at).toLocaleString()} mono />
          <div className="text-center mt-4 text-[10px] text-[#5C6661]">— Thank you —</div>
        </>
      )}

      {chit.type === "MEDICINE" && (
        <>
          <div className="text-center mb-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">Collect at Pharmacy</div>
            <div className="font-display text-4xl font-semibold text-[#B55B49] mt-1 tabular-nums">
              #{String(chit.queue_number).padStart(3, "0")}
            </div>
          </div>
          <Row label="Patient" value={chit.patient_name} />
          <Row label="IC" value={chit.patient_ic} mono />
          <Row label="Doctor" value={chit.doctor_name} />
          <Row label="Diagnosis" value={chit.diagnosis} />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661] mb-1.5">Prescriptions</div>
            {(!chit.prescriptions || chit.prescriptions.length === 0) ? (
              <div className="text-xs text-[#5C6661]">No medicine prescribed.</div>
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
          <div className="text-center mt-4 text-[10px] text-[#5C6661]">Show this chit to the pharmacist</div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between text-xs mt-2 gap-3">
      <div className="text-[#5C6661] shrink-0">{label}</div>
      <div className={`text-right ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
