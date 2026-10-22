import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ml_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("ml_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    localStorage.setItem("ml_token", r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (payload) => {
    const r = await api.post("/auth/register", payload);
    localStorage.setItem("ml_token", r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };

  // First-run setup (bundled installer): create clinic + admin, optionally
  // activate the licence, then log in. Returns the FULL response, because the
  // wizard needs to tell the user whether activation actually succeeded.
  const completeSetup = async (payload) => {
    const r = await api.post("/setup", payload);
    localStorage.setItem("ml_token", r.data.token);
    setUser(r.data.user);
    return r.data;
  };

  const logout = () => {
    localStorage.removeItem("ml_token");
    setUser(null);
  };

  const isSuperAdmin = !!user && (user.role === "super_admin" || user.role === "admin");
  const isClinicAdmin = !!user && user.role === "clinic_admin";
  const isAdmin = isSuperAdmin || isClinicAdmin;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, completeSetup, logout, isSuperAdmin, isClinicAdmin, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
