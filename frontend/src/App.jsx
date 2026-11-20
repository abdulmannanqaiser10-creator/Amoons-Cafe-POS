import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import StaffDashboard from "./pages/StaffDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import OrderManagement from "./pages/OrderManagement";
import OrderReversal from "./pages/OrderReversal";
import ShiftReport from "./pages/ShiftReport";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import { applyDisplayPreferences } from "./utils/preferences";
import "./pages/ModulePages.css";

/** Tab title for each screen, so the browser history reads like the app. */
const PAGE_TITLES = [
  ["/", "Login"],
  ["/home", "Till"],
  ["/staff", "Staff Dashboard"],
  ["/orders", "Order Management"],
  ["/reversals", "Order Reversal"],
  ["/shifts", "Shift Report"],
  ["/settings", "Settings"],
  ["/help", "Help Center"],
  ["/admin", "Admin Panel"],
  ["/admin/orders", "Orders"],
  ["/admin/menu", "Menu Management"],
  ["/admin/categories", "Categories"],
  ["/admin/inventory", "Inventory"],
  ["/admin/customers", "Customers"],
  ["/admin/staff", "Staff"],
  ["/admin/rewards", "Rewards"],
  ["/admin/reports", "Reports"],
  ["/admin/settings", "Business Settings"],
];

function useDocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const match =
      PAGE_TITLES.find(([path]) => path === pathname) ??
      (pathname.startsWith("/admin") ? [null, "Manager"] : [null, "Till"]);

    document.title = `Lexcore Solutions — ${match[1]}`;
  }, [pathname]);
}

function App() {
  useDocumentTitle();

  useEffect(() => {
    applyDisplayPreferences();
    const onPrefs = (event) => applyDisplayPreferences(event.detail);
    window.addEventListener("softpos:preferences-changed", onPrefs);
    window.addEventListener("lexos:preferences-changed", onPrefs);
    return () => {
      window.removeEventListener("softpos:preferences-changed", onPrefs);
      window.removeEventListener("lexos:preferences-changed", onPrefs);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route
        path="/home"
        element={
          <ProtectedRoute role="authenticated">
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff"
        element={
          <ProtectedRoute role="authenticated">
            <StaffDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedRoute role="authenticated">
            <OrderManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reversals"
        element={
          <ProtectedRoute role="authenticated">
            <OrderReversal />
          </ProtectedRoute>
        }
      />

      <Route
        path="/shifts"
        element={
          <ProtectedRoute role="authenticated">
            <ShiftReport />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute role="authenticated">
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/help"
        element={
          <ProtectedRoute role="authenticated">
            <Help />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <Admin />
          </ProtectedRoute>
        }
      />

      {/* Any other URL lands on the till rather than an empty screen. */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default App;
