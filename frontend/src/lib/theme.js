import { useEffect } from "react";
import api from "@/lib/api";

/* The clinic's brand colour, set in Branding, drives the primary colour of the
   whole interface. Hover and tint shades are derived from it so any colour the
   clinic picks still reads as one system. Triage colours are never affected. */
const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function applyBrandColour(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const root = document.documentElement.style;
  root.setProperty("--ml-primary", toHex(rgb));
  root.setProperty("--ml-primary-soft", toHex(mix(rgb, [0, 0, 0], 0.2)));
  root.setProperty("--ml-wash", toHex(mix(rgb, [255, 255, 255], 0.88)));
}

export function useBrandTheme() {
  useEffect(() => {
    const load = () => api.get("/branding").then((r) => applyBrandColour(r.data?.brand_colour)).catch(() => {});
    load();
    window.addEventListener("medilink:branding", load);
    return () => window.removeEventListener("medilink:branding", load);
  }, []);
}
