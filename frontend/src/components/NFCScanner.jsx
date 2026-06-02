import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Cardholder, QrCode, WaveTriangle } from "@phosphor-icons/react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * NFC simulator dialog.
 * Two modes:
 *  - Manual IC entry
 *  - "QR scan" using webcam (simulated decode after a few seconds)
 */
export default function NFCScanner({ open, onOpenChange, onMatch }) {
  const [ic, setIc] = useState("");
  const [tapping, setTapping] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => () => stopCam(), []);
  useEffect(() => {
    if (!open) stopCam();
  }, [open]);

  const performScan = async (icValue) => {
    setTapping(true);
    try {
      const r = await api.post("/nfc/scan", { ic_number: icValue });
      toast.success(`NFC tap recognised: ${r.data.patient.name}`);
      onMatch?.(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No patient found for this IC");
    } finally {
      setTapping(false);
    }
  };

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setScanning(true);
      // simulated QR decode after 3.2s using the first demo patient IC
      setTimeout(() => {
        const decoded = "IC-880421-14-5567";
        toast.info(`QR decoded → ${decoded}`);
        stopCam();
        performScan(decoded);
      }, 3200);
    } catch (e) {
      toast.error("Camera permission denied – use Manual mode");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="nfc-dialog"
        className="sm:max-w-[480px] bg-[#F9F9F6] border-[#E2DDD7]"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Tap NFC Card
          </DialogTitle>
          <DialogDescription className="text-[#5C6661]">
            Identify a patient via simulated NFC IC chip or QR code.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" className="mt-2">
          <TabsList className="bg-[#F3EFE9] border border-[#E2DDD7] grid grid-cols-2 w-full">
            <TabsTrigger value="manual" data-testid="nfc-tab-manual">
              <Cardholder size={16} weight="duotone" className="mr-1.5" /> Manual
            </TabsTrigger>
            <TabsTrigger value="qr" data-testid="nfc-tab-qr">
              <QrCode size={16} weight="duotone" className="mr-1.5" /> QR Scan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4">
            <div className="inset-card p-8 flex flex-col items-center text-center mb-4">
              <motion.div
                whileTap={{ scale: 0.94 }}
                onClick={() => ic && performScan(ic)}
                data-testid="nfc-tap-button"
                className={`relative w-24 h-24 rounded-full flex items-center justify-center cursor-pointer bg-white border-2 ${
                  tapping ? "nfc-pulse border-[#B55B49]" : "border-[#1C3F39]"
                }`}
                style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)" }}
              >
                <WaveTriangle size={36} weight="duotone" color="#1C3F39" />
                <AnimatePresence>
                  {tapping && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0.6 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border-2 border-[#B55B49]"
                    />
                  )}
                </AnimatePresence>
              </motion.div>
              <div className="overline mt-4">Tap to read IC chip</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ic" className="text-[#1C3F39]">IC Number</Label>
              <Input
                id="ic"
                data-testid="nfc-ic-input"
                placeholder="IC-880421-14-5567"
                value={ic}
                onChange={(e) => setIc(e.target.value)}
                className="font-mono border-[#E2DDD7] focus-visible:ring-[#1C3F39]"
              />
              <Button
                data-testid="nfc-submit-btn"
                disabled={!ic || tapping}
                onClick={() => performScan(ic)}
                className="w-full bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
              >
                {tapping ? "Reading chip…" : "Tap Card"}
              </Button>
              <div className="text-[11px] text-[#5C6661] mt-2 font-mono">
                Demo ICs: IC-880421-14-5567 · IC-950311-08-2210 · IC-720915-10-7733
              </div>
            </div>
          </TabsContent>

          <TabsContent value="qr" className="mt-4">
            <div className="relative rounded-2xl overflow-hidden border border-[#E2DDD7] bg-black aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">
                  Camera idle
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#D4A373] shadow-[0_0_12px_#D4A373] animate-pulse" />
                  <div className="absolute inset-6 border-2 border-[#D4A373] rounded-xl" />
                </div>
              )}
            </div>
            <Button
              data-testid="qr-start-btn"
              disabled={scanning}
              onClick={startCam}
              className="w-full mt-3 bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]"
            >
              {scanning ? "Scanning QR…" : "Start QR Scan"}
            </Button>
            <div className="text-[11px] text-[#5C6661] mt-2 font-mono text-center">
              Webcam required. Demo decodes to a sample IC.
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
