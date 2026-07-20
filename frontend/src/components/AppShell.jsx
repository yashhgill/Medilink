import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import SyncIndicator from "@/components/SyncIndicator";
import AIChat from "@/components/AIChat";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Heartbeat, SignOut, Sparkle, Broadcast, List, X, Lock, House } from "@phosphor-icons/react";

const roleLabel = {
  patient: "Patient", doctor: "Doctor", admin: "Reception · Admin",
  pharmacist: "Pharmacy", receptionist: "Reception",
};

export default function AppShell({ children, title, subtitle, navItems = [], sections = [] }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [aiOpen, setAiOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: "", new_password: "" });
  const [live, setLive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useQueueSocket((ev) => { if (ev?.type === "hello") setLive(true); });

  const goSection = (id) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const doLogout = () => { logout(); nav("/login"); };

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F9F9F6]/85 border-b" style={{ borderColor: "var(--ml-border)" }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setMenuOpen(true)} data-testid="menu-open"
              className="w-9 h-9 rounded-xl border border-[#E2DDD7] bg-white flex items-center justify-center hover:bg-[#F3EFE9]" title="Menu">
              <List size={18} />
            </button>
            <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
              <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
                <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
              </div>
              <div className="hidden sm:block">
                <div className="font-display text-lg leading-none">MediLink</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">Cloud · AI · IoT</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div data-testid="ws-status"
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-white text-xs font-mono ${live ? "text-[#2D6A4F]" : "text-[#5C6661]"}`}
              style={{ borderColor: "var(--ml-border)" }}>
              <Broadcast size={12} weight={live ? "fill" : "regular"} className={live ? "breathe" : ""} />
              {live ? "Live" : "Sync"}
            </div>
            <SyncIndicator compact />
            {user?.role === "patient" && (
              <Button data-testid="open-ai-chat" onClick={() => setAiOpen(true)} size="sm"
                className="bg-[#B55B49] hover:bg-[#9b4a3b] text-[#F9F9F6] rounded-full">
                <Sparkle size={14} weight="fill" className="mr-1" /> AI Triage
              </Button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <div className="text-sm font-medium leading-tight" data-testid="header-user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">{roleLabel[user?.role] || user?.role}</div>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50" data-testid="nav-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-[#F9F9F6] shadow-2xl flex flex-col">
            <div className="p-5 border-b border-[#E2DDD7] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1C3F39] flex items-center justify-center">
                  <Heartbeat size={20} color="#F9F9F6" weight="duotone" />
                </div>
                <div>
                  <div className="font-display text-lg leading-none">MediLink</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6661]">{roleLabel[user?.role] || user?.role}</div>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="w-8 h-8 rounded-lg hover:bg-[#F3EFE9] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 border-b border-[#E2DDD7]">
              <div className="text-sm font-medium">{user?.name}</div>
              {user?.ic_number && <div className="text-[11px] font-mono text-[#5C6661]">{user.ic_number}</div>}
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <button onClick={() => goSection("__top")} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F3EFE9] text-[#1C3F39]">
                <House size={18} weight="duotone" /> <span className="text-sm font-medium">Home</span>
              </button>
              {navItems.map((it) => (
                <Link key={it.to} to={it.to} onClick={() => setMenuOpen(false)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${loc.pathname === it.to ? "bg-[#1C3F39] text-[#F9F9F6]" : "hover:bg-[#F3EFE9] text-[#1C3F39]"}`}>
                  {it.label}
                </Link>
              ))}
              {sections.map((sec) => (
                <button key={sec.id} onClick={() => goSection(sec.id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F3EFE9] text-[#1C3F39]">
                  {sec.icon} <span className="text-sm font-medium">{sec.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-[#E2DDD7] space-y-1">
              <button onClick={() => { setMenuOpen(false); setPwOpen(true); }} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F3EFE9] text-[#1C3F39]">
                <Lock size={18} weight="duotone" /> <span className="text-sm font-medium">Change password</span>
              </button>
              <button onClick={doLogout} data-testid="logout-btn" className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#B55B49]/10 text-[#B55B49]">
                <SignOut size={18} /> <span className="text-sm font-medium">Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <div id="__top" className="max-w-[1400px] mx-auto px-4 md:px-8 pt-8 pb-6">
        <div className="overline mb-3">{subtitle}</div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tight font-semibold text-[#0A0F0D]">{title}</h1>
      </div>
      <main className="max-w-[1400px] mx-auto px-4 md:px-8 pb-16 fade-in">{children}</main>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="bg-[#F9F9F6] border-[#E2DDD7]">
          <DialogHeader><DialogTitle className="font-display text-xl">Change password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Current password</Label>
              <Input type="password" value={pwForm.old_password} onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })} className="border-[#E2DDD7]" /></div>
            <div className="space-y-1.5"><Label>New password (min 8 chars)</Label>
              <Input type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} className="border-[#E2DDD7]" /></div>
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              try {
                await api.patch("/auth/me/password", pwForm);
                toast.success("Password changed");
                setPwOpen(false); setPwForm({ old_password: "", new_password: "" });
              } catch (e) {
                const d = e?.response?.data?.detail;
                toast.error(typeof d === "string" ? d : "Could not change password");
              }
            }} className="bg-[#1C3F39] hover:bg-[#2D5A52] text-[#F9F9F6]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AIChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

export { roleLabel };
