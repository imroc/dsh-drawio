# dsh-drawio

**简体中文** | [English](README.en.md)

给 DSH（DeepSeek Harness）加上 **drawio 画图能力**：模型用 `drawio_*` 工具画图与改图，你在 Web UI **右侧栏的「Drawio 画板」标签页**里实时看图、拖动编辑、保存回项目。

```
用户/模型 → drawio XML (mxfile) → 纯 TS 翻译器 → SVG → PNG（对话内联预览 / 画板实时渲染 / 导出）
```

核心翻译器是**零依赖纯 TS**（无 DOM、无 Node 内置模块），宿主与浏览器共用同一份代码——所以模型看到的预览和你看到的画板是同一个渲染结果。

## 要解决的问题

模型天然擅长产出结构化数据，不擅长「把结构画成图」再让你看懂；而 drawio 本身是个 GUI 程序，命令行/对话里用不上。这个插件把两边接起来：

- **模型不手写 XML 细节**：配套 skill 规定受支持的样式子集，改图走结构化的 `drawio_edit`（增删节点/连线、移动、缩放、改样式、改文案），不会因为手改 XML 把图弄坏；
- **会话里的图能直接看**：`drawio_render` 把图渲染成 PNG 内联进对话，不需要你打开任何外部工具；
- **你和 AI 能改同一张图**：画板里可以拖拽精修并写回工作区，AI 下一次改图前会读回你的改动——一张图在两方之间来回迭代。

## 能力

### Agent 工具

