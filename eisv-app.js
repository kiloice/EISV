/**
 * EISV view + app — browser only. Depends on global EISV_CORE.
 */
(function () {
  "use strict";

  const C = window.EISV_CORE;
  if (!C) {
    console.error("EISV_CORE missing");
    return;
  }

  const URL_KEYS = {
    tw: "topWidth",
    ew: "entryWidth",
    li: "leftInset",
    ri: "rightInset",
    lh: "leftHeight",
    rh: "rightHeight",
    lor: "leftOuterRadius",
    lir: "leftInnerRadius",
    ror: "rightOuterRadius",
    rir: "rightInnerRadius",
    pl: "partLength",
    ph: "partHeight",
    tg: "topGap",
    cl: "clearance"
  };

  /** 常见凹位预设（快速调用） */
  const PRESETS = [
    {
      id: "leftInset",
      label: "左侧退进",
      values: {
        topWidth: 212,
        entryWidth: 192,
        leftInset: 20,
        rightInset: 0,
        leftHeight: 50,
        rightHeight: 50,
        leftOuterRadius: 0,
        leftInnerRadius: 0,
        rightOuterRadius: 0,
        rightInnerRadius: 0,
        partLength: 200,
        partHeight: 40,
        topGap: 5,
        clearance: 0
      }
    },
    {
      id: "default",
      label: "右侧退进",
      values: { ...C.DEFAULTS }
    },
    {
      id: "symmetric",
      label: "对称退进",
      values: {
        topWidth: 300,
        entryWidth: 260,
        leftInset: 20,
        rightInset: 20,
        leftHeight: 50,
        rightHeight: 50,
        leftOuterRadius: 0,
        leftInnerRadius: 0,
        rightOuterRadius: 0,
        rightInnerRadius: 0,
        partLength: 250,
        partHeight: 30,
        topGap: 5,
        clearance: 0
      }
    },
    {
      id: "straight",
      label: "直壁通口",
      values: {
        topWidth: 200,
        entryWidth: 200,
        leftInset: 0,
        rightInset: 0,
        leftHeight: 60,
        rightHeight: 60,
        leftOuterRadius: 0,
        leftInnerRadius: 0,
        rightOuterRadius: 0,
        rightInnerRadius: 0,
        partLength: 180,
        partHeight: 40,
        topGap: 1,
        clearance: 0
      }
    },
    {
      id: "fillet",
      label: "圆角收口",
      values: {
        topWidth: 300,
        entryWidth: 260,
        leftInset: 20,
        rightInset: 20,
        leftHeight: 50,
        rightHeight: 50,
        leftOuterRadius: 10,
        leftInnerRadius: 5,
        rightOuterRadius: 10,
        rightInnerRadius: 5,
        partLength: 275,
        partHeight: 30,
        topGap: 1,
        clearance: 0
      }
    },
    {
      id: "asymmetric",
      label: "左右不等高",
      values: {
        topWidth: 240,
        entryWidth: 200,
        leftInset: 10,
        rightInset: 30,
        leftHeight: 40,
        rightHeight: 55,
        leftOuterRadius: 0,
        leftInnerRadius: 0,
        rightOuterRadius: 0,
        rightInnerRadius: 0,
        partLength: 190,
        partHeight: 28,
        topGap: 5,
        clearance: 0
      }
    }
  ];

  const inputs = {
    topWidth: document.getElementById("topWidthInput"),
    entryWidth: document.getElementById("entryWidthInput"),
    leftInset: document.getElementById("leftInsetInput"),
    rightInset: document.getElementById("rightInsetInput"),
    leftHeight: document.getElementById("leftHeightInput"),
    rightHeight: document.getElementById("rightHeightInput"),
    leftOuterRadius: document.getElementById("leftOuterRadiusInput"),
    leftInnerRadius: document.getElementById("leftInnerRadiusInput"),
    rightOuterRadius: document.getElementById("rightOuterRadiusInput"),
    rightInnerRadius: document.getElementById("rightInnerRadiusInput"),
    partLength: document.getElementById("partLengthInput"),
    partHeight: document.getElementById("partHeightInput"),
    topGap: document.getElementById("topGapInput"),
    clearance: document.getElementById("clearanceInput")
  };

  const result = document.getElementById("result");
  const resultTitle = document.getElementById("resultTitle");
  const resultCopy = document.getElementById("resultCopy");
  const maxLengthEl = document.getElementById("maxLength");
  const partMetric = document.getElementById("partMetric");
  const widthMetric = document.getElementById("widthMetric");
  const heightMetric = document.getElementById("heightMetric");
  const insetMetric = document.getElementById("insetMetric");
  const radiusMetric = document.getElementById("radiusMetric");
  const validateBtn = document.getElementById("validateBtn");
  const resetBtn = document.getElementById("resetBtn");
  const replayBtn = document.getElementById("replayBtn");
  const copyBtn = document.getElementById("copyBtn");

  const diagram = document.getElementById("diagram");
  const wallPath = document.getElementById("wallPath");
  const cavityFill = document.getElementById("cavityFill");
  const cavityWall = document.getElementById("cavityWall");
  const openingLine = document.getElementById("openingLine");
  const travelPath = document.getElementById("travelPath");
  const turnDots = document.getElementById("turnDots");
  const ghost = document.getElementById("ghost");
  const part = document.getElementById("part");
  const partFill = document.getElementById("partFill");
  const partRect = document.getElementById("partRect");
  const partText = document.getElementById("partText");
  const hitMarker = document.getElementById("hitMarker");
  const hitDot = document.getElementById("hitDot");
  const hitLabel = document.getElementById("hitLabel");

  const dimLines = {};
  [
    "topDimHelpLeft", "topDimHelpRight", "topDimLine",
    "entryDimHelpLeft", "entryDimHelpRight", "entryDimLine",
    "depthDimHelpTop", "depthDimHelpBottom", "depthDimLine",
    "leftHeightDimHelpTop", "leftHeightDimHelpBottom", "leftHeightDimLine",
    "stepDimHelpLeft", "stepDimHelpRight", "stepDimLine",
    "leftStepDimHelpLeft", "leftStepDimHelpRight", "leftStepDimLine"
  ].forEach((id) => {
    dimLines[id] = document.getElementById(id);
  });

  const topDimText = document.getElementById("topDimText");
  const entryDimText = document.getElementById("entryDimText");
  const depthDimText = document.getElementById("depthDimText");
  const leftHeightDimText = document.getElementById("leftHeightDimText");
  const stepDim = document.getElementById("stepDim");
  const stepDimText = document.getElementById("stepDimText");
  const leftStepDim = document.getElementById("leftStepDim");
  const leftStepDimText = document.getElementById("leftStepDimText");

  let lastPath = [];
  let lastCanFit = false;
  let lastResult = null;
  let animationId = null;
  let activeGeom = null;
  let solveToken = 0;
  let debounceTimer = null;
  let worker = null;
  let lastSummary = "";

  function num(input) {
    return Number(input.value);
  }

  function readInputs() {
    return {
      topWidth: num(inputs.topWidth),
      entryWidth: num(inputs.entryWidth),
      leftInset: num(inputs.leftInset),
      rightInset: num(inputs.rightInset),
      leftHeight: num(inputs.leftHeight),
      rightHeight: num(inputs.rightHeight),
      leftOuterRadius: num(inputs.leftOuterRadius),
      leftInnerRadius: num(inputs.leftInnerRadius),
      rightOuterRadius: num(inputs.rightOuterRadius),
      rightInnerRadius: num(inputs.rightInnerRadius),
      partLength: num(inputs.partLength),
      partHeight: num(inputs.partHeight),
      topGap: num(inputs.topGap),
      clearance: num(inputs.clearance)
    };
  }

  function setLine(id, x1, y1, x2, y2) {
    const el = dimLines[id];
    if (!el) return;
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
  }

  /**
   * 制图参数（参考 GB/T 4457.4 粗细比、GB/T 4458.4 尺寸注法）
   * 模型坐标与 mm 同量级；界线与轮廓留间隙，并略超出尺寸线。
   */
  function draftParams(geom, pad) {
    const s = Math.max(0.85, Math.min(1.35, geom.topWidth / 200));
    return {
      extGap: 1.8 * s,
      extOver: 2.2 * s,
      textGap: 2.4 * s,
      topOffset: Math.max(11, pad * 0.4),
      sideOffset: Math.max(10, pad * 0.32),
      stepOffset: Math.min(16, Math.max(10, pad * 0.36))
    };
  }

  /** 水平尺寸：side "up" 向 y 减小方向（图上方），"down" 向 y 增大方向 */
  function placeHorizontalDim(opts) {
    const { x1, x2, y1, y2, dimY, side, helpL, helpR, dimId, textEl, value, p } = opts;
    const gap = p.extGap;
    const over = p.extOver;
    if (side === "up") {
      setLine(helpL, x1, y1 - gap, x1, dimY - over);
      setLine(helpR, x2, y2 - gap, x2, dimY - over);
    } else {
      setLine(helpL, x1, y1 + gap, x1, dimY + over);
      setLine(helpR, x2, y2 + gap, x2, dimY + over);
    }
    setLine(dimId, x1, dimY, x2, dimY);
    textEl.setAttribute("x", (x1 + x2) / 2);
    textEl.setAttribute("y", side === "up" ? dimY - p.textGap : dimY + p.textGap);
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("dominant-baseline", "middle");
    textEl.textContent = C.formatNumber(value);
  }

  /** 竖直尺寸：side "left" 向 x 减小，"right" 向 x 增大 */
  function placeVerticalDim(opts) {
    const { y1, y2, x1, x2, dimX, side, helpA, helpB, dimId, textEl, value, p } = opts;
    const gap = p.extGap;
    const over = p.extOver;
    if (side === "left") {
      setLine(helpA, x1 - gap, y1, dimX - over, y1);
      setLine(helpB, x2 - gap, y2, dimX - over, y2);
    } else {
      setLine(helpA, x1 + gap, y1, dimX + over, y1);
      setLine(helpB, x2 + gap, y2, dimX + over, y2);
    }
    setLine(dimId, dimX, y1, dimX, y2);
    textEl.setAttribute("x", side === "left" ? dimX - p.textGap : dimX + p.textGap);
    textEl.setAttribute("y", (y1 + y2) / 2);
    textEl.setAttribute("text-anchor", side === "left" ? "end" : "start");
    textEl.setAttribute("dominant-baseline", "middle");
    textEl.textContent = C.formatNumber(value);
  }

  function setPartPose(pose, blocked) {
    if (!pose) return;
    part.setAttribute("transform", `translate(${pose.x} ${pose.y}) rotate(${pose.deg})`);
    part.classList.toggle("blocked", Boolean(blocked));
  }

  function cancelPartAnimation() {
    if (animationId != null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  /** 按当前输入计算最终落位并立刻摆正零件（改退进/尺寸时即时对中） */
  function placePartAtFinal(values) {
    const raw = values || readInputs();
    const v = C.valuesForDraw(raw);
    const space = C.createSpace2D(v);
    const pose = space.finalPlacementPose(
      { length: v.partLength, height: v.partHeight },
      { topGap: v.topGap, clearance: v.clearance || 0 }
    );
    setPartPose(pose, false);
    return pose;
  }

  function setPartSize(geom, length, height, values) {
    const hx = -length / 2;
    const hy = -height / 2;
    partFill.setAttribute("x", String(hx));
    partFill.setAttribute("y", String(hy));
    partFill.setAttribute("width", String(length));
    partFill.setAttribute("height", String(height));
    partRect.setAttribute("x", String(hx));
    partRect.setAttribute("y", String(hy));
    partRect.setAttribute("width", String(length));
    partRect.setAttribute("height", String(height));
    partText.textContent = `${C.formatNumber(length)}×${C.formatNumber(height)}`;
    partText.setAttribute("font-size", String(Math.max(8, Math.min(12, Math.min(length, height) * 0.28))));

    const vals = values || {
      topWidth: geom.topWidth,
      entryWidth: geom.entryWidth,
      leftInset: geom.leftInset,
      rightInset: geom.rightInset,
      leftHeight: geom.leftHeight,
      rightHeight: geom.rightHeight,
      leftOuterRadius: geom.leftOuterRadius,
      leftInnerRadius: geom.leftInnerRadius,
      rightOuterRadius: geom.rightOuterRadius,
      rightInnerRadius: geom.rightInnerRadius,
      partLength: length,
      partHeight: height,
      topGap: geom.topGap,
      clearance: 0
    };
    const pose = C.createSpace2D(vals).finalPlacementPose(
      { length, height },
      { topGap: vals.topGap, clearance: vals.clearance || 0 }
    );
    if (ghost) {
      ghost.setAttribute("x", String(hx));
      ghost.setAttribute("y", String(hy));
      ghost.setAttribute("width", String(length));
      ghost.setAttribute("height", String(height));
      ghost.setAttribute("transform", `translate(${pose.x} ${pose.y}) rotate(${pose.deg})`);
    }
    return pose;
  }

  function drawTravelPath(path) {
    turnDots.replaceChildren();
    if (!path.length) {
      travelPath.setAttribute("d", "");
      return;
    }
    const d = path
      .map((pose, index) => `${index === 0 ? "M" : "L"} ${pose.x.toFixed(1)} ${pose.y.toFixed(1)}`)
      .join(" ");
    travelPath.setAttribute("d", d);
    const dotRadius = Math.max(1.7, Math.min(3.2, (activeGeom?.topWidth || 200) / 95));
    const placed = new Set();
    for (let i = 1; i < path.length; i += 1) {
      if (Math.abs(path[i].deg - path[i - 1].deg) < 0.1) continue;
      const key = `${Math.round(path[i].x * 2) / 2},${Math.round(path[i].y * 2) / 2}`;
      if (placed.has(key)) continue;
      placed.add(key);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "turn-dot");
      dot.setAttribute("cx", path[i].x.toFixed(1));
      dot.setAttribute("cy", path[i].y.toFixed(1));
      dot.setAttribute("r", dotRadius.toFixed(1));
      turnDots.appendChild(dot);
    }
  }

  function showHitMarker(firstHit) {
    if (!hitMarker || !firstHit || !firstHit.point) {
      if (hitMarker) hitMarker.setAttribute("visibility", "hidden");
      return;
    }
    hitMarker.setAttribute("visibility", "visible");
    const { x, y } = firstHit.point;
    hitDot.setAttribute("cx", x.toFixed(1));
    hitDot.setAttribute("cy", y.toFixed(1));
    hitLabel.setAttribute("x", (x + 6).toFixed(1));
    hitLabel.setAttribute("y", (y - 6).toFixed(1));
    hitLabel.textContent = firstHit.reason || "干涉";
  }

  function animatePath(path, blockedAtEnd) {
    cancelPartAnimation();
    if (!path.length) return;

    const duration = Math.max(1700, Math.min(4300, path.length * 58));
    const delay = 350;
    const startTime = performance.now() + delay;
    // 终点用 finalPlacementPose，避免路径末点网格误差；不在此调用 placePartAtFinal 以免闪到终点
    const v = C.valuesForDraw(readInputs());
    const endPose =
      C.createSpace2D(v).finalPlacementPose(
        { length: v.partLength, height: v.partHeight },
        { topGap: v.topGap, clearance: v.clearance || 0 }
      ) || path[path.length - 1];
    setPartPose(path[0], false);

    function tick(now) {
      if (now < startTime) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (t >= 1) {
        setPartPose(endPose, blockedAtEnd);
        animationId = null;
        return;
      }
      const rawIndex = eased * (path.length - 1);
      const index = Math.floor(rawIndex);
      const nextIndex = Math.min(path.length - 1, index + 1);
      const localT = rawIndex - index;
      const a = path[index];
      const b = path[nextIndex];
      setPartPose(
        {
          x: a.x + (b.x - a.x) * localT,
          y: a.y + (b.y - a.y) * localT,
          deg: a.deg + (b.deg - a.deg) * localT
        },
        false
      );
      animationId = requestAnimationFrame(tick);
    }

    animationId = requestAnimationFrame(tick);
  }

  function setResultState(kind, title, copy) {
    result.classList.remove("ok", "fail", "wait");
    result.classList.add(kind);
    resultTitle.textContent = title;
    resultCopy.textContent = copy;
  }

  function updateMetrics(values, geom) {
    partMetric.textContent = `${C.formatNumber(values.partLength)} x ${C.formatNumber(values.partHeight)} · 顶${C.formatNumber(values.topGap)} · 隙${C.formatNumber(values.clearance)}`;
    widthMetric.textContent = `${C.formatNumber(values.topWidth)} / ${C.formatNumber(geom.entryWidth)}`;
    heightMetric.textContent = `${C.formatNumber(values.leftHeight)} / ${C.formatNumber(values.rightHeight)}`;
    insetMetric.textContent = `${C.formatNumber(values.leftInset)} / ${C.formatNumber(values.rightInset)}`;
    radiusMetric.textContent = `外${C.formatNumber(values.leftOuterRadius)}/${C.formatNumber(values.rightOuterRadius)} 内${C.formatNumber(values.leftInnerRadius)}/${C.formatNumber(values.rightInnerRadius)}`;
  }

  function updateDiagram(rawValues) {
    cancelPartAnimation();
    const drawValues = C.valuesForDraw(rawValues);
    const geom = C.deriveGeom(drawValues);
    const paths = C.buildCavityPaths(geom);
    activeGeom = geom;
    const pad = Math.max(30, geom.topWidth * 0.14);
    const p = draftParams(geom, pad);
    const viewW = geom.topWidth + pad * 2;
    const viewH = geom.yMax + pad * 2;
    diagram.setAttribute("viewBox", `${-pad} ${-pad} ${viewW} ${viewH}`);

    // 取消外围实体阴影；仅腔内浅透明层
    if (wallPath) {
      wallPath.setAttribute("d", "");
      wallPath.setAttribute("visibility", "hidden");
    }
    cavityFill.setAttribute("d", paths.fill);
    cavityWall.setAttribute("d", paths.stroke);
    openingLine.setAttribute("x1", geom.entryLeft);
    openingLine.setAttribute("y1", geom.leftHeight);
    openingLine.setAttribute("x2", geom.entryRight);
    openingLine.setAttribute("y2", geom.rightHeight);

    // 顶部净宽 · 水平尺寸（轮廓上方）
    placeHorizontalDim({
      x1: 0,
      x2: geom.topWidth,
      y1: 0,
      y2: 0,
      dimY: -p.topOffset,
      side: "up",
      helpL: "topDimHelpLeft",
      helpR: "topDimHelpRight",
      dimId: "topDimLine",
      textEl: topDimText,
      value: geom.topWidth,
      p
    });

    // 下方开口 · 水平尺寸（轮廓下方；左右附着高度可不同）
    const entryDimY = geom.cavityHeight + p.stepOffset + 4;
    placeHorizontalDim({
      x1: geom.entryLeft,
      x2: geom.entryRight,
      y1: geom.leftHeight,
      y2: geom.rightHeight,
      dimY: entryDimY,
      side: "down",
      helpL: "entryDimHelpLeft",
      helpR: "entryDimHelpRight",
      dimId: "entryDimLine",
      textEl: entryDimText,
      value: geom.entryWidth,
      p
    });

    // 右侧空腔高度 · 竖直尺寸
    placeVerticalDim({
      y1: 0,
      y2: geom.rightHeight,
      x1: geom.topWidth,
      x2: geom.entryRight,
      dimX: geom.topWidth + p.sideOffset,
      side: "right",
      helpA: "depthDimHelpTop",
      helpB: "depthDimHelpBottom",
      dimId: "depthDimLine",
      textEl: depthDimText,
      value: geom.rightHeight,
      p
    });

    // 左侧空腔高度 · 竖直尺寸
    placeVerticalDim({
      y1: 0,
      y2: geom.leftHeight,
      x1: 0,
      x2: 0,
      dimX: -p.sideOffset,
      side: "left",
      helpA: "leftHeightDimHelpTop",
      helpB: "leftHeightDimHelpBottom",
      dimId: "leftHeightDimLine",
      textEl: leftHeightDimText,
      value: geom.leftHeight,
      p
    });

    // 右侧退进（为 0 时与左侧一致，隐藏标注）
    stepDim.style.display = geom.rightInset > 0.001 ? "" : "none";
    if (geom.rightInset > 0.001) {
      placeHorizontalDim({
        x1: geom.entryRight,
        x2: geom.topWidth,
        y1: geom.rightHeight,
        y2: geom.rightHeight,
        dimY: geom.rightHeight + p.stepOffset,
        side: "down",
        helpL: "stepDimHelpLeft",
        helpR: "stepDimHelpRight",
        dimId: "stepDimLine",
        textEl: stepDimText,
        value: geom.rightInset,
        p
      });
    }

    leftStepDim.style.display = geom.leftInset > 0.001 ? "" : "none";
    if (geom.leftInset > 0.001) {
      const leftStepDimY = geom.leftHeight + p.stepOffset;
      placeHorizontalDim({
        x1: 0,
        x2: geom.entryLeft,
        y1: geom.leftHeight,
        y2: geom.leftHeight,
        dimY: leftStepDimY,
        side: "down",
        helpL: "leftStepDimHelpLeft",
        helpR: "leftStepDimHelpRight",
        dimId: "leftStepDimLine",
        textEl: leftStepDimText,
        value: geom.leftInset,
        p
      });
    }

    const placePose = setPartSize(
      geom,
      drawValues.partLength,
      drawValues.partHeight,
      drawValues
    );
    setPartPose(placePose, false);
    drawTravelPath([]);
    showHitMarker(null);
    updateMetrics(rawValues, geom);
  }

  function applySolveResult(solveResult, values, opts) {
    lastResult = solveResult;
    const animate = opts && opts.animate;
    const light = opts && opts.light;

    if (solveResult.error) {
      setResultState("fail", "尺寸有误", solveResult.error);
      maxLengthEl.textContent = "--";
      replayBtn.disabled = true;
      copyBtn.disabled = false;
      lastPath = [];
      lastCanFit = false;
      lastSummary = buildSummary(values, solveResult, "尺寸有误");
      showHitMarker(null);
      return;
    }

    if (solveResult.maxLength != null) {
      maxLengthEl.textContent = `约 ${solveResult.maxLength.toFixed(1)} mm`;
    }

    if (light) {
      if (solveResult.ok) {
        const margin = solveResult.diagnostics.margin;
        const marginText = margin != null ? `余量约 ${C.formatNumber(margin)} mm。` : "";
        setResultState(
          "wait",
          "预估可放",
          `轻量预检通过。最大约 ${solveResult.maxLength != null ? solveResult.maxLength.toFixed(1) : "--"} mm。${marginText}点击验证查看路径动画。`
        );
      } else {
        setResultState(
          "wait",
          "预估紧张",
          "轻量预检未找到路径。点击验证做完整搜索并查看干涉位置。"
        );
      }
      lastSummary = buildSummary(values, solveResult, "预检");
      copyBtn.disabled = false;
      return;
    }

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
        Math.abs(values.partLength - solveResult.maxLength) <=
          Math.max(0.5, solveResult.diagnostics.grid || 1);
      const marginText =
        margin != null ? `余量约 ${C.formatNumber(margin)} mm。` : "";
      setResultState(
        "ok",
        critical ? "接近临界，可放入" : "可放入",
        `${C.formatNumber(values.partLength)} x ${C.formatNumber(values.partHeight)} 可从下方开口进入并落位（间隙 ${C.formatNumber(values.clearance)}mm）。${marginText}`
      );
    } else {
      const hit = solveResult.diagnostics.firstHit;
      const hitText = hit ? `示意干涉：${hit.reason}。` : "";
      setResultState(
        "fail",
        "不可放入",
        `${C.formatNumber(values.partLength)} x ${C.formatNumber(values.partHeight)} 在当前收口形状与装入路径下会发生干涉。${hitText}`
      );
    }

    lastSummary = buildSummary(values, solveResult, solveResult.ok ? "可放入" : "不可放入");
    if (animate && lastPath.length) {
      animatePath(lastPath, !solveResult.ok);
    } else {
      // 改参即时重算：优先最终落位函数（落两侧退台），不用路径网格近似
      placePartAtFinal(values);
      if (!solveResult.ok) {
        part.classList.add("blocked");
      }
    }
  }

  function buildSummary(values, solveResult, status) {
    const lines = [
      `凹位装配模拟验证器 ${C.meta.version}（${C.meta.mode}）`,
      `状态：${status}`,
      `顶部净宽/开口：${values.topWidth} / ${values.entryWidth} mm`,
      `左高/右高：${values.leftHeight} / ${values.rightHeight} mm`,
      `左退进/右退进：${values.leftInset} / ${values.rightInset} mm`,
      `矩形：${values.partLength} x ${values.partHeight} mm`,
      `离顶：${values.topGap} mm；间隙：${values.clearance} mm`
    ];
    if (solveResult && solveResult.maxLength != null) {
      lines.push(`最大可放长度：约 ${solveResult.maxLength} mm`);
    }
    if (solveResult && solveResult.diagnostics && solveResult.diagnostics.margin != null) {
      lines.push(`余量：约 ${solveResult.diagnostics.margin} mm`);
    }
    if (solveResult && solveResult.error) lines.push(`说明：${solveResult.error}`);
    if (solveResult && solveResult.diagnostics && solveResult.diagnostics.firstHit) {
      lines.push(`干涉：${solveResult.diagnostics.firstHit.reason}`);
    }
    return lines.join("\n");
  }

  let workerSource = "";
  let workerDisabled = false;
  /** 正在 Worker 中计算的任务：{ token, request, values, animate } */
  let pendingJob = null;

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
    const coreEl = document.getElementById("eisv-core");
    if (!coreEl) return;
    workerSource = `${coreEl.textContent}
self.onmessage = function (e) {
  var data = e.data || {};
  try {
    var result = self.EISV_CORE.solve(data.request);
    self.postMessage({ token: data.token, ok: true, result: result });
  } catch (err) {
    self.postMessage({ token: data.token, ok: false, error: String(err && err.message || err) });
  }
};
`;
    worker = createWorker();
  }

  /** 丢弃进行中的计算：Worker 无法中断单次 solve，只能终止重建 */
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
    // 未完成的任务改在主线程重算，避免按钮卡在禁用、结果停在「正在计算」
    if (job && job.token === solveToken) solveOnMainThread(job);
  }

  function solveOnMainThread(job) {
    window.setTimeout(function () {
      if (job.token !== solveToken) return;
      const solved = C.solve(job.request);
      validateBtn.disabled = false;
      applySolveResult(solved, job.values, { animate: job.animate });
    }, job.animate ? 20 : 0);
  }

  function runSolve(options) {
    cancelPendingSolve();
    const values = readInputs();
    updateDiagram(values);
    const request = C.buildSolveRequest(values, {
      keepPath: Boolean(options.keepPath),
      estimateMax: options.estimateMax !== false
    });

    const localError = C.validateValues(values);
    if (localError) {
      validateBtn.disabled = false;
      applySolveResult(C.errorResult(localError, values.clearance), values, { animate: false });
      return;
    }

    if (!options.quiet) {
      setResultState("wait", "正在计算", "正在按当前尺寸检查旋转路径。");
    }
    if (options.animate) {
      validateBtn.disabled = true;
      replayBtn.disabled = true;
    }

    const job = {
      token: solveToken,
      request,
      values,
      animate: Boolean(options.animate)
    };

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

  /** 改参即刷新：立即更新图纸，防抖后完整求解（不自动播动画） */
  function scheduleLiveSolve() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      runSolve({
        keepPath: true,
        estimateMax: true,
        animate: false,
        quiet: true
      });
    }, 220);
  }

  function runValidation() {
    runSolve({ keepPath: true, estimateMax: true, animate: true, quiet: false });
  }

  function setActivePreset(id) {
    const row = document.getElementById("presetRow");
    if (!row) return;
    row.querySelectorAll(".preset-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.preset === id);
    });
  }

  function applyPreset(preset) {
    applyValuesToInputs(preset.values);
    writeUrlState(preset.values);
    setActivePreset(preset.id);
    updateDiagram(preset.values);
    runSolve({ keepPath: true, estimateMax: true, animate: false, quiet: true });
  }

  function buildPresetButtons() {
    const row = document.getElementById("presetRow");
    if (!row) return;
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

  function writeUrlState(values) {
    try {
      const params = new URLSearchParams();
      Object.keys(URL_KEYS).forEach(function (shortKey) {
        const field = URL_KEYS[shortKey];
        const v = values[field];
        if (Number.isFinite(v)) params.set(shortKey, C.formatInputValue(v));
      });
      const qs = params.toString();
      const next = qs ? `${location.pathname}?${qs}${location.hash}` : `${location.pathname}${location.hash}`;
      history.replaceState(null, "", next);
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

  function applyValuesToInputs(values) {
    Object.keys(inputs).forEach(function (key) {
      if (values[key] != null && Number.isFinite(values[key])) {
        inputs[key].value = String(values[key]);
      }
    });
  }

  function resetAll() {
    // 重置为右侧退进默认（DEFAULTS），不是第一个预设
    const right = PRESETS.find(function (p) { return p.id === "default"; }) || PRESETS[0];
    applyPreset(right);
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
    // 旧参数的结果不再适用：作废进行中的计算，避免旧结果配新参数显示
    cancelPendingSolve();
    const values = readInputs();
    const patch = C.linkedInputPatch(values, changedKey);
    Object.keys(patch).forEach(function (key) {
      if (inputs[key]) inputs[key].value = C.formatInputValue(patch[key]);
    });
    const next = readInputs();
    writeUrlState(next);
    setActivePreset("");
    // 立即重绘型腔与尺寸，并按新开口中心摆正零件
    updateDiagram(next);
    placePartAtFinal(next);
    scheduleLiveSolve();
  }

  Object.keys(inputs).forEach(function (key) {
    // input：拖动步进时连续刷新；change：失焦/回车再保证一次
    inputs[key].addEventListener("input", function () {
      onInput(key);
    });
    inputs[key].addEventListener("change", function () {
      onInput(key);
    });
  });

  validateBtn.addEventListener("click", runValidation);
  resetBtn.addEventListener("click", resetAll);
  replayBtn.addEventListener("click", function () {
    animatePath(lastPath, !lastCanFit);
  });
  copyBtn.addEventListener("click", copyResult);

  initWorker();
  buildPresetButtons();

  const fromUrl = readUrlState();
  if (fromUrl) {
    const merged = { ...C.DEFAULTS, ...fromUrl };
    // URL 只带部分参数时，按联动规则补全开口/右退进，避免与默认值组合出矛盾尺寸
    if (!("entryWidth" in fromUrl)) {
      Object.assign(merged, C.linkedInputPatch(merged, "rightInset"));
    } else if (!("rightInset" in fromUrl)) {
      Object.assign(merged, C.linkedInputPatch(merged, "entryWidth"));
    }
    applyValuesToInputs(merged);
    setActivePreset("");
  } else {
    applyValuesToInputs(C.DEFAULTS);
    setActivePreset("default"); // 默认高亮「右侧退进」
  }

  updateDiagram(readInputs());
  scheduleLiveSolve();
})();
