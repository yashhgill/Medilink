import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { House, FileText, CalendarCheck, User } from "@phosphor-icons/react";

/**
 * Fixed bottom navigation for the patient app — replaces the hidden hamburger
 * for the 4 highest-priority destinations. Large tap targets, always visible,
 * safe-area aware. Mobile-first; hidden on large screens where the drawer is fine.
 */
const items = [
  { key: "overview", label: "Home", to: "/patient", icon: House },
  { key: "records", label: "Records", to: "/patient/records", icon: FileText },
  { key: "billing", label: "Billing", to: "/patient/billing", icon: CalendarCheck },
  { key: "profile", label: "Profile", action: "profile", icon: User },
];

export default function PatientBottomNav({ onProfile }) {
  const nav = useNavigate();
  const loc = useLocation();
  const current = loc.pathname.split("/")[2] || "overview";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-[#DCE8E9]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="navigation"
      aria-label="Primary"
    >
      <div className="max-w-lg mx-auto grid grid-cols-4">
        {items.map((it) => {
          const active = current === it.key;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => (it.action === "profile" ? onProfile && onProfile() : nav(it.to))}
              className="flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] focus:outline-none"
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={24}
                weight={active ? "fill" : "regular"}
                color={active ? "#0B7C8C" : "#5A6B70"}
              />
              <span
                className={`text-[11px] font-medium ${active ? "text-[#0B7C8C]" : "text-[#5A6B70]"}`}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
