import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import MenuItems from "../components/MenuItems";
import CurrentOrder from "../components/CurrentOrder";
import LexcoreLogo from "../components/LexcoreLogo";
import LexcoreCredit from "../components/LexcoreCredit";
import PosWebsiteOrderNotice from "../components/PosWebsiteOrderNotice";
import ConfirmDialog from "../components/orders/ConfirmDialog";
import {
  authApi,
  errorMessage,
  logoutSession,
  ordersApi,
  sessionRole,
  shiftsApi,
} from "../api/client";
import { CLOSED_STATUSES } from "../data/orderConstants";
import {
  CalendarIcon as NavCalendarIcon,
  CartIcon as NavOrdersIcon,
  HelpIcon as NavHelpIcon,
  ReverseIcon as NavReversalIcon,
} from "../components/Icons";
import { useMenu } from "../components/MenuProvider";
import {
  applyDiscountAndTax,
  computeSubtotal,
  paymentTaxProfile,
  validateOrder,
} from "../utils/orderMath";
import { formatMoney } from "../utils/format";
import {
  announceNewOrder,
  loadPrinterSettings,
  playOrderAlertTone,
  printSaleBundle,
} from "../utils/printer";
import {
  getDisplayPreferences,
  saveDisplayPreferences,
} from "../utils/preferences";
import "./Home.css";

const navItems = [
  { id: "new", label: "New Order" },
  { id: "orders", label: "Orders" },
  { id: "reversals", label: "Order Reversal" },
  { id: "shifts", label: "Shift" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help" },
  { id: "logout", label: "Logout" },
];

const sidebarItems = [
  { id: "new", label: "New Order", hint: "Start a fresh till order" },
  { id: "orders", label: "Orders", hint: "View and manage orders" },
  { id: "reversals", label: "Order Reversal", hint: "Reverse a completed sale" },
  { id: "shifts", label: "Shift", hint: "Open, close, and report shifts" },
  { id: "settings", label: "Settings", hint: "Fonts, printer, and account" },
  { id: "help", label: "Help", hint: "Guides and support" },
  { id: "logout", label: "Logout", hint: "Sign out of this terminal" },
];

const navRoutes = {
  orders: "/orders",
  reversals: "/reversals",
  shifts: "/shifts",
  settings: "/settings",
  help: "/help",
};

const emptyOrderForm = {
  customerName: "",
  customerPhone: "",
  channel: "Dine-In",
  paymentMethod: "Cash",
  riderName: "",
  riderPhone: "",
  deliveryAddress: "",
  discountEnabled: false,
  discountType: "fixed",
  discountValue: 0,
  discountPercentage: 0,
  loyaltyMemberId: null,
  loyaltyPoints: null,
  loyaltyFound: false,
  redeemPoints: 0,
};

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function SearchIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.2-4.2" />
    </svg>
  );
}

function CartIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2.8 4h2.4l2.3 10.6a1.7 1.7 0 0 0 1.7 1.35h7.9a1.7 1.7 0 0 0 1.66-1.32L20.6 8.2H6.1" />
      <circle cx="9.8" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      {...props}
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

function GearIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.1 14.9a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46V21a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H3a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A1.94 1.94 0 1 1 6.93 4.3l.06.06a1.6 1.6 0 0 0 1.77.32H8.8a1.6 1.6 0 0 0 .97-1.46V3a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97H21a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.46.97Z" />
    </svg>
  );
}

function PowerIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15.4 3.6a8.4 8.4 0 1 1-6.8 0" />
      <path d="M12 2.6V11" />
    </svg>
  );
}

function CloseIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      {...props}
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function navIcon(id) {
  switch (id) {
    case "dashboard":
      return <NavCalendarIcon />;
    case "new":
      return <PlusIcon />;
    case "orders":
      return <NavOrdersIcon />;
    case "reversals":
      return <NavReversalIcon />;
    case "shifts":
      return <NavCalendarIcon />;
    case "settings":
      return <GearIcon />;
    case "help":
      return <NavHelpIcon />;
    default:
      return <PowerIcon />;
  }
}

