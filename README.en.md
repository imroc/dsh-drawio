# dsh-drawio

[简体中文](README.md) | **English**

Drawio for DSH (DeepSeek Harness): the model draws and edits diagrams with the `drawio_*` tools, and you watch them live in a **Drawio board tab in the Web UI's right Sidebar** — where you can also drag things around and save back into the project.

```
user/model → drawio XML (mxfile) → zero-dependency TS translator → SVG → PNG
             (inline chat preview / live board / export)
```

The translator is plain TypeScript with no dependencies (no DOM, no Node built-ins) and is shared by both halves, so the preview the model sees and the board you see are the same rendering.

## The problem it solves

Models are good at producing structure and bad at making you *see* it; drawio is a GUI program that does not exist in a terminal or a chat. This plugin joins the two:

- **the model never hand-writes XML details** — the bundled skill pins the supported style subset, and every change goes through the structured `drawio_edit` (add/remove nodes and edges, move, resize, restyle, relabel), so a hand-edited XML cannot quietly break the diagram;
- **a diagram in the conversation is visible right there** — `drawio_render` returns an inline PNG preview, with no external tool to open;
- **you and the agent edit the same file** — the board's embedded editor writes your drag-and-drop refinements back into the workspace, and the agent reads them back before its next edit.

## What it does

### Agent tools

