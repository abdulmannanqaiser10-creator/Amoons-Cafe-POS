import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";

function ProtectedRoute({ role, children }) {
  const [allowed, setAllowed] = useState(null);
  const [redirect, setRedirect] = useState("/");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      try {
        if (role === "admin") {
          await api.get("/admin");
        } else {
          await api.get("/auth/me");
        }

        if (active) setAllowed(true);
      } catch (problem) {
        if (!active) return;

        if (problem.response?.status === 403) {
          // Denied admin panel → Home POS dashboard, never the old Staff page.
          setRedirect(role === "admin" ? "/home" : "/");
        } else if (!problem.response || problem.response.status >= 500) {
          setError(errorMessage(problem, "Could not verify access."));
        }
        setAllowed(false);
      }
    };

    checkAccess();

    return () => {
      active = false;
    };
  }, [role]);

  if (allowed === null) {
    return <p className="p-5">Loading...</p>;
  }

  if (error) {
    return (
      <main className="p-5" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  if (!allowed) {
    return <Navigate to={redirect} replace />;
  }

  return children;
}

export default ProtectedRoute;
