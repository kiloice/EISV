import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = require(join(root, "eisv-core.js"));
const core3 = require(join(root, "eisv-core3d.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const d = { ...core3.DEFAULTS };
const partOf = (v) => ({ length: v.partLength, width: v.partWidth, height: v.partHeight });

/** 路径逐段按 0.25mm / 0.25° 加密复核：端点与每段插值都不碰撞 */
function assertPathFree(space, part, path, c, label) {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)) / 0.25),
      Math.ceil(Math.max(Math.abs(b.yaw - a.yaw), Math.abs(b.tilt - a.tilt)) / 0.25)
    );
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: a.yaw + (b.yaw - a.yaw) * t,
        tilt: a.tilt + (b.tilt - a.tilt) * t
      };
      assert(space.validPose(part, p, c), `${label}: segment ${i} collides at t=${t.toFixed(3)}`);
    }
  }
}

// 1) default: V1 直入做不到（剖面最大 ~189），3D 斜入水平转向可放入
{
  const r = core3.solve(core3.buildSolveRequest(d, { keepPath: true }));
  assert(r.ok, "default should fit in 3d");
  assert(r.diagnostics.strategy === "turn", "default uses turn, got " + r.diagnostics.strategy);
  assert(r.maxLength > d.partLength, "maxLength > part: " + r.maxLength);
  const space = core3.createSpace3D(d);
  const part = partOf(d);
  assert(space.isEntryPose(part, r.path[0], 0), "path starts below the opening");
  const last = r.path[r.path.length - 1];
  for (const k of ["x", "y", "z", "tilt"]) {
    assert(Math.abs(last[k] - r.finalPose[k]) < 1e-6, `path ends at final pose (${k})`);
  }
  assert(Math.abs(((last.yaw - r.finalPose.yaw) % 180 + 180) % 180) < 1e-6, "final yaw equivalent");
  assertPathFree(space, part, r.path, 0, "default");

  const sec = core.solve(core.buildSolveRequest(core3.sectionValues(d, "x"), { keepPath: false }));
  assert(sec.maxLength < d.partLength, "2D section alone would not fit: " + sec.maxLength);
  console.log("ok: default turn, entryYaw", r.diagnostics.entryYaw, "max", r.maxLength, "2D section max", sec.maxLength);
}

// 2) 与 V1 一致：无前后退进且足够深 → 最终位姿与 2D 剖面一致、直入
{
  const v = {
    ...d,
    topDepth: 400,
    entryDepth: 400,
    frontInset: 0,
    backInset: 0,
    leftInset: 0,
    rightInset: 20,
    entryWidth: 192,
    partLength: 200,
    partWidth: 100,
    partHeight: 40
  };
  const r = core3.solve(core3.buildSolveRequest(v, { keepPath: true, estimateMax: false }));
  const r2 = core.solve(core.buildSolveRequest(core3.sectionValues(v, "x"), { keepPath: true, estimateMax: false }));
  assert(r.ok === r2.ok && r.ok, "3d and 2d agree on fit");
  assert(r.diagnostics.strategy === "direct", "v1-like uses direct");
  const p2 = core.createSpace2D(core3.sectionValues(v, "x")).finalPlacementPose({ length: 200, height: 40 }, { topGap: 5, clearance: 0 });
  assert(Math.abs(r.finalPose.x - p2.x) < 1e-9 && Math.abs(r.finalPose.y - p2.y) < 1e-9, "final pose matches 2D section");
  assert(r.finalPose.yaw === 0 && r.finalPose.mode === p2.mode, "yaw 0, same mode");
  assertPathFree(core3.createSpace3D(v), partOf(v), r.path, 0, "v1-like");
  console.log("ok: consistent with 2D section", r.finalPose.mode);
}

// 3) 太宽：转不过来 → 不可放入且给出干涉原因
{
  const v = { ...d, partWidth: 120 };
  const r = core3.solve(core3.buildSolveRequest(v, { keepPath: true, estimateMax: false }));
  assert(!r.ok, "200x120 should not fit");
  assert(r.diagnostics.firstHit && r.diagnostics.firstHit.reason, "firstHit reason");
  assert(r.path.length >= 1, "fail hint path for animation");
  console.log("ok: wide fails:", r.diagnostics.firstHit.reason);
}

// 4) validation
{
  assert(core3.validateValues({ ...d, frontInset: 110, backInset: 110 }).includes("前后退进"), "front/back sum");
  assert(core3.validateValues({ ...d, entryDepth: 100 }).includes("开口深度"), "entry depth consistency");
  assert(core3.validateValues({ ...d, frontHeight: 20 }).includes("最矮一侧"), "part taller than lowest step");
  assert(core3.validateValues({ ...d, partWidth: 0 }).includes("零件宽度"), "width > 0");
  const patch = core3.linkedInputPatch({ ...d, frontInset: 30 }, "frontInset");
  assert(patch.entryDepth === 212 - 30 - 20, "frontInset updates entryDepth: " + JSON.stringify(patch));
  const patch2 = core3.linkedInputPatch({ ...d, entryDepth: 150 }, "entryDepth");
  assert(patch2.backInset === 212 - 20 - 150, "entryDepth updates backInset");
  console.log("ok: validation and linked inputs");
}