`drawio_validate` / `drawio_render` / `drawio_template` are exposed by default; `drawio_edit` (structured editing, the most useful one) must be enabled explicitly — see [Configuration](#configuration).

| Tool | What it does |
|---|---|
| `drawio_template` | Emits an mxfile skeleton for four diagram kinds: flowchart / architecture / network / orgchart |
| `drawio_edit` | **Structured editing**: upsert / delete / move / resize / restyle / relabel vertices and edges, writes the file back and renders a preview. The model never hand-edits XML |
| `drawio_validate` | Validates a workspace `.drawio` file or inline XML and reports vertex / edge / structure problems |
| `drawio_render` | Renders to SVG (+ PNG) into the workspace and attaches an inline PNG preview to the conversation |

A bundled skill (`skills/drawio/SKILL.md`) teaches the model the supported style subset and how to edit, which is what keeps the rendering faithful.

### The board (a right-Sidebar tab)

The board is **not** a panel of its own: it is a tab of DSH's own right Sidebar, sharing that surface and its width mechanism with the built-in Files panel and with plugins like the embedded browser.

- **It no longer fights for the screen.** The board used to be a self-built side column: two panels competing for one fixed width budget, where the board could only grow by squeezing the Sidebar to nothing and then overflowing the frame — measured at 1440px it never got past about half the screen, and the conversation was squeezed down to almost nothing. Inside the Sidebar, the conversation stays visible.
- **It gets genuinely wide.** The Sidebar's own drag handle sets its width (up to 70% of the window), and its **fullscreen** control turns the board into the whole window.
- **It coexists with the other panels.** The tab strip carries a Drawio chip; switch between the board, Files, the embedded browser, or open another board tab from the **+** list.
- **Three ways in:**
  - the **board button in the conversation header** (next to the Sidebar's own expand control) — one click opens the Sidebar with the board in it (wide viewports);
  - the **Drawio board** entry in the right Sidebar's **+** (new tab) list;
  - **on a phone**, the **Drawio board** row in the navigation Sidebar (the drawer) — it opens the board and dismisses the drawer. A phone has no room side by side, so the Sidebar switches to its **full-screen panel** (the product's own design), the board fills the screen, and the board toolbar's "Close board" is the way out.
- **How it follows the agent.** A *live* agent edit reveals the board by itself on a wide screen, so you can watch it draw; **replayed** history only updates the content and never pops the panel open (otherwise every reload would reopen a board you had just closed), and a narrow screen never auto-opens it (that would interrupt your typing). Either way the board quietly follows the newest file the agent touched — open it and it is already there.
- Lists every `.drawio` file in the workspace (recursive, depth- and count-bounded); picking one renders it.
- **The official drawio editor, embedded**: pick a file → "Open in editor" → the bundled diagrams.net webapp (local `assets/`, **works offline**) → drag nodes, draw edges, restyle; File → Save posts back through a bridge and writes the workspace file (the board's XML and preview sync immediately).
- **Agent linkage**: when the agent changes a file with `drawio_edit`, an open editor and the preview reload by themselves.
- **Zoom**: `− % + Fit` in the toolbar, or Ctrl/⌘ + wheel to zoom at the cursor (pan by scrolling once zoomed in). The file list is hidden by default so the diagram owns the panel; click "Files" to reveal it.
- **Standalone page and pop-back**: "Standalone" opens the full official editor in its own browser tab; there, Save writes the workspace file and "Pop back to board" saves, shows it in the Sidebar board, and closes the tab.
- A fallback **XML source + SVG preview** split view, PNG export, and SVG copy.
- Handles swimlanes, groups, rich-text labels, orthogonal edges, dashed lines and arrows.

### Rendering coverage

The pure-TypeScript translator (shared by host and browser) covers:

- **Shapes**: rectangle, rounded rectangle, ellipse, rhombus, hexagon, triangle, cylinder, swimlane, plain text, image placeholder
- **Styles**: fill / stroke / stroke width / dashed / opacity / font size / colour / bold-italic-underline / alignment / spacing / word wrap
- **HTML labels**: `<b> <i> <u> <font> <span style> <br> <h1-h6>` and entities
- **Edges**: explicit waypoints, `orthogonalEdgeStyle` routing, `curved` smoothing, start/end arrows (classic / block / open / oval / diamond), edge labels, and `exitX/exitY/entryX/entryY` anchors
- **Coordinates**: group and swimlane child offsets, `dx/dy` page offsets, compressed mxfiles (inflater required)

## Install

```bash
dsh plugin --profile web add https://github.com/imroc/dsh-drawio
```

> This is roc's fork of [`jean3690/dsh-drawio`](https://github.com/jean3690/dsh-drawio). The significant difference: the board was reworked from a self-built side column (with an entry row in the left Sidebar) into a **tab of DSH's own right Sidebar**.

Restart `dsh web` and it is live: a Drawio board tab in the right Sidebar, a board button in the conversation header corner, the `drawio_*` tools in the model's tool set, the skill loadable, and the bundled drawio webapp served under `/drawio/*`.

> **A git install has no build output.** `lib/` is gitignored and there is no `prepare` script, so `add https://github.com/...` yields a package with nothing to run. What actually works is a local development install (a `link:` dependency), or building first. See [Development](#development).

### Configuration

The plugin's own `cordis.patch.yml` carries the defaults; overriding them means a patch layer in the profile (locally: `~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- id: dsh-drawio
  config:
    # '*' exposes everything, [] exposes nothing, or list a subset.
    # Built-ins: drawio_template / drawio_edit / drawio_validate / drawio_render
    agentTools: [ 'drawio_validate', 'drawio_render', 'drawio_template', 'drawio_edit' ]
    pngScale: 2      # PNG preview scale for drawio_render (default 2)
    fontFamily: "Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
```

## Typical use

```
"Draw me a login flow chart"
  → agent: drawio_template skeleton → writes docs/login-flow.drawio → drawio_render (inline preview)
    you: open that file in the board → "Open in editor" → refine by dragging → Save writes it back
"Make 'credentials valid?' a rhombus and add a verification-code branch"
  → agent: reads the existing .drawio (remembering cell ids) → drawio_edit (structured ops) → renders a preview
    the open editor in the board reloads; your further edits are read back on the agent's next turn
```

## Development

Sources and build output are separate: `src/` is the source, `lib/` the output (gitignored). Locally the plugin is installed as a `link:` dependency, so a rebuild is all it takes:

```bash
npm install
npx tsdown          # both halves: lib/index.js (host) + lib/client.js (browser)
npx tsc --noEmit    # type check
npm test            # smoke / edge cases / structured editing / workspace-root resolution
```

What takes effect when (for a `link:` install):

- **browser half** (`lib/client.js`): rebuild, then **reload the page** (the bundle URL carries a content revision);
- **host half** (`lib/index.js`): **`dsh-web` must be restarted** (the tools, the HTTP routes and the file watcher all live in the host process).

Layout:

| File | Role |
|---|---|
| `src/translate.ts` | The translator: mxfile XML → layout boxes → SVG. No dependencies, shared by both halves |
| `src/index.ts` | Host half entry: tool registration, `/dsh-drawio/*` routes, the watcher, PNG rasterisation |
| `src/client/index.ts` | Browser half entry: board tab registration and assembly, activity subscription |
| `src/client/sidebar-tab.tsx` | Registers the board as a tab of the official right Sidebar (the type plus its body and chip seats) |
| `src/client/sidebar-controller.ts` | Opens, collapses and closes that tab; depends only on the Sidebar service's *structural* face, never imports the Sidebar package |
| `src/client/header-entry.ts` | The board button in the conversation header corner (DOM injection, beside the Sidebar's own expand control; wide viewports only) |
| `src/client/narrow-entry.ts` | The board row in a phone's navigation Sidebar (the drawer), shown only on narrow viewports, dismissing the drawer on tap |
| `src/client/narrow-styles.ts` | One `max-width:767px` positioning repair: the mobile shell collapses the Sidebar's full-screen panel containing block to zero height |
| `src/client/narrow.ts` | The narrow-viewport flag (`matchMedia`, aligned with the Sidebar's own 768px breakpoint) |
| `src/client/board.tsx` | The board itself: file list, preview, source editor, zoom, embedded editor |
| `src/client/workspace-root.ts` | Which workspace the board browses (session cwd resolution and fallback) |
| `src/client/auto-open.ts` | When an activity event may reveal the board by itself (never on replay, never on a narrow screen) |

## Known limitations

- **`shape=image`** and complex tables / specialised UML shapes render as placeholders (dashed box with the label) — open the file in the embedded official editor to see them fully;
- **Edges without explicit waypoints** get basic orthogonal routing (direct plus a midpoint bend) rather than drawio's full router; the agent following the skill can write `points` for an exact match;
- **The board tab's visibility follows the Sidebar's layout.** On a wide viewport it is simply a tab of the Sidebar; when the viewport is too narrow for side-by-side (< 768px) the Sidebar switches to its **full-screen panel**, the board fills the screen, and the board toolbar's "Close board" exits (the surface is still the Sidebar's own board tab; the plugin only adds one narrow-screen positioning fix and one drawer entry). **Note:** the plugin injects one `max-width: 767px` rule on the stable attribute the Sidebar stamps on the panel (`[data-sidebar-right-panel="fullscreen"]`, pinned with `position: fixed`) to repair the full-screen panel being laid out off-screen by the mobile shell's collapsed containing block. It touches no layout column, and a desktop layout is untouched.

## License

Apache-2.0
