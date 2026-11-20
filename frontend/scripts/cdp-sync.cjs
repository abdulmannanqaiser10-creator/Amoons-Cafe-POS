// Throwaway probe: does a price written through the admin API reach an already
// open till without a reload? Restores the original price afterwards.
const { spawn } = require("child_process");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9560);
const API = "http://localhost:5000/api";
const TOKEN = process.env.TOKEN || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let idSeq = 0;
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const h = pending.get(m.id);
        pending.delete(m.id);
        m.error ? h.reject(new Error(JSON.stringify(m.error))) : h.resolve(m.result);
      }
    });
    ws.addEventListener("error", () => reject(new Error("ws error")));
    ws.addEventListener("open", () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = ++idSeq;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        async evaluate(expression) {
          const r = await this.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
          return r.result.value;
        },
        close() { ws.close(); },
      })
    );
  });
}

const api = async (path, options = {}) => {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
};

const firstPrice = (page) =>
  page.evaluate(`document.querySelector('.pos-card-price')?.innerText || '(none)'`);

async function main() {
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--remote-debugging-port=" + PORT, "--no-first-run",
     "--disable-gpu", "--user-data-dir=" + process.env.TEMP + "\\cdp-sync-" + PORT,
     "about:blank"],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
    await sleep(300);
  }
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = t.find((x) => x.type === "page");
    if (!target) await sleep(300);
  }

  const page = await connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  await page.send("Page.navigate", { url: "http://localhost:5173/" });
  await sleep(2000);
  await page.evaluate(`localStorage.setItem('token', ${JSON.stringify(TOKEN)})`);
  await page.send("Page.navigate", { url: "http://localhost:5173/home" });

  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(`document.querySelectorAll('.pos-card').length`)) > 0) break;
    await sleep(400);
  }

  const before = await firstPrice(page);
  const name = await page.evaluate(`document.querySelector('.pos-card-name')?.innerText`);
  console.log("till shows:", name, "·", before);

  const catalogue = await api("/menu");
  const product = catalogue.products.find((p) => p.name === name);
  if (!product) throw new Error("product not found in /menu: " + name);

  const rows = await api("/admin/products");
  const row = (rows.products || rows).find((p) => p.id === product.id);
  if (!row) throw new Error("product not found in /admin/products");

  const originalPrice = Number(row.price);
  const probePrice = originalPrice === 111.11 ? 222.22 : 111.11;

  const payload = {
    categoryId: row.categoryId ?? product.categoryId,
    name: row.name,
    description: row.description ?? "",
    price: probePrice,
    imageUrl: row.imageUrl ?? "",
    isAvailable: row.isAvailable ?? true,
    trackStock: row.trackStock ?? false,
    unit: row.unit ?? "",
  };

  try {
    await api(`/admin/products/${product.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    console.log("api wrote price", probePrice, "— waiting for the open till");

    await page.evaluate(`window.dispatchEvent(new Event('focus'))`);

    let after = before;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      after = await firstPrice(page);
      if (after !== before) break;
    }
    console.log("till now shows:", after);
    console.log(after === after && !after.includes(String(originalPrice)) ? "SYNC OK" : "SYNC FAILED");
  } finally {
    await api(`/admin/products/${product.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...payload, price: originalPrice }),
    });
    console.log("restored price", originalPrice);
  }

  page.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
