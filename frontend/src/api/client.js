import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A stale or tampered token must send the operator back to the PIN screen
    // instead of leaving a dead dashboard on screen. A wrong PIN is answered
    // with 401 too, and that belongs on the form, not in a redirect.
    if (
      error.response?.status === 401 &&
      !String(error.config?.url ?? "").includes("/auth/login")
    ) {
      logoutSession("expired");
    }

    return Promise.reject(error);
  }
);

export function errorMessage(error, fallback = "Something went wrong") {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.code === "ECONNABORTED") return "The request timed out.";
  // Axios network failure (request was sent, no response).
  if (error?.isAxiosError && error?.request && !error?.response) {
    return "Unable to reach the server.";
  }
  if (error?.message && !/^Request failed with status code \d+$/i.test(error.message)) {
    return error.message;
  }
  if (!error?.response && error?.request) return "Unable to reach the server.";

  return fallback;
}

/**
 * Ends the session locally and reloads the app, so nothing a previous operator
 * left in memory — cart, catalogue, printer cache — survives the handover. The
 * token is a bearer credential, so dropping it is what invalidates access here;
 * no other trace of it is kept.
 */
export function logoutSession(reason = "signedout") {
  localStorage.removeItem("token");

  window.location.replace(`/?${reason}=1`);
}

/** The full JSON error body, for responses that carry a flag next to the text. */
export function errorData(error) {
  return error?.response?.data ?? null;
}

/**
 * The role carried by the current token, read only to decide what to show —
 * the server still checks every request, so a forged value gains nothing.
 */
export function sessionRole() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;

    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const unwrapOrder = (response) => response.data.order;

export const ordersApi = {
  list: (params) => api.get("/orders", { params }).then((r) => r.data),
  stats: (params) => api.get("/orders/stats", { params }).then((r) => r.data),
  get: (id) => api.get(`/orders/${id}`).then(unwrapOrder),
  create: (payload) => api.post("/orders", payload).then(unwrapOrder),
  update: (id, payload) =>
    api.put(`/orders/${id}`, payload).then(unwrapOrder),
  updateStatus: (id, status) =>
    api.patch(`/orders/${id}/status`, { status }).then(unwrapOrder),
  complete: (id, payload = {}) =>
    api.post(`/orders/${id}/complete`, payload).then(unwrapOrder),
  updatePayment: (id, payload) =>
    api.patch(`/orders/${id}/payment`, payload).then(unwrapOrder),
  cancel: (id) => api.post(`/orders/${id}/cancel`).then(unwrapOrder),
  remove: (id) => api.delete(`/orders/${id}`).then((r) => r.data),
  reverse: (id, payload) =>
    api.post(`/orders/${id}/reverse`, payload).then((r) => r.data),
};

export const reversalsApi = {
  history: (params) => api.get("/reversals", { params }).then((r) => r.data),
};

export const shiftsApi = {
  options: () => api.get("/shifts/options").then((r) => r.data),
  list: (params) => api.get("/shifts", { params }).then((r) => r.data),
  current: () => api.get("/shifts/current").then((r) => r.data.shift),
  get: (id) => api.get(`/shifts/${id}`).then((r) => r.data),
  open: (payload) => api.post("/shifts", payload).then((r) => r.data),
  close: (id, payload) =>
    api.patch(`/shifts/${id}/close`, payload).then((r) => r.data),
  addCashPull: (id, payload) =>
    api.post(`/shifts/${id}/cash-pulls`, payload).then((r) => r.data),
};

export const authApi = {
  me: () => api.get("/auth/me").then((r) => r.data.user),
};

/** Self-service account actions — an operator may only change their own PIN. */
export const staffApi = {
  changePin: (payload) =>
    api.post("/staff/change-pin", payload).then((r) => r.data),
  updateProfile: (payload) =>
    api.patch("/staff/profile", payload).then((r) => r.data),
  lookupLoyalty: (phone) =>
    api
      .get("/staff/loyalty/lookup", { params: { phone } })
      .then((r) => r.data),
};

