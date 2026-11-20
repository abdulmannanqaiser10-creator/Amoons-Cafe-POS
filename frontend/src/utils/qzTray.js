import qz from "qz-tray";

let connectPromise = null;
let securityReady = false;

function apiBase() {
  if (typeof window === "undefined") return "";
  return "";
}

/**
 * Optional certificate + signature from the backend for fully silent QZ prints.
 * When unavailable, QZ Tray still works after the operator allows this site once.
 */
async function ensureSecurity() {
  if (securityReady) return;
  securityReady = true;

  try {
    const certRes = await fetch(`${apiBase()}/api/qz/certificate`, {
      cache: "no-store",
    });
    if (!certRes.ok) return;
    const certificate = await certRes.text();
    if (!certificate || !/BEGIN CERTIFICATE/.test(certificate)) return;

    // Probe signing once so we never enable a half-configured security mode.
    const probe = await fetch(`${apiBase()}/api/qz/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "qz-probe" }),
    });
    if (!probe.ok) return;

    qz.security.setCertificatePromise((resolve) => resolve(certificate));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
      fetch(`${apiBase()}/api/qz/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: toSign }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("QZ sign failed");
          const data = await res.json();
          resolve(data.signature);
        })
        .catch(reject);
    });
  } catch {
    // Unsigned mode — QZ may prompt once to allow this site.
  }
}

export async function isQzAvailable(timeoutMs = 2500) {
  if (typeof window === "undefined") return false;
  try {
    await ensureConnected(timeoutMs);
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

async function ensureConnected(timeoutMs = 8000) {
  await ensureSecurity();

  if (qz.websocket.isActive()) return;

  if (!connectPromise) {
    connectPromise = Promise.race([
      qz.websocket.connect(),
      new Promise((_, reject) =>
        window.setTimeout(
          () => reject(new Error("QZ Tray is not running or not reachable.")),
          timeoutMs
        )
      ),
    ])
      .catch((error) => {
        connectPromise = null;
        throw error;
      })
      .then(() => {
        /* keep connection open for subsequent tickets */
      });
  }

  await connectPromise;
}

function resolvePrinterName(preferred) {
  const name = String(preferred || "").trim();
  if (!name) return null;
  const blocked = /microsoft print to pdf|onenote|fax|xps document|send to onenote/i;
  if (blocked.test(name)) return null;
  return name;
}

async function findTargetPrinter(preferredName) {
  const preferred = resolvePrinterName(preferredName);

  try {
    if (preferred) {
      const found = await qz.printers.find(preferred);
      if (found) return Array.isArray(found) ? found[0] : found;
    }
  } catch {
    /* fall through to default */
  }

  try {
    const def = await qz.printers.getDefault();
    if (def && !/microsoft print to pdf|onenote|fax|xps document/i.test(def)) {
      return def;
    }
  } catch {
    /* ignore */
  }

  const printers = await qz.printers.find();
  const list = Array.isArray(printers) ? printers : printers ? [printers] : [];
  const physical = list.find(
    (item) => !/microsoft print to pdf|onenote|fax|xps document|send to onenote/i.test(item)
  );
  if (physical) return physical;
  if (list[0]) return list[0];
  throw new Error("No printers found in QZ Tray.");
}

/**
 * Silent pixel HTML print through QZ Tray (no Chrome print dialog).
 */
export async function printHtmlViaQz({
  html,
  printerName,
  paperWidthMm = 80,
  copies = 1,
}) {
  await ensureConnected();

  const printer = await findTargetPrinter(printerName);
  const widthIn = Number(paperWidthMm) === 58 ? 2.28 : 3.15;
  const count = Math.min(Math.max(Math.trunc(Number(copies)) || 1, 1), 5);

  const config = qz.configs.create(printer, {
    forceRaw: false,
    scaleContent: true,
    rasterize: true,
    interpolation: "nearest-neighbor",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    units: "in",
    size: { width: widthIn },
    copies: count,
  });

  const data = [
    {
      type: "pixel",
      format: "html",
      flavor: "plain",
      data: html,
      options: {
        pageWidth: widthIn,
      },
    },
  ];

  await qz.print(config, data);
  return { printer, copies: count };
}

export async function listQzPrinters() {
  await ensureConnected();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : printers ? [printers] : [];
}
