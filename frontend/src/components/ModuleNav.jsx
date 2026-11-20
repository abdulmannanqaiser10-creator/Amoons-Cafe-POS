import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { authApi, errorMessage, logoutSession } from "../api/client";
import LexcoreLogo from "./LexcoreLogo";
import LexcoreCredit from "./LexcoreCredit";
import {
  getDisplayPreferences,
  saveDisplayPreferences,
} from "../utils/preferences";

const links = [
  { to: "/home", label: "New Order", end: true },
  { to: "/orders", label: "Orders" },
  { to: "/reversals", label: "Order Reversal" },
  { to: "/shifts", label: "Shift" },
  { to: "/settings", label: "Settings" },
  { to: "/help", label: "Help" },
];

export default function ModuleNav() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNav, setShowNav] = useState(
    () => getDisplayPreferences().showNavigationBar !== false
  );

  useEffect(() => {
    let active = true;
    const onProfileChanged = (event) => setUser(event.detail);
    const onPrefs = (event) => {
      const next = event.detail || getDisplayPreferences();
      setShowNav(next.showNavigationBar !== false);
    };

    authApi
      .me()
      .then((result) => {
        if (active) setUser(result);
      })
      .catch((problem) => {
        if (active) setError(errorMessage(problem, "Account details unavailable"));
      });

    window.addEventListener("softpos:profile-changed", onProfileChanged);
    window.addEventListener("lexos:profile-changed", onProfileChanged);
    window.addEventListener("softpos:preferences-changed", onPrefs);
    window.addEventListener("lexos:preferences-changed", onPrefs);
    const timer = window.setInterval(() => setNow(new Date()), 30000);

    return () => {
      active = false;
      window.removeEventListener("softpos:profile-changed", onProfileChanged);
      window.removeEventListener("lexos:profile-changed", onProfileChanged);
      window.removeEventListener("softpos:preferences-changed", onPrefs);
      window.removeEventListener("lexos:preferences-changed", onPrefs);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const go = (to) => {
    setMenuOpen(false);
    navigate(to);
  };

  const restoreNav = () => {
    const next = saveDisplayPreferences({
      ...getDisplayPreferences(),
      showNavigationBar: true,
    });
    setShowNav(next.showNavigationBar !== false);
  };

  return (
    <header
      className={`module-topbar${menuOpen ? " module-topbar--nav-open" : ""}${
        showNav ? "" : " module-topbar--nav-hidden"
      }`}
    >
      {showNav ? (
        <button
          type="button"
          className="module-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      ) : (
        <button
          type="button"
          className="module-nav-restore"
          onClick={restoreNav}
        >
          Show Navigation
        </button>
      )}

      {showNav ? (
        <nav className="mn module-nav" aria-label="POS sections">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `mn-link${isActive ? " mn-link--on" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          <button type="button" className="mn-link module-logout" onClick={() => logoutSession()}>
            Logout
          </button>
        </nav>
      ) : null}

      {menuOpen && showNav ? (
        <button
          type="button"
          className="module-nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {showNav ? (
        <aside className="module-sidebar" aria-label="POS sidebar">
          <p className="module-sidebar-title">Navigate</p>
          {links.map(({ to, label }) => (
            <button
              key={to}
              type="button"
              className="module-sidebar-link"
              onClick={() => go(to)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="module-sidebar-link module-sidebar-link--out"
            onClick={() => logoutSession()}
          >
            Logout
          </button>
          <div className="module-sidebar-foot">
            <LexcoreCredit className="dash-lexcore-credit" compact />
          </div>
        </aside>
      ) : null}

      <div className="module-identity">
        <span className="module-lexcore" title="Lexcore Solutions">
          <LexcoreLogo compact />
        </span>
        <span className="module-online"><i /> Online</span>
        <time dateTime={now.toISOString()}>
          {now.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        <span className="module-user" title={error || user?.role || ""}>
          <span className="module-user-avatar" aria-hidden="true">
            {(user?.name || "U").slice(0, 1).toUpperCase()}
          </span>
          {user?.name || (error ? "Account unavailable" : "Loading…")}
        </span>
      </div>
    </header>
  );
}
