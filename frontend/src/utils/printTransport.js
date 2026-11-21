/**
 * Direct print transport: Capacitor native TCP (Android APK) or local Windows print agent.
 * Never opens a browser print dialog.
 */

const AGENT_BASE = "http://127.0.0.1:19100";
const AGENT_TOKEN = "amoons-pos-local";

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function agentHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Amoons-Print-Token": AGENT_TOKEN,
  };
}

export async function isLocalAgentAvailable(timeoutMs = 1200) {
  if (typeof window === "undefined") return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_BASE}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeNetworkPrinter(host, port = 9100) {
  const ip = String(host || "").trim();
  if (!ip) throw new Error("Enter the printer IP address.");

  // Prefer native bridge inside the Android APK.
  if (typeof window !== "undefined" && window.AmoonsNativePrint?.probe) {
    const result = await window.AmoonsNativePrint.probe({ host: ip, port: Number(port) || 9100 });
    if (!result?.ok) {
      throw new Error(result?.message || `Printer offline at ${ip}:${port}`);
    }
    return { ok: true, target: `${ip}:${Number(port) || 9100}`, via: "native" };
  }

  const agentUp = await isLocalAgentAvailable();
  if (!agentUp) {
    throw new Error(
      "Local Print Agent is not running. Install print-agent (install.bat) on this PC, or use the Amoons Android APK."
    );
  }

  const res = await fetch(
    `${AGENT_BASE}/probe?host=${encodeURIComponent(ip)}&port=${Number(port) || 9100}`,
    { headers: agentHeaders(), cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.message || `Printer offline or unreachable at ${ip}:${Number(port) || 9100}`
    );
  }
  return { ok: true, target: data.target, via: "agent" };
}

/**
 * Send ESC/POS bytes to a network printer. Throws if offline — never fakes success.
 */
export async function printRawToNetwork({ host, port = 9100, bytes }) {
  const ip = String(host || "").trim();
  if (!ip) throw new Error("Printer IP address is not configured.");
  if (!bytes?.length) throw new Error("Empty print job.");

  if (typeof window !== "undefined" && window.AmoonsNativePrint?.print) {
    const result = await window.AmoonsNativePrint.print({
      host: ip,
      port: Number(port) || 9100,
      data: bytesToBase64(bytes),
    });
    if (!result?.ok) {
      throw new Error(result?.message || "Native print failed. Printer may be offline.");
    }
    return { ok: true, via: "native", target: `${ip}:${Number(port) || 9100}` };
  }

  const agentUp = await isLocalAgentAvailable();
  if (!agentUp) {
    throw new Error(
      "Cannot reach the Local Print Agent (127.0.0.1:19100). Start it with print-agent\\install.bat, or install the Amoons Android APK for direct printing."
    );
  }

  const res = await fetch(`${AGENT_BASE}/print`, {
    method: "POST",
    headers: agentHeaders(),
    body: JSON.stringify({
      host: ip,
      port: Number(port) || 9100,
      data: bytesToBase64(bytes),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.message ||
        (data.offline
          ? `Printer offline at ${ip}:${Number(port) || 9100}`
          : "Print failed")
    );
  }
  return { ok: true, via: "agent", target: data.target, bytes: data.bytes };
}

export function isNativePrintAvailable() {
  return Boolean(
    typeof window !== "undefined" &&
      (window.AmoonsNativePrint?.print || window.Capacitor?.isNativePlatform?.())
  );
}
