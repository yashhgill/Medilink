import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bluetooth, BluetoothConnected, BluetoothSlash } from "@phosphor-icons/react";

/**
 * BluetoothVitals — reads live vitals from BLE medical devices via Web Bluetooth.
 * Supports the standard GATT services:
 *   - Heart Rate (0x180D): HR in bpm
 *   - Health Thermometer (0x1809): temperature in °C
 * Streams parsed readings up via onVital({ hr, temp, spo2 }).
 * Falls back gracefully when Web Bluetooth is unavailable (manual entry stays).
 */
export default function BluetoothVitals({ onVital }) {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | error
  const [deviceName, setDeviceName] = useState(null);
  const [lastReading, setLastReading] = useState(null);
  const deviceRef = useRef(null);

  const supported = typeof navigator !== "undefined" && !!navigator.bluetooth;

  const parseHeartRate = (dv) => {
    const flags = dv.getUint8(0);
    return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
  };

  const parseTemperature = (dv) => {
    // IEEE-11073 32-bit float: 3-byte mantissa + 1-byte exponent
    const mantissa = dv.getUint8(1) | (dv.getUint8(2) << 8) | (dv.getUint8(3) << 16);
    const exponent = dv.getInt8(4);
    return +(mantissa * Math.pow(10, exponent)).toFixed(1);
  };

  const connect = async () => {
    setStatus("connecting");
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [{ services: ["heart_rate"] }, { services: ["health_thermometer"] }],
        optionalServices: ["heart_rate", "health_thermometer", "battery_service"],
      });
      deviceRef.current = device;
      setDeviceName(device.name || "BLE device");
      device.addEventListener("gattserverdisconnected", () => setStatus("idle"));
      const server = await device.gatt.connect();

      // Heart rate notifications
      try {
        const svc = await server.getPrimaryService("heart_rate");
        const ch = await svc.getCharacteristic("heart_rate_measurement");
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => {
          const hr = parseHeartRate(e.target.value);
          setLastReading(`HR ${hr} bpm`);
          onVital?.({ hr });
        });
      } catch (_) { /* device has no HR service */ }

      // Thermometer indications
      try {
        const svc = await server.getPrimaryService("health_thermometer");
        const ch = await svc.getCharacteristic("temperature_measurement");
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => {
          const temp = parseTemperature(e.target.value);
          setLastReading(`Temp ${temp} °C`);
          onVital?.({ temp });
        });
      } catch (_) { /* device has no thermometer service */ }

      setStatus("connected");
    } catch (err) {
      // User cancelled the chooser or connection failed
      setStatus(err?.name === "NotFoundError" ? "idle" : "error");
    }
  };

  const disconnect = () => {
    try { deviceRef.current?.gatt?.disconnect(); } catch (_) {}
    setStatus("idle");
    setDeviceName(null);
    setLastReading(null);
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#5A6B70] rounded-xl border border-dashed border-[#DCE8E9] p-3">
        <BluetoothSlash size={16} />
        Bluetooth devices need Chrome/Edge — enter vitals manually below.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-[#DCE8E9] bg-white p-3">
      {status !== "connected" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={connect}
          disabled={status === "connecting"}
          data-testid="ble-connect"
          className="rounded-full border-[#0B7C8C] text-[#0B7C8C]"
        >
          <Bluetooth size={14} className="mr-1.5" />
          {status === "connecting" ? "Connecting…" : "Connect vitals device"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={disconnect}
          data-testid="ble-disconnect"
          className="rounded-full border-[#2D6A4F] text-[#2D6A4F]"
        >
          <BluetoothConnected size={14} className="mr-1.5" /> {deviceName} · disconnect
        </Button>
      )}
      {lastReading && (
        <span className="text-xs font-mono text-[#2D6A4F]">{lastReading}</span>
      )}
      {status === "error" && (
        <span className="text-xs text-[#0A3D62]">Connection failed — try again</span>
      )}
      <span className="text-[11px] text-[#5A6B70]">
        Readings fill the fields below automatically
      </span>
    </div>
  );
}
