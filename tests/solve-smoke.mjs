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

  // 直壁：离顶+件高超腔深
  const v2 = {
    ...d,
    leftInset: 0,
    rightInset: 0,
    entryWidth: d.topWidth,
    leftHeight: 50,
    rightHeight: 50,
    partHeight: 48,
    topGap: 5
  };
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

// 4b) topGap < clearance（直壁吸顶）: early, clear interference message
{
  const v = {
    ...d,
    leftInset: 0,
    rightInset: 0,
    entryWidth: d.topWidth,
    topGap: 0,
    clearance: 1
  };
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

// 6) final placement: step / bridge (corner contact) / top
{
  const spaceStep = core.createSpace2D({
    ...d,
    leftInset: 20,
    rightInset: 20,
    entryWidth: 172,
    leftHeight: 50,
    rightHeight: 50,
    partHeight: 30
  });
  const pStep = spaceStep.finalPlacementPose({ length: 160, height: 30 }, { topGap: 5 });
  assert(pStep.mode === "step", "step mode");
  assert(Math.abs(pStep.deg) < 0.01, "step horizontal");
  assert(Math.abs(pStep.y - (50 - 15)) < 0.2, "bottom on step: " + pStep.y);
  assert(pStep.contactLeft && Math.abs(pStep.contactLeft.y - 50) < 0.01, "left corner on step");
  console.log("ok: step placement", pStep);

  // 不等高：斜担 + 开口对中（不再钉死左角点）
  const spaceBridge = core.createSpace2D({
    ...d,
    topWidth: 240,
    entryWidth: 200,
    leftInset: 20,
    rightInset: 20,
    leftHeight: 40,
    rightHeight: 55,
    partHeight: 20,
    partLength: 220
  });
  const partB = { length: 220, height: 20 };
  const pBridge = spaceBridge.finalPlacementPose(partB, { topGap: 5, clearance: 0 });
  const oc = 20 + 100; // 开口中心 120
  assert(pBridge.mode === "bridge", "must bridge not top/float, got " + pBridge.mode);
  assert(Math.abs(pBridge.deg) > 1, "must be tilted, deg=" + pBridge.deg);
  assert(spaceBridge.validPose(partB, pBridge, 0, true), "collision-free strict");
  assert(Math.abs(pBridge.x - oc) < 2, "center on opening, cx=" + pBridge.x + " oc=" + oc);
  assert(pBridge.contactRight.y <= 55 + 0.3, "right on/near deep step y " + pBridge.contactRight.y);
  assert(pBridge.contactRight.x >= 220 - 1, "right reaches deep ledge " + pBridge.contactRight.x);
  // 左端不应钉死在内角 (20,40)——对中后应向左空腔或台面伸展
  assert(
    Math.abs(pBridge.contactLeft.x - 20) > 2 || Math.abs(pBridge.contactLeft.y - 40) > 0.5,
    "must not pin left end to inner corner only"
  );

  // 非对称退进：开口中心随退进移动，落位跟随
  const spaceShift = core.createSpace2D({
    ...d,
    topWidth: 240,
    entryWidth: 160,
    leftInset: 50,
    rightInset: 30,
    leftHeight: 40,
    rightHeight: 55,
    partHeight: 20,
    partLength: 200
  });
  const partS = { length: 200, height: 20 };
  const pShift = spaceShift.finalPlacementPose(partS, { topGap: 5, clearance: 0 });
  const oc2 = 50 + 80; // 130
  assert(pShift.mode === "bridge", "shift bridge, got " + pShift.mode);
  assert(Math.abs(pShift.x - oc2) < 3, "shift centers on new opening " + pShift.x);
  assert(spaceShift.validPose(partS, pShift, 0, true), "shift valid");

  // 窄浅侧退进仍斜担且对中
  const spaceNarrow = core.createSpace2D({
    ...d,
    topWidth: 240,
    entryWidth: 200,
    leftInset: 10,
    rightInset: 30,
    leftHeight: 40,
    rightHeight: 55,
    partHeight: 28,
    partLength: 220
  });
  const partN = { length: 220, height: 28 };
  const pNarrow = spaceNarrow.finalPlacementPose(partN, { topGap: 5, clearance: 0 });
  const oc3 = 10 + 100; // 110
  assert(pNarrow.mode === "bridge", "narrow must bridge, got " + pNarrow.mode);
  assert(Math.abs(pNarrow.x - oc3) < 3, "narrow center " + pNarrow.x);
  assert(spaceNarrow.validPose(partN, pNarrow, 0, true), "narrow valid");
  console.log(
    "ok: bridge cx",
    pBridge.x.toFixed(1),
    "shift",
    pShift.x.toFixed(1),
    "narrow",
    pNarrow.x.toFixed(1)
  );

  // 件长不足以斜担：落矮台且对中，绝不吸顶
  const spaceShort = core.createSpace2D({
    ...d,
    topWidth: 240,
    entryWidth: 200,
    leftInset: 20,
    rightInset: 20,
    leftHeight: 40,
    rightHeight: 55,
    partHeight: 20,
    partLength: 200
  });
  const pShort = spaceShort.finalPlacementPose({ length: 200, height: 20 }, { topGap: 5 });
  assert(pShort.mode !== "top", "short must not float at ceiling, got " + pShort.mode);
  assert(Math.abs(pShort.x - 120) < 1, "short still centered " + pShort.x);
  console.log("ok: short step centered", pShort.mode, pShort.x.toFixed(1));

  const spaceTop = core.createSpace2D({
    ...d,
    leftInset: 0,
    rightInset: 0,
    entryWidth: 212,
    topGap: 1,
    partHeight: 40
  });
  const pTop = spaceTop.finalPlacementPose({ length: 180, height: 40 }, { topGap: 1 });
  assert(pTop.mode === "top", "top mode");
  assert(Math.abs(pTop.y - (1 + 20)) < 0.2, "top gap 1: " + pTop.y);
  console.log("ok: top placement", pTop);
}

console.log("\nAll smoke tests passed.");
