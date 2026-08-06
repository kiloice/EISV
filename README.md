# 凹位装配模拟验证器（EISV）

离线单页工具：在浏览器里用 **二维剖面** 近似验证矩形件能否从下方开口旋转装入凹腔，并估算最大可放长度。

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
- 验证：旋转路径搜索 + 动画；失败时说明干涉原因
- 辅助：防抖预估、URL 参数、复制结果、Worker 后台计算

## 仓库结构（维护用）

| 路径 | 说明 |
|------|------|
| `EISV_1.0.html` | **交付物**：零依赖单文件，分发只给这个 |
| `eisv-core.js` | 纯计算源码（无 DOM）；测试与组装用 |
| `eisv-app.js` | 界面与应用层源码；组装用 |
| `scripts/assemble.mjs` | 将 core + app 内联进 HTML |
| `tests/solve-smoke.mjs` | 核心烟测（Node） |
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

## 限制

- 二维采样近似，非 CAD；正式加工请用公差与 CAD 复核
- 单项尺寸建议 ≤ 800mm
- 无 npm / 无打包器

## License

见 `LICENSE`。
