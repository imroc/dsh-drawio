/**
 * dsh-drawio plugin config: which agent tools are exposed and rendering
 * defaults. Unlike dsh-devtoolbox (tools off by default), the drawio tools are
 * the point of the plugin — they ship on unless the user opts out.
 *
 * @module dsh-drawio/config
 */

/** All agent-visible tool ids. */
export const TOOL_IDS = ['drawio_validate', 'drawio_render', 'drawio_edit', 'drawio_template'] as const

export type ToolId = (typeof TOOL_IDS)[number]

export interface Config {
  /** Tool ids the model may call; '*' exposes all, [] exposes none. */
  agentTools: ToolId[] | '*'
  /** PNG preview scale factor for drawio_render. */
  pngScale: number
  /** Label font family list. */
  fontFamily: string
  /**
   * Whether agent drawing activity may open the board on its own (reveal the
   * right Sidebar and focus the 画板 tab).
   *
   * Off by default: an unprompted panel that comes back every time the agent
   * touches a diagram fights the user who just closed it. The board still
   * follows the newest diagram silently, so opening it by hand lands on the
   * right file. The board's own toolbar carries a per-browser override, so
   * this only sets the default for fresh browsers.
   */
  boardAutoOpen: boolean
}

export const DEFAULT_FONT_FAMILY = "Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"

/** Raw loader config (all fields optional). */
export interface RawConfig {
  agentTools?: unknown
  pngScale?: unknown
  fontFamily?: unknown
  boardAutoOpen?: unknown
}

/** Apply defaults to the raw loader config. */
export function resolveConfig(raw: RawConfig | undefined): Config {
  const agentTools = raw?.agentTools
  const tools: ToolId[] | '*' = agentTools === '*'
    ? '*'
    : Array.isArray(agentTools)
      ? agentTools.filter((id): id is ToolId => (TOOL_IDS as readonly string[]).includes(id))
      : [...TOOL_IDS]
  const pngScale = typeof raw?.pngScale === 'number' && Number.isFinite(raw.pngScale)
    ? Math.max(0.5, Math.min(8, raw.pngScale))
    : 2
  const fontFamily = typeof raw?.fontFamily === 'string' && raw.fontFamily !== ''
    ? raw.fontFamily
    : DEFAULT_FONT_FAMILY
  // Only an explicit `true` turns the unprompted reveal back on.
  const boardAutoOpen = raw?.boardAutoOpen === true
  return { agentTools: tools, pngScale, fontFamily, boardAutoOpen }
}

/** Whether a tool id is exposed by the config. */
export function exposed(config: Config, id: ToolId): boolean {
  return config.agentTools === '*' || config.agentTools.includes(id)
}
