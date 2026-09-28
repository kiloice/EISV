/**
 * EISV 3D core (V2) — no DOM. Depends on EISV_CORE (2D core) for the
 * section-based final placement, BFS path search and shared helpers.
 *
 * Coordinates: x = 宽（左→右），z = 深（前→后），y = 自腔顶向下为正（与 2D 一致）。
 * Pose3D: { x, y, z, yaw, tilt }（度）。
 *   yaw  = 零件长度方向在水平面内相对 +x 的转角（绕竖直轴，0 → 沿 x，90 → 沿 z）
 *   tilt = 长度方向绕零件宽度轴的倾角（与 2D 的 deg 同号：正值时沿长度方向向下）
 * Part3D: { length, width, height }
 *
 * 详见 docs/3d.md。
 */
(function (global) {
  "use strict";

  const C2 =
    global.EISV_CORE || (typeof require === "function" ? require("./eisv-core.js") : null);
  if (!C2) throw new Error("EISV_CORE (2D core) must be loaded before eisv-core3d.js");

  const meta = {
    version: "2.0.0",
    mode: "3d"
  };

  const DEG = Math.PI / 180;
  const EPS = 0.001;
  const FAR = 1e5;

  const DEFAULTS = {
    topWidth: 212,
    topDepth: 212,
    entryWidth: 172,
    entryDepth: 172,
    leftInset: 20,
    rightInset: 20,
    frontInset: 20,
    backInset: 20,
    leftHeight: 50,
    rightHeight: 50,
    frontHeight: 50,
    backHeight: 50,
    leftOuterRadius: 0,
    leftInnerRadius: 0,
    rightOuterRadius: 0,
    rightInnerRadius: 0,
    partLength: 200,
    partWidth: 60,
    partHeight: 30,
    topGap: 5,
    clearance: 0
  };

  const SIDES = [
    { key: "left", inset: "leftInset", height: "leftHeight", label: "左" },
    { key: "right", inset: "rightInset", height: "rightHeight", label: "右" },
    { key: "front", inset: "frontInset", height: "frontHeight", label: "前" },
    { key: "back", inset: "backInset", height: "backHeight", label: "后" }
  ];

  function validateValues(values) {
    const positive = [
      ["顶部净宽", values.topWidth],
      ["顶部净深", values.topDepth],
      ["开口宽度", values.entryWidth],
      ["开口深度", values.entryDepth],
      ["左侧空腔高度", values.leftHeight],
      ["右侧空腔高度", values.rightHeight],
      ["前侧空腔高度", values.frontHeight],
      ["后侧空腔高度", values.backHeight],
      ["零件长度", values.partLength],
      ["零件宽度", values.partWidth],
      ["零件高度", values.partHeight]
    ];
    for (const [label, value] of positive) {
      if (!Number.isFinite(value) || value <= 0) return `${label}必须大于 0。`;
    }
    const nonNegative = [
      ["左侧退进", values.leftInset],
      ["右侧退进", values.rightInset],
      ["前侧退进", values.frontInset],
      ["后侧退进", values.backInset],
      ["左外角圆角半径", values.leftOuterRadius],
      ["左内角圆角半径", values.leftInnerRadius],
      ["右外角圆角半径", values.rightOuterRadius],
      ["右内角圆角半径", values.rightInnerRadius],
      ["离顶距离", values.topGap],
      ["安装间隙", values.clearance]
    ];
    for (const [label, value] of nonNegative) {
      if (!Number.isFinite(value) || value < 0) return `${label}不能小于 0。`;
    }
    if (values.leftInset + values.rightInset >= values.topWidth) {
      return "左右退进之和必须小于顶部净宽。";
    }
    if (values.frontInset + values.backInset >= values.topDepth) {
      return "前后退进之和必须小于顶部净深。";
    }
    if (values.leftOuterRadius + values.leftInnerRadius > values.leftInset) {
      return "左内外圆角半径之和不能大于左侧退进。";
    }
    if (values.rightOuterRadius + values.rightInnerRadius > values.rightInset) {
      return "右内外圆角半径之和不能大于右侧退进。";
    }
    if (values.leftOuterRadius > values.leftHeight) {
      return "左外角圆角半径不能大于左侧空腔高度。";
    }
    if (values.rightOuterRadius > values.rightHeight) {
      return "右外角圆角半径不能大于右侧空腔高度。";
    }
    if (Math.abs(values.entryWidth - (values.topWidth - values.leftInset - values.rightInset)) > 0.01) {
      return "开口宽度应等于顶部净宽减左、右退进。";
    }
    if (Math.abs(values.entryDepth - (values.topDepth - values.frontInset - values.backInset)) > 0.01) {
      return "开口深度应等于顶部净深减前、后退进。";
    }
    const heights = SIDES.map((s) => values[s.height]);
    const cavityMaxH = Math.max(...heights);
    if (values.partHeight > cavityMaxH) {
      return "零件高度大于空腔最大高度，无法放入。";
    }
    const insetHeights = SIDES.filter((s) => values[s.inset] > EPS).map((s) => values[s.height]);
    if (insetHeights.length) {
      if (values.partHeight > Math.min(...insetHeights) + EPS) {
        return "零件高度大于最矮一侧退台高度，无法落在退台上。";
      }
    } else if (values.topGap + values.partHeight > cavityMaxH + EPS) {
      return "零件高度与离顶距离之和超过空腔高度，无法水平放到顶部。";
    }
    if (!insetHeights.length && values.clearance > 0 && values.topGap + EPS < values.clearance) {
      return "离顶距离与安装间隙互相干涉：最终位姿下零件上表面到顶壁的空隙为离顶距离，须不小于安装间隙。请增大离顶距离，或减小安装间隙。";
    }
    if (Object.values(values).some((value) => Number.isFinite(value) && value > 800)) {
      return "单项尺寸建议不超过 800mm；此工具为浏览器内近似验证。";
    }
    return "";
  }

  /** 仅用于绘图的参数清洗：逐项回退，宽度方向与深度方向分别复用 2D 规则 */
  function valuesForDraw(values) {
    const x = C2.valuesForDraw(values);
    const z = C2.valuesForDraw({
      topWidth: values.topDepth,
      leftInset: values.frontInset,
      rightInset: values.backInset,
      leftHeight: values.frontHeight,
      rightHeight: values.backHeight,
      partLength: values.partWidth,
      partHeight: values.partHeight,
      topGap: values.topGap,
      clearance: values.clearance
    });
    return {
      ...x,
      topDepth: z.topWidth,
      entryDepth: z.entryWidth,
      frontInset: z.leftInset,
      backInset: z.rightInset,
      frontHeight: z.leftHeight,
      backHeight: z.rightHeight,
      partWidth: Number.isFinite(values.partWidth) && values.partWidth > 0 ? Math.min(values.partWidth, 800) : DEFAULTS.partWidth
    };
  }

  /** 联动：宽度方向同 2D（开口宽 ↔ 右退进），深度方向对应（开口深 ↔ 后退进） */
  function linkedInputPatch(values, changedKey) {
    const widthKeys = { topWidth: 1, entryWidth: 1, leftInset: 1, rightInset: 1 };
    const depthMap = {
      topDepth: "topWidth",
      entryDepth: "entryWidth",
      frontInset: "leftInset",
      backInset: "rightInset"
    };
    if (widthKeys[changedKey]) return C2.linkedInputPatch(values, changedKey);
    if (!depthMap[changedKey]) return {};
    const patch = C2.linkedInputPatch(
      {
        topWidth: values.topDepth,
        entryWidth: values.entryDepth,
        leftInset: values.frontInset,
        rightInset: values.backInset
      },
      depthMap[changedKey]
    );
    const out = {};
    if ("rightInset" in patch) out.backInset = patch.rightInset;
    if ("entryWidth" in patch) out.entryDepth = patch.entryWidth;
    return out;
  }

  /** 沿长度方向的 2D 剖面参数（axis "x"：左右剖面；"z"：前后剖面） */
  function sectionValues(values, axis) {
    const common = {
      partLength: values.partLength,
      partHeight: values.partHeight,
      topGap: values.topGap,
      clearance: values.clearance || 0
    };
    if (axis === "x") {
      return {
        ...common,
        topWidth: values.topWidth,
        entryWidth: values.topWidth - values.leftInset - values.rightInset,
        leftInset: values.leftInset,
        rightInset: values.rightInset,
        leftHeight: values.leftHeight,
        rightHeight: values.rightHeight,
        leftOuterRadius: values.leftOuterRadius,
        leftInnerRadius: values.leftInnerRadius,
        rightOuterRadius: values.rightOuterRadius,
        rightInnerRadius: values.rightInnerRadius
      };
    }
    return {
      ...common,
      topWidth: values.topDepth,
      entryWidth: values.topDepth - values.frontInset - values.backInset,
      leftInset: values.frontInset,
      rightInset: values.backInset,
      leftHeight: values.frontHeight,
      rightHeight: values.backHeight,
      leftOuterRadius: 0,
      leftInnerRadius: 0,
      rightOuterRadius: 0,
      rightInnerRadius: 0
    };
  }

  function deriveGeom(values) {
    const heights = SIDES.map((s) => values[s.height]);
    const maxH = Math.max(...heights);
    const insetHeights = SIDES.filter((s) => values[s.inset] > EPS).map((s) => values[s.height]);
    const W = values.topWidth;
    const D = values.topDepth;
    const yMax = maxH + Math.max((values.topGap + values.partHeight) * 3, Math.max(W, D) * 0.55, 90);
    const maxDim = Math.max(W, D, values.partLength, values.partWidth, yMax);
    const grid = Math.max(1, Math.ceil(maxDim / 160));
    return {
      topWidth: W,
      topDepth: D,
      leftInset: values.leftInset,
      rightInset: values.rightInset,
      frontInset: values.frontInset,
      backInset: values.backInset,
      entryLeft: values.leftInset,
      entryRight: W - values.rightInset,
      entryFront: values.frontInset,
      entryBack: D - values.backInset,
      entryWidth: W - values.leftInset - values.rightInset,
      entryDepth: D - values.frontInset - values.backInset,
      leftHeight: values.leftHeight,
      rightHeight: values.rightHeight,
      frontHeight: values.frontHeight,
      backHeight: values.backHeight,
      leftOuterRadius: values.leftOuterRadius,
      leftInnerRadius: values.leftInnerRadius,
      rightOuterRadius: values.rightOuterRadius,
      rightInnerRadius: values.rightInnerRadius,
      maxHeight: maxH,
      /** 顶部整区（完整 W×D 截面）底面：有退进各侧台顶的最小值；四边无退进时为 ∞ */
      stageHeight: insetHeights.length ? Math.min(...insetHeights) : Infinity,
      topGap: values.topGap,
      yMax,
      grid,
      angleStep: 2,
      yawStep: 5,
      minAngle: -88,
      maxAngle: 88
    };
  }

  /** 零件局部轴（世界坐标）：u 长度、w 宽度（恒水平）、v 高度 */
  function poseAxes(pose) {
    const cy = Math.cos(pose.yaw * DEG);
    const sy = Math.sin(pose.yaw * DEG);
    const ct = Math.cos(pose.tilt * DEG);
    const st = Math.sin(pose.tilt * DEG);
    return {
      u: [ct * cy, st, ct * sy],
      w: [-sy, 0, cy],
      v: [-st * cy, ct, -st * sy]
    };
  }

  function poseCorners(part, pose) {
    const { u, w, v } = poseAxes(pose);
    const a = part.length / 2;
    const b = part.width / 2;
    const h = part.height / 2;
    const out = [];
    for (const su of [-1, 1]) {
      for (const sw of [-1, 1]) {
        for (const sv of [-1, 1]) {
          out.push([
            pose.x + su * a * u[0] + sw * b * w[0] + sv * h * v[0],
            pose.y + su * a * u[1] + sw * b * w[1] + sv * h * v[1],
            pose.z + su * a * u[2] + sw * b * w[2] + sv * h * v[2]
          ]);
        }
      }
    }
    return out;
  }

  /**
   * OBB（中心 c、轴 B[3]、半长 e[3]）与 AABB（min/max）是否相交：分离轴定理 15 轴。
   * 相切视为不相交（调用方已把零件内缩 EPS）。
   */
  function obbHitsAabb(c, B, e, box) {
    const be = [
      (box.max[0] - box.min[0]) / 2,
      (box.max[1] - box.min[1]) / 2,
      (box.max[2] - box.min[2]) / 2
    ];
    const T = [
      (box.max[0] + box.min[0]) / 2 - c[0],
      (box.max[1] + box.min[1]) / 2 - c[1],
      (box.max[2] + box.min[2]) / 2 - c[2]
    ];
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        R[i][j] = B[j][i];
        A[i][j] = Math.abs(R[i][j]) + 1e-9;
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const rb = e[0] * A[i][0] + e[1] * A[i][1] + e[2] * A[i][2];
      if (Math.abs(T[i]) > be[i] + rb) return false;
    }
    for (let j = 0; j < 3; j += 1) {
      const ra = be[0] * A[0][j] + be[1] * A[1][j] + be[2] * A[2][j];
      const t = T[0] * R[0][j] + T[1] * R[1][j] + T[2] * R[2][j];
      if (Math.abs(t) > ra + e[j]) return false;
    }
    for (let i = 0; i < 3; i += 1) {
      const i1 = (i + 1) % 3;
      const i2 = (i + 2) % 3;
      for (let j = 0; j < 3; j += 1) {
        const j1 = (j + 1) % 3;
        const j2 = (j + 2) % 3;
        const ra = be[i1] * A[i2][j] + be[i2] * A[i1][j];
        const rb = e[j1] * A[i][j2] + e[j2] * A[i][j1];
        const t = T[i2] * R[i1][j] - T[i1] * R[i2][j];
        if (Math.abs(t) > ra + rb) return false;
      }
    }
    return true;
  }

  function createSpace3D(values) {
    const geom = deriveGeom(values);
    const secX = C2.createSpace2D(sectionValues(values, "x"));
    const blockCache = new Map();

    function slabs(y0, y1, r) {
      const n = Math.max(4, Math.min(24, Math.ceil(r / 0.5)));
      const out = [];
      for (let i = 0; i < n; i += 1) out.push([y0 + ((y1 - y0) * i) / n, y0 + ((y1 - y0) * (i + 1)) / n]);
      return out;
    }

    /**
     * 实体块（按安装间隙 c 偏移）：退台块在水平方向向开口侧外扩 c，台顶不偏移（可落台接触），
     * 与 2D pointFree 语义一致。左右圆角按阶梯盒保守近似（每片取该片内最靠开口的壁位置）。
     */
    function blocks(c) {
      const cached = blockCache.get(c);
      if (cached) return cached;
      const { topWidth: W, topDepth: D, leftHeight: lh, rightHeight: rh } = geom;
      const out = [];
      const add = (name, min, max) => out.push({ name, min, max });
      const lo = geom.leftOuterRadius;
      const li = geom.leftInnerRadius;
      const ro = geom.rightOuterRadius;
      const ri = geom.rightInnerRadius;
      if (lo > 0) {
        for (const [a, b] of slabs(lh - lo, lh, lo)) add("left", [0, a, 0], [secX.xMinAt(b) + c, b, D]);
      }
      if (li > 0) {
        for (const [a, b] of slabs(lh, lh + li, li)) add("left", [0, a, 0], [secX.xMinAt(b) + c, b, D]);
      }
      add("left", [0, lh + li, 0], [geom.entryLeft + c, FAR, D]);
      if (ro > 0) {
        for (const [a, b] of slabs(rh - ro, rh, ro)) add("right", [secX.xMaxAt(b) - c, a, 0], [W, b, D]);
      }
      if (ri > 0) {
        for (const [a, b] of slabs(rh, rh + ri, ri)) add("right", [secX.xMaxAt(b) - c, a, 0], [W, b, D]);
      }
      add("right", [geom.entryRight - c, rh + ri, 0], [W, FAR, D]);
      add("front", [0, geom.frontHeight, 0], [W, FAR, geom.entryFront + c]);
      add("back", [0, geom.backHeight, geom.entryBack - c], [W, FAR, D]);
      blockCache.set(c, out);
      return out;
    }

    function obbOf(part, pose) {
      const { u, w, v } = poseAxes(pose);
      const e = [part.length / 2 - EPS, part.width / 2 - EPS, part.height / 2 - EPS];
      const ext = [0, 1, 2].map((k) => e[0] * Math.abs(u[k]) + e[1] * Math.abs(w[k]) + e[2] * Math.abs(v[k]));
      return { c: [pose.x, pose.y, pose.z], B: [u, w, v], e, ext };
    }

    /** 精确位姿校验：零件在外框（墙、顶内缩 c）内，且不与任何实体块相交 */
    function validPose(part, pose, clearance) {
      const c = clearance || 0;
      const o = obbOf(part, pose);
      if (o.c[0] - o.ext[0] < c || o.c[0] + o.ext[0] > geom.topWidth - c) return false;
      if (o.c[2] - o.ext[2] < c || o.c[2] + o.ext[2] > geom.topDepth - c) return false;
      if (o.c[1] - o.ext[1] < c) return false;
      const list = blocks(c);
      for (let i = 0; i < list.length; i += 1) {
        const b = list[i];
        if (
          o.c[0] + o.ext[0] <= b.min[0] || o.c[0] - o.ext[0] >= b.max[0] ||
          o.c[1] + o.ext[1] <= b.min[1] || o.c[1] - o.ext[1] >= b.max[1] ||
          o.c[2] + o.ext[2] <= b.min[2] || o.c[2] - o.ext[2] >= b.max[2]
        ) {
          continue;
        }
        if (obbHitsAabb(o.c, o.B, o.e, b)) return false;
      }
      return true;
    }

    /** 开口面：左右台顶连线与前后台顶连线取较低者（y 较大）；零件八角均在其下方即已在腔外 */
    function rimY(x, z) {
      const tx = geom.entryWidth > 0 ? Math.max(0, Math.min(1, (x - geom.entryLeft) / geom.entryWidth)) : 0;
      const tz = geom.entryDepth > 0 ? Math.max(0, Math.min(1, (z - geom.entryFront) / geom.entryDepth)) : 0;
      return Math.max(
        geom.leftHeight + (geom.rightHeight - geom.leftHeight) * tx,
        geom.frontHeight + (geom.backHeight - geom.frontHeight) * tz
      );
    }

    /** 入口位姿：开口柱体与开口面下方围成凸区域，八角在内即整体在内 */
    function isEntryPose(part, pose, clearance) {
      const c = clearance || 0;
      for (const [x, y, z] of poseCorners(part, pose)) {
        if (x < geom.entryLeft + c - EPS || x > geom.entryRight - c + EPS) return false;
        if (z < geom.entryFront + c - EPS || z > geom.entryBack - c + EPS) return false;
        if (y < rimY(x, z) + c - EPS) return false;
      }
      return true;
    }

    const blockLabel = { left: "左侧退台", right: "右侧退台", front: "前侧退台", back: "后侧退台" };

    /** 失败诊断：给出第一处干涉的位置与原因 */
    function findFirstHit(part, pose, clearance) {
      const c = clearance || 0;
      if (validPose(part, pose, c)) return null;
      const tag = (base) => (c > 0 ? `${base}安装间隙不足` : `${base}干涉`);
      for (const [x, y, z] of poseCorners(part, pose)) {
        const point = { x, y, z };
        if (y < -EPS) return { pose, point, reason: "越过顶部边界" };
        if (c > 0 && y < c - EPS) return { pose, point, reason: "顶侧安装间隙不足（离顶距离须 ≥ 安装间隙）" };
        if (x < c - EPS) return { pose, point, reason: tag("左侧壁") };
        if (x > geom.topWidth - c + EPS) return { pose, point, reason: tag("右侧壁") };
        if (z < c - EPS) return { pose, point, reason: tag("前侧壁") };
        if (z > geom.topDepth - c + EPS) return { pose, point, reason: tag("后侧壁") };
      }
      const o = obbOf(part, pose);
      for (const b of blocks(c)) {
        if (!obbHitsAabb(o.c, o.B, o.e, b)) continue;
        const clampTo = (k) => Math.max(b.min[k], Math.min(Math.min(b.max[k], FAR / 2), o.c[k]));
        return {
          pose,
          point: { x: clampTo(0), y: clampTo(1), z: clampTo(2) },
          reason: tag(blockLabel[b.name])
        };
      }
      return { pose, point: { x: pose.x, y: pose.y, z: pose.z }, reason: "干涉" };
    }

    /**
     * 最终落位（优先级同 docs/placement.md）：
     * 1 四边无退进 → top 吸顶对中（先沿 x，再沿 z）
     * 2 有退进 → 依次尝试长度沿 x（yaw 0）、沿 z（yaw 90）：
     *   零件宽度落在开口内 → 复用 2D 剖面落位（bridge / step，对中）；
     *   宽度压到横向退台 → 水平落在所覆盖台面的最高处（step），沿长度方向对中。
     * 结果须通过 3D validPose；都不合法时返回 yaw 0 候选并标 valid:false。
     */
    function finalPlacementPose(part, options) {
      const c = options.clearance || 0;
      const topGap = options.topGap != null ? options.topGap : geom.topGap;
      const ocx = geom.entryLeft + geom.entryWidth / 2;
      const ocz = geom.entryFront + geom.entryDepth / 2;
      const clamp = (v, half, extent) => Math.max(half + c, Math.min(extent - half - c, v));
      const noInset = SIDES.every((s) => geom[s.inset] <= EPS);
      const candidates = [];

      for (const yaw of [0, 90]) {
        const alongX = yaw === 0;
        const extentT = alongX ? geom.topDepth : geom.topWidth;
        const openT0 = alongX ? geom.entryFront : geom.entryLeft;
        const openT1 = alongX ? geom.entryBack : geom.entryRight;
        const tc = clamp(alongX ? ocz : ocx, part.width / 2, extentT);
        const toPose = (s, y, tilt) =>
          alongX ? { x: s, y, z: tc, yaw, tilt } : { x: tc, y, z: s, yaw, tilt };
        let pose;
        let mode;

        if (noInset) {
          const s = clamp(alongX ? ocx : ocz, part.length / 2, alongX ? geom.topWidth : geom.topDepth);
          pose = toPose(s, topGap + part.height / 2, 0);
          mode = "top";
        } else if (tc - part.width / 2 >= openT0 + c - EPS && tc + part.width / 2 <= openT1 - c + EPS) {
          const sec = C2.createSpace2D(sectionValues(values, alongX ? "x" : "z"));
          const p2 = sec.finalPlacementPose(
            { length: part.length, height: part.height },
            { topGap, clearance: c }
          );
          pose = toPose(p2.x, p2.y, p2.deg);
          mode = p2.mode;
        } else {
          // 宽度压到横向退台：所覆盖台面中最高者（y 最小）承托，水平落位
          const extentL = alongX ? geom.topWidth : geom.topDepth;
          const openL0 = alongX ? geom.entryLeft : geom.entryFront;
          const openL1 = alongX ? geom.entryRight : geom.entryBack;
          const hL0 = alongX ? geom.leftHeight : geom.frontHeight;
          const hL1 = alongX ? geom.rightHeight : geom.backHeight;
          const hT0 = alongX ? geom.frontHeight : geom.leftHeight;
          const hT1 = alongX ? geom.backHeight : geom.rightHeight;
          const floorAt = (s) => {
            const floors = [];
            if (tc - part.width / 2 < openT0 + c - EPS) floors.push(hT0);
            if (tc + part.width / 2 > openT1 - c + EPS) floors.push(hT1);
            if (s - part.length / 2 < openL0 + c - EPS) floors.push(hL0);
            if (s + part.length / 2 > openL1 - c + EPS) floors.push(hL1);
            return Math.min(...floors);
          };
          const center = clamp(alongX ? ocx : ocz, part.length / 2, extentL);
          const lo = part.length / 2 + c;
          const span = Math.max(extentL - c - part.length / 2 - lo, 0);
          const n = Math.max(24, Math.ceil(span / 0.25));
          let best = null;
          for (let i = -1; i <= n; i += 1) {
            const s = i < 0 ? center : lo + (span * i) / n;
            const score = Math.abs(s - center);
            if (best && score >= best.score) continue;
            const trial = toPose(s, floorAt(s) - part.height / 2, 0);
            if (!validPose(part, trial, c)) continue;
            best = { score, pose: trial };
          }
          pose = best ? best.pose : toPose(center, floorAt(center) - part.height / 2, 0);
          mode = "step";
        }
        const valid = validPose(part, pose, c);
        candidates.push({ ...pose, mode, valid });
        if (valid) break;
      }
      return candidates.find((p) => p.valid) || candidates[0];
    }

    return {
      mode: "3d",
      geom,
      validPose,
      isEntryPose,
      findFirstHit,
      finalPlacementPose,
      rimY,
      blocks
    };
  }

  // ---------------------------------------------------------------------------
  // 路径规划
  // ---------------------------------------------------------------------------

  /** 过锚点、方向 yaw 的水平线与外框 [0,W]×[0,D] 的交段 → 平面坐标 s 的原点与长度 */
  function lineThrough(geom, ax, az, yaw) {
    const dx = Math.cos(yaw * DEG);
    const dz = Math.sin(yaw * DEG);
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [p, d, hi] of [[ax, dx, geom.topWidth], [az, dz, geom.topDepth]]) {
      if (Math.abs(d) < 1e-12) continue;
      const a = (0 - p) / d;
      const b = (hi - p) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    return { ox: ax + t0 * dx, oz: az + t0 * dz, dx, dz, yaw, sMax: Math.max(0, t1 - t0) };
  }

  /**
   * 竖直平面内的路径搜索：固定 yaw 与横向位置，搜 (s, y, tilt)。
   * 通过 Space 适配器复用 2D 核心的 BFS（findPath）；目标谓词由 goal 给出。
   * 返回 3D 位姿路径（目标端在前、start 在末），或 null。
   */
  function planeSearch(space, part, line, start, goal, opts) {
    const geom = space.geom;
    const to3D = (p) => ({ x: line.ox + p.x * line.dx, y: p.y, z: line.oz + p.x * line.dz, yaw: line.yaw, tilt: p.deg });
    const to2D = (p) => ({ x: (p.x - line.ox) * line.dx + (p.z - line.oz) * line.dz, y: p.y, deg: p.tilt });
    const grid = geom.grid;
    const adapter = {
      geom: { topWidth: Infinity, yMax: geom.yMax },
      searchBounds() {
        const angles = [];
        for (let a = geom.minAngle; a <= geom.maxAngle; a += geom.angleStep) angles.push(a);
        if (!angles.includes(0)) angles.push(0);
        angles.sort((a, b) => a - b);
        return {
          grid,
          gridXCount: Math.floor(line.sMax / grid) + 1,
          gridYCount: Math.round(geom.yMax / grid) + 1,
          angles,
          zeroAngleIndex: angles.indexOf(0)
        };
      },
      seedFinalCenters() {
        const finalPose = to2D(start);
        const centers = [];
        for (let s = 0; s <= line.sMax + EPS; s += grid) centers.push(s);
        centers.sort((a, b) => Math.abs(a - finalPose.x) - Math.abs(b - finalPose.x));
        return { finalPose, centers };
      },
      validPose: (_, p, c) => space.validPose(part, to3D(p), c),
      isEntryPose: (_, p, c) => goal(to3D(p), c),
      findFirstHit: () => null,
      failHintPath: () => []
    };
    const r = C2.findPath(
      adapter,
      { length: part.length, height: part.height },
      { clearance: opts.clearance, topGap: opts.topGap, keepPath: true }
    );
    if (!r.ok) return null;
    const path = r.path.map(to3D);
    path[path.length - 1] = start;
    return path;
  }

  function motionFree(space, part, a, b, c) {
    const g = space.geom.grid;
    const n = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)) / (g / 2)),
      Math.ceil(Math.max(Math.abs(b.yaw - a.yaw), Math.abs(b.tilt - a.tilt)) / 0.5)
    );
    for (let i = 1; i < n; i += 1) {
      const t = i / n;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: a.yaw + (b.yaw - a.yaw) * t,
        tilt: a.tilt + (b.tilt - a.tilt) * t
      };
      if (!space.validPose(part, p, c)) return false;
    }
    return true;
  }

  /**
   * 顶部整区内水平转向：在 y = yRot、tilt = 0 上对 (x, z, yaw) 做 BFS（yaw 以 180° 为周期）。
   * 从 start 位姿出发遍历整个连通域，返回可查询的可达表与回溯函数。
   */
  function turnSearch(space, part, start, yRot, c) {
    const geom = space.geom;
    const g = geom.grid;
    const ys = geom.yawStep;
    const nx = Math.floor(geom.topWidth / g) + 1;
    const nz = Math.floor(geom.topDepth / g) + 1;
    const nk = Math.round(180 / ys);
    const nCell = nx * nz;
    const parent = new Int32Array(nCell * nk).fill(-2);
    const key = (ix, iz, ik) => ix + iz * nx + ik * nCell;
    const poseOf = (k) => {
      const ik = Math.floor(k / nCell);
      const rem = k - ik * nCell;
      const iz = Math.floor(rem / nx);
      return { x: (rem - iz * nx) * g, y: yRot, z: iz * g, yaw: ik * ys, tilt: 0 };
    };
    const lifted = { ...start, y: yRot, tilt: 0 };
    const queue = [];
    if (space.validPose(part, lifted, c) && motionFree(space, part, start, lifted, c)) {
      const ik0 = ((Math.round(start.yaw / ys) % nk) + nk) % nk;
      const bx = Math.round(start.x / g);
      const bz = Math.round(start.z / g);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ix = bx + dx;
          const iz = bz + dz;
          if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) continue;
          const k = key(ix, iz, ik0);
          if (parent[k] !== -2) continue;
          const p = poseOf(k);
          if (!space.validPose(part, p, c) || !motionFree(space, part, p, lifted, c)) continue;
          parent[k] = -1;
          queue.push(k);
        }
      }
    }
    let head = 0;
    while (head < queue.length) {
      const k = queue[head];
      head += 1;
      const ik = Math.floor(k / nCell);
      const rem = k - ik * nCell;
      const iz = Math.floor(rem / nx);
      const ix = rem - iz * nx;
      const next = [
        [ix + 1, iz, ik], [ix - 1, iz, ik], [ix, iz + 1, ik], [ix, iz - 1, ik],
        [ix, iz, (ik + 1) % nk], [ix, iz, (ik + nk - 1) % nk]
      ];
      for (const [jx, jz, jk] of next) {
        if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
        const nkey = key(jx, jz, jk);
        if (parent[nkey] !== -2) continue;
        if (!space.validPose(part, poseOf(nkey), c)) {
          parent[nkey] = -3;
          continue;
        }
        parent[nkey] = k;
        queue.push(nkey);
      }
    }
    return {
      lifted,
      /** 与给定位姿最近、可达、且可直线过渡的网格状态（同 yaw） */
      nearestReachable(p) {
        const ik = ((Math.round(p.yaw / ys) % nk) + nk) % nk;
        const bx = Math.round(p.x / g);
        const bz = Math.round(p.z / g);
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const ix = bx + dx;
            const iz = bz + dz;
            if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) continue;
            const k = key(ix, iz, ik);
            if (parent[k] < -1) continue;
            if (motionFree(space, part, p, poseOf(k), c)) return k;
          }
        }
        return -1;
      },
      /** 从状态 k 回溯到起点：返回 [k 的位姿, …, 起点网格位姿] */
      trace(k) {
        const out = [];
        let cur = k;
        while (cur >= 0) {
          out.push(poseOf(cur));
          cur = parent[cur];
        }
        return out;
      }
    };
  }

  /** 连续化 yaw（tilt = 0 时 yaw 与 yaw±180 等价；倾斜段同时翻转 tilt 保持姿态不变） */
  function unwrapYaw(path) {
    let off = 0;
    let prev = null;
    return path.map((p) => {
      let yaw = p.yaw + off;
      if (prev != null) {
        while (yaw - prev > 90) {
          off -= 180;
          yaw -= 180;
        }
        while (yaw - prev < -90) {
          off += 180;
          yaw += 180;
        }
      }
      prev = yaw;
      const flips = Math.round(off / 180) % 2 !== 0;
      return { ...p, yaw, tilt: flips ? -p.tilt : p.tilt };
    });
  }

  /** 确定性伪随机（mulberry32）：同一输入 → 同一搜索结果 */
  function makeRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(obj) {
    const text = JSON.stringify(obj);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  /**
   * 5 自由度双向快速扩展随机树（RRT-Connect），伪随机种子由输入决定，结果可复现。
   * 一棵树根在最终位姿，另一棵根在开口下方的一组入口位姿。
   * 度量：平移 mm + 转角 × 半长（零件端点弧长），边按 ≤ grid/2 的端点位移逐点做精确校验。
   * 未连通只表示在预算内未找到，与网格搜索的「未找到」同义。
   */
  function rrtConnect(space, part, finalPose, c, seed, budget) {
    const geom = space.geom;
    const rnd = makeRandom(seed);
    const r = Math.max(part.length, part.width) / 2;
    const res = geom.grid / 2;
    const stepMax = Math.max(8, geom.grid * 5);
    const maxIter = budget || 3000;

    function dist(a, b) {
      const ry = r * wrapDeg(b.yaw - a.yaw) * DEG;
      const rt = r * (b.tilt - a.tilt) * DEG;
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z, ry, rt);
    }
    function lerp(a, b, t) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: a.yaw + wrapDeg(b.yaw - a.yaw) * t,
        tilt: a.tilt + (b.tilt - a.tilt) * t
      };
    }
    function edgeFree(a, b) {
      const n = Math.ceil(dist(a, b) / res);
      for (let i = 1; i <= n; i += 1) {
        if (!space.validPose(part, lerp(a, b, i / n), c)) return false;
      }
      return true;
    }
    function makeTree(roots) {
      return { nodes: roots.slice(), parent: roots.map(() => -1) };
    }
    function nearest(tree, q) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < tree.nodes.length; i += 1) {
        const d = dist(tree.nodes[i], q);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
    /** 向 q 扩展一步：0 受阻 / 1 前进 / 2 到达 */
    function extend(tree, q) {
      const i = nearest(tree, q);
      const from = tree.nodes[i];
      const d = dist(from, q);
      // 受阻时步长减半重试：窄通道（零件贴墙、刚好卡在台面上）也能慢慢长出去
      for (let step = Math.min(d, stepMax); step >= res; step /= 2) {
        const reach = step >= d;
        const to = reach ? q : lerp(from, q, step / d);
        if (!space.validPose(part, to, c) || !edgeFree(from, to)) continue;
        tree.nodes.push(to);
        tree.parent.push(i);
        return reach ? 2 : 1;
      }
      return 0;
    }
    function chain(tree, i) {
      const out = [];
      for (let k = i; k >= 0; k = tree.parent[k]) out.push(tree.nodes[k]);
      return out;
    }

    const ocx = geom.entryLeft + geom.entryWidth / 2;
    const ocz = geom.entryFront + geom.entryDepth / 2;
    const entryRoots = [];
    for (let yaw = 0; yaw < 180; yaw += 15) {
      for (const tilt of [-70, -45, 0, 45, 70]) {
        const probe = { x: ocx, y: 0, z: ocz, yaw, tilt };
        const ext = poseCorners(part, probe).reduce((m, p) => Math.max(m, p[1]), -Infinity);
        const q = { ...probe, y: geom.maxHeight + c + ext + 1 };
        if (q.y > geom.yMax) continue;
        if (space.validPose(part, q, c) && space.isEntryPose(part, q, c)) entryRoots.push(q);
      }
    }
    if (!entryRoots.length) return null;

    let ta = makeTree([finalPose]);
    let tb = makeTree(entryRoots);
    let aIsFinal = true;
    for (let iter = 0; iter < maxIter; iter += 1) {
      const q = {
        x: rnd() * geom.topWidth,
        y: rnd() * geom.yMax,
        z: rnd() * geom.topDepth,
        yaw: rnd() * 360,
        tilt: geom.minAngle + rnd() * (geom.maxAngle - geom.minAngle)
      };
      if (extend(ta, q) !== 0) {
        const qNew = ta.nodes[ta.nodes.length - 1];
        let status = 1;
        while (status === 1) status = extend(tb, qNew);
        if (status === 2) {
          const fromA = chain(ta, ta.nodes.length - 1);
          const fromB = chain(tb, tb.nodes.length - 1);
          // fromX 由连接点指向各自的根；拼成「入口根 → … → 最终位姿」
          const toFinal = aIsFinal ? fromA : fromB;
          const toEntry = aIsFinal ? fromB : fromA;
          return smooth(toEntry.reverse().concat(toFinal.slice(1)));
        }
      }
      [ta, tb] = [tb, ta];
      aIsFinal = !aIsFinal;
    }
    return null;

    function smooth(path) {
      const p = path.slice();
      for (let k = 0; k < 80 && p.length > 2; k += 1) {
        const i = Math.floor(rnd() * (p.length - 2));
        const j = i + 2 + Math.floor(rnd() * (p.length - i - 2));
        if (j >= p.length) continue;
        if (edgeFree(p[i], p[j])) p.splice(i + 1, j - i - 1);
      }
      // 加密，保证动画插值时相邻点之间也无碰撞（已校验的边上取点）
      const out = [p[0]];
      for (let i = 1; i < p.length; i += 1) {
        const n = Math.max(1, Math.ceil(dist(p[i - 1], p[i]) / stepMax));
        for (let t = 1; t <= n; t += 1) out.push(lerp(p[i - 1], p[i], t / n));
      }
      return out;
    }
  }

  /**
   * 路径精简：从起点贪心地连到最远的「直线过渡无碰撞」点。
   * 与 2D 的按步长抽稀不同，保证动画线性插值的每一段都经过校验。
   */
  function simplifyPath(space, part, path, c) {
    if (path.length <= 2) return path.slice();
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 1);
      for (let k = path.length - 1; k > i + 1; k -= 1) {
        if (motionFree(space, part, path[i], path[k], c)) {
          j = k;
          break;
        }
      }
      out.push(path[j]);
      i = j;
    }
    return out;
  }

  function failHintPath(space, part, finalPose) {
    const g = space.geom;
    const ocx = g.entryLeft + g.entryWidth / 2;
    const ocz = g.entryFront + g.entryDepth / 2;
    const yaw = finalPose ? finalPose.yaw : 0;
    return [
      { x: ocx, y: g.maxHeight + part.height * 2.4, z: ocz, yaw, tilt: -36 },
      { x: ocx, y: g.maxHeight + part.height * 1.5, z: ocz, yaw, tilt: -36 },
      { x: ocx, y: g.maxHeight + part.height * 0.8, z: ocz, yaw, tilt: -36 }
    ];
  }

  /**
   * 装入规划：
   * A 直入：最终 yaw 所在竖直平面内，从最终位姿搜到入口（与 2D 同理）。
   * B 斜入转向：最终位姿 → 顶部整区（水平、底面不低于最矮退台顶）→ 水平转向 →
   *   沿某 yaw 的开口弦平面下行至入口。候选 yaw 按开口弦长由长到短尝试。
   * C 空间搜索：A、B 都失败时，5 自由度 RRT-Connect（可在倾斜中转向）。
   * 返回 { ok, path, strategy, entryYaw, finalPose, firstHit }。
   */
  function planInsertion(space, part, options) {
    const c = options.clearance || 0;
    const topGap = options.topGap;
    const geom = space.geom;
    const opts = { clearance: c, topGap };
    const finalPose = space.finalPlacementPose(part, opts);
    const entryGoal = (p, cc) => space.isEntryPose(part, p, cc);
    const fail = () => {
      let firstHit = null;
      if (!finalPose.valid) firstHit = space.findFirstHit(part, finalPose, c);
      const hint = failHintPath(space, part, finalPose);
      for (let i = hint.length - 1; i >= 0 && !firstHit; i -= 1) firstHit = space.findFirstHit(part, hint[i], c);
      return { ok: false, path: [], strategy: null, entryYaw: null, finalPose, firstHit };
    };
    if (!finalPose.valid) return fail();

    // A 直入
    const finalLine = lineThrough(geom, finalPose.x, finalPose.z, finalPose.yaw);
    const direct = planeSearch(space, part, finalLine, finalPose, entryGoal, opts);
    if (direct) {
      return { ok: true, path: direct, strategy: "direct", entryYaw: finalPose.yaw, finalPose, firstHit: null };
    }
    const tryRrt = () => {
      const seed = hashSeed([geom.topWidth, geom.topDepth, geom.entryLeft, geom.entryRight,
        geom.entryFront, geom.entryBack, geom.leftHeight, geom.rightHeight, geom.frontHeight,
        geom.backHeight, part.length, part.width, part.height, c]);
      const path = rrtConnect(space, part, finalPose, c, seed);
      if (!path) return fail();
      return { ok: true, path: unwrapYaw(path), strategy: "search", entryYaw: path[0].yaw, finalPose, firstHit: null };
    };
    if (!Number.isFinite(geom.stageHeight)) return tryRrt();

    // B 斜入转向（水平转向，确定性）
    const stageBottom = geom.stageHeight;
    const stageGoal = (p, cc) =>
      Math.abs(p.tilt) < 1e-9 && p.y + part.height / 2 <= stageBottom + EPS && space.validPose(part, p, cc);
    const toStage = planeSearch(space, part, finalLine, finalPose, stageGoal, opts);
    if (!toStage) return tryRrt();
    const stagePose = toStage[0];
    const maxOuter = Math.max(geom.leftOuterRadius, geom.rightOuterRadius);
    const yRot = Math.min(
      stageBottom - part.height / 2,
      Math.max(c + part.height / 2, stageBottom - part.height / 2 - maxOuter)
    );
    const turn = turnSearch(space, part, stagePose, yRot, c);

    const ocx = geom.entryLeft + geom.entryWidth / 2;
    const ocz = geom.entryFront + geom.entryDepth / 2;
    const chord = (yaw) => {
      const cx = Math.abs(Math.cos(yaw * DEG));
      const sz = Math.abs(Math.sin(yaw * DEG));
      return Math.min(cx > 1e-9 ? geom.entryWidth / cx : Infinity, sz > 1e-9 ? geom.entryDepth / sz : Infinity);
    };
    const yaws = [];
    for (let yaw = 0; yaw < 180; yaw += geom.yawStep) {
      if (Math.abs(((yaw - finalPose.yaw) % 180 + 180) % 180) < 1e-9) continue;
      yaws.push(yaw);
    }
    yaws.sort((a, b) => chord(b) - chord(a));

    for (const yaw of yaws) {
      const line = lineThrough(geom, ocx, ocz, yaw);
      // 该开口弦上、转向可达的顶部水平位姿（离开口中心由近及远）
      const sCenter = (ocx - line.ox) * line.dx + (ocz - line.oz) * line.dz;
      const tried = new Set();
      for (let step = 0; step <= line.sMax / geom.grid; step += 1) {
        const found = [];
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const s = sCenter + sign * step * geom.grid;
          if (s < 0 || s > line.sMax) continue;
          const p = { x: line.ox + s * line.dx, y: yRot, z: line.oz + s * line.dz, yaw, tilt: 0 };
          if (!space.validPose(part, p, c)) continue;
          const k = turn.nearestReachable(p);
          if (k < 0 || tried.has(k)) continue;
          tried.add(k);
          found.push([p, k]);
        }
        for (const [entryStage, k] of found) {
          const up = planeSearch(space, part, line, entryStage, entryGoal, opts);
          if (!up) continue;
          const turnPath = turn.trace(k);
          const path = unwrapYaw(
            up.concat(turnPath, [turn.lifted], toStage)
          );
          return { ok: true, path, strategy: "turn", entryYaw: yaw, finalPose, firstHit: null };
        }
        if (tried.size >= 3) break;
      }
    }
    // C 5 自由度空间搜索（倾斜中转向）
    return tryRrt();
  }

  function estimateMaxLength(values, options) {
    const c = options.clearance || 0;
    let low = 0;
    let high = Math.hypot(values.topWidth, values.topDepth);
    const probe = createSpace3D(values);
    const eps = Math.max(0.1, probe.geom.grid / 2);
    let guard = 0;
    while (high - low > eps && guard < 20) {
      guard += 1;
      const mid = (low + high) / 2;
      const space = createSpace3D({ ...values, partLength: mid });
      const part = { length: mid, width: values.partWidth, height: values.partHeight };
      if (planInsertion(space, part, { clearance: c, topGap: values.topGap }).ok) low = mid;
      else high = mid;
    }
    return Math.floor(low * 10) / 10;
  }

  function valuesFromRequest(request) {
    const cavity = request.cavity || {};
    const part = request.part || {};
    const options = request.options || {};
    return {
      topWidth: cavity.topWidth,
      topDepth: cavity.topDepth,
      entryWidth: cavity.entryWidth,
      entryDepth: cavity.entryDepth,
      leftInset: cavity.leftInset,
      rightInset: cavity.rightInset,
      frontInset: cavity.frontInset,
      backInset: cavity.backInset,
      leftHeight: cavity.leftHeight,
      rightHeight: cavity.rightHeight,
      frontHeight: cavity.frontHeight,
      backHeight: cavity.backHeight,
      leftOuterRadius: cavity.leftOuterRadius || 0,
      leftInnerRadius: cavity.leftInnerRadius || 0,
      rightOuterRadius: cavity.rightOuterRadius || 0,
      rightInnerRadius: cavity.rightInnerRadius || 0,
      partLength: part.length,
      partWidth: part.width,
      partHeight: part.height,
      topGap: options.topGap != null ? options.topGap : 0,
      clearance: options.clearance != null ? options.clearance : 0
    };
  }

  function solve(request) {
    if ((request.mode || "3d") !== "3d") {
      return C2.errorResult(`EISV_CORE3D 只处理 3d 请求，收到 ${request.mode}。`, 0, request.mode);
    }
    const options = request.options || {};
    const values = valuesFromRequest(request);
    const error = validateValues(values);
    if (error) return C2.errorResult(error, values.clearance, "3d");

    const space = createSpace3D(values);
    const part = { length: values.partLength, width: values.partWidth, height: values.partHeight };
    const plan = planInsertion(space, part, { clearance: values.clearance, topGap: values.topGap });
    const maxLength = options.estimateMax === false ? null : estimateMaxLength(values, options);

    let path = [];
    if (options.keepPath) {
      path = plan.ok
        ? simplifyPath(space, part, plan.path, values.clearance)
        : failHintPath(space, part, plan.finalPose);
    }
    const margin =
      maxLength != null && plan.ok ? Math.round((maxLength - part.length) * 10) / 10 : null;
    return {
      ok: plan.ok,
      mode: "3d",
      path,
      maxLength,
      error: "",
      geom: space.geom,
      finalPose: plan.finalPose,
      diagnostics: {
        grid: space.geom.grid,
        angleStep: space.geom.angleStep,
        yawStep: space.geom.yawStep,
        clearance: values.clearance,
        margin,
        strategy: plan.strategy,
        entryYaw: plan.entryYaw,
        firstHit: plan.ok ? null : plan.firstHit,
        warnings: []
      }
    };
  }

  function buildSolveRequest(values, options) {
    return {
      mode: "3d",
      cavity: {
        topWidth: values.topWidth,
        topDepth: values.topDepth,
        entryWidth: values.entryWidth,
        entryDepth: values.entryDepth,
        leftInset: values.leftInset,
        rightInset: values.rightInset,
        frontInset: values.frontInset,
        backInset: values.backInset,
        leftHeight: values.leftHeight,
        rightHeight: values.rightHeight,
        frontHeight: values.frontHeight,
        backHeight: values.backHeight,
        leftOuterRadius: values.leftOuterRadius,
        leftInnerRadius: values.leftInnerRadius,
        rightOuterRadius: values.rightOuterRadius,
        rightInnerRadius: values.rightInnerRadius
      },
      part: { length: values.partLength, width: values.partWidth, height: values.partHeight },
      options: {
        clearance: values.clearance || 0,
        topGap: values.topGap,
        keepPath: Boolean(options && options.keepPath),
        estimateMax: !(options && options.estimateMax === false)
      }
    };
  }

  const api = {
    meta,
    DEFAULTS,
    SIDES,
    valuesForDraw,
    validateValues,
    linkedInputPatch,
    sectionValues,
    deriveGeom,
    poseAxes,
    poseCorners,
    obbHitsAabb,
    createSpace3D,
    planInsertion,
    estimateMaxLength,
    solve,
    buildSolveRequest,
    /** 供测试直接调用各阶段 */
    internals: { rrtConnect, planeSearch, lineThrough, unwrapYaw, simplifyPath, motionFree }
  };

  global.EISV_CORE3D = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
