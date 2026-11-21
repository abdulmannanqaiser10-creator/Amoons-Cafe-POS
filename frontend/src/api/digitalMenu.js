import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 30000,
});

const TOKEN_KEY = "amoons.digital-menu.customer";

export function getCustomerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setCustomerToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function parseTableFromPath(pathname = "") {
  const match = String(pathname).match(/Digitalmenu-t(\d+)/i);
  const n = match ? Number(match[1]) : 0;
  return n >= 1 && n <= 4 ? n : 1;
}

export const digitalMenuApi = {
  async catalogue(tableNumber) {
    const { data } = await api.get("/digital-menu/catalogue", {
      params: { table: tableNumber },
    });
    return data;
  },

  async register({ name, phone }) {
    const { data } = await api.post("/digital-menu/customer/register", {
      name,
      phone,
    });
    if (data?.token) setCustomerToken(data.token);
    return data;
  },

  async me() {
    const token = getCustomerToken();
    if (!token) return null;
    const { data } = await api.get("/digital-menu/customer/me", {
      headers: { "x-customer-token": token },
    });
    return data;
  },

  async placeOrder(payload) {
    const token = getCustomerToken();
    const headers = token ? { "x-customer-token": token } : {};
    const { data } = await api.post("/digital-menu/orders", payload, { headers });
    return data;
  },
};

export function money(value) {
  return `Rs ${(Number(value) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
