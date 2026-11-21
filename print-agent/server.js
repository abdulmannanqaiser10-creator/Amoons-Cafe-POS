#!/usr/bin/env node
/**
 * Amoons Local Print Agent
 * Listens on 127.0.0.1 only. Forwards ESC/POS bytes to network printers (RAW TCP :9100).
 * Independent of the Vercel backend.
 */
"use strict";

const http = require("http");
const net = require("net");
const { URL } = require("url");

const HOST = process.env.AMOONS_PRINT_HOST || "127.0.0.1";
const PORT = Number(process.env.AMOONS_PRINT_PORT) || 19100;
const TOKEN = String(process.env.AMOONS_PRINT_TOKEN || "amoons-pos-local").trim();

const ALLOWED_ORIGINS = new Set(
  String(
    process.env.AMOONS_PRINT_ORIGINS ||
      "https://amoonssoft.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,capacitor://localhost,http://localhost"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function cors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Amoons-Print-Token"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  }
  // Same-origin / no Origin (local tools) — allow without CORS reflect
  if (!origin) return true;
  return false;
}

function authorize(req) {
  const header =
    req.headers["x-amoons-print-token"] ||
    (String(req.headers.authorization || "").startsWith("Bearer ")
      ? String(req.headers.authorization).slice(7)
      : "");
  return String(header || "").trim() === TOKEN;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function probePrinter(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok, error) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, error: error || null, target: `${host}:${port}` });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "Connection timed out"));
    socket.once("error", (err) => done(false, err.message || "Connection failed"));
    try {
      socket.connect(port, host);
    } catch (err) {
      done(false, err.message || "Connection failed");
    }
  });
}

function sendRaw(host, port, buffer, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve({ ok: true, bytes: buffer.length, target: `${host}:${port}` });
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error("Printer write timed out")));
    socket.once("error", (err) =>
      finish(new Error(err.message || "Printer connection failed"))
    );
    socket.connect(port, host, () => {
      socket.write(buffer, (writeErr) => {
        if (writeErr) return finish(writeErr);
        // Give the printer a moment to accept the buffer, then close cleanly.
        socket.end(() => finish(null));
      });
    });
  });
}

function isValidHost(host) {
  const value = String(host || "").trim();
  if (!value || value.length > 120) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((part) => {
      const n = Number(part);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  return /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(value);
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) {
    return sendJson(res, 403, { ok: false, message: "Origin not allowed" });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "amoons-print-agent",
      version: "1.0.0",
      host: HOST,
      port: PORT,
    });
  }

  if (!authorize(req) && url.pathname !== "/health") {
    return sendJson(res, 401, { ok: false, message: "Unauthorized print agent token" });
  }

  if (req.method === "GET" && url.pathname === "/probe") {
    const host = url.searchParams.get("host") || "";
    const port = Number(url.searchParams.get("port")) || 9100;
    if (!isValidHost(host) || port < 1 || port > 65535) {
      return sendJson(res, 400, { ok: false, message: "Invalid host or port" });
    }
    const result = await probePrinter(host, port);
    return sendJson(res, result.ok ? 200 : 502, result);
  }

  if (req.method === "POST" && url.pathname === "/print") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const host = String(body.host || "").trim();
      const port = Number(body.port) || 9100;
      if (!isValidHost(host) || port < 1 || port > 65535) {
        return sendJson(res, 400, { ok: false, message: "Invalid printer host or port" });
      }
      if (!body.data || typeof body.data !== "string") {
        return sendJson(res, 400, { ok: false, message: "Missing base64 print data" });
      }
      let buffer;
      try {
        buffer = Buffer.from(body.data, "base64");
      } catch {
        return sendJson(res, 400, { ok: false, message: "Invalid base64 print data" });
      }
      if (!buffer.length) {
        return sendJson(res, 400, { ok: false, message: "Empty print payload" });
      }

      const probe = await probePrinter(host, port, 2000);
      if (!probe.ok) {
        return sendJson(res, 502, {
          ok: false,
          message: `Printer offline or unreachable at ${host}:${port}. ${probe.error || ""}`.trim(),
          offline: true,
        });
      }

      const result = await sendRaw(host, port, buffer);
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        message: error.message || "Print failed",
      });
    }
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[amoons-print-agent] listening on http://${HOST}:${PORT}`);
  console.log(`[amoons-print-agent] allowed origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
