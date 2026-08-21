# 凹位装配模拟验证器（EISV）

离线单页工具：在浏览器里用 **二维剖面** 近似验证矩形件能否从下方开口旋转装入凹腔，并估算最大可放长度。

源码仓库：<https://github.com/kiloice/EISV.git>

```bash
git clone https://github.com/kiloice/EISV.git
```

## 使用者

只需 **一个文件**：

```bash
open EISV_1.0.html
```

或双击打开。不依赖网络、不依赖 `eisv-*.js` 等其它文件（逻辑已内联在 HTML 中）。

- 版本：v1.1（二维剖面）
- v2.0 预留三维求解接口，不推翻现有 `solve` 契约

## 功能摘要

- 空腔：顶部净宽、开口、左右退进、左右高度、内外圆角半径
- 零件：长度、高度、离顶距离、安装间隙（二者互相制约：离顶距离须 ≥ 安装间隙）
- **改参即重算**；「再次计算」强制重算并播放路径；「重播」仅重放上次动画
- 预设常见凹位、URL 参数、复制结果、Worker 后台计算
- 桌面：左图纸固定 / 右表单滚动；手机：表单区横向滑动画板
- 工程蓝图配色与制图线型

## 仓库结构（维护用）

| 路径 | 说明 |
|------|------|
| `EISV_1.0.html` | **交付物**：零依赖单文件，分发只给这个 |
| `eisv-core.js` | 纯计算源码（无 DOM）；测试与组装用 |
| `eisv-app.js` | 界面与应用层源码；组装用 |
| `scripts/assemble.mjs` | 将 core + app 内联进 HTML |
| `tests/solve-smoke.mjs` | 核心烟测（Node） |
| `docs/placement.md` | 最终落位不变量、优先级与改动复盘（改落位前必读） |
| `LICENSE` | 许可证 |
| `AGENTS.md` | 协作 / Agent 约定 |

修改 `eisv-core.js` 或 `eisv-app.js` 后：

```bash
node tests/solve-smoke.mjs
node scripts/assemble.mjs
```

再分发更新后的 `EISV_1.0.html`。

## 架构要点

```
App / View  →  EISV_CORE.solve(request)  →  Space2D + PathSearch
```

- `Pose`（v1）：`{ x, y, deg }`
- 路径搜索只依赖 Space 接口，便于 v2 增加 `Space3D`
- `request.mode`：`"2d"` 现用，`"3d"` 预留
- **最终落位**（`finalPlacementPose`：top / step / bridge、对中、有退台不吸顶）见 [`docs/placement.md`](docs/placement.md)

## 限制

- 二维采样近似，非 CAD；正式加工请用公差与 CAD 复核
- 单项尺寸建议 ≤ 800mm
- 无 npm / 无打包器

## License

见 `LICENSE`。
