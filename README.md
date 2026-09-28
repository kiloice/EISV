# 凹位装配模拟验证器（EISV）

离线单页工具：验证零件能否从下方开口旋转装入凹腔，并估算最大可放长度。两个版本并行维护：

| 版本 | 文件 | 模型 |
|------|------|------|
| V1 | `EISV_1.0.html` | 二维剖面：矩形件在左右剖面内平移 + 倾转 |
| V2 | `EISV_2.0.html` | 三维：四边退进矩形凹腔，长方体零件平移 + 偏航 + 倾转（5 自由度），可借开口对角线斜入后转正 |

源码仓库：<https://github.com/kiloice/EISV.git>

```bash
git clone https://github.com/kiloice/EISV.git
```

## 使用者

只需 **一个文件**（按需选择版本）：

```bash
open EISV_1.0.html   # V1 二维
open EISV_2.0.html   # V2 三维
```

或双击打开。不依赖网络、不依赖 `eisv-*.js` 等其它文件（逻辑已内联在 HTML 中）。

## 功能摘要

V2 另有：顶部净深、前后退进与高度、零件宽度；主视图 / 左视图 / 俯视图 / 轴测图四视图联动动画；结果中给出装入方式（直入 / 斜入转向 / 空间搜索）与最终落位方向。模型与算法见 [`docs/3d.md`](docs/3d.md)。

以下为两版共有（V1 为二维）：

- 空腔：顶部净宽、开口、左右退进、左右高度、内外圆角半径
- 零件：长度、高度、离顶距离、安装间隙（二者互相制约：离顶距离须 ≥ 安装间隙）
- **改参即重算**；「再次计算」强制重算并播放路径；「重播」仅重放上次动画
- 预设常见凹位、URL 参数、复制结果、Worker 后台计算
- 桌面：左图纸固定 / 右表单滚动；手机：表单区横向滑动画板
- 工程蓝图配色与制图线型

## 仓库结构（维护用）

| 路径 | 说明 |
|------|------|
| `EISV_1.0.html` / `EISV_2.0.html` | **交付物**：V1 / V2 零依赖单文件，分发只给这些 |
| `eisv-core.js` | 二维纯计算源码（无 DOM）；V2 也依赖它 |
| `eisv-core3d.js` | 三维纯计算源码（无 DOM） |
| `eisv-app.js` / `eisv-app3d.js` | V1 / V2 界面与应用层源码 |
| `src/base.css` | 两版共用样式 |
| `src/template.html` / `src/template3d.html` | V1 / V2 页面模板（`{{VERSION}}` 等占位） |
| `scripts/assemble.mjs` | 生成两个 HTML；版本号分别取自两个核心的 `meta.version` |
| `tests/solve-smoke.mjs` / `tests/solve3d-smoke.mjs` | 二维 / 三维核心烟测（Node） |
| `docs/placement.md` | 最终落位不变量、优先级与改动复盘（改落位前必读） |
| `docs/3d.md` | V2 模型、碰撞判定、落位与装入规划 |
| `LICENSE` | 许可证 |
| `AGENTS.md` | 协作 / Agent 约定 |

修改任何 `eisv-*.js` 或 `src/*` 后：

```bash
node tests/solve-smoke.mjs
node tests/solve3d-smoke.mjs
node scripts/assemble.mjs
node scripts/assemble.mjs --check   # 确认两个 HTML 都已与源码同步
```

再分发更新后的 HTML。

## 架构要点

```
V1 App  →  EISV_CORE.solve(request)            →  Space2D + PathSearch
V2 App  →  EISV_CORE3D.solve(request)          →  Space3D + 分阶段规划（平面 BFS 复用 PathSearch）
           EISV_CORE.solve({ mode: "3d" }) 在已加载 3D 核心时委托给 EISV_CORE3D
```

- `Pose`：V1 `{ x, y, deg }`；V2 `{ x, y, z, yaw, tilt }`
- 路径搜索只依赖 Space 接口；V2 通过适配器把竖直平面搜索交给同一个 BFS
- **最终落位**（`finalPlacementPose`：top / step / bridge、对中、有退台不吸顶）见 [`docs/placement.md`](docs/placement.md)

## 限制

- 近似验证：碰撞判定为精确几何（V1 圆角按弦折线、V2 圆角按阶梯盒保守近似），路径按离散网格 / 有预算的随机树搜索，「未找到」不等于几何上不可能；非 CAD，正式加工请用公差与 CAD 复核
- V2：零件不做横滚（宽度轴恒水平）；前后圆角未实现
- 单项尺寸建议 ≤ 800mm
- 无 npm / 无打包器

## License

见 `LICENSE`。