/** The catalogue the till sells from, plus the settings that price it. */
export const menuApi = {
  get: () => api.get("/menu").then((r) => r.data),
};

/**
 * Manager-only writes. Every one of these is the same table the till reads, so
 * a save here is what the counter sells on its next refresh — there is no
 * second copy of the menu.
 */
export const adminApi = {
  categories: {
    list: () => api.get("/admin/categories").then((r) => r.data),
    create: (payload) => api.post("/admin/categories", payload).then((r) => r.data),
    update: (id, payload) =>
      api.put(`/admin/categories/${id}`, payload).then((r) => r.data),
    remove: (id, reassignTo) =>
      api
        .delete(`/admin/categories/${id}`, { params: reassignTo ? { reassignTo } : {} })
        .then((r) => r.data),
  },
  products: {
    list: (params) => api.get("/admin/products", { params }).then((r) => r.data),
    create: (payload) => api.post("/admin/products", payload).then((r) => r.data),
    update: (id, payload) =>
      api.put(`/admin/products/${id}`, payload).then((r) => r.data),
    remove: (id) => api.delete(`/admin/products/${id}`).then((r) => r.data),
  },
  inventory: {
    list: (params) => api.get("/admin/inventory", { params }).then((r) => r.data),
    adjust: (productId, payload) =>
      api.post(`/admin/inventory/${productId}/adjust`, payload).then((r) => r.data),
    updateItem: (productId, payload) =>
      api.put(`/admin/inventory/${productId}`, payload).then((r) => r.data),
    movements: (productId) =>
      api.get(`/admin/inventory/${productId}/movements`).then((r) => r.data),
  },
  staff: {
    list: () => api.get("/admin/staff").then((r) => r.data),
    create: (payload) => api.post("/admin/staff", payload).then((r) => r.data),
    update: (id, payload) =>
      api.put(`/admin/staff/${id}`, payload).then((r) => r.data),
    remove: (id) => api.delete(`/admin/staff/${id}`).then((r) => r.data),
  },
  loyalty: {
    list: (params) => api.get("/admin/loyalty", { params }).then((r) => r.data),
    redemptions: () =>
      api.get("/admin/loyalty/redemptions/recent").then((r) => r.data),
    detail: (id) => api.get(`/admin/loyalty/${id}`).then((r) => r.data),
    create: (payload) => api.post("/admin/loyalty", payload).then((r) => r.data),
    update: (id, payload) =>
      api.put(`/admin/loyalty/${id}`, payload).then((r) => r.data),
    addEntry: (id, payload) =>
      api.post(`/admin/loyalty/${id}/entries`, payload).then((r) => r.data),
    remove: (id) => api.delete(`/admin/loyalty/${id}`).then((r) => r.data),
  },
  customers: {
    list: (params) =>
      api.get("/admin/customers", { params }).then((r) => r.data),
    detail: (id) => api.get(`/admin/customers/${id}`).then((r) => r.data),
    redeem: (id, payload) =>
      api.post(`/admin/customers/${id}/redeem`, payload).then((r) => r.data),
  },
  reports: (params) => api.get("/admin/reports", { params }).then((r) => r.data),
  srb: {
    status: () => api.get("/admin/srb/status").then((r) => r.data),
    test: () => api.post("/admin/srb/test").then((r) => r.data),
    submitOrder: (id) =>
      api.post(`/admin/srb/orders/${id}/submit`).then((r) => r.data),
  },
};

/** Business profile, tax, receipt and security settings. */
export const companyApi = {
  get: () => api.get("/settings/company").then((r) => r.data),
  save: (key, payload) =>
    api.put(`/settings/${key}`, payload).then((r) => r.data),
  reset: (key) => api.delete(`/settings/${key}`).then((r) => r.data),
};

export const settingsApi = {
  getPrinter: () => api.get("/settings/printer").then((r) => r.data),
  savePrinter: (payload) =>
    api.put("/settings/printer", payload).then((r) => r.data),
  resetPrinter: () =>
    api.delete("/settings/printer").then((r) => r.data),
};
