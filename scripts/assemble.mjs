/**
 * Assemble single-file EISV_1.0.html from modular sources.
 * Users only need the HTML; this script is for maintainers.
 *
 *   node scripts/assemble.mjs          # write EISV_1.0.html
 *   node scripts/assemble.mjs --check  # exit 1 if EISV_1.0.html is out of date
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (name) => readFileSync(join(root, name), "utf8");

const core = read("eisv-core.js");
const app = read("eisv-app.js");
const template = read("src/template.html");
// 版本号唯一来源：eisv-core.js 的 meta.version
const version = require(join(root, "eisv-core.js")).meta.version;

for (const [name, source] of [["eisv-core.js", core], ["eisv-app.js", app]]) {
  if (/<\/script/i.test(source)) {
    throw new Error(`${name} contains "</script", which would break the inlined page`);
  }
}

const slots = { VERSION: version, CORE: core, APP: app };
const html = template.replace(/\{\{(VERSION|CORE|APP)\}\}/g, (_, key) => slots[key]);

const out = join(root, "EISV_1.0.html");
if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== html) {
    console.error("EISV_1.0.html is out of date; run: node scripts/assemble.mjs");
    process.exit(1);
  }
  console.log("EISV_1.0.html is up to date (v" + version + ")");
} else {
  writeFileSync(out, html);
  console.log("Wrote", out, `(${Buffer.byteLength(html)} bytes, v${version})`);
}
