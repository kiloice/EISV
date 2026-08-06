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
  <meta name="eisv-version" content="1.1">
  <link rel="icon" href="data:,">
  <title>凹位装配模拟验证器 v1.1</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #eefbff;
      --muted: #a8d9f4;
      --line: rgba(125, 221, 255, 0.38);
      --panel: #05255d;
      --page: #031a46;
      --ok: #5cf0a7;
      --warn: #ff707d;
      --wait: #ffd166;
      --accent: #2cc7ff;
      --part: #ff697f;
      /* 工程图线（GB/T 4457.4 粗:细 ≈ 2:1，屏幕像素） */
      --draft-ink: #e8f6ff;
      --draft-ink-dim: #b7dff5;
      --draft-thick: 1.8px;
      --draft-thin: 0.9px;
      --draft-hatch: rgba(170, 220, 245, 0.72);
      --space-fill: rgba(6, 28, 72, 0.42);
      --part-fill: rgba(255, 105, 127, 0.12);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background: var(--page);
    }

    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 36px;
    }

    header {
      display: grid;
      gap: 8px;
      margin-bottom: 18px;
      text-align: center;
      justify-items: center;
    }

    h1 {
      margin: 0;
      font-size: clamp(24px, 3vw, 36px);
      line-height: 1.18;
      letter-spacing: 0;
      color: #f5fcff;
      text-shadow: 0 2px 10px rgba(2, 40, 97, 0.42);
    }

    .version {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      padding: 3px 10px;
      border: 1px solid rgba(125, 221, 255, 0.35);
      border-radius: 999px;
      color: #9fd8f5;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      background: rgba(4, 32, 91, 0.55);
    }

    .lead {
      max-width: 840px;
      margin: 0;
      color: rgba(235, 250, 255, 0.88);
      font-size: 15px;
      font-weight: 300;
      line-height: 1.7;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      align-items: start;
    }

    .stage,
    .controls {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(7, 60, 142, 0.96) 0%, rgba(3, 32, 88, 0.98) 100%);
      border-radius: 14px;
      box-shadow:
        0 22px 55px rgba(0, 30, 86, 0.26),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08),
        0 0 24px rgba(57, 213, 255, 0.20);
    }

    .stage {
      overflow: hidden;
    }

    .stage-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(125, 221, 255, 0.28);
      align-items: center;
      background: rgba(4, 26, 73, 0.46);
    }

    .stage-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #f7fcff;
      text-shadow: 0 1px 8px rgba(44, 199, 255, 0.34);
    }

    .svg-wrap {
      padding: 14px;
      background: #061f55;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      min-height: clamp(380px, 48vw, 520px);
      touch-action: manipulation;
    }

    .controls {
      padding: 16px;
      display: grid;
      gap: 16px;
    }

    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: grid;
      gap: 10px;
    }

    legend {
      margin-bottom: 2px;
      font-size: 14px;
      font-weight: 800;
      color: #f7fcff;
      text-shadow: 0 1px 8px rgba(44, 199, 255, 0.26);
    }

    .input-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    label {
      display: grid;
      gap: 7px;
      color: #a9dcf6;
      font-size: 12px;
      font-weight: 400;
    }

    input[type="number"] {
      width: 100%;
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid rgba(139, 223, 255, 0.54);
      border-radius: 8px;
      color: #f7fcff;
      font-size: 17px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      outline: none;
      background: linear-gradient(180deg, rgba(10, 67, 149, 0.88), rgba(5, 41, 112, 0.92));
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.06),
        inset 0 10px 18px rgba(255, 255, 255, 0.04);
    }

    input[type="number"]:focus {
      border-color: #8ef0ff;
      box-shadow:
        0 0 0 3px rgba(44, 199, 255, 0.18),
        0 0 18px rgba(44, 199, 255, 0.30),
        inset 0 0 0 1px rgba(255, 255, 255, 0.09);
    }

    .result {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: rgba(4, 32, 91, 0.72);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    }

    .result strong {
      font-size: 24px;
      line-height: 1.15;
    }

    .result.ok strong {
      color: var(--ok);
    }

    .result.fail strong {
      color: var(--warn);
    }

    .result.wait strong {
      color: var(--wait);
    }

    .result p {
      margin: 0;
      color: #afdff6;
      font-size: 13px;
      font-weight: 300;
      line-height: 1.6;
    }

    .metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .metric {
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: rgba(4, 32, 91, 0.66);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    }

    .metric span {
      display: block;
      margin-bottom: 6px;
      color: #a9dcf6;
      font-size: 12px;
      font-weight: 300;
    }

    .metric b {
      font-size: 18px;
      font-variant-numeric: tabular-nums;
      color: #f5fcff;
      overflow-wrap: anywhere;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    button {
      min-height: 42px;
      border: 1px solid rgba(139, 223, 255, 0.54);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(8, 57, 134, 0.92), rgba(4, 36, 101, 0.96));
      color: #f5fcff;
      font-weight: 800;
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    button.primary {
      border-color: rgba(151, 239, 255, 0.76);
      color: #fff;
      background: linear-gradient(180deg, #2cc7ff 0%, #176de3 100%);
      box-shadow:
        0 0 18px rgba(44, 199, 255, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.20);
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    button:hover:not(:disabled) {
      filter: brightness(1.08);
    }

    .span-2 {
      grid-column: span 2;
    }

    .note {
      margin: 0;
      color: #a9dcf6;
      font-size: 12px;
      font-weight: 300;
      line-height: 1.6;
    }

    /*
     * 工程图线（参考 GB/T 4457.4 / ISO 128）
     * 粗实线 : 细实线 ≈ 2 : 1；non-scaling-stroke 保持屏幕线宽比
     */
    .draft-thick,
    .draft-thin,
    .draft-dash,
    .draft-aux {
      fill: none;
      stroke-linecap: square;
      stroke-linejoin: miter;
      vector-effect: non-scaling-stroke;
    }

    /* 粗实线：可见轮廓 */
    .draft-thick {
      stroke: var(--draft-ink);
      stroke-width: var(--draft-thick);
    }

    /* 细实线：尺寸线、尺寸界线 */
    .draft-thin {
      stroke: var(--draft-ink-dim);
      stroke-width: var(--draft-thin);
    }

    /* 细虚线：开口参考 / 假想轮廓 */
    .draft-dash {
      stroke: rgba(160, 220, 245, 0.72);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 4 2.5;
    }

    /* 装入轨迹（示意用辅助线，非标准图线） */
    .draft-aux {
      stroke: rgba(60, 199, 255, 0.75);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 5 4;
      stroke-linecap: round;
    }

    /* 剖面区域：仅 45° 细实线剖面线 */
    .wall {
      fill: url(#hatchMetal);
      stroke: none;
    }

    /* 空腔：浅底、无剖面线 */
    .cavity-fill {
      fill: var(--space-fill);
      stroke: none;
    }

    .dim-line {
      marker-start: url(#dimArrowStart);
      marker-end: url(#dimArrowEnd);
    }

    .dim-text,
    .label-text {
      fill: #f0faff;
      font-size: 10px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      dominant-baseline: middle;
      stroke: none;
    }

    .label-text.muted {
      fill: rgba(200, 230, 245, 0.78);
      font-size: 9px;
      font-weight: 500;
    }

    .turn-dot {
      fill: rgba(60, 199, 255, 0.9);
      stroke: #061f55;
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

    #part.blocked #partFill {
      fill: rgba(180, 35, 24, 0.16);
    }

    #part.blocked #partRect {
      stroke: var(--warn);
    }

    #partText {
      fill: #ffe8ec;
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-anchor: middle;
      dominant-baseline: middle;
      stroke: none;
    }

    #part.blocked #partText {
      fill: var(--warn);
    }

    .ghost {
      fill: none;
      stroke: rgba(92, 240, 167, 0.7);
      stroke-width: var(--draft-thin);
      stroke-dasharray: 4 2.5;
      stroke-linecap: square;
      stroke-linejoin: miter;
      vector-effect: non-scaling-stroke;
    }

    .hit-dot {
      fill: #ff707d;
      stroke: #fff4f6;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }

    .hit-label {
      fill: #ffd0d5;
      font-size: 9px;
      font-weight: 600;
      stroke: none;
    }

    #hatchMetal line {
      stroke: var(--draft-hatch);
      stroke-width: 0.45;
      vector-effect: non-scaling-stroke;
    }

    @media (max-width: 1100px) {
      main {
        width: min(100vw - 24px, 900px);
        padding-top: 18px;
      }

      .workspace {
        grid-template-columns: 1fr;
      }

      .controls {
        order: -1;
      }

      svg {
        min-height: clamp(360px, 62vw, 520px);
      }
    }

    @media (max-width: 700px) {
      main {
        width: min(100vw - 16px, 640px);
        padding: 18px 0 28px;
      }

      header {
        text-align: left;
        justify-items: start;
      }

      .stage-head,
      .controls {
        padding: 12px;
      }

      .svg-wrap {
        padding: 8px;
      }

      .input-grid,
      .metrics {
        gap: 8px;
      }
    }

    @media (max-width: 520px) {
      .input-grid,
      .metrics,
      .actions {
        grid-template-columns: 1fr;
      }

      .span-2 {
        grid-column: auto;
      }

      h1 {
        font-size: 24px;
      }

      .lead {
        font-size: 13px;
      }

      svg {
        min-height: 320px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>凹位装配模拟验证器</h1>
      <p class="version">v1.1 · 二维剖面 · 可扩展至 v2 三维</p>
      <p class="lead">输入空腔和矩形尺寸后点击验证。左右退进会与下方开口自动联动；左右空腔高度和内外圆角半径可不同。计算按二维剖面近似：矩形只能从下方开口进入，可旋转，最终水平放到顶部。安装间隙会收紧碰撞判定；最终贴顶时，离顶距离须不小于安装间隙，二者会互相制约。</p>
    </header>

    <section class="workspace" aria-label="凹位尺寸验证工具">
      <div class="stage">
        <div class="stage-head">
          <p class="stage-title">装入路径模拟</p>
        </div>
        <div class="svg-wrap">
          <svg id="diagram" viewBox="-30 -30 292 240" role="img" aria-labelledby="svgTitle svgDesc">
            <title id="svgTitle">凹位尺寸和矩形装入路径示意</title>
            <desc id="svgDesc">可输入顶部净宽、下方开口、左右退进、左右空腔高度、左右内外圆角半径、矩形长度和高度、安装间隙。矩形从下方开口旋转进入。</desc>
            <defs>
              <!-- 金属剖面线：45° 细实线，间距由脚本按图幅调整 -->
              <pattern id="hatchMetal" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line id="hatchMetalLine" x1="0" y1="0" x2="0" y2="4.5"></line>
              </pattern>
              <!-- 尺寸箭头：闭口实心；marker 随线宽缩放，配合 non-scaling 细实线保持屏幕可读 -->
              <marker id="dimArrowEnd" viewBox="0 0 10 6" refX="9.5" refY="3" markerWidth="9" markerHeight="6" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0.4 L9.5 3 L0 5.6 Z" fill="#b7dff5"></path>
              </marker>
              <marker id="dimArrowStart" viewBox="0 0 10 6" refX="0.5" refY="3" markerWidth="9" markerHeight="6" orient="auto" markerUnits="strokeWidth">
                <path d="M10 0.4 L0.5 3 L10 5.6 Z" fill="#b7dff5"></path>
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

            <text id="solidLabel" class="label-text muted">金属</text>

            <g id="part">
              <rect id="partFill"></rect>
              <rect id="partRect"></rect>
              <text id="partText">200 x 40</text>
            </g>
          </svg>
        </div>
      </div>

      <aside class="controls" aria-label="尺寸输入和计算结果">
        <fieldset>
          <legend>空腔尺寸</legend>
          <div class="input-grid">
            <label for="topWidthInput">
              顶部净宽（mm）
              <input id="topWidthInput" type="number" inputmode="decimal" min="1" step="0.5" value="212">
            </label>
            <label for="entryWidthInput">
              下方开口（mm）
              <input id="entryWidthInput" type="number" inputmode="decimal" min="1" step="0.5" value="192">
            </label>
            <label for="leftInsetInput">
              左侧退进（mm）
              <input id="leftInsetInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
            </label>
            <label for="rightInsetInput">
              右侧退进（mm）
              <input id="rightInsetInput" type="number" inputmode="decimal" min="0" step="0.5" value="20">
            </label>
            <label for="leftHeightInput">
              左侧空腔高度（mm）
              <input id="leftHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="50">
            </label>
            <label for="rightHeightInput">
              右侧空腔高度（mm）
              <input id="rightHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="50">
            </label>
            <label for="leftOuterRadiusInput">
              左外角圆角半径（mm）
              <input id="leftOuterRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
            </label>
            <label for="leftInnerRadiusInput">
              左内角圆角半径（mm）
              <input id="leftInnerRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
            </label>
            <label for="rightOuterRadiusInput">
              右外角圆角半径（mm）
              <input id="rightOuterRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
            </label>
            <label for="rightInnerRadiusInput">
              右内角圆角半径（mm）
              <input id="rightInnerRadiusInput" type="number" inputmode="decimal" min="0" step="0.5" value="0">
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>放入物体</legend>
          <div class="input-grid">
            <label for="partLengthInput">
              矩形长度（mm）
              <input id="partLengthInput" type="number" inputmode="decimal" min="1" step="0.5" value="200">
            </label>
            <label for="partHeightInput">
              矩形高度（mm）
              <input id="partHeightInput" type="number" inputmode="decimal" min="1" step="0.5" value="40">
            </label>
            <label for="topGapInput">
              离顶距离（mm）
              <input id="topGapInput" type="number" inputmode="decimal" min="0" step="0.5" value="5">
            </label>
            <label for="clearanceInput">
              安装间隙（mm）
              <input id="clearanceInput" type="number" inputmode="decimal" min="0" step="0.1" value="0">
            </label>
          </div>
        </fieldset>

        <div class="actions">
          <button class="primary" id="validateBtn" type="button">验证</button>
          <button id="resetBtn" type="button">重置</button>
          <button id="replayBtn" type="button" disabled>重播动画</button>
          <button id="copyBtn" type="button" disabled>复制结果</button>
        </div>

        <div id="result" class="result wait" aria-live="polite">
          <strong id="resultTitle">待验证</strong>
          <p id="resultCopy">当前尺寸已载入，点击验证开始计算。</p>
        </div>

        <div class="metrics">
          <div class="metric">
            <span>最大可放长度</span>
            <b id="maxLength">--</b>
          </div>
          <div class="metric">
            <span>当前物体</span>
            <b id="partMetric">200 x 40 · 顶5 · 隙0</b>
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
            <span>左角 / 右角</span>
            <b id="radiusMetric">0</b>
          </div>
        </div>

        <p class="note">说明：本页为单文件，不依赖网络和外部库，可离线打开。安装间隙会收紧碰撞边界；离顶距离表示最终上表面到顶壁的空隙，须 ≥ 安装间隙。计算为二维采样近似（v1.1）；实际加工请按真实公差用 CAD 复核。v2 将扩展三维模式，求解接口已预留。</p>
      </aside>
    </section>
  </main>

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
