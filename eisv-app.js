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
  const solidLabel = document.getElementById("solidLabel");
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
  let workerReady = false;
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
      stepOffset: Math.min(16, Math.max(10, pad * 0.36)),
      hatchPitch: Math.max(3.2, Math.min(6.5, geom.topWidth / 48))
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

  function updateHatchPitch(pitch) {
    const pattern = document.getElementById("hatchMetal");
    const line = document.getElementById("hatchMetalLine");
    if (!pattern || !line) return;
    const p = pitch.toFixed(2);
    pattern.setAttribute("width", p);
    pattern.setAttribute("height", p);
    line.setAttribute("y2", p);
  }

  function setPartPose(pose, blocked) {
    part.setAttribute("transform", `translate(${pose.x} ${pose.y}) rotate(${pose.deg})`);
    part.classList.toggle("blocked", Boolean(blocked));
  }

  function setPartSize(geom, length, height) {
    // 零件：直角轮廓 + 浅填充（非剖切体，不打剖面线）
    partFill.setAttribute("x", String(-length / 2));
    partFill.setAttribute("y", String(-height / 2));
    partFill.setAttribute("width", String(length));
    partFill.setAttribute("height", String(height));
    partRect.setAttribute("x", String(-length / 2));
    partRect.setAttribute("y", String(-height / 2));
    partRect.setAttribute("width", String(length));
    partRect.setAttribute("height", String(height));
    partText.textContent = `${C.formatNumber(length)}×${C.formatNumber(height)}`;
    partText.setAttribute("font-size", String(Math.max(8, Math.min(12, Math.min(length, height) * 0.28))));
    const ghostWidth = Math.min(length, geom.topWidth);
    const openingCenter = geom.entryLeft + geom.entryWidth / 2;
    const minX = ghostWidth / 2;
    const maxX = geom.topWidth - ghostWidth / 2;
    const ghostX = Math.max(minX, Math.min(maxX, openingCenter)) - ghostWidth / 2;
    // 最终位姿示意：细虚线假想轮廓，与实体同尺寸
    ghost.setAttribute("x", String(ghostX));
    ghost.setAttribute("y", String(geom.topGap));
    ghost.setAttribute("width", String(ghostWidth));
    ghost.setAttribute("height", String(height));
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
    cancelAnimationFrame(animationId);
    if (!path.length) return;

    const duration = Math.max(1700, Math.min(4300, path.length * 58));
    const delay = 350;
    const startTime = performance.now() + delay;

    setPartPose(path[0], false);
    function tick(now) {
      if (now < startTime) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const rawIndex = eased * (path.length - 1);
      const index = Math.floor(rawIndex);
      const nextIndex = Math.min(path.length - 1, index + 1);
      const localT = rawIndex - index;
      const a = path[index];
      const b = path[nextIndex];
      const pose = {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
        deg: a.deg + (b.deg - a.deg) * localT
      };
      setPartPose(pose, blockedAtEnd && t >= 0.98);
      if (t < 1) animationId = requestAnimationFrame(tick);
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
    const drawValues = C.valuesForDraw(rawValues);
    const geom = C.deriveGeom(drawValues);
    const paths = C.buildCavityPaths(geom);
    activeGeom = geom;
    const pad = Math.max(30, geom.topWidth * 0.14);
    const p = draftParams(geom, pad);
    const viewW = geom.topWidth + pad * 2;
    const viewH = geom.yMax + pad * 2;
    diagram.setAttribute("viewBox", `${-pad} ${-pad} ${viewW} ${viewH}`);

    updateHatchPitch(p.hatchPitch);

    wallPath.setAttribute("d", paths.wall);
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

    // 右侧退进
    const stepDimY = geom.rightHeight + p.stepOffset;
    placeHorizontalDim({
      x1: geom.entryRight,
      x2: geom.topWidth,
      y1: geom.rightHeight,
      y2: geom.rightHeight,
      dimY: stepDimY,
      side: "down",
      helpL: "stepDimHelpLeft",
      helpR: "stepDimHelpRight",
      dimId: "stepDimLine",
      textEl: stepDimText,
      value: geom.stepWidth,
      p
    });

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

    // 剖面材料标注（非尺寸）
    solidLabel.textContent = "金属";
    solidLabel.setAttribute("x", geom.topWidth + pad * 0.55);
    solidLabel.setAttribute("y", geom.cavityHeight + Math.max(28, geom.yMax * 0.2));
    solidLabel.setAttribute("text-anchor", "middle");
    solidLabel.setAttribute("dominant-baseline", "middle");

    setPartSize(geom, drawValues.partLength, drawValues.partHeight);
    setPartPose(
      {
        x: geom.entryLeft + Math.min(geom.entryWidth / 2, drawValues.partLength / 2),
        y: geom.cavityHeight + drawValues.partHeight * 2.5,
        deg: -28
      },
      false
    );
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
        `${C.formatNumber(values.partLength)} x ${C.formatNumber(values.partHeight)} 可从下方开口旋转进入，最终以离顶 ${C.formatNumber(values.topGap)}mm、间隙 ${C.formatNumber(values.clearance)}mm 水平放入。${marginText}`
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
    if (animate) animatePath(lastPath, !solveResult.ok);
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

  function initWorker() {
    try {
      const coreEl = document.getElementById("eisv-core");
      if (!coreEl) return;
      const workerSource = `${coreEl.textContent}
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
      const blob = new Blob([workerSource], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = function (e) {
        const data = e.data || {};
        if (data.token !== solveToken) return;
        validateBtn.disabled = false;
        if (!data.ok) {
          setResultState("fail", "计算失败", data.error || "Worker 异常");
          return;
        }
        const values = readInputs();
        applySolveResult(data.result, values, { animate: data.animate, light: data.light });
      };
      worker.onerror = function () {
        worker = null;
        workerReady = false;
      };
      workerReady = true;
    } catch (err) {
      worker = null;
      workerReady = false;
    }
  }

  function runSolve(options) {
    const values = readInputs();
    updateDiagram(values);
    const request = C.buildSolveRequest(values, {
      keepPath: Boolean(options.keepPath),
      estimateMax: options.estimateMax !== false
    });

    const localError = C.validateValues(values);
    if (localError && !options.light) {
      applySolveResult(
        {
          ok: false,
          mode: "2d",
          path: [],
          maxLength: null,
          error: localError,
          diagnostics: {
            grid: 0,
            angleStep: 0,
            clearance: values.clearance,
            margin: null,
            firstHit: null,
            warnings: []
          }
        },
        values,
        { animate: false }
      );
      return;
    }

    if (!options.light) {
      setResultState("wait", "正在计算", "正在按当前尺寸检查旋转路径。");
      validateBtn.disabled = true;
      replayBtn.disabled = true;
    }

    const token = ++solveToken;
    const payload = {
      token,
      request,
      animate: Boolean(options.animate),
      light: Boolean(options.light)
    };

    if (workerReady && worker && options.useWorker !== false) {
      try {
        worker.postMessage(payload);
        return;
      } catch (err) {
        /* fall through */
      }
    }

    window.setTimeout(function () {
      if (token !== solveToken) return;
      const result = C.solve(request);
      validateBtn.disabled = false;
      applySolveResult(result, values, { animate: options.animate, light: options.light });
    }, options.light ? 0 : 20);
  }

  function markPending() {
    const values = readInputs();
    updateDiagram(values);
    setResultState("wait", "待验证", "尺寸已变化，点击验证重新计算。");
    maxLengthEl.textContent = "--";
    replayBtn.disabled = true;
    lastPath = [];
    lastCanFit = false;
    lastResult = null;
    showHitMarker(null);
  }

  function runValidation() {
    runSolve({ keepPath: true, estimateMax: true, animate: true, light: false });
  }

  function scheduleLightSolve() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      const values = readInputs();
      if (C.validateValues(values)) return;
      runSolve({
        keepPath: false,
        estimateMax: true,
        animate: false,
        light: true,
        useWorker: true
      });
    }, 300);
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
    applyValuesToInputs(C.DEFAULTS);
    writeUrlState(C.DEFAULTS);
    runValidation();
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
      setResultState("wait", resultTitle.textContent, "复制失败，请手动选择结果文本。");
    }
  }

  function onInput(changedKey) {
    const values = readInputs();
    const patch = C.linkedInputPatch(values, changedKey);
    Object.keys(patch).forEach(function (key) {
      if (inputs[key]) inputs[key].value = C.formatInputValue(patch[key]);
    });
    const next = readInputs();
    writeUrlState(next);
    markPending();
    scheduleLightSolve();
  }

  Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener("input", function () {
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

  const fromUrl = readUrlState();
  if (fromUrl) applyValuesToInputs({ ...C.DEFAULTS, ...fromUrl });
  else applyValuesToInputs(C.DEFAULTS);

  updateDiagram(readInputs());
  runValidation();
})();
