import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "src/styles/sections.css",
  "src/pages/ModulePages.css",
  "src/index.css",
  "src/pages/AdminPanel.css",
];

function bumpRem(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n <= 0.7) return "0.9375";
  if (n <= 0.78) return "1";
  if (n <= 0.86) return "1.0625";
  if (n <= 0.95) return "1.125";
  if (n <= 1.05) return "1.125";
  return String(value);
}

for (const rel of files) {
  const file = path.join(root, rel);
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  text = text.replace(/font-size:\s*(\d*\.?\d+)rem/g, (_, v) => `font-size: ${bumpRem(v)}rem`);
  text = text.replace(
    /font-size:\s*clamp\((\d*\.?\d+)rem,\s*([^,]+),\s*(\d*\.?\d+)rem\)/g,
    (_, a, mid, b) => `font-size: clamp(${bumpRem(a)}rem, ${mid}, ${bumpRem(b)}rem)`,
  );
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    console.log("updated", rel);
  } else {
    console.log("no change", rel);
  }
}