function CategoryIcon({ category }) {
  const name = category.toLowerCase();

  if (name === "all") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }

  if (/dessert|snack|frappe/.test(name)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 13h16l-2 7H6l-2-7Z" />
        <path d="M7 13c0-3 2-5 5-5s5 2 5 5M9 6c0-1 .7-1.6 1.5-2M14 6c0-1 .7-1.6 1.5-2" />
      </svg>
    );
  }

  if (/coffee|latte|mocha/.test(name)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" />
        <path d="M17 11h1a2.5 2.5 0 1 1 0 5h-2M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2" />
      </svg>
    );
  }

  if (/tea/.test(name)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5ZM17 11h1.5a2 2 0 0 1 0 4H17M8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8l1 17H7L8 3Z" />
      <path d="m15 3-5 9M9 16h6M10 6h.01" />
    </svg>
  );
}

function ClocheIcon() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="82" rx="46" ry="6" fill="#e7dcef" />
      <path d="M20 68h80c0-23-18-42-40-42S20 45 20 68Z" fill="#d8c9e6" />
      <path d="M28 66c4-17 16-28 32-28s28 11 32 28" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M15 68h90v8H15z" fill="#bba9ce" />
      <circle cx="60" cy="20" r="7" fill="#c7b5d7" />
      <path d="M60 13V8" stroke="#c7b5d7" strokeWidth="3" strokeLinecap="round" />
      <path d="m23 24 2 5m-4-3 5 1m67-6-2 5m4-3-5 1" stroke="#d7c8e3" strokeWidth="2" strokeLinecap="round" />
      <path d="m39 16 1.5 3.5L44 21l-3.5 1.5L39 26l-1.5-3.5L34 21l3.5-1.5L39 16Z" fill="#d7c8e3" />
      <path d="m82 18 1.5 3.5L87 23l-3.5 1.5L82 28l-1.5-3.5L77 23l3.5-1.5L82 18Z" fill="#d7c8e3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    products,
    categoryNames,
    business,
    receipt,
    tax,
    loading: menuLoading,
    error: menuError,
    reload,
  } = useMenu();

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNavBar, setShowNavBar] = useState(
    () => getDisplayPreferences().showNavigationBar !== false
  );
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);

  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [orderErrors, setOrderErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const searchInputRef = useRef(null);
  const editLoadRef = useRef(null);

  // Header identity: who is signed in, whether a shift is running, and the
  // wall clock. All three come from the same endpoints the other screens use.
  const [operator, setOperator] = useState(null);
  const [shift, setShift] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const toastTimer = useRef(null);
  const orderAlertFailed = useRef(false);
  const orderAlertInitialized = useRef(false);
  const latestAlertOrderTime = useRef(0);
  const orderAlertGeneration = useRef(0);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    const onPrefs = (event) => {
      const next = event.detail || getDisplayPreferences();
      setShowNavBar(next.showNavigationBar !== false);
    };

    window.addEventListener("softpos:preferences-changed", onPrefs);
    window.addEventListener("lexos:preferences-changed", onPrefs);
    return () => {
      clearInterval(clock);
      window.removeEventListener("softpos:preferences-changed", onPrefs);
      window.removeEventListener("lexos:preferences-changed", onPrefs);
    };
  }, []);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    let cancelled = false;

    authApi
      .me()
      .then((user) => {
        if (!cancelled) setOperator(user);
      })
      .catch(() => {});

    shiftsApi
      .current()
      .then((open) => {
        if (!cancelled) setShift(open);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = sessionRole() === "admin";
  // Staff PIN lands on Home and uses the same till sections as admin.
  const visibleNavItems = navItems;

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
    },
    []
  );

  useEffect(() => {
    loadPrinterSettings();
  }, []);

  useEffect(() => {
    if (!orderOpen && !sidebarOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (orderOpen) setOrderOpen(false);
        if (sidebarOpen) setSidebarOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    // Keep page chrome fixed; Current Order scrolls inside its own panel.
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [orderOpen, sidebarOpen]);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    const generation = ++orderAlertGeneration.current;
    const pollOrders = async () => {
      try {
        const result = await ordersApi.list({ limit: 10, offset: 0 });
        if (orderAlertGeneration.current !== generation) return;

        const rows = result.orders || [];
        const timestamps = rows.map((order) => new Date(order.createdAt).getTime());
        const newestTime = Math.max(0, ...timestamps.filter(Number.isFinite));

        if (!orderAlertInitialized.current) {
          latestAlertOrderTime.current = newestTime;
          orderAlertInitialized.current = true;
          return;
        }

        const incoming = rows.filter((order) => {
          const created = new Date(order.createdAt).getTime();
          if (!(created > latestAlertOrderTime.current)) return false;
          // Always alert for website intake; skip the operator's own till saves.
          if (!order.createdBy) return true;
          return !operator?.id || Number(order.createdBy) !== Number(operator.id);
        });
        latestAlertOrderTime.current = Math.max(
          latestAlertOrderTime.current,
          newestTime
        );

        if (incoming.length && getDisplayPreferences().orderAlerts) {
          const order = incoming[0];
          const isWeb =
            order.channel === "Web" ||
            !order.createdBy ||
            /website/i.test(order.note || "");
          const title = isWeb
            ? `New Web order ${order.orderNumber}`
            : `New order ${order.orderNumber}`;
          showToast(title);
          if (isWeb) playOrderAlertTone();
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(title, {
              body: `${formatMoney(order.total)} · ${order.channel}${
                order.customerName ? ` · ${order.customerName}` : ""
              }`,
            });
          }
        }
        orderAlertFailed.current = false;
      } catch (problem) {
        if (
          orderAlertGeneration.current === generation &&
          !orderAlertFailed.current
        ) {
          showToast(errorMessage(problem, "Could not check for new orders."));
        }
        orderAlertFailed.current = true;
      }
    };

    void pollOrders();
    const timer = window.setInterval(pollOrders, 10000);
    return () => {
      orderAlertGeneration.current += 1;
      window.clearInterval(timer);
    };
  }, [operator?.id, showToast]);

  // Stock is a catalogue fact, so the counter never rings up more than the
  // inventory row can cover; the server enforces the same ceiling. The cart
  // keeps one line per product, so line quantity and units left are the same.
  const leftOf = (id) => {
    const source = products.find((item) => item.id === id);

    if (!source || !source.trackStock) return Infinity;

    return Math.max(0, Number(source.stock) || 0);
  };

  // Add item to cart — keep the till open and refresh the Current Order summary.
  const addToCart = (product) => {
    const available = leftOf(product.id);
    let outcome = "added";

    setCart((previousCart) => {
      const existingItem = previousCart.find((item) => item.id === product.id);

      if (existingItem) {
        if (existingItem.quantity >= available) {
          outcome = "stock";
          return previousCart;
        }

        return previousCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      if (available < 1) {
        outcome = "stock";
        return previousCart;
      }

      return [
        ...previousCart,
        {
          ...product,
          id: product.id,
          productId: product.id,
          quantity: 1,
        },
      ];
    });

    if (outcome === "stock") {
      showToast(`${product.name} is out of stock`);
    }
  };

  // Update quantity
  const updateQuantity = (id, change) => {
    setCart((previousCart) =>
      previousCart
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: Math.min(item.quantity + change, leftOf(id)),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove item
  const removeItem = (id) => {
    setCart((previousCart) =>
      previousCart.filter((item) => item.id !== id)
    );
  };

  // Search and category filter. A category retired in the admin panel falls
  // back to "All" without an effect, so the chips can never select a tab that
  // no longer exists.
  const selectedCategory = categoryNames.includes(activeCategory)
    ? activeCategory
    : "All";

  const filteredProducts = products.filter((item) => {
    const matchesCategory =
      selectedCategory === "All" ||
      item.category === selectedCategory;

    const matchesSearch = item.name
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartSubtotal = computeSubtotal(cart);

  // Payment-method tax: Cash 15%, Card 8% (mirrors server taxOf).
  const paymentTax = paymentTaxProfile(orderForm.paymentMethod, tax);

  // Discount-aware bill for display (mirrors submitOrder calculation)
  const orderDiscount = orderForm.discountEnabled
    ? { enabled: true, type: orderForm.discountType, value: orderForm.discountValue, percentage: orderForm.discountPercentage }
    : null;
  const orderBill = applyDiscountAndTax(cartSubtotal, orderDiscount, paymentTax);

  const changeOrderForm = (patch) => {
    setOrderForm((previous) => ({ ...previous, ...patch }));
    setOrderErrors((previous) => {
      const next = { ...previous };

      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const resetOrderForm = () => {
    setOrderForm(emptyOrderForm);
    setOrderErrors({});
  };

  const startNewOrder = () => {
    setCart([]);
    resetOrderForm();
    setEditingOrder(null);
    editLoadRef.current = null;
    setOrderOpen(false);
  };

  useEffect(() => {
    const editOrderId = location.state?.editOrderId;
    if (!editOrderId || editLoadRef.current === editOrderId) return undefined;

    let cancelled = false;
    editLoadRef.current = editOrderId;

    (async () => {
      try {
        const order = await ordersApi.get(editOrderId);
        if (cancelled) return;

        if (CLOSED_STATUSES.includes(order.status)) {
          showToast(`${order.orderNumber} cannot be edited.`);
          navigate(location.pathname, { replace: true, state: {} });
          editLoadRef.current = null;
          return;
        }

        setEditingOrder(order);
        setCart(
          (order.items || [])
            .map((item) => {
              const productId = Number(item.productId);
              if (!Number.isInteger(productId) || productId < 1) return null;
              return {
                id: productId,
                productId,
                name: item.name,
                price: Number(item.price) || 0,
                quantity: Number(item.quantity) || 0,
                category: item.category,
              };
            })
            .filter(Boolean)
        );
        setOrderForm({
          ...emptyOrderForm,
          customerName: order.customerName || "",
          customerPhone: order.customerPhone || "",
          channel: order.channel || "Dine-In",
          paymentMethod:
            order.paymentMethod === "Card" || order.paymentMethod === "Cash"
              ? order.paymentMethod
              : "Cash",
          riderName: order.riderName || "",
          riderPhone: order.riderPhone || "",
          deliveryAddress: order.deliveryAddress || "",
          discountEnabled: Number(order.discountAmount) > 0,
          discountType:
            order.discountType === "percentage" ? "percentage" : "fixed",
          discountValue:
            order.discountType === "percentage"
              ? 0
              : Number(order.discountAmount) || 0,
          discountPercentage:
            order.discountType === "percentage"
              ? Number(order.discountPercent || order.discountPercentage) || 0
              : 0,
        });
        setOrderErrors({});
        setOrderOpen(true);
        showToast(`Editing ${order.orderNumber}`);
        navigate(location.pathname, { replace: true, state: {} });
      } catch (error) {
        if (!cancelled) {
          showToast(errorMessage(error, "Could not load that order for editing."));
          editLoadRef.current = null;
          navigate(location.pathname, { replace: true, state: {} });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.state, location.pathname, navigate, showToast]);

  const prepareOrderCheckout = () => {
    const cartSnapshot = cart.map((item) => {
      const productId = Number(item.productId || item.id);
      return {
        id: productId,
        productId,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        category: item.category,
        lineTotal: (Number(item.price) || 0) * (Number(item.quantity) || 0),
      };
    });
    const formSnapshot = { ...orderForm };
    const redeemPoints = Math.trunc(Number(formSnapshot.redeemPoints) || 0);
    const redeemDiscount =
      redeemPoints === 10
        ? 5
        : redeemPoints === 20
          ? 10
          : redeemPoints === 50
            ? 20
            : 0;
    const discount = redeemDiscount
      ? {
          enabled: true,
          type: "percentage",
          value: redeemDiscount,
        }
      : formSnapshot.discountEnabled
        ? {
            enabled: true,
            type: formSnapshot.discountType,
            value:
              formSnapshot.discountType === "percentage"
                ? formSnapshot.discountPercentage
                : formSnapshot.discountValue,
          }
        : null;
    const bill = applyDiscountAndTax(
      cartSnapshot.reduce((sum, item) => sum + item.lineTotal, 0),
      discount,
      paymentTaxProfile(formSnapshot.paymentMethod, tax)
    );
    const total = bill.total;

    const problems = validateOrder({
      items: cartSnapshot,
      channel: formSnapshot.channel,
      deliveryAddress: formSnapshot.deliveryAddress,
      total,
    });

    const phone = String(formSnapshot.customerPhone ?? "").trim();
    const digits = phone.replace(/\D/g, "");
    if (phone && (digits.length < 10 || digits.length > 15)) {
      problems.customerPhone = "Enter a valid phone number (10–15 digits).";
    }

    const payload = {
      customerName: formSnapshot.customerName || "",
      customerPhone: formSnapshot.customerPhone,
      channel: formSnapshot.channel,
      paymentMethod: formSnapshot.paymentMethod,
      riderName: formSnapshot.riderName,
      riderPhone: formSnapshot.riderPhone,
      deliveryAddress: formSnapshot.deliveryAddress,
      items: cartSnapshot.map((item) => ({
        productId: item.productId || item.id,
        quantity: item.quantity,
        name: item.name,
      })),
      discountAmount: discount ? bill.discountAmount : 0,
      discountType: redeemDiscount
        ? "percentage"
        : formSnapshot.discountEnabled
          ? formSnapshot.discountType
          : "none",
      discountPercentage: redeemDiscount
        ? redeemDiscount
        : formSnapshot.discountEnabled && formSnapshot.discountType === "percentage"
          ? formSnapshot.discountPercentage
          : 0,
      discountAfterTax: false,
      amountPaid: total,
      redeemPoints: redeemPoints > 0 ? redeemPoints : 0,
    };

    return {
      cartSnapshot,
      formSnapshot,
      redeemPoints,
      discount,
      bill,
      total,
      problems,
      payload,
    };
  };

  const syncCartFromOrder = (order) => {
    if (!order?.items?.length) return;
    setCart(
      order.items
        .map((item) => {
          const productId = Number(item.productId);
          if (!Number.isInteger(productId) || productId < 1) return null;
          return {
            id: productId,
            productId,
            name: item.name,
            price: Number(item.price) || 0,
            quantity: Number(item.quantity) || 0,
            category: item.category,
          };
        })
        .filter(Boolean)
    );
  };

  const toPrintOrder = (order, cartSnapshot, formSnapshot, bill, total, status = "Pending") => {
    // Prefer the till cart that was just submitted so edited/new lines are never dropped
    // if the API response is briefly stale or incomplete.
    const serverItems = Array.isArray(order?.items) ? order.items : [];
    const useCart =
      Array.isArray(cartSnapshot) &&
      cartSnapshot.length > 0 &&
      (serverItems.length === 0 || serverItems.length < cartSnapshot.length);

    const printItems = (useCart ? cartSnapshot : serverItems.length ? serverItems : cartSnapshot).map(
      (item) => ({
        ...item,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        lineTotal:
          item.lineTotal != null
            ? Number(item.lineTotal)
            : (Number(item.price) || 0) * (Number(item.quantity) || 0),
      })
    );

    const discountAmount = Number(order?.discountAmount ?? bill.discountAmount) || 0;
    const taxTotal = Number(order?.taxAmount ?? order?.taxTotal ?? bill.taxAmount) || 0;
    const subtotal = Number(
      order?.subtotal ?? bill.subtotal ?? cartSnapshot.reduce((sum, item) => sum + item.lineTotal, 0)
    );
    const grandTotal = Number(order?.total ?? total ?? bill.total) || 0;

    return {
      ...(order || {}),
      orderNumber: order?.orderNumber || "KOT",
      items: printItems,
      status,
      amountPaid: status === "Completed" ? grandTotal : Number(order?.amountPaid ?? grandTotal) || 0,
      paymentStatus: status === "Completed" ? "Paid" : order?.paymentStatus || "Unpaid",
      balanceDue:
        status === "Completed"
          ? 0
          : Math.max(0, grandTotal - (Number(order?.amountPaid) || 0)),
      discountAmount,
      discountType:
        order?.discountType ||
        (discountAmount > 0 ? "fixed" : "none"),
      discountPercentage: order?.discountPercent || order?.discountPercentage || 0,
      discountPercent: order?.discountPercent || order?.discountPercentage || 0,
      taxTotal,
      taxAmount: taxTotal,
      taxRate: Number(order?.taxRate ?? tax?.rate) || 0,
      subtotal,
      total: grandTotal,
      customerName: formSnapshot.customerName || order?.customerName,
      customerPhone: formSnapshot.customerPhone,
      channel: formSnapshot.channel,
      paymentMethod: formSnapshot.paymentMethod,
      riderName: formSnapshot.riderName,
      riderPhone: formSnapshot.riderPhone,
      deliveryAddress: formSnapshot.deliveryAddress,
      createdAt: order?.createdAt || new Date().toISOString(),
    };
  };

  /** Print KOT only — keeps Current Order open with all data intact. */
  const printKotOnly = async () => {
    if (saving || cart.length === 0) return;

    const prepared = prepareOrderCheckout();
    setOrderErrors(prepared.problems);
    if (Object.keys(prepared.problems).length > 0) {
      showToast("Check the highlighted order fields");
      return;
    }

    const { cartSnapshot, formSnapshot, bill, total, payload } = prepared;
    setSaving(true);

    let order = editingOrder;
    const isEdit = Boolean(editingOrder?.id);

    try {
      order = isEdit
        ? await ordersApi.update(editingOrder.id, payload)
        : await ordersApi.create(payload);
      setEditingOrder(order);
      // Keep till cart as source of truth; only sync when server returned a full line set.
      if ((order.items || []).length >= cartSnapshot.length) {
        syncCartFromOrder(order);
      }
    } catch (error) {
      // Still allow a local KOT print if the kitchen needs the ticket now.
      showToast(
        errorMessage(error, "Order could not be saved — printing local KOT.")
      );
      order = {
        orderNumber: editingOrder?.orderNumber || "KOT",
        items: cartSnapshot,
        total,
        ...formSnapshot,
      };
    }

    const printOrder = toPrintOrder(
      order,
      cartSnapshot,
      formSnapshot,
      bill,
      total,
      "Pending"
    );

    try {
      const printed = await printSaleBundle(printOrder, {
        business,
        receipt,
        mode: "kitchen",
      });
      showToast(
        `${printOrder.orderNumber || "Order"} · KOT sent${
          printed ? ` · ${printed}` : ""
        }`
      );
    } catch (error) {
      showToast(errorMessage(error, "KOT printing failed. Order data was kept open."));
    } finally {
      setSaving(false);
      setOrderOpen(true);
    }
  };

  /** Print Bill — saves, completes, prints bill, then clears the till. */
  const submitOrder = async (printMode = "bill") => {
    const mode = String(printMode || "bill").toLowerCase();
    if (mode === "kitchen" || mode === "kot") {
      await printKotOnly();
      return;
    }

    if (saving || cart.length === 0) return;

    const prepared = prepareOrderCheckout();
    setOrderErrors(prepared.problems);
    if (Object.keys(prepared.problems).length > 0) {
      showToast("Check the highlighted order fields");
      return;
    }

    const {
      cartSnapshot,
      formSnapshot,
      redeemPoints,
      bill,
      total,
      payload,
    } = prepared;

    setSaving(true);

    let order = null;
    const isEdit = Boolean(editingOrder?.id);

    try {
      order = isEdit
        ? await ordersApi.update(editingOrder.id, payload)
        : await ordersApi.create(payload);
      setEditingOrder(order);
      if ((order.items || []).length >= cartSnapshot.length) {
        syncCartFromOrder(order);
      }
    } catch (error) {
      showToast(errorMessage(error, "Could not save this order."));
      setSaving(false);
      return;
    }

    // Always print the cart that was just saved (includes newly added edit lines).
    const printOrder = toPrintOrder(
      {
        ...order,
        items:
          (order.items || []).length >= cartSnapshot.length
            ? order.items
            : cartSnapshot,
        subtotal: order.subtotal ?? bill.subtotal,
        discountAmount: order.discountAmount ?? bill.discountAmount,
        taxAmount: order.taxAmount ?? bill.taxAmount,
        taxTotal: order.taxTotal ?? order.taxAmount ?? bill.taxAmount,
        total: order.total ?? total,
      },
      cartSnapshot,
      formSnapshot,
      bill,
      total,
      "Completed"
    );

    let printed = null;
    let printError = "";
    try {
      printed = await printSaleBundle(printOrder, {
        business,
        receipt,
        mode: mode === "both" ? "both" : "bill",
      });
    } catch (error) {
      printError = errorMessage(error, "printing failed");
    }

    let completed = false;
    const shouldComplete = !isEdit || editingOrder?.status === "Pending";
    if (shouldComplete) {
      try {
        await ordersApi.complete(
          order.id,
          redeemPoints > 0 ? { redeemPoints } : {}
        );
        completed = true;
      } catch (error) {
        showToast(
          `${order.orderNumber} was saved, but could not be marked Completed/Paid: ${errorMessage(error, "server update failed")}`
        );
      }
    }

    reload();

    if (printed) {
      const alert = completed ? announceNewOrder(order) : null;
      showToast(
        `${order.orderNumber} · ${formatMoney(order.total)} · ${printed}${
          alert ? ` · ${alert === "speech" ? "voice alert" : "alert tone"} played` : ""
        }`
      );
      startNewOrder();
    } else {
      // Keep Current Order open so the cashier can retry Print Bill.
      setEditingOrder(order);
      setOrderOpen(true);
      setSaving(false);
      showToast(
        `${order.orderNumber} was saved${completed ? " to Orders" : ""}, but ${
          printError || "bill printing is unavailable"
        }. Order kept open.`
      );
      return;
    }

    setSaving(false);
  };

  const handleNav = (item) => {
    setSidebarOpen(false);

    if (item.id === "new") {
      startNewOrder();
      showToast("New order started");
      return;
    }

    if (item.id === "logout") {
      setLeaving(true);
      return;
    }

    const route = navRoutes[item.id];
    if (route) navigate(route);
  };

  const openCurrentOrder = () => {
    if (cart.length === 0) return;
    setOrderOpen(true);
  };
  const closeCurrentOrder = () => setOrderOpen(false);

  if (orderOpen) {
    return (
      <div className="pos-page dash-page dash-page--order">
        <header className="dash-order-page-head">
          <button
            type="button"
            className="dash-order-back"
            onClick={closeCurrentOrder}
          >
            ← Back to menu
          </button>
          <div>
            <p className="dash-order-kicker">Current Till</p>
            <h1>{editingOrder?.orderNumber ? `Edit ${editingOrder.orderNumber}` : "Current Order"}</h1>
          </div>
          <button
            type="button"
            className="dash-order-close"
            onClick={closeCurrentOrder}
            aria-label="Close current order"
          >
            <CloseIcon />
          </button>
        </header>

        <main className="dash-order-page-main">
          <CurrentOrder
            cart={cart}
            cartCount={cartCount}
            subtotal={cartSubtotal}
            tax={paymentTax}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            form={orderForm}
            onFormChange={changeOrderForm}
            errors={orderErrors}
            saving={saving}
            onSubmit={submitOrder}
            onClear={startNewOrder}
            onNotice={showToast}
            editingLabel={editingOrder?.orderNumber || ""}
          />
        </main>

        {toast ? (
          <div className="pos-toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`pos-page dash-page${sidebarOpen ? " dash-page--sidebar-open" : ""}${
        showNavBar ? "" : " dash-page--nav-hidden"
      }`}
    >
      {sidebarOpen ? (
        <button
          type="button"
          className="dash-sidebar-scrim"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className="dash-sidebar" aria-label="POS sidebar">
        <div className="dash-sidebar-head">
          <div>
            <p className="dash-sidebar-kicker">Lexcore Solutions</p>
            <strong>Navigation</strong>
          </div>
          <button
            type="button"
            className="dash-sidebar-close"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="dash-sidebar-nav">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dash-sidebar-link${item.id === "logout" ? " dash-sidebar-link--out" : ""}`}
              onClick={() => handleNav(item)}
            >
              <span className="dash-sidebar-icon">{navIcon(item.id)}</span>
              <span className="dash-sidebar-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="dash-sidebar-foot">
          <LexcoreCredit className="dash-lexcore-credit" compact />
        </div>
      </aside>

      <header className="dash-header">
        <svg
          className="dash-header-wave"
          viewBox="0 0 1440 110"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 0h700C625 50 565 102 466 102H0V0Z" fill="#4a001d" />
          <path d="M0 0h670C600 47 548 89 454 95H0V0Z" fill="#76002d" opacity=".8" />
        </svg>

        <div className="dash-brand">
          <button
            type="button"
            className="dash-menu-btn"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="dash-brand-mark" aria-hidden="true">
            <LexcoreLogo showWordmark={false} compact />
          </span>
          <div className="dash-brand-lex">
            <strong>Lexcore Solutions</strong>
            <span>INTELLIGENT DIGITAL SOLUTIONS</span>
          </div>
          {business?.name ? (
            <>
              <span className="dash-brand-divider" aria-hidden="true" />
              <div className="dash-brand-amoons">
                <strong>{business.name}</strong>
                <span>STORE</span>
              </div>
            </>
          ) : null}

          <label className="pos-search dash-header-search">
            <SearchIcon className="pos-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="pos-search-input"
              placeholder="Search menu items..."
              aria-label="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>Ctrl + K</kbd>
          </label>
        </div>

        <div className="dash-header-meta">
          {isAdmin ? (
            <button
              type="button"
              className="dash-admin"
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>
          ) : null}
          <span
            className="dash-online"
            title={
              shift
                ? `Online · Shift ${shift.shiftNumber} opened ${new Date(
                    shift.openedAt
                  ).toLocaleString()}`
                : "Online · No shift is currently open"
            }
          >
            <span />
            Online
          </span>
          <span className="dash-date">
            <CalendarIcon />
            {now.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            <time>
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
          <span className="dash-operator">
            <span className="dash-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 21c.4-4.3 3.3-7 7.5-7s7.1 2.7 7.5 7h-15Z" />
              </svg>
            </span>
            <span>{operator?.name || "Cashier 1"}</span>
            <span className="dash-chevron" aria-hidden="true">⌄</span>
          </span>
        </div>
      </header>

      {/* Categories: single horizontal row; products scroll below */}
      <div className="pos-toolbar dash-toolbar dash-toolbar--categories" role="toolbar" aria-label="Menu categories">
        {categoryNames.map((category) => (
          <button
            key={category}
            type="button"
            className={`pos-chip${
              selectedCategory === category
                ? " pos-chip--active"
                : ""
            }`}
            aria-pressed={selectedCategory === category}
            onClick={(event) => {
              setActiveCategory(category);
              event.currentTarget.scrollIntoView({
                behavior: "smooth",
                inline: "center",
                block: "nearest",
              });
            }}
          >
            <CategoryIcon category={category} />
            {category}
          </button>
        ))}
      </div>

      <div className="dash-workspace">
        <main className="pos-main dash-products">
          {menuError ? (
            <div className="pos-state">
              <p className="pos-state-title">The menu could not be loaded</p>
              <p className="pos-state-text">{menuError}</p>
              <button type="button" className="pos-state-btn" onClick={reload}>
                Try again
              </button>
            </div>
          ) : menuLoading && products.length === 0 ? (
            <p className="pos-empty">Loading the menu…</p>
          ) : filteredProducts.length > 0 ? (
            <MenuItems
              items={filteredProducts}
              addToCart={addToCart}
              cart={cart}
            />
          ) : (
            <div className="pos-state">
              <p className="pos-state-title">Nothing matches that search</p>
              <p className="pos-state-text">
                {products.length === 0
                  ? "The menu is empty — add products from the admin panel."
                  : "Try another category or clear the search."}
              </p>
            </div>
          )}
        </main>
      </div>

      {cartCount > 0 ? (
        <button
          type="button"
          className="dash-cart-fab"
          onClick={openCurrentOrder}
          aria-label={`Open current order, ${cartCount} items`}
        >
          <CartIcon aria-hidden="true" />
          <span className="dash-cart-fab-copy">
            <strong>Current Order</strong>
            <span>
              {cartCount} items · {formatMoney(orderBill.total)}
            </span>
          </span>
          <span className="dash-cart-fab-count">{cartCount}</span>
        </button>
      ) : null}

      <PosWebsiteOrderNotice />

      <div className="dash-lexcore-bar" aria-label="Lexcore Solutions">
        <LexcoreCredit className="dash-lexcore-credit dash-lexcore-credit--bar" compact />
      </div>

      {/* Bottom navigation */}
      {showNavBar ? (
        <nav className="pos-nav dash-nav" aria-label="POS navigation">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              className={`pos-nav-item${
                item.id === "new" ? " pos-nav-item--new pos-nav-item--active" : ""
              }`}
              onClick={() => handleNav(item)}
            >
              <span className="pos-nav-icon">{navIcon(item.id)}</span>
              <span className="pos-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      ) : (
        <button
          type="button"
          className="dash-nav-restore"
          onClick={() => {
            const next = saveDisplayPreferences({
              ...getDisplayPreferences(),
              showNavigationBar: true,
            });
            setShowNavBar(next.showNavigationBar !== false);
          }}
        >
          Show Navigation
        </button>
      )}

      {/* Toast */}
      {toast && (
        <div className="pos-toast" role="status">
          {toast}
        </div>
      )}

      {leaving ? (
        <ConfirmDialog
          title="Log out of this terminal?"
          message="The sign-in token is cleared, so the next operator starts from the PIN screen. Anything not yet printed or paid stays on this till only."
          confirmLabel="Log out"
          cancelLabel="Stay signed in"
          onCancel={() => setLeaving(false)}
          onConfirm={() => logoutSession()}
        />
      ) : null}
    </div>
  );
}

export default Home;
