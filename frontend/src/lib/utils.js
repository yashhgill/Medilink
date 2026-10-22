import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Malaysian date formats: "22 Oct 2026, 9:05 am" and "22 Oct 2026".
export const fmtDateTime = (v) => v ? new Date(v).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
export const fmtDate = (v) => v ? new Date(v).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "";
