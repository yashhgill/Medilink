import "@/App.css";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { IS_PUBLIC } from "@/lib/api";
import Landing from "@/pages/Landing";
import Login, { redirectFor } from "@/pages/Login";
import Activate from "@/pages/Activate";
import PharmacyInventory from "@/pages/PharmacyInventory";
import Facilities from "@/pages/Facilities";
import InstallPrompt from "@/components/InstallPrompt";
import Register from "@/pages/Register";
import PatientDashboard from "@/pages/PatientDashboard";
import DoctorDashboard from "@/pages/DoctorDashboard";
import ReceptionDashboard from "@/pages/ReceptionDashboard";
import PharmacyDashboard from "@/pages/PharmacyDashboard";
import Kiosk from "@/pages/Kiosk";
import { Toaster } from "@/components/ui/sonner";

function HomeGate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  return <Navigate to={redirectFor(user.role)} replace />;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomeGate />} />
            <Route path="/kiosk" element={IS_PUBLIC ? <Navigate to="/" replace /> : <Kiosk />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={IS_PUBLIC ? <Navigate to="/login" replace /> : <Register />} />
            <Route path="/activate" element={<Activate />} />
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
                <ProtectedRoute roles={["admin"]}>
                  <ReceptionDashboard />
                </ProtectedRoute>
              }
            />
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
          <Toaster position="top-right" richColors />
          <InstallPrompt />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
