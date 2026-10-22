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
import LicenceBanner from "@/components/LicenceBanner";
import AIChat from "@/components/AIChat";
import useQueueSocket from "@/hooks/useQueueSocket";
import { Heartbeat, SignOut, Sparkle, Broadcast, List, X, Lock, House, User } from "@phosphor-icons/react";
import { PRODUCT } from "@/brand";
import { useMode } from "@/lib/mode";

const roleAccent = {
  patient: "#0A6E62",      // teal
  doctor: "#0A6E62",       // medical blue
  admin: "#10262E",        // navy
  super_admin: "#10262E",
  clinic_admin: "#0A6E62",
  receptionist: "#10262E",
  pharmacist: "#0A6E62",   // green
};

const roleLabel = {
  patient: "Patient", doctor: "Doctor",
  admin: "Administrator", super_admin: "Network administrator", clinic_admin: "Clinic administrator",
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
  const [userMenu, setUserMenu] = useState(false);
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

  const isStaff = user && user.role !== "patient";
  const { isAdmin, isSuperAdmin } = useAuth();
  const { isNetworked } = useMode();
  // Admins get one consistent menu on every admin page.
  if (isAdmin) {
    navItems = [
      { label: "Today's queue", to: "/reception" },
      { label: "Patients", to: "/reception/patients" },
      { label: isSuperAdmin && isNetworked ? "Clinics and staff" : "Clinic and staff", to: "/facilities" },
      { label: "Clinic settings", to: "/branding" },
      ...(isNetworked ? [{ label: "Sync and cloud health", to: "/monitoring" }] : []),
    ];
  }
  const role = roleLabel[user?.role] || user?.role;

  const NavList = ({ onPick }) => (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" aria-label="Main">
        {navItems.map((it) => {
          const active = loc.pathname === it.to;
          return (
            <Link key={it.to} to={it.to} onClick={onPick} aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors ${active ? "bg-[var(--ml-primary)] text-white" : "text-[#10201D] hover:bg-[var(--ml-wash)]"}`}>
              {it.label}
            </Link>
          );
        })}
        {sections.length > 0 && <div className="pt-4 pb-1 px-3 text-[13px] font-semibold text-[#566663]">On this page</div>}
        {sections.map((sec) => (
          <button key={sec.id} onClick={() => { onPick && onPick(); goSection(sec.id); }}
            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] text-[#10201D] hover:bg-[var(--ml-wash)]">
            <span className="text-[var(--ml-primary)]">{sec.icon}</span> {sec.label}
          </button>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-[#DAE2DF] space-y-0.5">
        <button onClick={openProfile} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--ml-wash)] text-[15px]">
          <User size={18} /> My profile
        </button>
        <button onClick={() => { setMenuOpen(false); setPwOpen(true); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--ml-wash)] text-[15px]">
          <Lock size={18} /> Change password
        </button>
        <button onClick={doLogout} data-testid="logout-btn" className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--ml-wash)] text-[15px]">
          <SignOut size={18} /> Sign out
        </button>
      </div>
    </>
  );

  const Brand = ({ dark }) => (
    <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="brand-home">
      <img src={PRODUCT.logo} alt="" className="w-10 h-10 rounded-[10px] object-cover" />
      <span className={`font-display text-[19px] leading-none ${dark ? "text-white" : "text-[#10201D]"}`}>{PRODUCT.name}</span>
    </Link>
  );
  const initials = (user?.name || "?").replace(/^(Dr\.?|Pn\.?|En\.?|Cik)\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const today = new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-[#EEF2F1]">
      {isStaff ? (
        <header className="sticky top-0 z-30 bg-[#10262E] text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 h-16 flex items-center gap-6">
            <button onClick={() => setMenuOpen(true)} data-testid="menu-open" aria-label="Open menu"
              className="lg:hidden w-10 h-10 -ml-2 rounded-lg flex items-center justify-center hover:bg-white/10">
              <List size={22} />
            </button>
            <Brand dark />
            <nav className="hidden lg:flex items-center gap-1 h-full" aria-label="Main">
              {navItems.map((it) => {
                const active = loc.pathname === it.to;
                return (
                  <Link key={it.to} to={it.to} aria-current={active ? "page" : undefined}
                    className={`relative h-full flex items-center px-3 text-[15px] font-semibold transition-colors ${active ? "text-white" : "text-white/65 hover:text-white"}`}>
                    {it.label}
                    {active && <span className="absolute left-3 right-3 bottom-0 h-[3px] rounded-t bg-[#5FD3A8]" />}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <div data-testid="ws-status" title={live ? "Screens update instantly" : "Reconnecting to live updates"}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-[13px] font-semibold text-white/85">
                <Broadcast size={14} weight={live ? "fill" : "regular"} className={live ? "breathe text-[#5FD3A8]" : ""} />
                {live ? "Live" : "Reconnecting"}
              </div>
              <div className="hidden md:block"><SyncIndicator compact /></div>
              <div className="relative">
                <button onClick={() => setUserMenu((v) => !v)} data-testid="user-menu" aria-haspopup="menu" aria-expanded={userMenu}
                  className="flex items-center gap-2.5 pl-1.5 pr-2 py-1 rounded-full hover:bg-white/10">
                  <span className="w-8 h-8 rounded-full bg-[#5FD3A8] text-[#10262E] text-[13px] font-bold flex items-center justify-center">{initials}</span>
                  <span className="hidden xl:flex flex-col items-start leading-tight">
                    <span className="text-[14px] font-semibold" data-testid="header-user-name">{user?.name}</span>
                    <span className="text-[12px] text-white/60">{role}</span>
                  </span>
                </button>
                {userMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                    <div role="menu" className="absolute right-0 mt-2 w-60 z-50 rounded-xl bg-white text-[#10201D] shadow-xl border border-[#DAE2DF] py-1.5">
                      <div className="px-4 py-2.5 border-b border-[#E8EEEC]">
                        <div className="font-semibold text-[15px]">{user?.name}</div>
                        <div className="text-[13px] text-[#566663]">{role}</div>
                      </div>
                      <button role="menuitem" onClick={() => { setUserMenu(false); openProfile(); }} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-[#EEF2F1] text-[15px]"><User size={18} /> My profile</button>
                      <button role="menuitem" onClick={() => { setUserMenu(false); setPwOpen(true); }} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-[#EEF2F1] text-[15px]"><Lock size={18} /> Change password</button>
                      <button role="menuitem" onClick={doLogout} data-testid="logout-btn" className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-[#EEF2F1] text-[15px] text-[#B4231C]"><SignOut size={18} /> Sign out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-20 bg-[#EEF2F1]/95 backdrop-blur border-b border-[#DAE2DF]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setMenuOpen(true)} data-testid="menu-open" aria-label="Open menu"
                className="w-10 h-10 rounded-lg border border-[#DAE2DF] bg-white flex items-center justify-center hover:bg-[var(--ml-wash)]">
                <List size={20} />
              </button>
              <Brand />
            </div>
            {user?.role === "patient" && (
              <Button data-testid="open-ai-chat" onClick={() => setAiOpen(true)} size="sm"
                className="bg-[#10262E] hover:bg-[#0A1A20] text-white rounded-full">
                <Sparkle size={14} weight="fill" className="mr-1" /> Check symptoms
              </Button>
            )}
          </div>
        </header>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50" data-testid="nav-drawer">
          <div className="absolute inset-0 bg-[#10201D]/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-xl flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="h-16 px-5 border-b border-[#DAE2DF] flex items-center justify-between">
              <Brand />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="w-9 h-9 rounded-lg hover:bg-[var(--ml-wash)] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 border-b border-[#DAE2DF]">
              <div className="text-[15px] font-semibold">{user?.name}</div>
              <div className="text-[13px] text-[#566663]">{role}{user?.ic_number ? <span className="font-mono"> · {user.ic_number}</span> : null}</div>
            </div>
            <NavList onPick={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <LicenceBanner />

      <div id="__top" className="max-w-[1440px] mx-auto px-4 md:px-8 pt-7 pb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          {subtitle && <div className="text-[15px] text-[#566663] mb-1">{subtitle}</div>}
          <h1 className="text-[30px] sm:text-[38px] leading-[1.05] text-[#10201D]">{title}</h1>
        </div>
        {isStaff && <div className="text-[15px] text-[#566663] pb-1">{today}</div>}
      </div>
      <main className="max-w-[1440px] mx-auto px-4 md:px-8 pb-16">{children}</main>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="bg-[#EEF2F1] border-[#DAE2DF]">
          <DialogHeader><DialogTitle className="font-display text-xl">My profile</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label>
              <Input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={pf.email} onChange={(e) => setPf({ ...pf, email: e.target.value })} placeholder="you@email.com" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Phone</Label>
              <Input value={pf.phone} onChange={(e) => setPf({ ...pf, phone: e.target.value })} placeholder="012-345 6789" className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>Home address</Label>
              <Input value={pf.address} onChange={(e) => setPf({ ...pf, address: e.target.value })} placeholder="No. 1, Jalan Sehat, 47500 Subang Jaya" className="border-[#DAE2DF]" /></div>
          </div>
          {user?.ic_number && <p className="text-[11px] text-[#566663] mt-1">You sign in with your IC ({user.ic_number}). Your IC cannot be changed here.</p>}
          <DialogFooter><Button onClick={saveProfile} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="bg-[#EEF2F1] border-[#DAE2DF]">
          <DialogHeader><DialogTitle className="font-display text-xl">Change password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Current password</Label>
              <Input type="password" value={pwForm.old_password} onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })} className="border-[#DAE2DF]" /></div>
            <div className="space-y-1.5"><Label>New password (min 8 chars)</Label>
              <Input type="password" value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} className="border-[#DAE2DF]" /></div>
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
            }} className="bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-[#EEF2F1]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AIChat open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

export { roleLabel };
