import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/AdminPanel.css");
const text = fs.readFileSync(file, "utf8");
const start = text.indexOf("/* Sidebar ------------------------------------------------------------ */");
const end = text.indexOf("/* Main shell --------------------------------------------------------- */");
if (start < 0 || end < 0) {
  console.error("markers missing", start, end);
  process.exit(1);
}

const next = `/* Sidebar ------------------------------------------------------------ */

.ad-rail {
  position: fixed;
  z-index: 50;
  inset: 0 auto 0 0;
  display: flex;
  flex-direction: column;
  width: var(--ad-sidebar-w);
  padding: 18px 14px 16px;
  color: #fff;
  background: #4a001d;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  transition: width 200ms ease;
  box-shadow: 4px 0 24px -12px rgba(74, 0, 29, 0.45);
}

.ad-rail-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding: 0 4px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 0;
}

.ad-rail-logo {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}

.ad-rail-logo .brand-mark,
.ad-rail-logo .brand-mark-svg,
.ad-rail .brand-mark-svg {
  width: 28px;
  height: 28px;
}

.ad-rail-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.ad-rail-brand strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.0625rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.ad-rail-brand small {
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.ad-collapse-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  cursor: pointer;
  transition: background 140ms ease;
}

.ad-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.ad-collapse-btn svg {
  width: 16px;
  height: 16px;
}

.ad-nav {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.ad-nav::-webkit-scrollbar {
  width: 4px;
}

.ad-nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
}

.ad-nav-link,
.ad-rail-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  max-width: 100%;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.9875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  overflow: hidden;
  transition: background 140ms ease, color 140ms ease;
}

.ad-nav-link:hover,
.ad-rail-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.ad-nav-link--on {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  box-shadow: inset 3px 0 0 #f4a5c0;
}

.ad-nav-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  opacity: 0.92;
}

.ad-nav-icon svg,
.ad-rail-out-icon {
  width: 18px;
  height: 18px;
}

.ad-nav-label {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-rail-foot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.ad-rail-out-icon {
  flex: 0 0 auto;
}

.ad-rail-link--out {
  color: rgba(255, 220, 230, 0.92);
}

.ad-rail-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
  font-size: 0.8125rem;
  font-weight: 600;
  overflow: hidden;
}

.ad-rail-online {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ad-rail-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18);
  flex: 0 0 auto;
}

.ad-rail-version {
  color: rgba(255, 255, 255, 0.48);
  flex: 0 0 auto;
}

/* Collapsed ---------------------------------------------------------- */

.ad--collapsed .ad-rail {
  padding-left: 10px;
  padding-right: 10px;
}

.ad--collapsed .ad-rail-brand,
.ad--collapsed .ad-nav-label,
.ad--collapsed .ad-rail-version {
  display: none !important;
}

.ad--collapsed .ad-rail-head {
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding-bottom: 12px;
}

.ad--collapsed .ad-rail-logo,
.ad--collapsed .ad-collapse-btn {
  margin: 0 auto;
}

.ad--collapsed .ad-nav-link,
.ad--collapsed .ad-rail-link {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.ad--collapsed .ad-nav-link--on {
  box-shadow: none;
  background: rgba(255, 255, 255, 0.18);
}

.ad--collapsed .ad-rail-status {
  justify-content: center;
  padding: 10px 0;
}

`;

fs.writeFileSync(file, text.slice(0, start) + next + text.slice(end), "utf8");
console.log("sidebar replaced ok");
