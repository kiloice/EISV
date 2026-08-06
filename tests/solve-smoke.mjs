import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const core = require(join(dirname(fileURLToPath(import.meta.url)), "..", "eisv-core.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const d = { ...core.DEFAULTS };

// 1) default fits
{
  const r = core.solve(core.buildSolveRequest(d, { keepPath: true }));
  assert(r.ok, "default should fit");
  assert(r.path.length > 2, "default path should have points");
  assert(r.maxLength != null && r.maxLength >= d.partLength, "maxLength >= part");
  assert(r.diagnostics.margin != null && r.diagnostics.margin >= 0, "margin >= 0");
  assert(r.path[r.path.length - 1].x != null, "pose uses x not cx");
  console.log("ok: default fit, maxLength=", r.maxLength, "margin=", r.diagnostics.margin);
}

// 2) too long fails
{
  const v = { ...d, partLength: 250 };
  const r = core.solve(core.buildSolveRequest(v, { keepPath: true }));
  assert(!r.ok, "250 length should not fit");
  assert(r.path.length >= 1, "fail path for animation");
  assert(r.diagnostics.firstHit, "firstHit present");
  console.log("ok: long fail, hit=", r.diagnostics.firstHit.reason);
}

// 3) height+topGap validation
{
  const v = { ...d, leftHeight: 30, rightHeight: 30, partHeight: 40, topGap: 5 };
  const err = core.validateValues(v);
  assert(err.includes("离顶") || err.includes("高度"), "height validation: " + err);
  const r = core.solve(core.buildSolveRequest(v, { keepPath: true }));
  assert(!r.ok && r.error, "solve returns error");
  console.log("ok: early height error:", r.error);

  const v2 = { ...d, leftHeight: 50, rightHeight: 50, partHeight: 48, topGap: 5 };
  const err2 = core.validateValues(v2);
  assert(err2.includes("离顶") || err2.includes("之和"), "topGap sum validation: " + err2);
  console.log("ok: early topGap+height error:", err2);
}

// 4) clearance tightens (topGap must cover clearance)
{
  const base = core.solve(core.buildSolveRequest(d, { keepPath: false }));
  const tight = core.solve(
    core.buildSolveRequest({ ...d, clearance: 2, topGap: 5 }, { keepPath: false })
  );
  assert(base.maxLength != null && tight.maxLength != null, "both max");
  assert(tight.maxLength <= base.maxLength + 0.05, "clearance reduces or equals max");
  console.log("ok: clearance", base.maxLength, "->", tight.maxLength);
}

// 4b) topGap < clearance: early, clear interference message (not「越过顶部边界」)
{
  const v = { ...d, topGap: 0, clearance: 1 };
  const err = core.validateValues(v);
  assert(err.includes("离顶") && err.includes("安装间隙"), "top/clearance msg: " + err);
  assert(!err.includes("越过顶部"), "must not say crossing top");
  const r = core.solve(core.buildSolveRequest(v, { keepPath: true }));
  assert(!r.ok && r.error && r.error.includes("互相干涉"), "solve error: " + r.error);
  console.log("ok: topGap/clearance interference:", r.error.slice(0, 40) + "…");
}

// 5) valuesForDraw does not snap all to defaults on one bad field
{
  const drawn = core.valuesForDraw({ ...d, topWidth: -1, partLength: 180 });
  assert(drawn.partLength === 180, "keeps good partLength");
  assert(drawn.topWidth === d.topWidth, "bad topWidth falls back field-only");
  console.log("ok: valuesForDraw field-local fallback");
}

console.log("\nAll smoke tests passed.");
