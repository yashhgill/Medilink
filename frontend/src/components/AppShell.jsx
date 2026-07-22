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
import { Heartbeat, SignOut, Sparkle, Broadcast, List, X, Lock, House, User } from "@phosphor-icons/react";

const roleAccent = {
  patient: "#0B7C8C",      // teal
  doctor: "#086788",       // medical blue
  admin: "#0A3D62",        // navy
  receptionist: "#0A3D62",
  pharmacist: "#2D6A4F",   // green
};

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [pf, setPf] = useState({ name: "", email: "", phone: "", address: "" });
  const openProfile = () => {
    setMenuOpen(false);
    setPf({
      name: user?.name || "",
      email: (user?.email || "").includes("@patient.medilink") ? "" : (user?.email || ""),
      phone: user?.phone || "",
      address: user?.address || "",
    });
    setProfileOpen(true);
  };
  const saveProfile = async () => {
    try {
      await api.patch("/auth/me/profile", pf);
      toast.success("Profile updated");
      setProfileOpen(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not update profile");
    }
  };

  useQueueSocket((ev) => { if (ev?.type === "hello") setLive(true); });

  const goSection = (id) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const doLogout = () => { logout(); nav("/login"); };

  return (
    <div className="min-h-screen bg-[#F4F9F9]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F9F9]/85 border-b" style={{ borderColor: "var(--ml-border)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="h-1 w-full" style={{ background: roleAccent[user?.role] || "#0B7C8C" }} />
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setMenuOpen(true)} data-testid="menu-open"
              className="w-9 h-9 rounded-xl border border-[#DCE8E9] bg-white flex items-center justify-center hover:bg-[#EAF5F5]" title="Menu">
              <List size={18} />
            </button>
            <Link to="/" className="flex items-center gap-2.5" data-testid="brand-home">
              <div className="w-9 h-9 rounded-xl bg-[#0B7C8C] flex items-center justify-center">
                <Heartbeat size={20} color="#F4F9F9" weight="duotone" />
              </div>
              <div className="hidden sm:block">
                <div className="font-display text-lg leading-none">MediLink</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#5A6B70]">Health Systems</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {user?.role !== "patient" && (
              <>
                <div data-testid="ws-status"
                  className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-white text-xs font-mono ${live ? "text-[#2D6A4F]" : "text-[#5A6B70]"}`}
                  style={{ borderColor: "var(--ml-border)" }}>
                  <Broadcast size={12} weight={live ? "fill" : "regular"} className={live ? "breathe" : ""} />
                  {live ? "Live" : "Sync"}
                </div>
                <SyncIndicator compact />
              </>
            )}
            {user?.role === "patient" && (
              <Button data-testid="open-ai-chat" onClick={() => setAiOpen(true)} size="sm"
                className="bg-[#0A3D62] hover:bg-[#083150] text-[#F4F9F9] rounded-full">
                <Sparkle size={14} weight="fill" className="mr-1" /> AI Triage
              </Button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <div className="text-sm font-medium leading-tight" data-testid="header-user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: roleAccent[user?.role] || "#5A6B70" }}>{roleLabel[user?.role] || user?.role}</div>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50" data-testid="nav-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-[#F4F9F9] shadow-2xl flex flex-col">
            <div className="p-5 border-b border-[#DCE8E9] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0B7C8C] flex items-center justify-center">
                  <Heartbeat size={20} color="#F4F9F9" weight="duotone" />
                </div>
                <div>
                  <div className="font-display text-lg leading-none">MediLink</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: roleAccent[user?.role] || "#5A6B70" }}>{roleLabel[user?.role] || user?.role}</div>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="w-8 h-8 rounded-lg hover:bg-[#EAF5F5] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 border-b border-[#DCE8E9]">
              <div className="text-sm font-medium">{user?.name}</div>
              {user?.ic_number && <div className="text-[11px] font-mono text-[#5A6B70]">{user.ic_number}</div>}
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <button onClick={() => goSection("__top")} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EAF5F5] text-[#0B7C8C]">
                <House size={18} weight="duotone" /> <span className="text-sm font-medium">Home</span>
              </button>
              {navItems.map((it) => (
                <Link key={it.to} to={it.to} onClick={() => setMenuOpen(false)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${loc.pathname === it.to ? "bg-[#0B7C8C] text-[#F4F9F9]" : "hover:bg-[#EAF5F5] text-[#0B7C8C]"}`}>
                  {it.label}
                </Link>
              ))}
              {sections.map((sec) => (
                <button key={sec.id} onClick={() => goSection(sec.id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EAF5F5] text-[#0B7C8C]">
                  {sec.icon} <span className="text-sm font-medium">{sec.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-[#DCE8E9] space-y-1">
              <button onClick={openProfile} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EAF5F5] text-[#0B7C8C]">
                <User size={18} weight="duotone" /> <span className="text-sm font-medium">My profile</span>
              </button>
              <button onClick={() => { setMenuOpen(false); setPwOpen(true); }} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EAF5F5] text-[#0B7C8C]">
                <Lock size={18} weight="duotone" /> <span className="text-sm font-medium">Change password</span>
              </button>
              <button onClick={doLogout} data-testid="logout-btn" className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#0A3D62]/10 text-[#0A3D62]">
                <SignOut size={18} /> <span className="text-sm font-medium">Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <div id="__top" className="max-w-[1400px] mx-auto px-4 md:px-8 pt-8 pb-6">
        <div className="overline mb-3">{subtitle}</div>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tight font-semibold text-[#12262B]">{title}</h1>
      </div>
      <main className="max-w-[1400px] mx-auto px-4 md:px-8 pb-16 fade-in">{children}</main>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="bg-[#F4F9F9] border-[#DCE8E9]">
          <DialogHeader><DialogTitle className="font-display text-xl">My profile</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label>
              <Input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} className="border-[#DCE8E9]" /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={pf.email} onChange={(e) => setPf({ ...pf, email: e.target.value })} placeholder="you@email.com" className="border-[#DCE8E9]" /></div>
            <div className="space-y-1.5"><Label>Phone</Label>
              <Input value={pf.phone} onChange={(e) => setPf({ ...pf, phone: e.target.value })} placeholder="012-345 6789" className="border-[#DCE8E9]" /></div>
            <div className="space-y-1.5"><Label>Home address</Label>
              <Input value={pf.address} onChange={(e) => setPf({ ...pf, address: e.target.value })} placeholder="No. 1, Jalan Sehat, 47500 Subang Jaya" className="border-[#DCE8E9]" /></div>
          </div>
          {user?.ic_number && <p className="text-[11px] text-[#5A6B70] mt-1">You sign in with your IC ({user.ic_number}). Your IC cannot be changed here.</p>}
          <DialogFooter><Button onClick={saveProfile} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="bg-[#F4F9F9] border-[#DCE8E9]">
          <DialogHeader><DialogTitle className="font-display text-xl">Change password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Current password</Label>
              <Input type="password" value={pwForm.old_password} onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })} className="border-[#DCE8E9]" /></div>
            <div className="space-y-1.5"><Label>New password (min 8 chars)</Label>
              <Input type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} className="border-[#DCE8E9]" /></div>
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
            }} className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AIChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

export { roleLabel };