默认暴露 `drawio_validate` / `drawio_render` / `drawio_template`；`drawio_edit`（结构化改图，**最有用**的一个）需要显式开启，见[配置](#配置)。

| 工具 | 作用 |
|---|---|
| `drawio_template` | 生成 4 类图的 mxfile 骨架：flowchart / architecture / network / orgchart |
| `drawio_edit` | **结构化改图**：upsert / delete / move / resize / restyle / relabel 节点与连线，改完写回并渲染预览。模型绝不手改 XML |
| `drawio_validate` | 校验工作区 `.drawio` 文件或内联 XML，报告节点/连线/结构问题 |
| `drawio_render` | 渲染为 SVG（+ PNG）写入工作区，并在对话中内联 PNG 预览 |

配套 skill `skills/drawio/SKILL.md`：告诉模型受支持的样式子集与改图方式，保证渲染一致。

### 画板（右侧栏标签页）

画板**不是**自建的一块面板，而是 DSH 官方右侧栏里的一个 tab——和「文件」「内嵌浏览器」这些面板**共用同一个侧栏位置、同一套宽度机制**：

- **不再抢屏幕**：以前画板是自建的并排栏，和官方侧栏同时打开时两块面板抢同一份宽度预算，只能靠把对方挤没来变宽（实测 1440px 屏上画板最多占少半屏，且会话被压得几乎看不见）。现在它就在侧栏里，宽度由侧栏统一管，**会话始终可见**；
- **能拉得很宽**：侧栏自带拖拽调宽（上限是窗口宽度的 70%）与**全屏模式**——画图时点侧栏右上角的「全屏」，画板直接铺满整个窗口；
- **和别的面板并存**：侧栏的 tab 条上有「Drawio 画板」chip，可以在画板 / 文件 / 内嵌浏览器之间自由切换，`+` 号里也能新建一个画板 tab；
- **打开方式**：
  - 会话标题栏右上角的 **画板按钮**（挨着官方的侧栏展开按钮）——点一下就把侧栏连同画板一起打开（宽视口）；
  - 右侧栏的 `+`（新建标签页）列表里的 **Drawio 画板** 入口；
  - **手机端**：导航侧栏（抽屉）里的 **Drawio 画板** 行——点它展开画板并自动收起抽屉。手机上没有并排的空间，此时侧栏会切成**全屏面板**（官方设计），画板铺满屏幕，用面板工具栏的「关闭画板」退出；
- **AI 跟随节奏**：agent 改图时的**实时**活动会在宽屏自动把画板亮出来（你不动手就能看着它画）；**重放的历史活动只更新内容、不弹面板**（否则每次刷新都会把刚关掉的画板弹回来）；**窄屏不自动打开**，免得打断你输入。无论面板开没开，画板都在静默跟随 agent 最新改的那个文件，打开即最新；
- 列出工作区所有 `.drawio` 文件（递归扫描，深度与条数受限），选中即渲染；
- **官方 drawio 编辑器嵌入**：选中文件 → 「在编辑器中打开」→ 内置 diagrams.net webapp（本地 `assets/`，**离线可用**）→ 拖节点、连线、改样式，File → Save 经 postMessage 桥自动写回工作区（保存后画板的 XML / 预览即时同步）；
- **AI 联动**：agent 用 `drawio_edit` 改完文件，已经打开的编辑器与预览自动重载；
- **缩放看图**：工具栏 `− % + 适应`，或 Ctrl/⌘ + 滚轮在光标处缩放（放大后可滚动平移）；文件列表默认隐藏、图占满面板，点「文件」再展开；
- **独立页面 + 弹回**：「独立页面」在新标签页打开全屏官方编辑器；独立页的「保存」写回工作区，「弹回画板」保存并在侧栏画板里显示后自动关掉标签页；
- 备用的 **XML 源码 + SVG 预览**分屏编辑、导出 PNG、复制 SVG；
- 支持泳道 / 分组 / 富文本标签 / 正交连线 / 虚线 / 箭头等常见特性。

### 渲染覆盖范围

纯 TS 翻译器（宿主与浏览器共用）：

- **形状**：矩形、圆角、椭圆、菱形、六边形、三角、圆柱、泳道、纯文本、图片占位
- **样式**：填色 / 描边 / 线宽 / 虚线 / 透明度 / 字号 / 颜色 / 粗斜下划线 / 对齐 / 间距 / 自动换行
- **HTML 标签**：`<b> <i> <u> <font> <span style> <br> <h1-h6>` 及实体
- **连线**：显式 waypoints、`orthogonalEdgeStyle` 自动布线、`curved` 平滑、起止箭头（classic / block / open / oval / diamond）、边标签与 `exitX/exitY/entryX/entryY` 锚点
- **坐标**：分组 / 泳道的子节点偏移、`dx/dy` 页偏移、压缩 mxfile（需 inflater）

## 安装

```bash
dsh plugin --profile web add https://github.com/imroc/dsh-drawio
```

> 这是 roc 的 fork（[上游](https://github.com/jean3690/dsh-drawio)）。本 fork 的关键差异：画板由「自建并排栏 + 左侧栏入口行」改造为**官方右侧栏标签页**。

重启 `dsh web` 后生效：右侧栏多出「Drawio 画板」标签页、会话标题栏右上角多出画板按钮，`drawio_*` 工具进入模型工具集，skill 自动可加载，内置 drawio webapp 挂在 `/drawio/*`。

> **从 git 直装拿不到产物**：`lib/` 被 `.gitignore` 忽略且没有 `prepare` 脚本，所以 `add https://github.com/...` 装出来是**没有构建产物**的包。真正能用的是本机开发态（`link:` 安装），或先构建再装。见[开发](#开发)。

### 配置

插件的 `cordis.patch.yml` 给了默认值；改配置是在 profile 的 patch 层覆盖（本机：`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- id: dsh-drawio
  config:
    # '*' = 全部暴露；[] = 一个都不给；也可以只列一部分。
    # 内置：drawio_template / drawio_edit / drawio_validate / drawio_render
    agentTools: [ 'drawio_validate', 'drawio_render', 'drawio_template', 'drawio_edit' ]
    pngScale: 2      # drawio_render 的 PNG 预览倍率（默认 2）
    fontFamily: "Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
```

## 典型用法

```
我要一张登录流程图
  → agent: drawio_template 骨架 → 写 docs/登录流程.drawio → drawio_render（对话内预览）
    你在画板里点开该文件 → 「在编辑器中打开」→ 官方编辑器拖拽精修 → Save 写回
刚才那张图把「校验通过？」改成菱形，并加一条「验证码校验」分支
  → agent: 先读现有 .drawio（记住 cell id）→ drawio_edit（结构化 ops）→ 渲染预览
    画板里开着的编辑器自动刷新；你接着改，AI 下一轮又能读回
```

## 开发

源码与产物分离：`src/` 是源码，`lib/` 是构建产物（被 gitignore）。本机用 `link:` 安装，所以改完代码直接重建即可生效：

```bash
npm install
npx tsdown          # 双端打包：lib/index.js（宿主）+ lib/client.js（浏览器）
npx tsc --noEmit    # 类型检查
npm test            # 冒烟 / 边界 / 结构化改图 / 工作区根解析 等用例
```

生效方式（`link:` 安装的插件）：

- **浏览器半**（`lib/client.js`）：重新构建后**刷新页面即生效**（bundle 的 URL 带内容 rev）；
- **宿主半**（`lib/index.js`）：**必须重启 `dsh-web`**（工具、HTTP 路由、文件监听都在宿主进程里）。

架构速览：

| 文件 | 角色 |
|---|---|
| `src/translate.ts` | 核心翻译器：mxfile XML → 布局盒 → SVG。零依赖，双端共用 |
| `src/index.ts` | 宿主半入口：工具注册、`/dsh-drawio/*` 路由、watch、PNG 栅格化 |
| `src/client/index.ts` | 浏览器半入口：画板 tab 的注册与装配、活动订阅 |
| `src/client/sidebar-tab.tsx` | 把画板注册成官方右侧栏的 tab（类型 + body + chip 两个 keyed slot） |
| `src/client/sidebar-controller.ts` | 打开 / 收起 / 关闭这个 tab；只依赖侧栏服务的**结构面**，不 import 侧栏包 |
| `src/client/header-entry.ts` | 会话标题栏右上角的画板按钮（DOM 注入，紧贴官方侧栏展开按钮；仅宽视口显示） |
| `src/client/narrow-entry.ts` | 手机端导航侧栏（抽屉）里的画板入口行（仅窄屏显示，点击后收起抽屉） |
| `src/client/narrow-styles.ts` | 仅 `max-width:767px` 生效的一条定位修正：移动 shell 下侧栏全屏面板的包含块会塌成 0 高 |
| `src/client/narrow.ts` | 窄视口判定（matchMedia，与侧栏自己的 768px 断点对齐） |
| `src/client/board.tsx` | 画板主体：文件列表、预览、源码编辑、缩放、编辑器嵌入 |
| `src/client/workspace-root.ts` | 画板浏览哪个工作区（会话 cwd 的解析与回退） |
| `src/client/auto-open.ts` | 什么情况下允许活动事件自己把画板亮出来（重放 / 窄屏不行） |

## 已知限制

- **`shape=image` 与复杂表格 / 专用 UML 形状**渲染为占位（虚线框 + 标签）——用官方编辑器打开能看到完整效果；
- **无显式 waypoints 的折线**只做基础正交布线（直连 + 中点折），与 drawio 的完整路由算法有差异：agent 生成时按 skill 规范写 `points` 即可完全一致；
- **画板 tab 的可见性由侧栏布局决定**：宽视口下它就是侧栏里的一个 tab；窄到放不下并排（< 768px）时，侧栏会切成**全屏面板**，画板铺满屏幕、用工具栏的「关闭画板」退出（此时画面由侧栏的画板 tab 提供，插件只补了一条窄屏定位修正与一个抽屉入口）。**注意**：插件会注入一条仅作用于 `max-width: 767px` 的样式，只打侧栏盖在面板上的稳定属性 `[data-sidebar-right-panel="fullscreen"]`（`position: fixed`），用于修正移动 shell 下侧栏全屏面板被包含块塌陷顶到屏幕外；不触碰布局列、桌面端不受影响。

## License

Apache-2.0
