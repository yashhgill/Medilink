import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, Cardholder, CheckCircle, XCircle, ArrowClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import axios from "axios";
import { API } from "@/lib/api";

const kioskAxios = axios.create({
  baseURL: API,
  headers: process.env.REACT_APP_KIOSK_TOKEN
    ? { "X-Kiosk-Token": process.env.REACT_APP_KIOSK_TOKEN }
    : {},
});

/**
 * ICScanner — find a patient by typing their IC or scanning with the camera.
 * Two modes:
 *  1. Camera capture: opens webcam → patient holds IC to camera → snapshot → staff types number from image
 *  2. Manual entry: type IC directly (YYMMDD-SS-NNNN)
 */
export default function ICScanner({ open, onOpenChange, onMatch }) {
  const [mode, setMode]       = useState("manual"); // "camera" | "manual"
  const [ic, setIc]           = useState("");
  const [parsed, setParsed]   = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [snapshot, setSnapshot]  = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  const stopCam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
    setSnapshot(null);
  }, []);

  useEffect(() => {
    if (!open) { stopCam(); setIc(""); setParsed(null); setMode("manual"); }
  }, [open, stopCam]);

  // Live-parse IC as user types
  useEffect(() => {
    if (!ic) { setParsed(null); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await kioskAxios.get(`/ic/parse/${encodeURIComponent(ic)}`);
        setParsed(r.data);
      } catch { setParsed(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [ic]);

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
      setSnapshot(null);
    } catch {
      toast.error("Camera access denied. Please use manual entry.");
      setMode("manual");
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.85));
    stopCam();
  };

  const handleLookup = async () => {
    const trimmed = ic.trim();
    if (!trimmed) { toast.error("Please enter your IC number"); return; }
    if (parsed && !parsed.valid) { toast.error("IC format invalid. Expected: YYMMDD-SS-NNNN"); return; }
    setLoading(true);
    try {
      const r = await kioskAxios.get(`/kiosk/lookup/${encodeURIComponent(trimmed)}`);
      onMatch(r.data);
      onOpenChange(false);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error("IC not registered. Please register first.");
      } else {
        toast.error("Lookup failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl bg-[#F4F9F9] border-0 shadow-2xl p-0 overflow-hidden">
        <div className="bg-[#0B7C8C] px-6 pt-6 pb-8">
          <DialogHeader>
            <DialogTitle className="text-[#F4F9F9] text-xl font-display flex items-center gap-2">
              <Cardholder size={22} weight="duotone" /> IC Identification
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm mt-1">
              Enter your Malaysian MyKad IC number to continue
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setMode("manual"); stopCam(); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                mode === "manual"
                  ? "bg-white text-[#0B7C8C]"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => { setMode("camera"); startCam(); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === "camera"
                  ? "bg-white text-[#0B7C8C]"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              <Camera size={14} /> Camera
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Camera view */}
          <AnimatePresence>
            {mode === "camera" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl overflow-hidden bg-black relative"
              >
                {snapshot ? (
                  <div className="relative">
                    <img src={snapshot} alt="IC snapshot" className="w-full rounded-2xl" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
                      <p className="text-white text-sm text-center px-4">
                        Type the IC number shown below
                      </p>
                    </div>
                    <button
                      onClick={() => { setSnapshot(null); startCam(); }}
                      className="absolute top-2 right-2 bg-white/20 hover:bg-white/40 text-white rounded-full p-1.5"
                    >
                      <ArrowClockwise size={14} />
                    </button>
                  </div>
                ) : streaming ? (
                  <div>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full"
                    />
                    {/* IC overlay guide */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="border-2 border-[#086788] rounded-xl w-3/4 h-2/5 opacity-70" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60">
                      <p className="text-white text-xs text-center mb-2">
                        Align IC within the frame
                      </p>
                      <Button
                        onClick={takeSnapshot}
                        className="w-full bg-[#086788] hover:bg-[#c4935f] text-white rounded-xl"
                        size="sm"
                      >
                        Capture
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-white/50">
                    <Camera size={32} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* IC input */}
          <div className="space-y-2">
            <Label className="text-[#0B7C8C] font-medium">
              IC Number <span className="text-[#0A3D62] font-normal text-xs">(YYMMDD-SS-NNNN)</span>
            </Label>
            <Input
              value={ic}
              onChange={e => setIc(e.target.value)}
              placeholder="e.g. 040412-08-1035"
              className="rounded-xl border-[#DCE8E9] focus:border-[#0B7C8C] text-[#0B7C8C] text-base tracking-wider"
              maxLength={14}
              onKeyDown={e => e.key === "Enter" && handleLookup()}
              autoFocus={mode === "manual"}
            />
          </div>

          {/* Live IC parse result */}
          <AnimatePresence>
            {parsed && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-xl p-3 flex items-start gap-3 ${
                  parsed.valid ? "bg-[#EAF3DE] border border-[#B8D98B]" : "bg-[#FCEBEB] border border-[#F1A8A8]"
                }`}
              >
                {parsed.valid
                  ? <CheckCircle size={18} className="text-[#3B6D11] mt-0.5 flex-shrink-0" weight="fill" />
                  : <XCircle size={18} className="text-[#A32D2D] mt-0.5 flex-shrink-0" weight="fill" />
                }
                {parsed.valid ? (
                  <div className="text-sm">
                    <p className="font-medium text-[#3B6D11]">Valid IC</p>
                    <p className="text-[#3B6D11]/80">
                      DOB: <span className="font-medium">{parsed.dob}</span> &nbsp;·&nbsp;
                      Age: <span className="font-medium">{parsed.age}</span> &nbsp;·&nbsp;
                      {parsed.gender_hint} &nbsp;·&nbsp; {parsed.state}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[#A32D2D]">
                    {parsed.error || "Invalid IC format. Use YYMMDD-SS-NNNN (e.g. 040412-08-1035)"}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={handleLookup}
            disabled={loading || !ic}
            className="w-full bg-[#0B7C8C] hover:bg-[#154f44] text-[#F4F9F9] rounded-xl h-11 font-medium"
          >
            {loading ? "Looking up…" : "Find Patient"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
