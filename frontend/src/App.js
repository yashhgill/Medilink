import "@/App.css";
import "@/index.css";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import ProtectedRoute from "@/components/ProtectedRoute";
import { IS_PUBLIC } from "@/lib/api";
import Landing from "@/pages/Landing";
import Login, { redirectFor } from "@/pages/Login";
import Activate from "@/pages/Activate";
import PharmacyInventory from "@/pages/PharmacyInventory";
import Facilities from "@/pages/Facilities";
import Monitoring from "@/pages/Monitoring";
import InstallPrompt from "@/components/InstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import Register from "@/pages/Register";
import Setup from "@/pages/Setup";
import Branding from "@/pages/Branding";
import Licence from "@/pages/Licence";
import PatientDashboard from "@/pages/PatientDashboard";
import DoctorDashboard from "@/pages/DoctorDashboard";
import ReceptionDashboard from "@/pages/ReceptionDashboard";
import PharmacyDashboard from "@/pages/PharmacyDashboard";
import Kiosk from "@/pages/Kiosk";
import Board from "@/pages/Board";
import { useBrandTheme } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

function HomeGate() {
  const { user, loading } = useAuth();
  // Fresh standalone install (empty DB) → send to the first-run setup wizard.
  const [needsSetup, setNeedsSetup] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get("/setup/status")
      .then((r) => { if (alive) setNeedsSetup(!!r.data.needs_setup); })
      .catch(() => { if (alive) setNeedsSetup(false); });
    return () => { alive = false; };
  }, []);
  if (loading || needsSetup === null) return null;
  if (needsSetup && !user) return <Navigate to="/setup" replace />;
  if (!user) return <Landing />;
  return <Navigate to={redirectFor(user.role)} replace />;
}

function App() {
  useBrandTheme();
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomeGate />} />
            <Route path="/kiosk" element={IS_PUBLIC ? <Navigate to="/" replace /> : <Kiosk />} />
            <Route path="/board" element={<Board />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activate" element={<Activate />} />
            <Route path="/setup" element={<Setup />} />
            <Route
              path="/patient/*"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/*"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reception/*"
              element={
                <ProtectedRoute roles={["admin", "receptionist"]}>
                  <ReceptionDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/monitoring"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Monitoring />
                </ProtectedRoute>
              }
            />
            <Route
              path="/branding"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Branding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/about"
              element={
                <ProtectedRoute>
                  <Licence />
                </ProtectedRoute>
              }
            />
            <Route path="/settings/licence" element={<Navigate to="/about" replace />} />
            <Route
              path="/facilities"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Facilities />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pharmacy"
              element={
                <ProtectedRoute roles={["pharmacist", "admin"]}>
                  <PharmacyDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pharmacy/inventory"
              element={
                <ProtectedRoute roles={["pharmacist", "admin"]}>
                  <PharmacyInventory />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
          <Toaster position="top-right" richColors />
          <InstallPrompt />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
