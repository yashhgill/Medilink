import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import SyncIndicator from "@/components/SyncIndicator";
import AIChat from "@/components/AIChat";
import {
  Heartbeat,
  SignOut,
  User,
  Stethoscope,
  ChartLine,
  Calendar,
  Sparkle,
} from "@phosphor-icons/react";

const roleLabel = {
  patient: "Patient",
  doctor: "Doctor",
  admin: "Reception · Admin",
};

export default function AppShell({ children, title, subtitle, navItems = [] }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md bg-[#F9F9F6]/85 border-b"
        style={{ borderColor: "var(--ml-border)" }}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
            <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
              <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">MediLink</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
                Cloud · AI · IoT
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {navItems.map((it) => {
              const active = loc.pathname === it.to;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#1C3F39] text-[#F9F9F6]"
                      : "text-[#5C6661] hover:text-[#0A0F0D] hover:bg-[#F3EFE9]"
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <SyncIndicator compact />
            {user?.role === "patient" && (
              <Button
                data-testid="open-ai-chat"
                onClick={() => setAiOpen(true)}
                size="sm"
                className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6] rounded-full"
              >
                <Sparkle size={14} weight="fill" className="mr-1" /> AI Triage
              </Button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <div className="text-sm font-medium leading-tight" data-testid="header-user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">
                {roleLabel[user?.role] || user?.role}
              </div>
            </div>
            <Button
              data-testid="logout-btn"
              variant="ghost"
              size="icon"
              onClick={() => {
                logout();
                nav("/login");
              }}
              className="rounded-full hover:bg-[#F3EFE9]"
            >
              <SignOut size={18} />
            </Button>
          </div>
        </div>
      </header>

      {/* Page header */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 pt-10 pb-6">
        <div className="overline mb-3">{subtitle}</div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tight font-semibold text-[#0A0F0D]">
          {title}
        </h1>
      </div>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-6 md:px-8 pb-16 fade-in">
        {children}
      </main>

      <AIChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

export { roleLabel };
