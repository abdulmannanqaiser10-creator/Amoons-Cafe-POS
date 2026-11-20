// Capture console messages + exceptions for a single route.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9444);
const URL = process.env.SHOT_URL || "http://localhost:5173/orders";
const TOKEN = process.env.TOKEN || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let idSeq = 0;
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const log = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const h = pending.get(m.id);
        pending.delete(m.id);
        m.error ? h.reject(new Error(JSON.stringify(m.error))) : h.resolve(m.result);
      } else if (m.method === "Runtime.consoleAPICalled") {
        log.push("[" + m.params.type + "] " + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        log.push("[EXCEPTION] " + (d.exception?.description || d.text));
      } else if (m.method === "Log.entryAdded") {
        log.push("[" + m.params.entry.level + "] " + m.params.entry.text);
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
        log,
        close: () => ws.close(),
      })
    );
  });
}

async function main() {
  const out = path.join(__dirname, "shots");
  fs.mkdirSync(out, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(out, "p" + PORT)}`,
    "--no-first-run", "--disable-gpu", "about:blank",
  ], { stdio: "ignore" });

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
  await page.send("Log.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: Number(process.env.VW || 1440),
    height: Number(process.env.VH || 900),
    deviceScaleFactor: 1,
    mobile: false,
  });

  if (TOKEN) {
    await page.send("Page.navigate", { url: "http://localhost:5173/" });
    await sleep(2500);
    await page.send("Runtime.evaluate", { expression: `localStorage.setItem('token', ${JSON.stringify(TOKEN)})` });
  }

  await page.send("Page.navigate", { url: URL });
  // A cold Vite dev server re-optimises dependencies on the first request, so
  // the bundle can take far longer than the default settle to appear.
  const wait = Number(process.env.WAIT || 7000);
  const deadline = Date.now() + Math.max(wait, 90000);
  for (;;) {
    await sleep(wait);
    const { result } = await page.send("Runtime.evaluate", {
      returnByValue: true,
      expression: "document.getElementById('root')?.children.length || 0",
    });
    if (Number(result.value) > 0 || Date.now() > deadline) break;
    await page.send("Page.navigate", { url: URL });
  }

  // Optional: drive one interaction before capturing, so drawers and modals
  // can be screenshotted.
  if (process.env.CLICK) {
    for (const sel of process.env.CLICK.split("||")) {
      await page.send("Runtime.evaluate", {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.click(); return !!el; })()`,
      });
      await sleep(1200);
    }
  }

  const { result } = await page.send("Runtime.evaluate", {
    returnByValue: true,
    expression: "JSON.stringify({html: document.getElementById('root')?.innerHTML.length || 0, text: (document.body.innerText||'').slice(0,300), overlay: !!document.querySelector('vite-error-overlay')})",
  });

  console.log("DOM:", result.value);
  console.log("CONSOLE:\n" + (page.log.join("\n") || "(none)"));

  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(out, "debug-" + URL.split("/").pop() + ".png"), Buffer.from(data, "base64"));

  page.close();
  chrome.kill();
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
