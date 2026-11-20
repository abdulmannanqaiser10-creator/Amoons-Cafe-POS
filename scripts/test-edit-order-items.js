/**
 * Verifies edit-order keeps newly added lines on save + fetch.
 * Usage: node scripts/test-edit-order-items.js
 */
const API = process.env.VITE_API_URL || process.env.API_URL || "https://amoonssoft.vercel.app/api";

async function req(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `${method} ${path} → ${response.status}`);
  }
  return data;
}

async function main() {
  const pin = process.env.TEST_PIN || "24680";
  const login = await req("/auth/login", { method: "POST", body: { pin } });
  const token = login.token;
  if (!token) throw new Error("Login failed — no token");

  const menu = await req("/menu", { token });
  const products = (menu.products || []).filter((p) => p.canSell !== false);
  if (products.length < 2) throw new Error("Need at least 2 sellable products");

  const [a, b] = products;
  const created = await req("/orders", {
    method: "POST",
    token,
    body: {
      channel: "Dine-In",
      paymentMethod: "Cash",
      amountPaid: 0,
      items: [{ productId: a.id, quantity: 1 }],
    },
  });
  const order = created.order || created;
  console.log("created", order.orderNumber, "items", (order.items || []).length);

  const updated = await req(`/orders/${order.id}`, {
    method: "PUT",
    token,
    body: {
      channel: order.channel || "Dine-In",
      paymentMethod: order.paymentMethod || "Cash",
      amountPaid: 0,
      items: [
        { productId: a.id, quantity: 1 },
        { productId: b.id, quantity: 2 },
      ],
    },
  });
  const after = updated.order || updated;
  const fetched = await req(`/orders/${order.id}`, { token });
  const fresh = fetched.order || fetched;

  const count = (fresh.items || []).length;
  const qty = (fresh.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  console.log("updated response items", (after.items || []).length);
  console.log("fetched items", count, "qty", qty, "total", fresh.total);

  if (count < 2) throw new Error(`Expected 2 lines after edit, got ${count}`);
  if (qty < 3) throw new Error(`Expected quantity >= 3 after edit, got ${qty}`);
  console.log("OK — edit order retains newly added items");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