// 5) 不等高 → bridge（倾斜、双侧支撑），有退进绝不 top
{
  const v = {
    ...d,
    topWidth: 240,
    entryWidth: 200,
    leftInset: 20,
    rightInset: 20,
    leftHeight: 40,
    rightHeight: 55,
    frontHeight: 60,
    backHeight: 60,
    partLength: 220,
    partWidth: 60,
    partHeight: 20
  };
  const space = core3.createSpace3D(v);
  const fp = space.finalPlacementPose(partOf(v), { topGap: 5, clearance: 0 });
  assert(fp.mode === "bridge" && Math.abs(fp.tilt) > 1, "bridge tilt, got " + fp.mode + " " + fp.tilt);
  assert(fp.valid && space.validPose(partOf(v), fp, 0), "bridge valid in 3d");
  assert(Math.abs(fp.x - 120) < 2, "bridge centered on opening, x=" + fp.x);
  console.log("ok: bridge", fp.x.toFixed(1), fp.tilt.toFixed(1));
}

// 6) 长于顶宽但短于顶深 → 长度沿 z（yaw 90）
{
  const v = { ...d, topDepth: 300, entryDepth: 260, partLength: 250, partWidth: 60 };
  const space = core3.createSpace3D(v);
  const fp = space.finalPlacementPose(partOf(v), { topGap: 5, clearance: 0 });
  assert(fp.valid && fp.yaw === 90, "yaw 90 when only depth fits, got " + fp.yaw);
  console.log("ok: final yaw 90", fp.mode);
}

// 7) 安装间隙：落位与路径都满足间隙
{
  const v = { ...d, clearance: 1 };
  const r = core3.solve(core3.buildSolveRequest(v, { keepPath: true, estimateMax: false }));
  const space = core3.createSpace3D(v);
  assert(space.validPose(partOf(v), r.finalPose, 1), "final pose honors clearance");
  if (r.ok) assertPathFree(space, partOf(v), r.path, 1, "clearance");
  console.log("ok: clearance", r.ok, r.diagnostics.strategy);
}

// 8) OBB–AABB 精确判定与密集采样一致
{
  let rng = 7;
  const rnd = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
  let mismatches = 0;
  for (let k = 0; k < 400; k += 1) {
    const pose = { x: rnd() * 40, y: rnd() * 40, z: rnd() * 40, yaw: rnd() * 180, tilt: -80 + rnd() * 160 };
    const part = { length: 5 + rnd() * 30, width: 5 + rnd() * 20, height: 3 + rnd() * 10 };
    const box = { min: [10, 10, 10], max: [30, 25, 28] };
    const { u, w, v } = core3.poseAxes(pose);
    const hit = core3.obbHitsAabb([pose.x, pose.y, pose.z], [u, w, v], [part.length / 2, part.width / 2, part.height / 2], box);
    let sampled = false;
    const n = 16;
    for (let a = 0; a <= n && !sampled; a += 1) {
      for (let b = 0; b <= n && !sampled; b += 1) {
        for (let c = 0; c <= n && !sampled; c += 1) {
          const la = (a / n - 0.5) * part.length;
          const lb = (b / n - 0.5) * part.width;
          const lc = (c / n - 0.5) * part.height;
          const p = [0, 1, 2].map((i) => [pose.x, pose.y, pose.z][i] + la * u[i] + lb * w[i] + lc * v[i]);
          sampled = p.every((val, i) => val > box.min[i] && val < box.max[i]);
        }
      }
    }
    if (sampled && !hit) mismatches += 1; // 采样只能证明相交；SAT 不得漏报
  }
  assert(mismatches === 0, "SAT misses sampled intersections: " + mismatches);
  console.log("ok: OBB-AABB exact");
}

// 9) 2D solve 契约：mode "3d" 在加载 3D 核心后委托
{
  const r = core.solve(core3.buildSolveRequest(d, { keepPath: false, estimateMax: false }));
  assert(r.mode === "3d" && r.ok, "core.solve delegates 3d");
  console.log("ok: core.solve delegates mode 3d");
}

// 10) 空间搜索确定性：同种子同结果，且路径无碰撞
{
  const v = { ...d, partLength: 150, partWidth: 100 };
  const space = core3.createSpace3D(v);
  const part = partOf(v);
  const fp = space.finalPlacementPose(part, { topGap: 5, clearance: 0 });
  const a = core3.internals.rrtConnect(space, part, fp, 0, 42);
  const b = core3.internals.rrtConnect(space, part, fp, 0, 42);
  assert(a && b && JSON.stringify(a) === JSON.stringify(b), "rrt deterministic");
  assert(space.isEntryPose(part, a[0], 0), "rrt path starts at entry");
  assertPathFree(space, part, core3.internals.unwrapYaw(a), 0, "rrt");
  console.log("ok: rrt deterministic, points", a.length);
}

console.log("\nAll 3D smoke tests passed.");
