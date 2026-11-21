import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import AdminDashboard from "./admin/Dashboard";
import CategoriesManagement from "./admin/CategoriesManagement";
import InventoryManagement from "./admin/InventoryManagement";
import MenuManagement from "./admin/MenuManagement";
import Reports from "./admin/Reports";
import Rewards from "./admin/Rewards";
import Customers from "./admin/Customers";
import Tables from "./admin/Tables";
import StaffManagement from "./admin/StaffManagement";
import BusinessSettings from "./admin/BusinessSettings";
import Integrations from "./admin/Integrations";
import OrderManagement from "./OrderManagement";
import LexcoreLogo from "../components/LexcoreLogo";
import LexcoreCredit from "../components/LexcoreCredit";
import WebsiteOrderAlert from "../components/admin/WebsiteOrderAlert";
import { touchCatalogue, useMenu } from "../components/MenuProvider";
import { adminApi, authApi, companyApi, errorMessage, logoutSession } from "../api/client";
import {
  BagIcon,
  BellIcon,
  ChartIcon,
  ClipboardIcon,
  CutleryIcon,
  FlagIcon,
  GearIcon,
  MapPinIcon,
  PowerIcon,
  SearchIcon,
  TrendingIcon,
  UsbIcon,
  UserIcon,
  WalletIcon,
} from "../components/Icons";
import "./AdminPanel.css";

const NAV_ITEMS = [
  { to: "/admin", end: true, label: "Dashboard", Glyph: ChartIcon },
  { to: "/admin/orders", label: "Orders", Glyph: ClipboardIcon },
  { to: "/admin/menu", label: "Menu Items", Glyph: CutleryIcon },
  { to: "/admin/categories", label: "Categories", Glyph: FlagIcon },
  { to: "/admin/inventory", label: "Inventory", Glyph: BagIcon },
  { to: "/admin/tables", label: "Tables", Glyph: MapPinIcon },
  { to: "/admin/customers", label: "Customers", Glyph: UserIcon },
  { to: "/admin/rewards", label: "Rewards", Glyph: WalletIcon },
  { to: "/admin/reports", label: "Reports", Glyph: TrendingIcon },
  { to: "/admin/staff", label: "Staff", Glyph: UserIcon },
  { to: "/admin/settings", label: "Settings", Glyph: GearIcon },
  { to: "/admin/integrations", label: "Integrations", Glyph: UsbIcon },
];

function MenuGlyph({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

function PanelCollapseIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      {collapsed ? <path d="M13 12h5M15.5 9.5 18 12l-2.5 2.5" /> : <path d="M14 12H7M9.5 9.5 7 12l2.5 2.5" />}
    </svg>
  );
}

