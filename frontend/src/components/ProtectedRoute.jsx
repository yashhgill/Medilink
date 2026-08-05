import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#5A6B70]">
        <span className="font-mono text-sm">Initializing…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  // Any admin tier (super_admin / clinic_admin / legacy admin) satisfies an "admin" gate.
  const ADMIN_TIERS = ["super_admin", "clinic_admin", "admin"];
  const allowed = roles
    ? roles.flatMap((r) => (r === "admin" ? ADMIN_TIERS : [r]))
    : null;
  if (allowed && !allowed.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
