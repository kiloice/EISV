/**
 * Assemble the single-file deliverables from modular sources.
 * Users only need the HTML files; this script is for maintainers.
 *
 *   EISV_1.0.html  ← src/template.html   + eisv-core.js + eisv-app.js           (2D, v1.x)
 *   EISV_2.0.html  ← src/template3d.html + eisv-core.js + eisv-core3d.js + eisv-app3d.js (3D, v2.x)
 *
 *   node scripts/assemble.mjs          # write both HTML files
 *   node scripts/assemble.mjs --check  # exit 1 if either HTML file is out of date
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (name) => readFileSync(join(root, name), "utf8");

const sources = {
  core: read("eisv-core.js"),
  app: read("eisv-app.js"),
  core3d: read("eisv-core3d.js"),
  app3d: read("eisv-app3d.js")
};
for (const [name, source] of Object.entries(sources)) {
  if (/<\/script/i.test(source)) {
    throw new Error(`${name} contains "</script", which would break the inlined page`);
  }
}
const baseCss = read("src/base.css");
// 版本号唯一来源：各自核心的 meta.version
const version2d = require(join(root, "eisv-core.js")).meta.version;
const version3d = require(join(root, "eisv-core3d.js")).meta.version;

const targets = [
  {
    out: "EISV_1.0.html",
    template: "src/template.html",
    slots: { VERSION: version2d, BASE_CSS: baseCss, CORE: sources.core, APP: sources.app }
  },
  {
    out: "EISV_2.0.html",
    template: "src/template3d.html",
    slots: { VERSION: version3d, BASE_CSS: baseCss, CORE: sources.core, CORE3D: sources.core3d, APP: sources.app3d }
  }
];

const check = process.argv.includes("--check");
let stale = false;
for (const target of targets) {
  const html = read(target.template).replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in target.slots)) throw new Error(`${target.template}: unknown slot ${match}`);
    return target.slots[key];
  });
  const out = join(root, target.out);
  const version = target.slots.VERSION;
  if (check) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (current !== html) {
      console.error(`${target.out} is out of date; run: node scripts/assemble.mjs`);
      stale = true;
    } else {
      console.log(`${target.out} is up to date (v${version})`);
    }
  } else {
    writeFileSync(out, html);
    console.log("Wrote", out, `(${Buffer.byteLength(html)} bytes, v${version})`);
  }
}
if (stale) process.exit(1);
