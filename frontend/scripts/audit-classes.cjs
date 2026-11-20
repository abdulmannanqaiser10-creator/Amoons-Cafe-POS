const fs = require("fs");
const path = require("path");

const prefix = process.argv[2] || "ad-";
const pat = new RegExp(`["'\` ](${prefix}[a-z0-9-]+)`, "g");

const root = path.join(__dirname, "..", "src");
const used = new Set();
const defined = new Set();

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    if (/\.(jsx|js)$/.test(entry)) {
      for (const m of text.matchAll(pat)) used.add(m[1]);
    }
    if (/\.css$/.test(entry)) {
      for (const m of text.matchAll(/\.((?:[a-z0-9-]*\s+)*[a-z0-9-]+)/g)) {
        m[1].split(/\s+/).forEach((c) => defined.add(c));
      }
    }
  }
}

walk(root);

const missing = [...used].filter((c) => !defined.has(c)).sort();
console.log("used:", used.size, "defined:", defined.size);
console.log("--- ALL USED ---");
console.log([...used].sort().join("\n"));
console.log("--- MISSING ---");
console.log(missing.join("\n"));
