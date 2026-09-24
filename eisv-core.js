/**
 * EISV pure core — no DOM.
 * Pose2D: { x, y, deg }
 * Loaded on main thread and inside Blob Worker.
 */
(function (global) {
  "use strict";

  const meta = {
    version: "1.1.5",
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
    let leftInset = nonNeg(values.leftInset, d.leftInset);
    let rightInset = nonNeg(values.rightInset, d.rightInset);
    // 只有退进之和不合法时才截断，合法输入必须按原尺寸绘制（与求解几何一致）
    if (leftInset + rightInset >= topWidth) {
      leftInset = Math.min(leftInset, topWidth * 0.45);
      rightInset = Math.min(rightInset, topWidth * 0.45);
    }
    const entryWidth = topWidth - leftInset - rightInset;
    return {
      topWidth,
      entryWidth,
      leftInset,
      rightInset,
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
    const hasInset = values.leftInset > 0.001 || values.rightInset > 0.001;
    if (values.partHeight > cavityMaxH) {
      return "矩形高度大于空腔最大高度，无法放入。";
    }
    if (hasInset) {
      // 落在退台上：件高不宜超过较矮一侧退台高度（否则顶面会越过腔顶）
      const stepMin = Math.min(values.leftHeight, values.rightHeight);
      if (values.partHeight > stepMin + 0.001) {
        return "矩形高度大于较矮一侧空腔高度，无法落在退台上。";
      }
    } else if (values.topGap + values.partHeight > cavityMaxH + 0.001) {
      return "矩形高度与离顶距离之和超过空腔高度，无法水平放到顶部。";
    }
    // 直壁吸顶：离顶距离须 ≥ 安装间隙。有退台时最终位姿由退台决定，此项不套用用户离顶输入。
    if (!hasInset && values.clearance > 0 && values.topGap + 0.001 < values.clearance) {
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
    return { fill, stroke };
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

  /** 零件边界 + 内部网格采样点（世界坐标）；仅用于失败诊断定位干涉点 */
  function worldSamples(pose, length, height) {
    const rad = (pose.deg * Math.PI) / 180;
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
    const toWorld = (lx, ly) => [pose.x + lx * cos - ly * sin, pose.y + lx * sin + ly * cos];
    const points = [];
    const perEdge = Math.max(16, Math.ceil(Math.max(length, height) / 4)) + 8;
    for (let i = 0; i < corners.length; i += 1) {
      const start = corners[i];
      const end = corners[(i + 1) % corners.length];
      for (let step = 0; step <= perEdge; step += 1) {
        const t = step / perEdge;
        points.push(toWorld(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t));
      }
    }
    const nx = 8;
    const ny = 5;
    for (let ix = 0; ix <= nx; ix += 1) {
      for (let iy = 0; iy <= ny; iy += 1) {
        points.push(toWorld(-halfL + (length * ix) / nx, -halfH + (height * iy) / ny));
      }
    }
    return points;
  }

  function createSpace2D(values) {
    const geom = deriveGeom(values);

    function pointFree(x, y, c) {
      if (y < -0.001 + c) return false;
      if (x < xMinAt(geom, y) + c - 0.001 || x > xMaxAt(geom, y) - c + 0.001) return false;
      return true;
    }

    /**
     * 可行域边界折线（按安装间隙 c 偏移）：竖直壁与腔顶内缩 c，退台顶面不偏移
     * （零件可落台接触），与 pointFree 的语义一致。圆弧按弦折线近似（误差 < 0.01mm 量级）。
     */
    const boundaryCache = new Map();
    const FAR = 1e6;

    function arcPoints(cx, cy, r, a0, a1, dx) {
      const n = Math.max(6, Math.min(48, Math.ceil(r)));
      const pts = [];
      for (let i = 0; i <= n; i += 1) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([cx + r * Math.cos(a) + dx, cy + r * Math.sin(a)]);
      }
      return pts;
    }

    function boundarySegments(c) {
      const cached = boundaryCache.get(c);
      if (cached) return cached;
      const { topWidth: tw, entryLeft: el, entryRight: er, leftHeight: lh, rightHeight: rh } = geom;
      const lo = geom.leftOuterRadius;
      const li = geom.leftInnerRadius;
      const ro = geom.rightOuterRadius;
      const ri = geom.rightInnerRadius;
      const half = Math.PI / 2;
      let pts = [[el + c, FAR]];
      // 左侧：开口壁 → 内角 → 左台顶 → 外角 → 左壁 → 腔顶
      pts = pts.concat(li > 0 ? arcPoints(el - li, lh + li, li, 0, -half, c) : [[el + c, lh]]);
      pts = pts.concat(lo > 0 ? arcPoints(lo, lh - lo, lo, half, Math.PI, c) : [[c, lh]]);
      pts.push([c, c], [tw - c, c]);
      // 右侧：右壁 → 外角 → 右台顶 → 内角 → 开口壁
      pts = pts.concat(ro > 0 ? arcPoints(tw - ro, rh - ro, ro, 0, half, -c) : [[tw - c, rh]]);
      pts = pts.concat(ri > 0 ? arcPoints(er + ri, rh + ri, ri, -half, -Math.PI, -c) : [[er - c, rh]]);
      pts.push([er - c, FAR]);

      const segs = [];
      for (let i = 1; i < pts.length; i += 1) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        if (x0 === x1 && y0 === y1) continue;
        segs.push({
          x0,
          y0,
          x1,
          y1,
          minX: Math.min(x0, x1),
          maxX: Math.max(x0, x1),
          minY: Math.min(y0, y1),
          maxY: Math.max(y0, y1)
        });
      }
      boundaryCache.set(c, segs);
      return segs;
    }

    /** 线段（零件局部坐标）是否穿过 [-hx,hx]×[-hy,hy]（Liang–Barsky） */
    function segmentHitsBox(ax, ay, bx, by, hx, hy) {
      const dx = bx - ax;
      const dy = by - ay;
      const p = [-dx, dx, -dy, dy];
      const q = [ax + hx, hx - ax, ay + hy, hy - ay];
      let t0 = 0;
      let t1 = 1;
      for (let i = 0; i < 4; i += 1) {
        if (p[i] === 0) {
          if (q[i] < 0) return false;
        } else {
          const r = q[i] / p[i];
          if (p[i] < 0) {
            if (r > t0) t0 = r;
          } else if (r < t1) {
            t1 = r;
          }
          if (t0 > t1) return false;
        }
      }
      return true;
    }

    /**
     * 精确位姿校验：零件矩形整体在可行域内 ⇔ 中心在域内 且 无边界线段穿入矩形内部。
     * 不依赖采样密度；允许贴合接触（内缩 0.001 容差）。
     */
    function validPose(part, pose, clearance) {
      const c = clearance || 0;
      if (!pointFree(pose.x, pose.y, c)) return false;
      const rad = (pose.deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const hx = part.length / 2 - 0.001;
      const hy = part.height / 2 - 0.001;
      if (hx <= 0 || hy <= 0) return true;
      const reach = Math.hypot(hx, hy);
      const segs = boundarySegments(c);
      for (let i = 0; i < segs.length; i += 1) {
        const s = segs[i];
        if (
          s.maxX < pose.x - reach ||
          s.minX > pose.x + reach ||
          s.maxY < pose.y - reach ||
          s.minY > pose.y + reach
        ) {
          continue;
        }
        const ax = s.x0 - pose.x;
        const ay = s.y0 - pose.y;
        const bx = s.x1 - pose.x;
        const by = s.y1 - pose.y;
        if (
          segmentHitsBox(
            ax * cos + ay * sin,
            -ax * sin + ay * cos,
            bx * cos + by * sin,
            -bx * sin + by * cos,
            hx,
            hy
          )
        ) {
          return false;
        }
      }
      return true;
    }

    /** 入口位姿：开口两壁与开口线围成凸区域，矩形四角在内即整体在内 */
    function isEntryPose(part, pose, clearance) {
      const c = clearance || 0;
      const rad = (pose.deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const hl = part.length / 2;
      const hh = part.height / 2;
      const corners = [[-hl, -hh], [hl, -hh], [hl, hh], [-hl, hh]];
      for (const [lx, ly] of corners) {
        const x = pose.x + lx * cos - ly * sin;
        const y = pose.y + lx * sin + ly * cos;
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
      const samples = worldSamples(pose, part.length, part.height);
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

    /**
     * 最终落位（分层）：
     * 1 无退台 → top 吸顶对中
     * 2 不等高 → bridge：浅侧内角 + 深侧台面；深侧触点扫描，可行域内 |cx−开口中心| 最小
     * 3 等高或无法斜担 → 较矮（等高）一侧 step，经碰撞校验后仍优先对中（有退台不吸顶）
     */
    function finalPlacementPose(part, options) {
      const clearance = options.clearance || 0;
      const topGapRaw = options.topGap != null ? options.topGap : geom.topGap;
      const openingCenter = geom.entryLeft + geom.entryWidth / 2;
      const halfL = part.length / 2;
      const halfH = part.height / 2;
      const topW = geom.topWidth;
      const clampX = (x) => Math.max(halfL, Math.min(topW - halfL, x));
      const lh = geom.leftHeight;
      const rh = geom.rightHeight;
      const ax = geom.entryLeft;
      const bx = geom.entryRight;
      const L = part.length;
      const dy = rh - lh;

      function bottomCorners(pose) {
        const rad = (pose.deg * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return {
          contactLeft: {
            x: pose.x - halfL * c - halfH * s,
            y: pose.y - halfL * s + halfH * c
          },
          contactRight: {
            x: pose.x + halfL * c - halfH * s,
            y: pose.y + halfL * s + halfH * c
          }
        };
      }

      function poseFromBottomLeft(x1, y1, cos, sin, deg) {
        return {
          x: x1 + halfL * cos + halfH * sin,
          y: y1 + halfL * sin - halfH * cos,
          deg
        };
      }

      function pack(mode, pose, extra) {
        const ends = bottomCorners(pose);
        const out = {
          x: pose.x,
          y: pose.y,
          deg: pose.deg,
          mode,
          derivedTopGap: Math.max(0, pose.y - halfH * Math.cos((pose.deg * Math.PI) / 180)),
          contactLeft: ends.contactLeft,
          contactRight: ends.contactRight
        };
        if (extra) {
          if (extra.supportLeft) out.supportLeft = extra.supportLeft;
          if (extra.supportRight) out.supportRight = extra.supportRight;
          if (extra.derivedTopGap != null) out.derivedTopGap = extra.derivedTopGap;
        }
        return out;
      }

      // 1) 直壁
      if (geom.leftInset <= 0.001 && geom.rightInset <= 0.001) {
        const gap = Number.isFinite(topGapRaw) ? topGapRaw : 1;
        const x = Math.max(halfL + clearance, Math.min(topW - halfL - clearance, openingCenter));
        return pack("top", { x, y: gap + halfH, deg: 0 }, { derivedTopGap: gap });
      }

      // 2) 不等高 bridge（等高直接走 3) step）
      // 浅侧内角 S + 深侧台面点 D；|SD|≤L；多余长只伸向浅侧；精确校验过滤后取 |cx − 开口中心| 最小
      if (Math.abs(dy) >= 0.001 && L + 0.001 >= Math.abs(dy)) {
        const leftShallow = lh <= rh;
        const S = leftShallow ? { x: ax, y: lh } : { x: bx, y: rh };
        const deepY = leftShallow ? rh : lh;
        const deepX0 = leftShallow ? bx : 0;
        const deepX1 = leftShallow ? topW : ax;
        const deepW = Math.max(deepX1 - deepX0, 0);
        const n = Math.min(32, Math.max(16, Math.ceil(deepW) || 16));

        let best = null;
        for (let i = 0; i <= n; i += 1) {
          const Dx = deepX0 + (deepW * i) / n;
          const spanX = Dx - S.x;
          const spanY = deepY - S.y;
          const d = Math.hypot(spanX, spanY);
          if (d < Math.abs(dy) - 0.001 || d > L + 0.001) continue;

          const t = L - d;
          let x1;
          let y1;
          let cos;
          let sin;
          if (leftShallow) {
            cos = spanX / d;
            sin = spanY / d;
            x1 = S.x - t * cos;
            y1 = S.y - t * sin;
            if (x1 < -0.05) continue;
          } else {
            cos = (S.x - Dx) / d;
            sin = (S.y - deepY) / d;
            x1 = Dx;
            y1 = deepY;
            if (x1 + L * cos > topW + 0.05) continue;
          }

          const deg = (Math.atan2(sin, cos) * 180) / Math.PI;
          const pose = poseFromBottomLeft(x1, y1, cos, sin, deg);
          if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y)) continue;
          const score = Math.abs(pose.x - openingCenter);
          if (best && score >= best.score) continue;
          if (!validPose(part, pose, clearance)) continue;
          best = {
            pose,
            score,
            supportLeft: leftShallow ? S : { x: Dx, y: deepY },
            supportRight: leftShallow ? { x: Dx, y: deepY } : S
          };
        }

        if (best) {
          return pack("bridge", best.pose, {
            supportLeft: best.supportLeft,
            supportRight: best.supportRight
          });
        }
      }

      // 3) 矮台（或等高台）水平；可行域内 |cx − 开口中心| 最小，含安装间隙
      const stepY = Math.min(lh, rh);
      const packStep = (pose) =>
        pack("step", pose, {
          derivedTopGap: Math.max(0, stepY - part.height),
          supportLeft: { x: Math.max(0, pose.x - halfL), y: stepY },
          supportRight: { x: Math.min(topW, pose.x + halfL), y: stepY }
        });
      const stepPose = { x: clampX(openingCenter), y: stepY - halfH, deg: 0 };
      if (validPose(part, stepPose, clearance)) return packStep(stepPose);
      const xLo = halfL + clearance;
      const xSpan = Math.max(topW - clearance - halfL - xLo, 0);
      const nStep = Math.max(24, Math.ceil(xSpan / 0.25));
      let found = null;
      let foundScore = Infinity;
      for (let i = 0; i <= nStep; i += 1) {
        const x = xLo + (xSpan * i) / nStep;
        const sc = Math.abs(x - openingCenter);
        if (sc >= foundScore) continue;
        const trial = { x, y: stepY - halfH, deg: 0 };
        if (!validPose(part, trial, clearance)) continue;
        foundScore = sc;
        found = trial;
      }
      return packStep(found || stepPose);
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
      const hint = space.failHintPath(part);
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
    // 状态数可达数百万：用定长位图代替 Set
    const seen = new Uint8Array(nCell * angles.length);
    const parent = keepParents ? new Map() : null;
    const { finalPose, centers } = space.seedFinalCenters(part, { topGap, clearance });

    // 最终姿态可能带倾角（不等高斜担），按最近离散角播种
    let finalAngleIndex = zeroAngleIndex;
    let bestAngDist = Infinity;
    for (let i = 0; i < angles.length; i += 1) {
      const d = Math.abs(angles[i] - finalPose.deg);
      if (d < bestAngDist) {
        bestAngDist = d;
        finalAngleIndex = i;
      }
    }

    // 种子到最终位姿的直线过渡须无碰撞，否则路径末段会「瞬移」穿墙
    const finalValid = space.validPose(part, finalPose, clearance);
    function motionFree(a, b) {
      const n = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / (grid / 2)),
        Math.ceil(Math.abs(b.deg - a.deg) / 0.5)
      );
      for (let i = 1; i < n; i += 1) {
        const t = i / n;
        const pose = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          deg: a.deg + (b.deg - a.deg) * t
        };
        if (!space.validPose(part, pose, clearance)) return false;
      }
      return true;
    }

    function trySeed(ix, iy, ia) {
      if (!finalValid) return;
      if (ix < 0 || ix >= gridXCount || iy < 0 || iy >= gridYCount) return;
      if (ia < 0 || ia >= angles.length) return;
      const sk = stateKey(ix, iy, ia);
      if (seen[sk]) return;
      const p = poseOf(ix, iy, ia);
      if (!space.validPose(part, p, clearance)) return;
      if (!motionFree(p, finalPose)) return;
      seen[sk] = 1;
      queue.push(sk);
      if (parent) parent.set(sk, -1);
    }

    // 优先精确最终位姿附近
    const seedIy = Math.round(finalPose.y / grid);
    for (const cx of centers) {
      const ix = Math.round(cx / grid);
      for (let dy = -1; dy <= 1; dy += 1) {
        trySeed(ix, seedIy + dy, finalAngleIndex);
      }
    }
    // 兜底：仍尝试水平 0°（直壁/等高）
    if (finalAngleIndex !== zeroAngleIndex) {
      for (const cx of centers.slice(0, 8)) {
        const ix = Math.round(cx / grid);
        trySeed(ix, seedIy, zeroAngleIndex);
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
          // 末点种子与 finalPose 之间已验证可直线过渡，追加而非替换
          found.path.push(finalPose);
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
        if (seen[nsk]) continue;
        const next = poseOf(nix, niy, nia);
        if (!space.validPose(part, next, clearance)) continue;
        seen[nsk] = 1;
        queue.push(nsk);
        if (parent) parent.set(nsk, sk);
      }
    }

    const hint = space.failHintPath(part);
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

  /** 统一的失败结果（参数错误 / 模式未实现） */
  function errorResult(error, clearance, mode) {
    return {
      ok: false,
      mode: mode || "2d",
      path: [],
      maxLength: null,
      error,
      diagnostics: {
        grid: 0,
        angleStep: 0,
        clearance: clearance || 0,
        margin: null,
        firstHit: null,
        warnings: []
      }
    };
  }

  function solve(request) {
    const mode = request.mode || "2d";
    if (mode !== "2d") {
      return errorResult(`模式 ${mode} 尚未实现（v1 仅支持 2d）。`, 0, mode);
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
    if (error) return errorResult(error, values.clearance);

    const space = createSpace2D(values);
    const part = { length: values.partLength, height: values.partHeight };
    const clearance = values.clearance;
    const topGap = values.topGap;

    let maxLength = null;
    if (options.estimateMax !== false) {
      maxLength = estimateMaxLength(space, part.height, { clearance, topGap });
    }

    const pathResult = findPath(space, part, { clearance, topGap, keepPath: Boolean(options.keepPath) });

    let path = [];
    if (pathResult.ok) {
      path = options.keepPath ? downsamplePath(pathResult.path) : pathResult.path;
    } else if (options.keepPath) {
      path = space.failHintPath(part);
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
    errorResult,
    buildSolveRequest,
    downsamplePath
  };

  global.EISV_CORE = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
