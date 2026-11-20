// Throwaway CDP harness: drive headless Chrome, seed the session token,
// then screenshot each POS route at a chosen viewport and report overflow.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9333);
const OUT = process.env.SHOT_DIR || path.join(__dirname, "shots");
const W = Number(process.env.VW || 1440);
const H = Number(process.env.VH || 900);
const TOKEN = process.env.TOKEN || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(300);
  }
  throw new Error("CDP endpoint never came up");
}

let idSeq = 0;

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const h = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? h.reject(new Error(JSON.stringify(msg.error))) : h.resolve(msg.result);
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
        close: () => ws.close(),
      })
    );
  });
}

const PROBE = `(() => {
  const d = document.documentElement;
  const boxes = {};
  for (const sel of ['.pos-grid','.pos-card','.pos-nav','.pos-toolbar','.pos-order-btn',
                     '.login-keypad','.login-key','.login-shell','.ord','.om-table','.ad-rail','.admin-shell']) {
    const el = document.querySelector(sel);
    if (el) { const r = el.getBoundingClientRect();
      boxes[sel] = { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; }
  }
  const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
  return JSON.stringify({
    route: location.pathname,
    viewport: [innerWidth, innerHeight],
    docScroll: [d.scrollWidth, d.scrollHeight],
    overflowX: d.scrollWidth - d.clientWidth,
    overflowY: d.scrollHeight - d.clientHeight,
    boxes,
    keyFont: cs('.login-key','fontSize'),
    keyW: cs('.login-key','width'),
    keyH: cs('.login-key','height'),
    gridCols: cs('.pos-grid','gridTemplateColumns'),
    navH: cs('.pos-nav','height'),
    title: document.querySelector('h1,h2') && document.querySelector('h1,h2').textContent.trim().slice(0,40)
  });
})()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${path.join(OUT, "profile-" + PORT)}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await waitForJson(`http://127.0.0.1:${PORT}/json/version`);

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = targets.find((t) => t.type === "page");
    if (!target) await sleep(300);
  }
  if (!target) throw new Error("no page target");

  const page = await connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Poll until the root markup stops changing AND the loading skeletons are
  // gone, so we never capture the skeleton state as if it were the page.
  const READY =
    "(() => { const r = document.getElementById('root');" +
    " return JSON.stringify({ len: r ? r.innerHTML.length : 0," +
    " busy: document.querySelectorAll('.om-skeleton, [aria-busy=true]').length }); })()";

  const settle = async (maxMs = 25000) => {
    let last = -1;
    let stable = 0;
    let snap = { len: 0, busy: 1 };
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const { result } = await page.send("Runtime.evaluate", {
        returnByValue: true,
        expression: READY,
      });
      snap = JSON.parse(result.value);
      const ready = snap.len > 2000 && snap.busy === 0;
      if (ready && snap.len === last) {
        if (++stable >= 3) break;
      } else {
        stable = 0;
      }
      last = snap.len;
      await sleep(400);
    }
    await sleep(700);
    return snap.len;
  };

  const arm = async () => {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // Headless only paints a surface it considers visible.
    await page.send("Emulation.setVisibleFocus", { enabled: true }).catch(() => {});
    await page.send("Page.bringToFront").catch(() => {});
  };

  const goto = async (url) => {
    await page.send("Page.navigate", { url });
    await sleep(1400);
    await arm();
    let len = await settle();
    if (len < 2000) {
      // A navigation that landed during a reload leaves an empty root; retry.
      await page.send("Page.navigate", { url });
      await sleep(1400);
      await arm();
      len = await settle();
    }
    console.log("   settled", url.replace("http://localhost:5173", ""), "html=" + len);
  };

  const shot = async (name) => {
    await arm();
    const { data } = await page.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT, `${W}x${H}-${name}.png`), Buffer.from(data, "base64"));
  };

  const probe = async (name) => {
    const { result } = await page.send("Runtime.evaluate", {
      returnByValue: true,
      expression: PROBE,
    });
    let parsed = result.value;
    try { parsed = JSON.parse(result.value); } catch { parsed = { error: result.exceptionDetails && result.exceptionDetails.text }; }
    fs.writeFileSync(path.join(OUT, `${W}x${H}-${name}.json`), JSON.stringify(parsed, null, 2));
    console.log(`${W}x${H} ${name} saved`);
  };

  await goto("http://localhost:5173/");
  await shot("01-login");
  await probe("01-login");

  if (TOKEN) {
    await page.send("Runtime.evaluate", {
      expression: `localStorage.setItem('token', ${JSON.stringify(TOKEN)})`,
    });

    for (const [route, name] of [
      ["/home", "02-home"],
      ["/orders", "03-orders"],
      ["/reversals", "04-reversals"],
      ["/shifts", "05-shifts"],
      ["/settings", "06-settings"],
      ["/help", "07-help"],
      ["/admin", "08-admin"],
      ["/admin/menu", "09-admin-menu"],
    ]) {
      await goto("http://localhost:5173" + route);
      await shot(name);
      await probe(name);
    }
  }

  page.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
