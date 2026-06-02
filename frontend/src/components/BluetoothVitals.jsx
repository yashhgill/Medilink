import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Bluetooth, Heartbeat, Pulse, Thermometer, Plugs, PlugsConnected, CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Web Bluetooth client for BLE health devices.
 * Supports:
 *  - Heart Rate Monitor (service 0x180D, char 0x2A37)
 *  - Health Thermometer (service 0x1809, char 0x2A1C)
 *  - Pulse Oximeter (service 0x1822, char 0x2A5F) — best-effort
 * Falls back to a "Simulated device" mode for demo purposes.
 *
 * Calls onVital({hr, temp, spo2}) whenever values arrive.
 */
export default function BluetoothVitals({ onVital }) {
  const [supported, setSupported] = useState(true);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [hr, setHr] = useState(null);
  const [temp, setTemp] = useState(null);
  const [spo2, setSpo2] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const simRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.bluetooth) setSupported(false);
    return () => stopAll();
  }, []);

  const stopAll = () => {
    if (simRef.current) {
      clearInterval(simRef.current);
      simRef.current = null;
    }
    if (cleanupRef.current) {
      try { cleanupRef.current(); } catch (_) {}
      cleanupRef.current = null;
    }
    setConnected(false);
    setSimulating(false);
  };

  const push = (patch) => {
    if (patch.hr !== undefined) setHr(patch.hr);
    if (patch.temp !== undefined) setTemp(patch.temp);
    if (patch.spo2 !== undefined) setSpo2(patch.spo2);
    onVital?.(patch);
  };

  const connectReal = async () => {
    if (!navigator.bluetooth) {
      toast.error("Web Bluetooth not available — try Chrome on desktop or use Simulated mode");
      return;
    }
    setBusy(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        optionalServices: ["heart_rate", "health_thermometer", 0x1822, "battery_service"],
        acceptAllDevices: true,
      });
      setDeviceName(device.name || "BLE device");
      const server = await device.gatt.connect();
      let attached = 0;

      // Heart rate
      try {
        const svc = await server.getPrimaryService("heart_rate");
        const ch = await svc.getCharacteristic("heart_rate_measurement");
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => {
          const v = e.target.value;
          const flags = v.getUint8(0);
          const rate16 = flags & 0x1;
          const bpm = rate16 ? v.getUint16(1, true) : v.getUint8(1);
          push({ hr: bpm });
        });
        attached++;
      } catch (_) {}

      // Health thermometer
      try {
        const svc = await server.getPrimaryService("health_thermometer");
        const ch = await svc.getCharacteristic("temperature_measurement");
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => {
          const v = e.target.value;
          // skip flags byte, read IEEE-11073 32-bit float
          const mantissa = v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16);
          const exponent = v.getInt8(4);
          const t = mantissa * Math.pow(10, exponent);
          push({ temp: Math.round(t * 10) / 10 });
        });
        attached++;
      } catch (_) {}

      if (attached === 0) {
        toast.message(`Connected to ${device.name || "device"}, but no compatible services found.`);
      } else {
        toast.success(`Connected · ${attached} sensor(s) streaming`);
      }
      setConnected(true);
      device.addEventListener("gattserverdisconnected", () => {
        setConnected(false);
        toast.message("Device disconnected");
      });
      cleanupRef.current = () => {
        try { device.gatt.disconnect(); } catch (_) {}
      };
    } catch (e) {
      toast.error("Could not connect — " + (e?.message || "cancelled"));
    } finally {
      setBusy(false);
    }
  };

  const simulate = () => {
    stopAll();
    setSimulating(true);
    setConnected(true);
    setDeviceName("Simulated IoT Device");
    // start near healthy baseline and drift
    let baseHr = 74 + Math.random() * 6;
    let baseTemp = 36.6;
    let baseSpo = 98;
    const tick = () => {
      baseHr += (Math.random() - 0.5) * 3;
      baseTemp += (Math.random() - 0.5) * 0.1;
      baseSpo += (Math.random() - 0.5) * 0.7;
      baseHr = Math.max(58, Math.min(110, baseHr));
      baseTemp = Math.max(35.8, Math.min(38.4, baseTemp));
      baseSpo = Math.max(92, Math.min(100, baseSpo));
      push({
        hr: Math.round(baseHr),
        temp: Math.round(baseTemp * 10) / 10,
        spo2: Math.round(baseSpo),
      });
    };
    tick();
    simRef.current = setInterval(tick, 1100);
    toast.success("Simulated IoT device streaming");
  };

  return (
    <div className="rounded-2xl border border-[#E2DDD7] bg-[#F9F9F6] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="overline">IoT · Live vitals</div>
          <div className="text-xs text-[#5C6661] mt-0.5">
            {connected ? deviceName : "Connect a BLE device or simulate"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#2D6A4F] breathe" : "bg-[#5C6661]/40"}`} />
          {connected ? "live" : "idle"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <VitalCell label="HR" value={hr} unit="bpm" icon={Heartbeat} colour="#B55B49" />
        <VitalCell label="Temp" value={temp} unit="°C" icon={Thermometer} colour="#D4A373" />
        <VitalCell label="SpO₂" value={spo2} unit="%" icon={Pulse} colour="#1C3F39" />
      </div>

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <>
            <Button
              data-testid="ble-connect-btn"
              onClick={connectReal}
              disabled={busy || !supported}
              size="sm"
              className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6] rounded-full"
            >
              {busy ? (
                <><CircleNotch size={14} className="mr-1.5 animate-spin" /> Pairing…</>
              ) : (
                <><Bluetooth size={14} weight="duotone" className="mr-1.5" /> Connect device</>
              )}
            </Button>
            <Button
              data-testid="ble-simulate-btn"
              onClick={simulate}
              size="sm"
              variant="outline"
              className="border-[#E2DDD7] text-[#1C3F39] hover:bg-[#F3EFE9] rounded-full"
            >
              <Plugs size={14} className="mr-1.5" /> Simulate device
            </Button>
          </>
        ) : (
          <Button
            data-testid="ble-disconnect-btn"
            onClick={stopAll}
            size="sm"
            variant="outline"
            className="border-[#E2DDD7] text-[#9B2226] hover:bg-[#F3EFE9] rounded-full"
          >
            <PlugsConnected size={14} className="mr-1.5" /> Disconnect
          </Button>
        )}
      </div>

      {!supported && (
        <div className="mt-2 text-[11px] text-[#9B2226] font-mono">
          Web Bluetooth isn&apos;t available in this browser — use Simulated mode for the demo.
        </div>
      )}
    </div>
  );
}

function VitalCell({ label, value, unit, icon: Icon, colour }) {
  return (
    <div className="rounded-xl bg-white border border-[#E2DDD7] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
        <Icon size={12} weight="duotone" color={colour} />
        {label}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={String(value)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="font-mono font-display text-2xl text-[#0A0F0D] mt-1 leading-none tabular-nums"
        >
          {value ?? "—"}
          {value != null && <span className="text-[10px] text-[#5C6661] ml-1">{unit}</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
