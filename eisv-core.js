/**
 * EISV pure core — no DOM.
 * Pose2D: { x, y, deg }
 * Loaded on main thread and inside Blob Worker.
 */
(function (global) {
  "use strict";

  const meta = {
    version: "1.1",
    mode: "2d",
    modesAvailable: ["2d"]
  };

  const DEFAULTS = {
    topWidth: 212,
    entryWidth: 192,
    leftInset: 0,
    rightInset: 20,
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
  };

  function formatNumber(value) {
    return Number(Number(value).toFixed(1)).toString();
  }

  function formatInputValue(value) {
    if (!Number.isFinite(value)) return "";
    return Number(value.toFixed(3)).toString();
  }

  /** Sanitize values for drawing only — per-field fallback, never wholesale DEFAULTS. */
  function valuesForDraw(values) {
    const d = DEFAULTS;
    function pos(v, def) {
      if (!Number.isFinite(v) || v <= 0) return def;
      return Math.min(v, 800);
    }
    function nonNeg(v, def) {
      if (!Number.isFinite(v) || v < 0) return def;
      return Math.min(v, 800);
    }
    const topWidth = pos(values.topWidth, d.topWidth);
    const leftInset = nonNeg(values.leftInset, d.leftInset);
    const rightInset = nonNeg(values.rightInset, d.rightInset);
    let entryWidth = pos(values.entryWidth, d.entryWidth);
    if (leftInset + rightInset < topWidth) {
      entryWidth = topWidth - leftInset - rightInset;
    } else {
      entryWidth = Math.max(1, topWidth * 0.5);
    }
    return {
      topWidth,
      entryWidth,
      leftInset: Math.min(leftInset, topWidth * 0.45),
      rightInset: Math.min(rightInset, topWidth * 0.45),
      leftHeight: pos(values.leftHeight, d.leftHeight),
      rightHeight: pos(values.rightHeight, d.rightHeight),
      leftOuterRadius: nonNeg(values.leftOuterRadius, 0),
      leftInnerRadius: nonNeg(values.leftInnerRadius, 0),
      rightOuterRadius: nonNeg(values.rightOuterRadius, 0),
      rightInnerRadius: nonNeg(values.rightInnerRadius, 0),
      partLength: pos(values.partLength, d.partLength),
      partHeight: pos(values.partHeight, d.partHeight),
      topGap: nonNeg(values.topGap, d.topGap),
      clearance: nonNeg(values.clearance, 0)
    };
  }

  function validateValues(values) {
    const names = [
      ["顶部净宽", values.topWidth],
      ["下方开口", values.entryWidth],
      ["左侧空腔高度", values.leftHeight],
      ["右侧空腔高度", values.rightHeight],
      ["矩形长度", values.partLength],
      ["矩形高度", values.partHeight]
    ];
    for (const [label, value] of names) {
      if (!Number.isFinite(value) || value <= 0) return `${label}必须大于 0。`;
    }
    const nonNegativeNames = [
      ["左侧退进", values.leftInset],
      ["右侧退进", values.rightInset],
      ["左外角圆角半径", values.leftOuterRadius],
      ["左内角圆角半径", values.leftInnerRadius],
      ["右外角圆角半径", values.rightOuterRadius],
      ["右内角圆角半径", values.rightInnerRadius],
      ["离顶距离", values.topGap],
      ["安装间隙", values.clearance]
    ];
    for (const [label, value] of nonNegativeNames) {
      if (!Number.isFinite(value) || value < 0) return `${label}不能小于 0。`;
    }
    if (values.leftInset + values.rightInset >= values.topWidth) {
      return "左右退进之和必须小于顶部净宽。";
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
      return "下方开口应等于顶部净宽减左侧退进和右侧退进。";
    }
    const cavityMaxH = Math.max(values.leftHeight, values.rightHeight);
    if (values.partHeight > cavityMaxH) {
      return "矩形高度大于空腔最大高度，无法放入。";
    }
    if (values.topGap + values.partHeight > cavityMaxH + 0.001) {
      return "矩形高度与离顶距离之和超过空腔高度，无法水平放到顶部。";
    }
    // 最终贴顶区：零件上表面在 y=topGap，安装间隙要求离实体壁 ≥ clearance
    // 故离顶距离必须 ≥ 安装间隙，否则顶侧间隙与离顶设定互相干涉（并非「越过」顶壁）
    if (values.clearance > 0 && values.topGap + 0.001 < values.clearance) {
      return "离顶距离与安装间隙互相干涉：最终位姿下零件上表面到顶壁的空隙为离顶距离，须不小于安装间隙。请增大离顶距离，或减小安装间隙（贴顶且要求间隙时二者不能同时满足）。";
    }
    if (Object.values(values).some((value) => Number.isFinite(value) && value > 800)) {
      return "单项尺寸建议不超过 800mm；此工具为浏览器内近似验证。";
    }
    return "";
  }

  /** Pure linked-field update. Returns patch object for changed dependents. */
  function linkedInputPatch(values, changedKey) {
    const topWidth = values.topWidth;
    if (!Number.isFinite(topWidth)) return {};
    if (changedKey === "entryWidth") {
      const entryWidth = values.entryWidth;
      const leftInset = values.leftInset;
      if (Number.isFinite(entryWidth)) {
        return {
          rightInset: topWidth - (Number.isFinite(leftInset) ? leftInset : 0) - entryWidth
        };
      }
      return {};
    }
    if (changedKey === "leftInset" || changedKey === "rightInset" || changedKey === "topWidth") {
      const leftInset = values.leftInset;
      const rightInset = values.rightInset;
      if (Number.isFinite(rightInset)) {
        return {
          entryWidth: topWidth - (Number.isFinite(leftInset) ? leftInset : 0) - rightInset
        };
      }
    }
    return {};
  }

  function deriveGeom(values) {
    const entryLeft = values.leftInset;
    const entryRight = values.topWidth - values.rightInset;
    const entryWidth = entryRight - entryLeft;
    const cavityHeight = Math.max(values.leftHeight, values.rightHeight);
    const yMax = cavityHeight + Math.max((values.topGap + values.partHeight) * 3, values.topWidth * 0.55, 90);
    const maxDim = Math.max(
      values.topWidth,
      values.entryWidth,
      values.leftHeight,
      values.rightHeight,
      values.partLength,
      values.partHeight,
      values.topGap,
      yMax
    );
    const grid = Math.max(1, Math.ceil(maxDim / 320));
    return {
      topWidth: values.topWidth,
      entryLeft,
      entryRight,
      entryWidth,
      leftInset: values.leftInset,
      rightInset: values.rightInset,
      leftHeight: values.leftHeight,
      rightHeight: values.rightHeight,
      leftOuterRadius: values.leftOuterRadius,
      leftInnerRadius: values.leftInnerRadius,
      rightOuterRadius: values.rightOuterRadius,
      rightInnerRadius: values.rightInnerRadius,
      cavityHeight,
      partLength: values.partLength,
      partHeight: values.partHeight,
      topGap: values.topGap,
      stepWidth: values.rightInset,
      yMax,
      grid,
      angleStep: grid > 1 ? 2 : 1,
      minAngle: -88,
      maxAngle: 88
    };
  }

  function buildCavityPaths(geom) {
    const lo = geom.leftOuterRadius;
    const li = geom.leftInnerRadius;
    const ro = geom.rightOuterRadius;
    const ri = geom.rightInnerRadius;

    const rightOuter = ro > 0
      ? `V ${geom.rightHeight - ro} A ${ro} ${ro} 0 0 1 ${geom.topWidth - ro} ${geom.rightHeight}`
      : `V ${geom.rightHeight}`;
    const rightInner = ri > 0
      ? `H ${geom.entryRight + ri} A ${ri} ${ri} 0 0 0 ${geom.entryRight} ${geom.rightHeight + ri}`
      : `H ${geom.entryRight}`;
    const leftInner = li > 0
      ? `V ${geom.leftHeight + li} A ${li} ${li} 0 0 0 ${geom.entryLeft - li} ${geom.leftHeight}`
      : `V ${geom.leftHeight}`;
    const leftOuter = lo > 0
      ? `H ${lo} A ${lo} ${lo} 0 0 1 0 ${geom.leftHeight - lo}`
      : "H 0";

    const fill = `M 0 0 H ${geom.topWidth} ${rightOuter} ${rightInner} V ${geom.yMax} H ${geom.entryLeft} ${leftInner} ${leftOuter} V 0 Z`;
    const stroke = `M ${geom.entryLeft} ${geom.yMax} ${leftInner} ${leftOuter} V 0 H ${geom.topWidth} ${rightOuter} ${rightInner} V ${geom.yMax}`;
    const pad = Math.max(24, geom.topWidth * 0.1);
    const wall = `M ${-pad} ${-pad} H ${geom.topWidth + pad} V ${geom.yMax + pad} H ${-pad} Z ${fill}`;
    return { fill, stroke, wall, pad };
  }

  function xMinAt(geom, y) {
    if (y < 0) return Infinity;
    const outer = geom.leftOuterRadius;
    const inner = geom.leftInnerRadius;
    if (outer > 0 && y > geom.leftHeight - outer && y <= geom.leftHeight) {
      const cy = geom.leftHeight - outer;
      return outer - Math.sqrt(Math.max(0, outer * outer - (y - cy) * (y - cy)));
    }
    if (y <= geom.leftHeight) return 0;
    if (inner > 0 && y <= geom.leftHeight + inner) {
      const dy = y - geom.leftHeight;
      return geom.entryLeft - inner + Math.sqrt(Math.max(0, inner * inner - (inner - dy) * (inner - dy)));
    }
    return geom.entryLeft;
  }

  function xMaxAt(geom, y) {
    if (y < 0) return -Infinity;
    const outer = geom.rightOuterRadius;
    const inner = geom.rightInnerRadius;
    if (outer > 0 && y > geom.rightHeight - outer && y <= geom.rightHeight) {
      const cy = geom.rightHeight - outer;
      return geom.topWidth - outer + Math.sqrt(Math.max(0, outer * outer - (y - cy) * (y - cy)));
    }
    if (y <= geom.rightHeight) return geom.topWidth;
    if (inner > 0 && y <= geom.rightHeight + inner) {
      const dy = y - geom.rightHeight;
      return geom.entryRight + inner - Math.sqrt(Math.max(0, inner * inner - (inner - dy) * (inner - dy)));
    }
    return geom.entryRight;
  }

  function openingYAt(geom, x) {
    const clampedX = Math.max(geom.entryLeft, Math.min(geom.entryRight, x));
    const ratio = geom.entryWidth === 0 ? 0 : (clampedX - geom.entryLeft) / geom.entryWidth;
    return geom.leftHeight + (geom.rightHeight - geom.leftHeight) * ratio;
  }

  function edgeSamples(length, height, angleDeg, denser) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const halfL = length / 2;
    const halfH = height / 2;
    const corners = [
      [-halfL, -halfH],
      [halfL, -halfH],
      [halfL, halfH],
      [-halfL, halfH]
    ];
    const points = [];
    const base = Math.max(8, Math.ceil(Math.max(length, height) / 8));
    const perEdge = denser ? base + 4 : base;

    for (let i = 0; i < corners.length; i += 1) {
      const start = corners[i];
      const end = corners[(i + 1) % corners.length];
      for (let step = 0; step <= perEdge; step += 1) {
        const t = step / perEdge;
        const localX = start[0] + (end[0] - start[0]) * t;
        const localY = start[1] + (end[1] - start[1]) * t;
        points.push([localX * cos - localY * sin, localX * sin + localY * cos]);
      }
    }
    return points;
  }

  function worldSamples(pose, length, height, denser) {
    const local = edgeSamples(length, height, pose.deg, denser);
    return local.map(([lx, ly]) => [pose.x + lx, pose.y + ly]);
  }

  function createSpace2D(values) {
    const geom = deriveGeom(values);
    const partTemplate = { length: values.partLength, height: values.partHeight };

    function angleList() {
      const list = [];
      for (let a = geom.minAngle; a <= geom.maxAngle; a += geom.angleStep) list.push(a);
      return list;
    }

    function validPose(part, pose, clearance) {
      const c = clearance || 0;
      const denser = c > 0;
      const samples = worldSamples(pose, part.length, part.height, denser);
      for (const [x, y] of samples) {
        if (y < -0.001 + c) return false;
        if (x < xMinAt(geom, y) + c - 0.001 || x > xMaxAt(geom, y) - c + 0.001) return false;
      }
      return true;
    }

    function isEntryPose(part, pose, clearance) {
      const c = clearance || 0;
      const samples = worldSamples(pose, part.length, part.height, c > 0);
      for (const [x, y] of samples) {
        if (
          x < geom.entryLeft - 0.001 + c ||
          x > geom.entryRight + 0.001 - c ||
          y < openingYAt(geom, x) - 0.001 + c
        ) {
          return false;
        }
      }
      return true;
    }

    function findFirstHit(part, pose, clearance) {
      const c = clearance || 0;
      const samples = worldSamples(pose, part.length, part.height, true);
      for (const [x, y] of samples) {
        // 真·穿出顶壁（y<0）；有间隙时 y∈[0,c) 是顶侧间隙不足，不是「越过边界」
        if (y < -0.001) {
          return { pose, point: { x, y }, reason: "越过顶部边界" };
        }
        if (c > 0 && y < c - 0.001) {
          return {
            pose,
            point: { x, y },
            reason: "顶侧安装间隙不足（离顶距离须 ≥ 安装间隙）"
          };
        }
        const xmin = xMinAt(geom, y) + c;
        const xmax = xMaxAt(geom, y) - c;
        if (x < xmin - 0.001) {
          return {
            pose,
            point: { x, y },
            reason: c > 0 ? "左侧壁安装间隙不足" : "左侧壁干涉"
          };
        }
        if (x > xmax + 0.001) {
          return {
            pose,
            point: { x, y },
            reason: c > 0 ? "右侧壁安装间隙不足" : "右侧壁干涉"
          };
        }
      }
      return null;
    }

    function finalPlacementPose(part, options) {
      const topGap = options.topGap != null ? options.topGap : geom.topGap;
      const openingCenter = geom.entryLeft + geom.entryWidth / 2;
      const minX = part.length / 2;
      const maxX = geom.topWidth - part.length / 2;
      const x = Math.max(minX, Math.min(maxX, openingCenter));
      return { x, y: topGap + part.height / 2, deg: 0 };
    }

    function seedFinalCenters(part, options) {
      const finalPose = finalPlacementPose(part, options);
      const minX = part.length / 2;
      const maxX = geom.topWidth - part.length / 2;
      const centers = [];
      for (let x = minX; x <= maxX + 0.001; x += geom.grid) centers.push(x);
      centers.sort((a, b) => Math.abs(a - finalPose.x) - Math.abs(b - finalPose.x));
      return { finalPose, centers };
    }

    function searchBounds(gridScale) {
      const scale = gridScale || 1;
      const grid = geom.grid * scale;
      const angles = [];
      const step = geom.angleStep * (scale > 1 ? 2 : 1);
      for (let a = geom.minAngle; a <= geom.maxAngle; a += step) angles.push(a);
      if (!angles.includes(0)) angles.push(0);
      angles.sort((a, b) => a - b);
      const gridXCount = Math.round(geom.topWidth / grid) + 1;
      const gridYCount = Math.round(geom.yMax / grid) + 1;
      return {
        grid,
        gridXCount,
        gridYCount,
        angles,
        zeroAngleIndex: angles.indexOf(0)
      };
    }

    function failHintPath(part) {
      const entryCenter = geom.entryLeft + geom.entryWidth / 2;
      if (part.length > geom.topWidth) {
        return [
          { x: entryCenter, y: geom.cavityHeight + part.height * 2.4, deg: -24 },
          { x: entryCenter, y: geom.cavityHeight + part.height * 1.2, deg: -24 },
          { x: geom.topWidth / 2, y: part.height / 2, deg: 0 }
        ];
      }
      return [
        { x: entryCenter, y: geom.cavityHeight + part.height * 2.4, deg: -36 },
        { x: entryCenter, y: geom.cavityHeight + part.height * 1.5, deg: -36 },
        { x: entryCenter, y: geom.cavityHeight + part.height * 0.8, deg: -36 }
      ];
    }

    return {
      mode: "2d",
      geom,
      partTemplate,
      paths: buildCavityPaths(geom),
      validPose,
      isEntryPose,
      findFirstHit,
      finalPlacementPose,
      seedFinalCenters,
      searchBounds,
      failHintPath,
      xMinAt: (y) => xMinAt(geom, y),
      xMaxAt: (y) => xMaxAt(geom, y)
    };
  }

  function downsamplePath(path) {
    if (path.length <= 42) return path;
    const reduced = [];
    const stride = Math.max(1, Math.floor(path.length / 38));
    for (let i = 0; i < path.length; i += stride) reduced.push(path[i]);
    const last = path[path.length - 1];
    if (reduced[reduced.length - 1] !== last) reduced.push(last);
    return reduced;
  }

  /**
   * Generic BFS path search over a Space interface.
   * No mode branches — only space methods.
   */
  function findPath(space, part, options) {
    const clearance = options.clearance || 0;
    const keepParents = Boolean(options.keepPath);
    const topGap = options.topGap != null ? options.topGap : 0;
    const geomTop = space.geom ? space.geom.topWidth : Infinity;

    if (part.length > geomTop) {
      const hint = space.failHintPath(part, options);
      const hitPose = hint[hint.length - 1] || { x: 0, y: 0, deg: 0 };
      return {
        ok: false,
        path: [],
        firstHit: space.findFirstHit(part, hitPose, clearance) || {
          pose: hitPose,
          point: { x: hitPose.x, y: hitPose.y },
          reason: "长度超过顶部净宽"
        }
      };
    }

    const bounds = space.searchBounds(options.gridScale || 1);
    const { grid, gridXCount, gridYCount, angles, zeroAngleIndex } = bounds;
    const nx = gridXCount;
    const ny = gridYCount;
    const nCell = nx * ny;

    function stateKey(ix, iy, ia) {
      return ix + iy * nx + ia * nCell;
    }

    function poseOf(ix, iy, ia) {
      return { x: ix * grid, y: iy * grid, deg: angles[ia] };
    }

    function decodeKey(k) {
      const ia = Math.floor(k / nCell);
      const rem = k - ia * nCell;
      const iy = Math.floor(rem / nx);
      const ix = rem - iy * nx;
      return [ix, iy, ia];
    }

    const queue = [];
    const seen = new Set();
    const parent = keepParents ? new Map() : null;
    const { finalPose, centers } = space.seedFinalCenters(part, { topGap, clearance });

    for (const cx of centers) {
      const ix = Math.round(cx / grid);
      const iy = Math.round(finalPose.y / grid);
      if (ix < 0 || ix >= gridXCount || iy < 0 || iy >= gridYCount) continue;
      const sk = stateKey(ix, iy, zeroAngleIndex);
      const p = poseOf(ix, iy, zeroAngleIndex);
      if (!seen.has(sk) && space.validPose(part, p, clearance)) {
        seen.add(sk);
        queue.push(sk);
        if (parent) parent.set(sk, -1);
      }
    }

    const moves = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];

    let head = 0;
    while (head < queue.length) {
      const sk = queue[head];
      head += 1;
      const [ix, iy, ia] = decodeKey(sk);
      const p = poseOf(ix, iy, ia);

      if (space.isEntryPose(part, p, clearance)) {
        const found = { ok: true, path: [], firstHit: null };
        if (parent) {
          let cursor = sk;
          while (cursor !== undefined && cursor !== -1) {
            const parts = decodeKey(cursor);
            found.path.push(poseOf(parts[0], parts[1], parts[2]));
            cursor = parent.get(cursor);
          }
          const first = found.path[0];
          const yMax = space.geom.yMax;
          const extended = {
            x: first.x,
            y: Math.min(yMax - part.height / 2, first.y + part.height * 1.2),
            deg: first.deg
          };
          if (space.isEntryPose(part, extended, clearance)) {
            found.path.unshift(extended);
          }
          found.path[found.path.length - 1] = finalPose;
        }
        return found;
      }

      for (const [dx, dy, da] of moves) {
        const nix = ix + dx;
        const niy = iy + dy;
        const nia = ia + da;
        if (nix < 0 || nix >= gridXCount || niy < 0 || niy >= gridYCount || nia < 0 || nia >= angles.length) {
          continue;
        }
        const nsk = stateKey(nix, niy, nia);
        if (seen.has(nsk)) continue;
        const next = poseOf(nix, niy, nia);
        if (!space.validPose(part, next, clearance)) continue;
        seen.add(nsk);
        queue.push(nsk);
        if (parent) parent.set(nsk, sk);
      }
    }

    const hint = space.failHintPath(part, options);
    let firstHit = null;
    for (let i = hint.length - 1; i >= 0; i -= 1) {
      firstHit = space.findFirstHit(part, hint[i], clearance);
      if (firstHit) break;
    }
    if (!firstHit) {
      firstHit = space.findFirstHit(part, finalPose, clearance);
    }
    return { ok: false, path: [], firstHit };
  }

  function estimateMaxLength(space, height, options) {
    const clearance = options.clearance || 0;
    const topGap = options.topGap != null ? options.topGap : space.geom.topGap;
    const grid = space.geom.grid;
    let low = 0;
    let high = space.geom.topWidth;
    const eps = Math.max(0.05, grid / 2);
    let guard = 0;
    while (high - low > eps && guard < 20) {
      guard += 1;
      const mid = (low + high) / 2;
      const part = { length: mid, height };
      if (findPath(space, part, { clearance, topGap, keepPath: false }).ok) low = mid;
      else high = mid;
    }
    return Math.floor(low * 10) / 10;
  }

  /**
   * Optional two-phase: coarse probe then fine path when keepPath.
   */
  function findPathWithRefine(space, part, options) {
    if (!options.keepPath) {
      return findPath(space, part, options);
    }
    const coarse = findPath(space, part, { ...options, keepPath: false, gridScale: 2 });
    if (!coarse.ok) {
      return findPath(space, part, { ...options, gridScale: 1 });
    }
    return findPath(space, part, { ...options, gridScale: 1 });
  }

  function solve(request) {
    const mode = request.mode || "2d";
    if (mode !== "2d") {
      return {
        ok: false,
        mode,
        path: [],
        maxLength: null,
        error: `模式 ${mode} 尚未实现（v1 仅支持 2d）。`,
        diagnostics: {
          grid: 0,
          angleStep: 0,
          clearance: 0,
          margin: null,
          firstHit: null,
          warnings: []
        }
      };
    }

    const cavity = request.cavity || {};
    const partIn = request.part || {};
    const options = request.options || {};
    const values = {
      topWidth: cavity.topWidth,
      entryWidth: cavity.entryWidth,
      leftInset: cavity.leftInset,
      rightInset: cavity.rightInset,
      leftHeight: cavity.leftHeight,
      rightHeight: cavity.rightHeight,
      leftOuterRadius: cavity.leftOuterRadius,
      leftInnerRadius: cavity.leftInnerRadius,
      rightOuterRadius: cavity.rightOuterRadius,
      rightInnerRadius: cavity.rightInnerRadius,
      partLength: partIn.length,
      partHeight: partIn.height,
      topGap: options.topGap != null ? options.topGap : 0,
      clearance: options.clearance != null ? options.clearance : 0
    };

    const error = validateValues(values);
    if (error) {
      return {
        ok: false,
        mode: "2d",
        path: [],
        maxLength: null,
        error,
        diagnostics: {
          grid: 0,
          angleStep: 0,
          clearance: values.clearance,
          margin: null,
          firstHit: null,
          warnings: []
        }
      };
    }

    const space = createSpace2D(values);
    const part = { length: values.partLength, height: values.partHeight };
    const clearance = values.clearance;
    const topGap = values.topGap;

    let maxLength = null;
    if (options.estimateMax !== false) {
      maxLength = estimateMaxLength(space, part.height, { clearance, topGap });
    }

    const pathResult = options.keepPath
      ? findPathWithRefine(space, part, { clearance, topGap, keepPath: true })
      : findPath(space, part, { clearance, topGap, keepPath: false });

    let path = [];
    if (pathResult.ok) {
      path = options.keepPath ? downsamplePath(pathResult.path) : pathResult.path;
    } else if (options.keepPath) {
      path = space.failHintPath(part, { topGap, clearance });
    }

    const margin =
      maxLength != null && pathResult.ok ? Math.round((maxLength - part.length) * 10) / 10 : null;

    return {
      ok: pathResult.ok,
      mode: "2d",
      path,
      maxLength,
      error: "",
      geom: space.geom,
      paths: space.paths,
      diagnostics: {
        grid: space.geom.grid,
        angleStep: space.geom.angleStep,
        clearance,
        margin,
        firstHit: pathResult.ok ? null : pathResult.firstHit,
        warnings: []
      }
    };
  }

  function buildSolveRequest(values, options) {
    return {
      mode: "2d",
      cavity: {
        topWidth: values.topWidth,
        entryWidth: values.entryWidth,
        leftInset: values.leftInset,
        rightInset: values.rightInset,
        leftHeight: values.leftHeight,
        rightHeight: values.rightHeight,
        leftOuterRadius: values.leftOuterRadius,
        leftInnerRadius: values.leftInnerRadius,
        rightOuterRadius: values.rightOuterRadius,
        rightInnerRadius: values.rightInnerRadius
      },
      part: {
        length: values.partLength,
        height: values.partHeight
      },
      options: {
        clearance: values.clearance || 0,
        topGap: values.topGap,
        keepPath: Boolean(options && options.keepPath),
        estimateMax: options && options.estimateMax === false ? false : true
      }
    };
  }

  const api = {
    meta,
    DEFAULTS,
    formatNumber,
    formatInputValue,
    valuesForDraw,
    validateValues,
    linkedInputPatch,
    deriveGeom,
    buildCavityPaths,
    createSpace2D,
    findPath,
    estimateMaxLength,
    solve,
    buildSolveRequest,
    downsamplePath
  };

  global.EISV_CORE = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
