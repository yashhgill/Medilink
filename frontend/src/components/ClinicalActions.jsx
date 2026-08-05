import React, { useEffect, useState } from "react";
import api, { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { TestTube, PaperPlaneTilt, Flask, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

async function downloadPdf(url, filename) {
  try {
    const token = localStorage.getItem("ml_token");
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error();
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { toast.error("Download failed"); }
}

/**
 * ClinicalActions — lab orders/results + referral letter for a patient.
 * Renders as a compact card the doctor uses during/after a consult.
 */
export default function ClinicalActions({ patientId, recordId }) {
  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [testCode, setTestCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [referOpen, setReferOpen] = useState(false);
  const [refer, setRefer] = useState({ refer_to: "", reason: "", clinical_summary: "" });

  const loadOrders = async () => {
    if (!patientId) return;
    try {
      const r = await api.get(`/lab/orders?patient_id=${patientId}`);
      setOrders(r.data);
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    api.get("/lab/catalog").then((r) => { setCatalog(r.data); if (r.data[0]) setTestCode(r.data[0].code); }).catch(() => {});
  }, []);
  useEffect(() => { loadOrders(); /* eslint-disable-next-line */ }, [patientId]);

  const orderTest = async () => {
    if (!testCode) return;
    setBusy(true);
    try {
      await api.post("/lab/orders", { patient_id: patientId, record_id: recordId, test_code: testCode });
      toast.success("Lab test ordered");
      loadOrders();
    } catch (e) { toast.error(errMsg(e, "Could not order test")); }
    finally { setBusy(false); }
  };

  const enterResult = async (o) => {
    const val = window.prompt(`Result for ${o.test_name} (${o.result_unit || ""}, ref ${o.ref_range || "-"}):`);
    if (val === null || val === "") return;
    try {
      const r = await api.patch(`/lab/orders/${o.id}/result`, { result_value: val });
      toast[r.data.abnormal ? "warning" : "success"](
        r.data.abnormal ? `${o.test_name}: ${val} — ABNORMAL` : `${o.test_name}: ${val} — normal`);
      loadOrders();
    } catch (e) { toast.error(errMsg(e, "Could not save result")); }
  };

  const sendReferral = async () => {
    if (!refer.refer_to || !refer.reason) return toast.error("Refer-to and reason are required");
    try {
      const token = localStorage.getItem("ml_token");
      const resp = await fetch("/api/referrals/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patient_id: patientId, record_id: recordId, ...refer }),
      });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "referral-letter.pdf"; a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Referral letter generated");
      setReferOpen(false);
      setRefer({ refer_to: "", reason: "", clinical_summary: "" });
    } catch (e) { toast.error("Referral failed"); }
  };

  if (!patientId) return null;

  return (
    <div className="rounded-xl border border-[#DCE8E9] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flask size={16} weight="duotone" color="#0B7C8C" />
        <div className="overline">Investigations &amp; referral</div>
      </div>

      {/* Order a lab test */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-[10px] overline">Order lab test</Label>
          <Select value={testCode} onValueChange={setTestCode}>
            <SelectTrigger className="border-[#DCE8E9] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {catalog.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={orderTest} disabled={busy} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-white h-9">
          <TestTube size={14} className="mr-1" /> Order
        </Button>
      </div>

      {/* Existing orders */}
      {orders.length > 0 && (
        <div className="space-y-1.5">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-xs border border-[#DCE8E9] rounded-lg px-2.5 py-1.5">
              <div>
                <span className="font-medium text-[#0A3D62]">{o.test_name}</span>
                {o.status === "resulted" ? (
                  <span className={o.abnormal ? "ml-2 text-[#B55B49] font-mono" : "ml-2 text-[#2D6A4F] font-mono"}>
                    {o.result_value} {o.result_unit} {o.abnormal ? "· ABNORMAL" : "· normal"}
                  </span>
                ) : (
                  <span className="ml-2 text-[#5A6B70]">ordered</span>
                )}
              </div>
              {o.status !== "resulted" && (
                <button onClick={() => enterResult(o)} className="text-[#0B7C8C] hover:underline">enter result</button>
              )}
            </div>
          ))}
          <button
            onClick={() => downloadPdf(`/api/lab/patient/${patientId}/report/pdf`, "lab-report.pdf")}
            className="text-[11px] text-[#0B7C8C] hover:underline">Download lab report (PDF)</button>
        </div>
      )}

      {/* Referral */}
      <Button size="sm" variant="outline" onClick={() => setReferOpen(true)} className="border-[#0A3D62] text-[#0A3D62] w-full">
        <PaperPlaneTilt size={14} className="mr-1.5" /> Refer patient
      </Button>

      <Dialog open={referOpen} onOpenChange={setReferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Referral letter</DialogTitle>
            <DialogDescription>Generates a signed PDF referral pulling this patient's latest record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Refer to</Label>
              <Input value={refer.refer_to} onChange={(e) => setRefer({ ...refer, refer_to: e.target.value })}
                     placeholder="Cardiology, Hospital Melaka" className="border-[#DCE8E9]" /></div>
            <div><Label>Reason</Label>
              <Input value={refer.reason} onChange={(e) => setRefer({ ...refer, reason: e.target.value })}
                     placeholder="Chest pain, abnormal ECG" className="border-[#DCE8E9]" /></div>
            <div><Label>Clinical summary (optional)</Label>
              <Textarea value={refer.clinical_summary} onChange={(e) => setRefer({ ...refer, clinical_summary: e.target.value })}
                        className="border-[#DCE8E9]" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button onClick={sendReferral} className="bg-[#0A3D62] hover:bg-[#082E4A] text-white">Generate PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