function Admin() {
  const { reload } = useMenu();
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [brandName, setBrandName] = useState("Amoon’s Cafe");
  const [alerts, setAlerts] = useState(0);
  const [bellTick, setBellTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return (
        localStorage.getItem("softpos.admin.sidebar") === "collapsed" ||
        localStorage.getItem("lexos.admin.sidebar") === "collapsed"
      );
    } catch {
      return false;
    }
  });
  const railCollapsed = collapsed && !isMobile;

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((user) => {
        if (active) setProfile(user);
      })
      .catch((problem) => {
        if (active) setProfileError(errorMessage(problem, "Could not load the admin profile."));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    companyApi
      .get()
      .then((result) => {
        const name = result?.settings?.business?.name?.trim();
        if (active && name) setBrandName(name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    adminApi.inventory
      .list()
      .then((data) => {
        if (!active) return;
        setAlerts((data.summary?.low ?? 0) + (data.summary?.out ?? 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname, bellTick]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const syncMobile = () => setIsMobile(media.matches);
    syncMobile();
    media.addEventListener("change", syncMobile);
    return () => media.removeEventListener("change", syncMobile);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("softpos.admin.sidebar", collapsed ? "collapsed" : "expanded");
      try {
        localStorage.removeItem("lexos.admin.sidebar");
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const sync = () => {
    touchCatalogue();
    setBellTick((tick) => tick + 1);
    return reload();
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/admin/menu?q=${encodeURIComponent(value)}` : "/admin/menu");
  };

  return (
    <div
      className={`ad${navOpen ? " ad--nav-open" : ""}${railCollapsed ? " ad--collapsed" : ""}`}
    >
      <button
        type="button"
        className="ad-scrim"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside className="ad-rail" aria-label="Admin navigation">
        <div className="ad-rail-head">
          <span className="ad-rail-logo" aria-hidden="true">
            <LexcoreLogo showWordmark={false} compact />
          </span>
          <span className="ad-rail-brand">
            <strong className="ad-rail-amoons" title="Amoons">Amoons</strong>
            <small>Admin Panel</small>
          </span>
          <button
            type="button"
            className="ad-rail-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <MenuGlyph open />
          </button>
          <button
            type="button"
            className="ad-collapse-btn"
            onClick={() => setCollapsed((value) => !value)}
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={railCollapsed}
          >
            <PanelCollapseIcon collapsed={railCollapsed} />
          </button>
        </div>

        <nav className="ad-nav" aria-label="Admin sections">
          {NAV_ITEMS.map(({ to, label, end, Glyph }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => `ad-nav-link${isActive ? " ad-nav-link--on" : ""}`}
            >
              <span className="ad-nav-icon">
                <Glyph />
              </span>
              <span className="ad-nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ad-rail-foot">
          <button
            type="button"
            className="ad-rail-link ad-rail-link--out"
            onClick={() => logoutSession()}
            title="Log Out"
          >
            <PowerIcon className="ad-rail-out-icon" />
            <span className="ad-nav-label">Log Out</span>
          </button>

          <div className="ad-rail-status" aria-live="polite" title="System Online · v1.0.0">
            <span className="ad-rail-online">
              <span className="ad-rail-dot" aria-hidden="true" />
              <span className="ad-nav-label">System Online</span>
            </span>
            <span className="ad-rail-version">v1.0.0</span>
          </div>

          <p className="ad-powered-foot">Powered By Lexcore Solutions</p>
        </div>
      </aside>

      <div className="ad-main">
        <header className="ad-topbar">
          <button
            type="button"
            className="ad-menu-btn"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <MenuGlyph open={navOpen} />
          </button>

          <form className="ad-top-search" role="search" onSubmit={submitSearch}>
            <SearchIcon aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search anything… (e.g. orders, menu items)"
              aria-label="Search menu items"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd className="ad-top-kbd" aria-hidden="true">
              Ctrl + K
            </kbd>
          </form>

          <div className="ad-top-actions">
            <LexcoreCredit className="ad-top-lexcore" compact />

            <NavLink
              className="ad-top-notice"
              to={alerts > 0 ? "/admin/inventory" : "/admin#needs-attention"}
              aria-label={
                alerts > 0
                  ? `${alerts} stock alert(s), open inventory`
                  : "View dashboard notifications"
              }
            >
              <BellIcon />
              {alerts > 0 ? (
                <span className="ad-top-dot" aria-hidden="true">
                  {alerts > 9 ? "9+" : alerts}
                </span>
              ) : null}
            </NavLink>

            <span className="ad-top-profile">
              <span className="ad-top-avatar" aria-hidden="true">
                {(profile?.name || "A").slice(0, 1).toUpperCase()}
              </span>
              <span className="ad-top-profile-copy">
                <strong>{profile?.name || "Admin"}</strong>
                <small>{profile ? "Administrator" : profileError || "Loading…"}</small>
              </span>
            </span>
          </div>
        </header>

        <WebsiteOrderAlert />

        <div className="ad-content">
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<OrderManagement mode="admin" />} />
            <Route path="menu" element={<MenuManagement onChanged={sync} />} />
            <Route path="categories" element={<CategoriesManagement onChanged={sync} />} />
            <Route path="inventory" element={<InventoryManagement onChanged={sync} />} />
            <Route path="staff" element={<StaffManagement />} />
            <Route path="customers" element={<Customers />} />
            <Route path="tables" element={<Tables />} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<BusinessSettings onChanged={sync} />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default Admin;
