/**
 * EISV V2 view + app (3D) — browser only. Depends on globals EISV_CORE and EISV_CORE3D.
 * 四视图：主视图 (x–y)、左视图 (z–y)、俯视图 (x–z)、轴测图。
 */
(function () {
  "use strict";

  const C = window.EISV_CORE;
  const C3 = window.EISV_CORE3D;
  if (!C || !C3) {
    console.error("EISV_CORE / EISV_CORE3D missing");
    return;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  const URL_KEYS = {
    tw: "topWidth",
    td: "topDepth",
    ew: "entryWidth",
    ed: "entryDepth",
    li: "leftInset",
    ri: "rightInset",
    fi: "frontInset",
    bi: "backInset",
    lh: "leftHeight",
    rh: "rightHeight",
    fh: "frontHeight",
    bh: "backHeight",
    lor: "leftOuterRadius",
    lir: "leftInnerRadius",
    ror: "rightOuterRadius",
    rir: "rightInnerRadius",
    pl: "partLength",
    pw: "partWidth",
    ph: "partHeight",
    tg: "topGap",
    cl: "clearance"
  };

  const D0 = C3.DEFAULTS;
  /** 常见凹位预设 */
  const PRESETS = [
    { id: "default", label: "四边退进·斜入", values: { ...D0 } },
    {
      id: "single",
      label: "单侧退进",
      values: {
        ...D0,
        topDepth: 150,
        entryDepth: 150,
        leftInset: 0,
        rightInset: 20,
        entryWidth: 192,
        frontInset: 0,
        backInset: 0,
        partLength: 200,
        partWidth: 100,
        partHeight: 40
      }
    },
    { id: "narrow", label: "窄长件", values: { ...D0, partLength: 205, partWidth: 40 } },
    {
      id: "asymmetric",
      label: "左右不等高",
      values: {
        ...D0,
        topWidth: 240,
        entryWidth: 200,
        leftHeight: 40,
        rightHeight: 55,
        frontHeight: 60,
        backHeight: 60,
        partLength: 220,
        partWidth: 60,
        partHeight: 20
      }
    },
    {
      id: "deep",
      label: "沿深度放",
      values: { ...D0, topDepth: 300, entryDepth: 260, partLength: 250, partWidth: 60 }
    },
    {
      id: "fillet",
      label: "圆角收口",
      values: {
        ...D0,
        topWidth: 300,
        entryWidth: 260,
        partLength: 275,
        leftOuterRadius: 10,
        leftInnerRadius: 5,
        rightOuterRadius: 10,
        rightInnerRadius: 5
      }
    }
  ];

  const FIELD_KEYS = Object.keys(D0);
  const inputs = {};
  FIELD_KEYS.forEach(function (key) {
    inputs[key] = document.getElementById(`${key}Input`);
  });

  const result = document.getElementById("result");
  const resultTitle = document.getElementById("resultTitle");
  const resultCopy = document.getElementById("resultCopy");
  const maxLengthEl = document.getElementById("maxLength");
  const partMetric = document.getElementById("partMetric");
  const strategyMetric = document.getElementById("strategyMetric");
  const placeMetric = document.getElementById("placeMetric");
  const topMetric = document.getElementById("topMetric");
  const entryMetric = document.getElementById("entryMetric");
  const validateBtn = document.getElementById("validateBtn");
  const resetBtn = document.getElementById("resetBtn");
  const replayBtn = document.getElementById("replayBtn");
  const copyBtn = document.getElementById("copyBtn");

  let lastPath = [];
  let lastCanFit = false;
  let lastResult = null;
  let lastSummary = "";
  let animationId = null;
  /** 当前图纸参数下的几何、零件与最终落位（每次 updateDiagram 只算一次） */
  let active = null;
  let solveToken = 0;
  let debounceTimer = null;
  let worker = null;
  let workerSource = "";
  let workerDisabled = false;
  /** 正在 Worker 中计算的任务：{ token, request, values, animate } */
  let pendingJob = null;

  // ---------------------------------------------------------------------------
  // 视图
  // ---------------------------------------------------------------------------

  function svgEl(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(node);
    return node;
  }

  const ISO_C = Math.cos(Math.PI / 6);
  const views = {
    front: { svg: document.getElementById("viewFront"), proj: (p) => [p[0], p[1]] },
    side: { svg: document.getElementById("viewSide"), proj: (p) => [p[2], p[1]] },
    top: { svg: document.getElementById("viewTop"), proj: (p) => [p[0], (active ? active.geom.topDepth : 0) - p[2]] },
    // 自下前方看向凹腔：越靠右、越靠后越低
    iso: { svg: document.getElementById("viewIso"), proj: (p) => [(p[0] - p[2]) * ISO_C, p[1] + (p[0] + p[2]) * 0.5] }
  };

  Object.keys(views).forEach(function (name) {
    const v = views[name];
    v.cavity = svgEl("g", {}, v.svg);
    v.dims = svgEl("g", {}, v.svg);
    v.travel = svgEl("path", { class: "path-line draft-aux", d: "" }, v.svg);
    v.ghost = svgEl("polygon", { class: "ghost-poly" }, v.svg);
    v.part = svgEl("g", {}, v.svg);
    v.partPoly = svgEl("polygon", { class: "part-poly" }, v.part);
    v.partEdges = name === "iso" ? svgEl("path", { class: "part-edge" }, v.part) : null;
    v.hit = svgEl("g", { visibility: "hidden" }, v.svg);
    v.hitDot = svgEl("circle", { class: "hit-dot", r: "2.4" }, v.hit);
    v.hitLabel = svgEl("text", { class: "hit-label" }, v.hit);
  });

  const fmt = (n) => C.formatNumber(n);
  const pt = (xy) => `${xy[0].toFixed(2)},${xy[1].toFixed(2)}`;

  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    const upper = [];
    for (let i = p.length - 1; i >= 0; i -= 1) {
      const q = p[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  function line(g, a, b, cls) {
    return svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }, g);
  }

  function text(g, xy, value, anchor, cls) {
    const t = svgEl("text", {
      x: xy[0],
      y: xy[1],
      class: cls || "dim-text",
      "text-anchor": anchor || "middle",
      "dominant-baseline": "middle"
    }, g);
    t.textContent = value;
    return t;
  }

  /** 水平尺寸（图上方或下方），与 V1 制图参数同量级 */
  function hDim(g, x1, x2, yRef, yDim, value, s) {
    const dir = yDim < yRef ? -1 : 1;
    line(g, [x1, yRef + dir * 1.8 * s], [x1, yDim + dir * 2.2 * s], "dim-ext draft-thin");
    line(g, [x2, yRef + dir * 1.8 * s], [x2, yDim + dir * 2.2 * s], "dim-ext draft-thin");
    line(g, [x1, yDim], [x2, yDim], "dim-line draft-thin");
    text(g, [(x1 + x2) / 2, yDim + dir * 5 * s], fmt(value));
  }

  function vDim(g, y1, y2, xRef, xDim, value, s) {
    const dir = xDim < xRef ? -1 : 1;
    line(g, [xRef + dir * 1.8 * s, y1], [xDim + dir * 2.2 * s, y1], "dim-ext draft-thin");
    line(g, [xRef + dir * 1.8 * s, y2], [xDim + dir * 2.2 * s, y2], "dim-ext draft-thin");
    line(g, [xDim, y1], [xDim, y2], "dim-line draft-thin");
    text(g, [xDim + dir * 3 * s, (y1 + y2) / 2], fmt(value), dir < 0 ? "end" : "start");
  }

  function setViewBox(view, minX, minY, maxX, maxY, pad) {
    view.svg.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
    view.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  /** 剖面视图：复用 2D 核心的空腔轮廓，另一方向的台面画成虚线（不可见轮廓） */
  function drawSection(view, v, geom, axis) {
    const sec = C.deriveGeom(C3.sectionValues(v, axis));
    sec.yMax = geom.yMax;
    const paths = C.buildCavityPaths(sec);
    svgEl("path", { d: paths.fill, class: "cavity-fill" }, view.cavity);
    svgEl("path", { d: paths.stroke, class: "draft-thick" }, view.cavity);
    line(view.cavity, [sec.entryLeft, sec.leftHeight], [sec.entryRight, sec.rightHeight], "draft-dash");
    const other = axis === "x"
      ? [[v.frontInset, v.frontHeight], [v.backInset, v.backHeight]]
      : [[v.leftInset, v.leftHeight], [v.rightInset, v.rightHeight]];
    other.forEach(function (o) {
      if (o[0] > 0.001) line(view.cavity, [0, o[1]], [sec.topWidth, o[1]], "hidden-line");
    });
    const extent = sec.topWidth;
    const pad = Math.max(28, extent * 0.14);
    const s = Math.max(0.85, Math.min(1.35, extent / 200));
    hDim(view.dims, 0, extent, 0, -pad * 0.45, extent, s);
    vDim(view.dims, 0, sec.leftHeight, 0, -pad * 0.35, sec.leftHeight, s);
    vDim(view.dims, 0, sec.rightHeight, extent, extent + pad * 0.35, sec.rightHeight, s);
    const names = axis === "x" ? ["左", "右"] : ["前", "后"];
    text(view.dims, [4 * s, geom.yMax - 6 * s], names[0], "start", "axis-label");
    text(view.dims, [extent - 4 * s, geom.yMax - 6 * s], names[1], "end", "axis-label");
    setViewBox(view, 0, 0, extent, geom.yMax, pad);
  }

  function drawTop(view, geom) {
    const P = view.proj;
    const W = geom.topWidth;
    const Dp = geom.topDepth;
    const outer = [[0, 0, 0], [W, 0, 0], [W, 0, Dp], [0, 0, Dp]].map(P);
    svgEl("polygon", { points: outer.map(pt).join(" "), class: "draft-thick" }, view.cavity);
    const open = [
      [geom.entryLeft, 0, geom.entryFront],
      [geom.entryRight, 0, geom.entryFront],
      [geom.entryRight, 0, geom.entryBack],
      [geom.entryLeft, 0, geom.entryBack]
    ].map(P);
    svgEl("polygon", { points: open.map(pt).join(" "), class: "cavity-fill" }, view.cavity);
    svgEl("polygon", { points: open.map(pt).join(" "), class: "draft-thin" }, view.cavity);
    const extent = Math.max(W, Dp);
    const pad = Math.max(28, extent * 0.14);
    const s = Math.max(0.85, Math.min(1.35, extent / 200));
    hDim(view.dims, geom.entryLeft, geom.entryRight, Dp, Dp + pad * 0.45, geom.entryWidth, s);
    vDim(view.dims, Dp - geom.entryBack, Dp - geom.entryFront, W, W + pad * 0.35, geom.entryDepth, s);
    text(view.dims, [W / 2, Dp - 6 * s], "前", "middle", "axis-label");
    text(view.dims, [W / 2, 6 * s], "后", "middle", "axis-label");
    setViewBox(view, 0, 0, W, Dp, pad);
  }

  function drawIso(view, geom) {
    const P = view.proj;
    const W = geom.topWidth;
    const Dp = geom.topDepth;
    const g = geom;
    const poly = (pts, cls) => svgEl("polygon", { points: pts.map(P).map(pt).join(" "), class: cls }, view.cavity);
    // 四面侧壁与腔顶（细线），开口边沿（粗线）
    poly([[0, 0, 0], [W, 0, 0], [W, 0, Dp], [0, 0, Dp]], "cavity-fill");
    poly([[0, 0, 0], [0, 0, Dp], [0, g.leftHeight, Dp], [0, g.leftHeight, 0]], "draft-thin");
    poly([[W, 0, 0], [W, 0, Dp], [W, g.rightHeight, Dp], [W, g.rightHeight, 0]], "draft-thin");
    poly([[0, 0, 0], [W, 0, 0], [W, g.frontHeight, 0], [0, g.frontHeight, 0]], "draft-thin");
    poly([[0, 0, Dp], [W, 0, Dp], [W, g.backHeight, Dp], [0, g.backHeight, Dp]], "draft-thin");
    const rim = [
      [[g.entryLeft, g.leftHeight, g.entryFront], [g.entryLeft, g.leftHeight, g.entryBack]],
      [[g.entryRight, g.rightHeight, g.entryFront], [g.entryRight, g.rightHeight, g.entryBack]],
      [[g.entryLeft, g.frontHeight, g.entryFront], [g.entryRight, g.frontHeight, g.entryFront]],
      [[g.entryLeft, g.backHeight, g.entryBack], [g.entryRight, g.backHeight, g.entryBack]]
    ];
    rim.forEach(function (seg) {
      line(view.cavity, P(seg[0]), P(seg[1]), "draft-thick");
    });
    const box = [];
    for (const x of [0, W]) for (const y of [0, g.yMax]) for (const z of [0, Dp]) box.push(P([x, y, z]));
    const xs = box.map((q) => q[0]);
    const ys = box.map((q) => q[1]);
    const extent = Math.max(...xs) - Math.min(...xs);
    setViewBox(view, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), Math.max(16, extent * 0.06));
  }

  function projectPart(view, pose) {
    const corners = C3.poseCorners(active.part, pose).map(view.proj);
    return corners;
  }

  function setPartPose(pose, blocked) {
    if (!pose || !active) return;
    Object.keys(views).forEach(function (name) {
      const view = views[name];
      const corners = projectPart(view, pose);
      view.partPoly.setAttribute("points", hull(corners).map(pt).join(" "));
      if (view.partEdges) {
        let d = "";
        for (let i = 0; i < 8; i += 1) {
          for (const bit of [1, 2, 4]) {
            if (i & bit) continue;
            d += `M${pt(corners[i])}L${pt(corners[i | bit])}`;
          }
        }
        view.partEdges.setAttribute("d", d);
      }
      view.part.classList.toggle("blocked", Boolean(blocked));
    });
  }

  function drawGhost(pose) {
    Object.keys(views).forEach(function (name) {
      const view = views[name];
      view.ghost.setAttribute("points", hull(projectPart(view, pose)).map(pt).join(" "));
    });
  }

  function drawTravelPath(path) {
    Object.keys(views).forEach(function (name) {
      const view = views[name];
      const d = path
        .map((p, i) => `${i === 0 ? "M" : "L"} ${pt(view.proj([p.x, p.y, p.z]))}`)
        .join(" ");
      view.travel.setAttribute("d", d);
    });
  }

  function showHitMarker(firstHit) {
    Object.keys(views).forEach(function (name) {
      const view = views[name];
      if (!firstHit || !firstHit.point) {
        view.hit.setAttribute("visibility", "hidden");
        return;
      }
      const xy = view.proj([firstHit.point.x, firstHit.point.y, firstHit.point.z]);
      view.hit.setAttribute("visibility", "visible");
      view.hitDot.setAttribute("cx", xy[0].toFixed(1));
      view.hitDot.setAttribute("cy", xy[1].toFixed(1));
      view.hitLabel.setAttribute("x", (xy[0] + 6).toFixed(1));
      view.hitLabel.setAttribute("y", (xy[1] - 6).toFixed(1));
      view.hitLabel.textContent = name === "front" ? firstHit.reason || "干涉" : "";
    });
  }

  function cancelPartAnimation() {
    if (animationId != null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function updateDiagram(rawValues) {
    cancelPartAnimation();
    const v = C3.valuesForDraw(rawValues);
    const geom = C3.deriveGeom(v);
    const part = { length: v.partLength, width: v.partWidth, height: v.partHeight };
    const space = C3.createSpace3D(v);
    const finalPose = space.finalPlacementPose(part, { topGap: v.topGap, clearance: v.clearance || 0 });
    active = { values: v, geom, part, finalPose };

    Object.keys(views).forEach(function (name) {
      views[name].cavity.replaceChildren();
      views[name].dims.replaceChildren();
    });
    drawSection(views.front, v, geom, "x");
    drawSection(views.side, v, geom, "z");
    drawTop(views.top, geom);
    drawIso(views.iso, geom);

    drawGhost(finalPose);
    setPartPose(finalPose, false);
    drawTravelPath([]);
    showHitMarker(null);
    updateMetrics(rawValues, geom);
  }

  // ---------------------------------------------------------------------------
  // 动画
  // ---------------------------------------------------------------------------

  function poseDistance(a, b) {
    const r = active ? Math.max(active.part.length, active.part.width) / 2 : 100;
    return Math.hypot(
      b.x - a.x,
      b.y - a.y,
      b.z - a.z,
      (r * (b.yaw - a.yaw) * Math.PI) / 180,
      (r * (b.tilt - a.tilt) * Math.PI) / 180
    );
  }

  function animatePath(path, blockedAtEnd) {
    cancelPartAnimation();
    if (!path.length) return;
    // 按位姿弧长分配时间，转向段与平移段速度一致
    const cum = [0];
    for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1] + poseDistance(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const duration = Math.max(1700, Math.min(5200, 1200 + total * 6));
    const startTime = performance.now() + 350;
    const endPose = active ? active.finalPose : path[path.length - 1];
    setPartPose(path[0], false);

    function tick(now) {
      if (now < startTime) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startTime) / duration);
      if (t >= 1) {
        setPartPose(blockedAtEnd ? path[path.length - 1] : endPose, blockedAtEnd);
        animationId = null;
        return;
      }
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const target = eased * total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < target) i += 1;
      const seg = cum[i] - cum[i - 1] || 1;
      const k = Math.max(0, Math.min(1, (target - cum[i - 1]) / seg));
      const a = path[i - 1];
      const b = path[i];
      setPartPose(
        {
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          z: a.z + (b.z - a.z) * k,
          yaw: a.yaw + (b.yaw - a.yaw) * k,
          tilt: a.tilt + (b.tilt - a.tilt) * k
        },
        false
      );
      animationId = requestAnimationFrame(tick);
    }
    animationId = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // 结果
  // ---------------------------------------------------------------------------

  const MODE_LABEL = { top: "吸顶", step: "落台", bridge: "斜担" };

  function strategyText(solveResult) {
    const dg = solveResult.diagnostics || {};
    if (!solveResult.ok || !dg.strategy) return "--";
    const yaw = Math.round(((dg.entryYaw % 180) + 180) % 180);
    if (dg.strategy === "direct") return "直入";
    if (dg.strategy === "turn") return `斜入 ${yaw}° · 顶部转正`;
    return `空间搜索 · 入口 ${yaw}°`;
  }

  function placeText(pose) {
    if (!pose) return "--";
    const dir = Math.round(pose.yaw) % 180 === 0 ? "长向沿宽" : "长向沿深";
    return `${MODE_LABEL[pose.mode] || pose.mode} · ${dir}`;
  }

  function setResultState(kind, title, copy) {
    result.classList.remove("ok", "fail", "wait");
    result.classList.add(kind);
    resultTitle.textContent = title;
    resultCopy.textContent = copy;
  }

  function updateMetrics(values, geom) {
    partMetric.textContent = `${fmt(values.partLength)}×${fmt(values.partWidth)}×${fmt(values.partHeight)} · 顶${fmt(values.topGap)} · 隙${fmt(values.clearance)}`;
    topMetric.textContent = `${fmt(values.topWidth)} × ${fmt(values.topDepth)}`;
    entryMetric.textContent = `${fmt(geom.entryWidth)} × ${fmt(geom.entryDepth)}`;
    placeMetric.textContent = active ? placeText(active.finalPose) : "--";
  }

  function partLabel(values) {
    return `${fmt(values.partLength)}×${fmt(values.partWidth)}×${fmt(values.partHeight)}`;
  }

  function applySolveResult(solveResult, values, opts) {
    lastResult = solveResult;
    const animate = opts && opts.animate;

    if (solveResult.error) {
      setResultState("fail", "尺寸有误", solveResult.error);
      maxLengthEl.textContent = "--";
      strategyMetric.textContent = "--";
      replayBtn.disabled = true;
      copyBtn.disabled = false;
      lastPath = [];
      lastCanFit = false;
      lastSummary = buildSummary(values, solveResult, "尺寸有误");
      showHitMarker(null);
      return;
    }

    maxLengthEl.textContent = solveResult.maxLength != null ? `约 ${solveResult.maxLength.toFixed(1)} mm` : "--";
    strategyMetric.textContent = strategyText(solveResult);
    lastPath = solveResult.path || [];
    lastCanFit = solveResult.ok;
    drawTravelPath(lastPath);
    showHitMarker(solveResult.ok ? null : solveResult.diagnostics.firstHit);
    replayBtn.disabled = !lastPath.length;
    copyBtn.disabled = false;

    if (solveResult.ok) {
      const margin = solveResult.diagnostics.margin;
      const critical =
        solveResult.maxLength != null &&
        Math.abs(values.partLength - solveResult.maxLength) <= Math.max(0.5, solveResult.diagnostics.grid || 1);
      const marginText = margin != null ? `余量约 ${fmt(margin)} mm。` : "";
      setResultState(
        "ok",
        critical ? "接近临界，可放入" : "可放入",
        `${partLabel(values)} 可从下方开口装入并落位（${strategyText(solveResult)}，间隙 ${fmt(values.clearance)}mm）。${marginText}`
      );
    } else {
      const hit = solveResult.diagnostics.firstHit;
      setResultState(
        "fail",
        "不可放入",
        `${partLabel(values)} 在当前凹腔与装入方式下会发生干涉。${hit ? `示意干涉：${hit.reason}。` : ""}`
      );
    }

    lastSummary = buildSummary(values, solveResult, solveResult.ok ? "可放入" : "不可放入");
    if (animate && lastPath.length) {
      animatePath(lastPath, !solveResult.ok);
    } else if (active) {
      setPartPose(active.finalPose, !solveResult.ok);
    }
  }

  function buildSummary(values, solveResult, status) {
    const lines = [
      `凹位装配模拟验证器 3D ${C3.meta.version}（${C3.meta.mode}）`,
      `状态：${status}`,
      `顶部净宽/净深：${values.topWidth} / ${values.topDepth} mm；开口：${values.entryWidth} × ${values.entryDepth} mm`,
      `退进 左/右/前/后：${values.leftInset} / ${values.rightInset} / ${values.frontInset} / ${values.backInset} mm`,
      `高度 左/右/前/后：${values.leftHeight} / ${values.rightHeight} / ${values.frontHeight} / ${values.backHeight} mm`,
      `零件：${values.partLength} × ${values.partWidth} × ${values.partHeight} mm`,
      `离顶：${values.topGap} mm；间隙：${values.clearance} mm`
    ];
    if (solveResult && solveResult.ok) lines.push(`装入方式：${strategyText(solveResult)}`);
    if (solveResult && solveResult.finalPose) lines.push(`最终落位：${placeText(solveResult.finalPose)}`);
    if (solveResult && solveResult.maxLength != null) lines.push(`最大可放长度：约 ${solveResult.maxLength} mm`);
    if (solveResult && solveResult.diagnostics && solveResult.diagnostics.margin != null) {
      lines.push(`余量：约 ${solveResult.diagnostics.margin} mm`);
    }
    if (solveResult && solveResult.error) lines.push(`说明：${solveResult.error}`);
    if (solveResult && solveResult.diagnostics && solveResult.diagnostics.firstHit) {
      lines.push(`干涉：${solveResult.diagnostics.firstHit.reason}`);
    }
    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // 求解调度（Worker 优先，可取消；失败回退主线程）
  // ---------------------------------------------------------------------------

  function createWorker() {
    if (workerDisabled || !workerSource) return null;
    try {
      const blob = new Blob([workerSource], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = onWorkerMessage;
      w.onerror = onWorkerError;
      return w;
    } catch (err) {
      workerDisabled = true;
      return null;
    }
  }

  function initWorker() {
    const core2 = document.getElementById("eisv-core");
    const core3 = document.getElementById("eisv-core3d");
    if (!core2 || !core3) return;
    workerSource = `${core2.textContent}
${core3.textContent}
self.onmessage = function (e) {
  var data = e.data || {};
  try {
    var result = self.EISV_CORE3D.solve(data.request);
    self.postMessage({ token: data.token, ok: true, result: result });
  } catch (err) {
    self.postMessage({ token: data.token, ok: false, error: String(err && err.message || err) });
  }
};
`;
    worker = createWorker();
  }

  function cancelPendingSolve() {
    solveToken += 1;
    if (pendingJob && worker) {
      worker.terminate();
      worker = createWorker();
    }
    pendingJob = null;
    validateBtn.disabled = false;
  }

  function onWorkerMessage(e) {
    const data = e.data || {};
    const job = pendingJob;
    if (!job || data.token !== job.token || job.token !== solveToken) return;
    pendingJob = null;
    validateBtn.disabled = false;
    if (!data.ok) {
      setResultState("fail", "计算失败", data.error || "Worker 异常");
      return;
    }
    applySolveResult(data.result, job.values, { animate: job.animate });
  }

  function onWorkerError(event) {
    if (event && event.preventDefault) event.preventDefault();
    const job = pendingJob;
    pendingJob = null;
    if (worker) worker.terminate();
    worker = null;
    workerDisabled = true;
    if (job && job.token === solveToken) solveOnMainThread(job);
  }

  function solveOnMainThread(job) {
    window.setTimeout(function () {
      if (job.token !== solveToken) return;
      const solved = C3.solve(job.request);
      validateBtn.disabled = false;
      applySolveResult(solved, job.values, { animate: job.animate });
    }, job.animate ? 20 : 0);
  }

  function readInputs() {
    const out = {};
    FIELD_KEYS.forEach(function (key) {
      out[key] = Number(inputs[key].value);
    });
    return out;
  }

  function runSolve(options) {
    cancelPendingSolve();
    const values = readInputs();
    const request = C3.buildSolveRequest(values, { keepPath: true, estimateMax: true });
    const localError = C3.validateValues(values);
    if (localError) {
      applySolveResult(C.errorResult(localError, values.clearance, "3d"), values, { animate: false });
      return;
    }
    if (!options.quiet) setResultState("wait", "正在计算", "正在按当前尺寸搜索三维装入路径。");
    if (options.animate) {
      validateBtn.disabled = true;
      replayBtn.disabled = true;
    }
    const job = { token: solveToken, request, values, animate: Boolean(options.animate) };
    if (worker) {
      try {
        pendingJob = job;
        worker.postMessage({ token: job.token, request });
        return;
      } catch (err) {
        pendingJob = null;
      }
    }
    solveOnMainThread(job);
  }

  function scheduleLiveSolve() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      runSolve({ animate: false, quiet: true });
    }, 260);
  }

  // ---------------------------------------------------------------------------
  // 输入、预设、URL、复制
  // ---------------------------------------------------------------------------

  function applyValuesToInputs(values) {
    FIELD_KEYS.forEach(function (key) {
      if (values[key] != null && Number.isFinite(values[key])) inputs[key].value = String(values[key]);
    });
  }

  function writeUrlState(values) {
    try {
      const params = new URLSearchParams();
      Object.keys(URL_KEYS).forEach(function (shortKey) {
        const v = values[URL_KEYS[shortKey]];
        if (Number.isFinite(v)) params.set(shortKey, C.formatInputValue(v));
      });
      const qs = params.toString();
      history.replaceState(null, "", qs ? `${location.pathname}?${qs}${location.hash}` : `${location.pathname}${location.hash}`);
    } catch (err) {
      /* file:// or restricted */
    }
  }

  function readUrlState() {
    try {
      const params = new URLSearchParams(location.search);
      const patch = {};
      let any = false;
      Object.keys(URL_KEYS).forEach(function (shortKey) {
        if (!params.has(shortKey)) return;
        const n = Number(params.get(shortKey));
        if (Number.isFinite(n)) {
          patch[URL_KEYS[shortKey]] = n;
          any = true;
        }
      });
      return any ? patch : null;
    } catch (err) {
      return null;
    }
  }

  function setActivePreset(id) {
    document.querySelectorAll("#presetRow .preset-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.preset === id);
    });
  }

  function applyPreset(preset) {
    applyValuesToInputs(preset.values);
    writeUrlState(preset.values);
    setActivePreset(preset.id);
    updateDiagram(preset.values);
    runSolve({ animate: false, quiet: true });
  }

  function buildPresetButtons() {
    const row = document.getElementById("presetRow");
    row.replaceChildren();
    PRESETS.forEach(function (preset) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn";
      btn.dataset.preset = preset.id;
      btn.textContent = preset.label;
      btn.addEventListener("click", function () {
        applyPreset(preset);
      });
      row.appendChild(btn);
    });
  }

  async function copyResult() {
    const text = lastSummary || buildSummary(readInputs(), lastResult, resultTitle.textContent);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      const prev = copyBtn.textContent;
      copyBtn.textContent = "已复制";
      window.setTimeout(function () {
        copyBtn.textContent = prev;
      }, 1200);
    } catch (err) {
      const kind = ["ok", "fail", "wait"].find(function (k) { return result.classList.contains(k); }) || "wait";
      setResultState(kind, resultTitle.textContent, "复制失败，请手动选择结果文本。");
    }
  }

  function onInput(changedKey) {
    cancelPartAnimation();
    cancelPendingSolve();
    const values = readInputs();
    const patch = C3.linkedInputPatch(values, changedKey);
    Object.keys(patch).forEach(function (key) {
      if (inputs[key]) inputs[key].value = C.formatInputValue(patch[key]);
    });
    const next = readInputs();
    writeUrlState(next);
    setActivePreset("");
    lastPath = [];
    replayBtn.disabled = true;
    updateDiagram(next);
    scheduleLiveSolve();
  }

  FIELD_KEYS.forEach(function (key) {
    inputs[key].addEventListener("input", function () {
      onInput(key);
    });
  });

  validateBtn.addEventListener("click", function () {
    runSolve({ animate: true, quiet: false });
  });
  resetBtn.addEventListener("click", function () {
    applyPreset(PRESETS[0]);
  });
  replayBtn.addEventListener("click", function () {
    animatePath(lastPath, !lastCanFit);
  });
  copyBtn.addEventListener("click", copyResult);

  initWorker();
  buildPresetButtons();

  const fromUrl = readUrlState();
  if (fromUrl) {
    const merged = { ...D0, ...fromUrl };
    // URL 只带部分参数时按联动规则补全开口，避免与默认值组合出矛盾尺寸
    if (!("entryWidth" in fromUrl)) Object.assign(merged, C3.linkedInputPatch(merged, "rightInset"));
    else if (!("rightInset" in fromUrl)) Object.assign(merged, C3.linkedInputPatch(merged, "entryWidth"));
    if (!("entryDepth" in fromUrl)) Object.assign(merged, C3.linkedInputPatch(merged, "backInset"));
    else if (!("backInset" in fromUrl)) Object.assign(merged, C3.linkedInputPatch(merged, "entryDepth"));
    applyValuesToInputs(merged);
    setActivePreset("");
  } else {
    applyValuesToInputs(D0);
    setActivePreset("default");
  }

  updateDiagram(readInputs());
  scheduleLiveSolve();
})();
