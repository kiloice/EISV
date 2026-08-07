/**
 * Assemble single-file EISV_1.0.html from modular sources.
 * Users only need the HTML; this script is for maintainers.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(root, "eisv-core.js"), "utf8");
const app = readFileSync(join(root, "eisv-app.js"), "utf8");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="eisv-version" content="1.1.4">
  <link rel="icon" href="data:,">
  <title>凹位装配模拟验证器 v1.1.4</title>
  <style>
    :root {
      color-scheme: dark;
      /*
       * 基础蓝 #0271B8（geargenerator 系蓝图纸）
       * 画布略亮、侧栏/页脚略深，线与字用白/浅蓝白
       */
      --blue: #0271B8;
      --page: #0266a6;
      --sheet: #0271B8;
      --panel: #0269ad;
      --panel-raised: #0478c4;
      --ink: #f4fbff;
      --muted: #b5d8f0;
      --line: rgba(255, 255, 255, 0.26);
      --line-strong: rgba(255, 255, 255, 0.4);
      --ok: #7dffb8;
      --warn: #ff9aa6;
      --wait: #ffe08a;
      --accent: #dff4ff;
      --part: #ff8a96;
      --draft-ink: #ffffff;
      --draft-ink-dim: #e3f3ff;
      --draft-thick: 1.65px;
      --draft-thin: 0.9px;
      /* 仅腔内淡白透明层，区分内外（无外围实体阴影） */
      --cavity-wash: rgba(255, 255, 255, 0.1);
      --part-fill: rgba(255, 138, 150, 0.14);
      --controls-w: min(380px, 38vw);
      font-family: "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
        -apple-system, sans-serif;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      height: 100%;
      color: var(--ink);
      background: var(--page);
    }

    body {
      overflow: hidden;
    }

    .app {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* —— 顶栏：标题合一，字号贴近栏高、字重适中 —— */
    .app-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px 24px;
      flex-wrap: wrap;
      min-height: 44px;
      padding: 8px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .app-header .brand {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.03em;
      line-height: 1.2;
      color: #ffffff;
      white-space: nowrap;
    }

    .app-header .hint {
      margin: 0;
      flex: 1 1 200px;
      max-width: 48ch;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.45;
      color: #c5e6fa;
      text-align: right;
    }

    /* —— 主工作区：左图纸固定 / 右表单滚动 —— */
    .workspace {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--controls-w);
      align-items: stretch;
    }

    .stage {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--sheet);
      border-right: 1px solid var(--line);
    }

    .svg-wrap {
      flex: 1 1 auto;
      min-height: 0;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--sheet);
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
      background-size: 24px 24px;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      max-height: 100%;
      touch-action: manipulation;
    }

    /* —— 右侧控制：仅此区纵向滚动 —— */
    .controls {
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: var(--panel);
      -webkit-overflow-scrolling: touch;
    }

    .panel {
      flex: 0 0 auto;
      padding: 12px 12px 14px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel-raised);
    }

    .panel-title {
      margin: 0 0 10px;
      padding: 0 0 8px 10px;
      border-left: 3px solid var(--accent);
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #ffffff;
      line-height: 1.2;
    }

    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: grid;
      gap: 10px;
    }

    legend {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    .input-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 8px;
    }

    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      line-height: 1.3;
    }

    input[type="number"] {
      width: 100%;
      min-height: 36px;
      padding: 6px 8px;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      outline: none;
      background: rgba(1, 48, 82, 0.45);
    }

    input[type="number"]:focus {
      border-color: #ffffff;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
      background: rgba(1, 48, 82, 0.58);
    }

    /* 预设 */
    .preset-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-btn {
      min-height: 30px;
      padding: 4px 10px;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: rgba(1, 48, 82, 0.35);
      color: #e8f5ff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .preset-btn:hover {
      border-color: #ffffff;
      color: #ffffff;
    }

    .preset-btn.is-active {
      border-color: #ffffff;
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    button {
      min-height: 36px;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: rgba(1, 48, 82, 0.4);
      color: #f0f8ff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
    }

    button.primary {
      border-color: rgba(255, 255, 255, 0.55);
      background: linear-gradient(180deg, #0490e0 0%, #0271B8 100%);
      color: #ffffff;
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    button:hover:not(:disabled) {
      filter: brightness(1.08);
    }

    .result {
      display: grid;
      gap: 6px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: rgba(1, 48, 82, 0.35);
    }

    .result strong {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }

    .result.ok strong { color: var(--ok); }
    .result.fail strong { color: var(--warn); }
    .result.wait strong { color: var(--wait); }

    .result p {
      margin: 0;
      color: #c8e6fa;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.55;
    }

    .metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .metric {
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: rgba(1, 48, 82, 0.3);
    }

    .metric span {
      display: block;
      margin-bottom: 4px;
      color: #a8d0ec;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
    }

    .metric b {
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      overflow-wrap: anywhere;
    }

    .note {
      margin: 0;
      color: #9ec8e6;
      font-size: 10px;
      font-weight: 400;
      line-height: 1.55;
    }

    /* 图线 */
    .draft-thick,
    .draft-thin,
    .draft-dash,
    .draft-aux {
      fill: none;
      stroke-linecap: square;
      stroke-linejoin: miter;
      vector-effect: non-scaling-stroke;
    }

    .draft-thick {
      stroke: var(--draft-ink);
      stroke-width: var(--draft-thick);
    }

    .draft-thin {
      stroke: var(--draft-ink-dim);
      stroke-width: var(--draft-thin);
    }

    .draft-dash {
      stroke: rgba(230, 245, 255, 0.75);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 4 2.5;
    }

    .draft-aux {
      stroke: rgba(200, 240, 255, 0.9);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 5 4;
      stroke-linecap: round;
    }

    /* 外围实体阴影已取消 */
    .wall {
      fill: none;
      stroke: none;
      display: none;
    }

    /* 仅空腔内部淡透明层，区分内外 */
    .cavity-fill {
      fill: var(--cavity-wash);
      stroke: none;
    }

    .dim-line {
      marker-start: url(#dimArrowStart);
      marker-end: url(#dimArrowEnd);
    }

    .dim-text,
    .label-text {
      fill: #ffffff;
      font-size: 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      dominant-baseline: middle;
      stroke: none;
    }

    .label-text.muted {
      fill: #d0ebfa;
      font-size: 9px;
      font-weight: 500;
    }

    .turn-dot {
      fill: #ffffff;
      stroke: #0271B8;
      stroke-width: 0.8;
      vector-effect: non-scaling-stroke;
    }

    #partFill {
      fill: var(--part-fill);
      stroke: none;
    }

    #partRect {
      fill: none;
      stroke: var(--part);
      stroke-width: var(--draft-thick);
      stroke-linecap: square;
      stroke-linejoin: miter;
      vector-effect: non-scaling-stroke;
    }

    #part.blocked #partFill { fill: rgba(180, 50, 50, 0.14); }
    #part.blocked #partRect { stroke: var(--warn); }

    #partText {
      fill: #f0d8dc;
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-anchor: middle;
      dominant-baseline: middle;
      stroke: none;
    }

    #part.blocked #partText { fill: var(--warn); }

    .ghost {
      fill: none;
      stroke: rgba(140, 255, 200, 0.75);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 4 2.5;
      stroke-linecap: square;
      stroke-linejoin: miter;
      vector-effect: non-scaling-stroke;
    }

    .hit-dot {
      fill: #ff9aa6;
      stroke: #ffffff;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }

    .hit-label {
      fill: #ffe0e4;
      font-size: 9px;
      font-weight: 600;
      stroke: none;
    }

    /* —— 页脚：弱存在 —— */
    .app-footer {
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 6px 16px 8px;
      border-top: 1px solid var(--line);
      background: #015a94;
      color: #8ebfe0;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.02em;
    }

    .app-footer a {
      color: inherit;
      text-decoration: none;
    }

    .app-footer a:hover {
      color: #c5e6fa;
    }

    /* —— 平板 / 手机 —— */
    @media (max-width: 900px) {
      body {
        overflow: auto;
      }

      .app {
        height: auto;
        min-height: 100%;
      }

      .workspace {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(38vh, 46vh) auto;
      }

      .stage {
        border-right: 0;
        border-bottom: 1px solid var(--line);
        min-height: 38vh;
      }

      /* 数值区：横向滑动画板 */
      .controls {
        flex-direction: row;
        align-items: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        gap: 10px;
        padding: 10px 12px 14px;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
      }

      .panel {
        flex: 0 0 min(86vw, 320px);
        max-height: 46vh;
        overflow-y: auto;
        scroll-snap-align: start;
      }

      .panel-result {
        flex-basis: min(90vw, 340px);
      }
    }

    @media (max-width: 520px) {
      .app-header {
        padding: 8px 12px;
        min-height: 40px;
      }

      .app-header .brand {
        font-size: 15px;
        white-space: normal;
      }

      .app-header .hint {
        display: none;
      }

      .input-grid,
      .metrics,
      .actions {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="app-header">
      <p class="brand">EISV凹位装配模拟验证器 V1.1.4</p>
      <p class="hint">改参即重算 · 离顶距离 ≥ 安装间隙 · 二维近似 · 正式加工请 CAD 复核</p>
    </header>

    <section class="workspace" aria-label="凹位尺寸验证工具">
      <div class="stage">
        <div class="svg-wrap">
          <svg id="diagram" viewBox="-30 -30 292 240" role="img" aria-labelledby="svgTitle svgDesc">
            <title id="svgTitle">凹位尺寸和矩形装入路径示意</title>
            <desc id="svgDesc">凹腔与矩形装入路径的二维剖面示意。</desc>
            <defs>
              <marker id="dimArrowEnd" viewBox="0 0 10 6" refX="9.5" refY="3" markerWidth="9" markerHeight="6" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0.4 L9.5 3 L0 5.6 Z" fill="#ffffff"></path>
              </marker>
              <marker id="dimArrowStart" viewBox="0 0 10 6" refX="0.5" refY="3" markerWidth="9" markerHeight="6" orient="auto" markerUnits="strokeWidth">
                <path d="M10 0.4 L0.5 3 L10 5.6 Z" fill="#ffffff"></path>
              </marker>
            </defs>

            <path id="wallPath" class="wall" fill-rule="evenodd"></path>
            <path id="cavityFill" class="cavity-fill"></path>
            <path id="cavityWall" class="cavity-wall draft-thick"></path>
            <line id="openingLine" class="opening-line draft-dash"></line>
            <path id="travelPath" class="path-line draft-aux" d=""></path>
            <g id="turnDots"></g>
            <rect id="ghost" class="ghost"></rect>
            <g id="hitMarker" visibility="hidden">
              <circle id="hitDot" class="hit-dot" r="2.4"></circle>
              <text id="hitLabel" class="hit-label"></text>
            </g>

            <g id="topDim">
              <line id="topDimHelpLeft" class="dim-ext draft-thin"></line>
              <line id="topDimHelpRight" class="dim-ext draft-thin"></line>
              <line id="topDimLine" class="dim-line draft-thin"></line>
              <text id="topDimText" class="dim-text" text-anchor="middle"></text>
            </g>
            <g id="entryDim">
              <line id="entryDimHelpLeft" class="dim-ext draft-thin"></line>
              <line id="entryDimHelpRight" class="dim-ext draft-thin"></line>
              <line id="entryDimLine" class="dim-line draft-thin"></line>
              <text id="entryDimText" class="dim-text" text-anchor="middle"></text>
            </g>
            <g id="depthDim">
              <line id="depthDimHelpTop" class="dim-ext draft-thin"></line>
              <line id="depthDimHelpBottom" class="dim-ext draft-thin"></line>
              <line id="depthDimLine" class="dim-line draft-thin"></line>
              <text id="depthDimText" class="dim-text" text-anchor="start"></text>
            </g>
            <g id="leftHeightDim">
              <line id="leftHeightDimHelpTop" class="dim-ext draft-thin"></line>
              <line id="leftHeightDimHelpBottom" class="dim-ext draft-thin"></line>
              <line id="leftHeightDimLine" class="dim-line draft-thin"></line>
              <text id="leftHeightDimText" class="dim-text" text-anchor="end"></text>
            </g>
            <g id="stepDim">
              <line id="stepDimHelpLeft" class="dim-ext draft-thin"></line>
              <line id="stepDimHelpRight" class="dim-ext draft-thin"></line>
              <line id="stepDimLine" class="dim-line draft-thin"></line>
              <text id="stepDimText" class="dim-text" text-anchor="middle"></text>
            </g>
            <g id="leftStepDim">
              <line id="leftStepDimHelpLeft" class="dim-ext draft-thin"></line>
              <line id="leftStepDimHelpRight" class="dim-ext draft-thin"></line>
              <line id="leftStepDimLine" class="dim-line draft-thin"></line>
              <text id="leftStepDimText" class="dim-text" text-anchor="middle"></text>
            </g>

            <g id="part">
              <rect id="partFill"></rect>
              <rect id="partRect"></rect>
              <text id="partText">200×40</text>
            </g>
          </svg>
        </div>
      </div>

      <aside class="controls" aria-label="尺寸输入和计算结果">
        <div class="panel panel-presets">
          <p class="panel-title">预设凹位</p>
          <div class="preset-row" id="presetRow"></div>
        </div>

        <div class="panel panel-cavity">
          <p class="panel-title">空腔尺寸</p>
          <fieldset>
            <legend>空腔尺寸</legend>
            <div class="input-grid">
              <label for="topWidthInput">顶部净宽（mm）
                <input id="topWidthInput" type="number" inputmode="decimal" min="1" step="0.5" value="212">
              </label>
              <label for="entryWidthInput">下方开口（mm）
                <input id="entryWidthInput" type="number" inputmode="decimal" min="1" step="0.5" value="192">
              </label>
              <label for="leftInsetInput">左侧退进（mm）
                <input id="leftInsetInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
              </label>
              <label for="rightInsetInput">右侧退进（mm）
                <input id="rightInsetInput" type="number" inputmode="decimal" min="0" step="0.5" value="20">
              </label>
              <label for="leftHeightInput">左侧空腔高度（mm）
                <input id="leftHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="50">
              </label>
              <label for="rightHeightInput">右侧空腔高度（mm）
                <input id="rightHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="50">
              </label>
              <label for="leftOuterRadiusInput">左外角圆角半径（mm）
                <input id="leftOuterRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
              </label>
              <label for="leftInnerRadiusInput">左内角圆角半径（mm）
                <input id="leftInnerRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
              </label>
              <label for="rightOuterRadiusInput">右外角圆角半径（mm）
                <input id="rightOuterRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
              </label>
              <label for="rightInnerRadiusInput">右内角圆角半径（mm）
                <input id="rightInnerRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
              </label>
            </div>
          </fieldset>
        </div>

        <div class="panel panel-part">
          <p class="panel-title">放入物体</p>
          <fieldset>
            <legend>放入物体</legend>
            <div class="input-grid">
              <label for="partLengthInput">矩形长度（mm）
                <input id="partLengthInput" type="number" inputmode="decimal" min="1" step="0.5" value="200">
              </label>
              <label for="partHeightInput">矩形高度（mm）
                <input id="partHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="40">
              </label>
              <label for="topGapInput">离顶距离（mm）
                <input id="topGapInput" type="number" inputmode="decimal" min="0" step="0.5" value="5">
              </label>
              <label for="clearanceInput">安装间隙（mm）
                <input id="clearanceInput" type="number" inputmode="decimal" min="0" step="0.1" value="0">
              </label>
            </div>
          </fieldset>
        </div>

        <div class="panel panel-result">
          <p class="panel-title">结果与操作</p>
          <div class="actions">
            <button class="primary" id="validateBtn" type="button">再次计算</button>
            <button id="resetBtn" type="button">重置</button>
            <button id="replayBtn" type="button" disabled>重播</button>
            <button id="copyBtn" type="button" disabled>复制结果</button>
          </div>
          <div id="result" class="result wait" aria-live="polite" style="margin-top:10px">
            <strong id="resultTitle">计算中</strong>
            <p id="resultCopy">正在根据当前尺寸更新。</p>
          </div>
          <div class="metrics" style="margin-top:10px">
            <div class="metric">
              <span>最大可放长度</span>
              <b id="maxLength">--</b>
            </div>
            <div class="metric">
              <span>当前物体</span>
              <b id="partMetric">200 × 40</b>
            </div>
            <div class="metric">
              <span>顶部 / 开口</span>
              <b id="widthMetric">212 / 192</b>
            </div>
            <div class="metric">
              <span>左高 / 右高</span>
              <b id="heightMetric">50 / 50</b>
            </div>
            <div class="metric">
              <span>左退进 / 右退进</span>
              <b id="insetMetric">0 / 20</b>
            </div>
            <div class="metric">
              <span>圆角 外/内</span>
              <b id="radiusMetric">0</b>
            </div>
          </div>
          <p class="note" style="margin-top:10px">二维采样近似 · 离顶距离 ≥ 安装间隙 · 单文件离线可用 · 正式加工请 CAD 复核</p>
        </div>
      </aside>
    </section>

    <footer class="app-footer">
      <span>EISV · Engineering Installation Simulation Validator</span>
      <span>Author Tony.D · © 2026 · MIT License</span>
    </footer>
  </div>

  <script id="eisv-core">
${core}
  </script>
  <script>
${app}
  </script>
</body>
</html>
`;

const out = join(root, "EISV_1.0.html");
writeFileSync(out, html);
console.log("Wrote", out, `(${html.length} bytes)`);
