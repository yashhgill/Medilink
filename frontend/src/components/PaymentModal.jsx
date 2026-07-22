import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  QrCode, Bank, CurrencyCircleDollar, HandCoins,
  CheckCircle, Copy, ArrowLeft,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const METHODS = [
  { id: "duitnow", label: "DuitNow QR",       icon: QrCode,              desc: "Scan with any Malaysian banking app",   color: "#E04133" },
  { id: "tng",     label: "Touch 'n Go",       icon: CurrencyCircleDollar, desc: "Pay via TnG eWallet deeplink",         color: "#007AFF" },
  { id: "bank",    label: "Bank Transfer (FPX)",icon: Bank,               desc: "Transfer to clinic bank account",       color: "#0B7C8C" },
  { id: "cash",    label: "Cash at Counter",   icon: HandCoins,           desc: "Pay at reception before collecting meds", color: "#086788" },
];

export default function PaymentModal({ open, onOpenChange, amount, appointmentId, icNumber, onSuccess }) {
  const [selected, setSelected] = useState(null);
  const [payData, setPayData]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const reset = () => { setSelected(null); setPayData(null); setDone(false); };

  const handlePay = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/kiosk/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ic_number: icNumber,
          appointment_id: appointmentId,
          method: selected,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPayData(data);
      if (selected === "cash") {
        setDone(true);
        onSuccess && onSuccess(data);
      }
    } catch (e) {
      toast.error("Payment initiation failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const confirmReceived = () => {
    setDone(true);
    onSuccess && onSuccess(payData);
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md rounded-3xl bg-[#F4F9F9] border-0 shadow-2xl p-0 overflow-hidden">
        <div className="bg-[#0B7C8C] px-6 pt-6 pb-8">
          <DialogHeader>
            <DialogTitle className="text-[#F4F9F9] text-xl font-display">
              Payment
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-white/60 text-sm">Total Due</span>
            <span className="text-[#086788] text-4xl font-bold ml-2">RM {amount?.toFixed(2)}</span>
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-3">
                <CheckCircle size={56} className="mx-auto text-[#2D6A4F]" weight="fill" />
                <p className="text-[#0B7C8C] font-semibold text-lg">Payment Recorded</p>
                <p className="text-[#6B7B6E] text-sm">Please collect your medicines at the pharmacy counter.</p>
                <Button onClick={() => { reset(); onOpenChange(false); }}
                  className="mt-4 bg-[#0B7C8C] text-white rounded-xl w-full">Close</Button>
              </motion.div>
            ) : payData && selected !== "cash" ? (
              <motion.div key="instructions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-4">
                <button onClick={reset} className="flex items-center gap-1 text-sm text-[#6B7B6E] hover:text-[#0B7C8C]">
                  <ArrowLeft size={14} /> Back
                </button>

                {selected === "duitnow" && payData.payment?.qr && (
                  <div className="text-center">
                    <p className="text-sm text-[#6B7B6E] mb-3">Scan with your banking app</p>
                    <div className="inline-block p-3 bg-white rounded-2xl shadow-sm border border-[#DCE8E9]">
                      <img src={`data:image/png;base64,${payData.payment.qr}`} alt="DuitNow QR" className="w-48 h-48" />
                    </div>
                    <p className="text-xs text-[#6B7B6E] mt-2">Ref: <span className="font-mono font-semibold">{payData.payment.ref}</span></p>
                  </div>
                )}

                {selected === "tng" && (
                  <div className="space-y-3">
                    <p className="text-sm text-[#6B7B6E]">Open TnG eWallet and complete payment:</p>
                    <div className="bg-white rounded-xl p-4 border border-[#DCE8E9] space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[#6B7B6E]">Amount</span>
                        <span className="font-bold text-[#0B7C8C]">RM {amount?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[#6B7B6E]">Reference</span>
                        <button onClick={() => copyText(payData.payment.ref)}
                          className="flex items-center gap-1 font-mono text-sm font-semibold text-[#0B7C8C] hover:text-[#086788]">
                          {payData.payment.ref} <Copy size={12} />
                        </button>
                      </div>
                    </div>
                    <a href={payData.payment.deeplink}
                      className="block w-full text-center py-3 bg-[#007AFF] text-white rounded-xl font-medium">
                      Open TnG eWallet
                    </a>
                  </div>
                )}

                {selected === "bank" && (
                  <div className="space-y-3">
                    <p className="text-sm text-[#6B7B6E]">Transfer to the following account:</p>
                    <div className="bg-white rounded-xl p-4 border border-[#DCE8E9] space-y-2 text-sm">
                      {[
                        ["Bank", payData.payment.bank],
                        ["Account Name", payData.payment.account_name],
                        ["Account No.", payData.payment.account_no],
                        ["Amount", `RM ${amount?.toFixed(2)}`],
                        ["Reference", payData.payment.ref],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center">
                          <span className="text-[#6B7B6E]">{k}</span>
                          <button onClick={() => copyText(v)}
                            className="flex items-center gap-1 font-semibold text-[#0B7C8C] hover:text-[#086788]">
                            {v} <Copy size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={confirmReceived}
                  className="w-full bg-[#2D6A4F] hover:bg-[#0B7C8C] text-white rounded-xl h-11">
                  I've Completed the Payment
                </Button>
              </motion.div>
            ) : (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="space-y-3">
                <p className="text-sm text-[#6B7B6E] font-medium">Select payment method</p>
                {METHODS.map(m => (
                  <button key={m.id} onClick={() => setSelected(m.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      selected === m.id
                        ? "border-[#0B7C8C] bg-[#0B7C8C]/5"
                        : "border-[#DCE8E9] bg-white hover:border-[#0B7C8C]/40"
                    }`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: m.color + "20" }}>
                      <m.icon size={20} style={{ color: m.color }} weight="duotone" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[#0B7C8C] text-sm">{m.label}</p>
                      <p className="text-[#6B7B6E] text-xs">{m.desc}</p>
                    </div>
                    {selected === m.id && (
                      <CheckCircle size={18} className="text-[#0B7C8C]" weight="fill" />
                    )}
                  </button>
                ))}
                <Button onClick={handlePay} disabled={!selected || loading}
                  className="w-full bg-[#0B7C8C] hover:bg-[#154f44] text-white rounded-xl h-11 mt-2 font-medium">
                  {loading ? "Processing…" : `Pay RM ${amount?.toFixed(2)}`}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
