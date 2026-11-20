import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { errorMessage, menuApi } from "../api/client";

const MenuContext = createContext(null);

const REVISION_KEY = "catalogue-revision";

/** How often a till re-pulls the catalogue while nobody is touching it. */
const POLL_MS = 45000;

/**
 * The manager panel calls this after any write that the counter sells from.
 * Same-origin storage events reach the other tabs on this machine instantly;
 * terminals elsewhere on the network catch the same change on their next poll.
 */
export function touchCatalogue() {
  try {
    localStorage.setItem(REVISION_KEY, String(Date.now()));
  } catch {
    // A blocked localStorage only costs the instant cross-tab refresh.
  }
}

/**
 * One copy of the catalogue is shared by the till and the admin panel, so a
 * price, image or stock change made in the panel is what the counter sells
 * without a reload. The list is fetched on demand rather than on app start:
 * the PIN screen has no token to fetch with.
 */
export function MenuProvider({ children }) {
  const [data, setData] = useState({
    categories: [],
    products: [],
    tax: null,
    business: null,
    receipt: null,
  });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!localStorage.getItem("token")) return false;

    if (!silent) setStatus("loading");

    try {
      const result = await menuApi.get();

      setData({
        categories: result.categories ?? [],
        products: (result.products ?? []).map((product) => ({
          ...product,
          price: Number(product.price),
        })),
        tax: result.tax ?? null,
        business: result.business ?? null,
        receipt: result.receipt ?? null,
      });
      setStatus("ready");
      setError("");

      return true;
    } catch (problem) {
      setError(errorMessage(problem, "Could not load the menu."));
      setStatus("error");

      return false;
    }
  }, []);

  // A refresh of the till with a stored token has to repopulate on its own;
  // the PIN screen triggers the same load once the sign-in succeeds.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load({ silent: true });
    const onStorage = (event) => {
      if (event.key === REVISION_KEY || event.key === null) refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [load]);

  const value = useMemo(
    () => ({
      ...data,
      // The chips keep the "All" tab in front of the database categories.
      categoryNames: ["All", ...data.categories.map((c) => c.name)],
      loading: status === "loading",
      error,
      reload: load,
    }),
    [data, status, error, load]
  );

  return (
    <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
  );
}

export function useMenu() {
  const context = useContext(MenuContext);

  if (!context) throw new Error("useMenu has to be used inside MenuProvider");

  return context;
}
