/**
 * 画板 sidebar-tab controller: the one way this plugin opens, focuses and
 * closes its tab in the product's right Sidebar.
 *
 * The board used to be a hand-built grid column of its own ("编外轨距"): an
 * extra implicit track on the shell frame whose width competed with the
 * Sidebar's fixed pixel tracks. Measured on a 1440px frame the conversation
 * held 400px, the Sidebar kept 280px, and the board could only grow by
 * squeezing the Sidebar to zero and then overflowing the frame — which is why
 * it never got past about half the screen and why drawing with the Sidebar
 * open left no room for the conversation. Riding the Sidebar's own tab
 * mechanism removes the competition entirely: one panel, one width mechanism,
 * one fullscreen mode.
 *
 * The controller reads the Sidebar through a narrow structural face rather
 * than importing `@deepseek-ai/dsh-client-ui-sidebar-right`: that package is a
 * client-only bundle the plugin does not depend on at run time (the service
 * arrives through Cordis, and older clients simply never declare it), so a
 * value/type import from it would tie the plugin to one harness build. The
 * face is exactly the subset this module calls.
 *
 * @module dsh-drawio/client/sidebar-controller
 */

/** A tab as the Sidebar's own snapshot reports it. */
export interface SidebarRightActiveTab {
  /** The tab's identity, for `close`. */
  readonly id: string
  /** The tab type's kind. */
  readonly kind: string
}

/** The observable the Sidebar publishes for its mounted session. */
export interface SidebarRightMounted {
  /** The session whose seat is mounted, or undefined while no seat is on screen. */
  getSnapshot: () => unknown
  /** Observe mounted-session changes. */
  subscribe: (listener: () => void) => () => void
}

/**
 * The right-Sidebar service face this plugin consumes (`ctx.sidebarRight`).
 *
 * Structural on purpose: the plugin works against whatever build of the
 * Sidebar is installed, and a method a build does not have is simply absent
 * (every call is guarded).
 */
export interface SidebarRightFace {
  /** Open the page tab of this kind, focusing it when it is already open. */
  openTab?: (kind: string, options?: Record<string, unknown>) => void
  /** Whether the panel is shown (false while collapsed onto its rail). */
  isExpanded?: () => boolean
  /** Collapse the panel, or expand a collapsed one. */
  toggleExpanded?: () => void
  /** Close one tab of the mounted session. */
  close?: (tabId: string) => void
  /** The active tab of the active pane. */
  active?: () => SidebarRightActiveTab | undefined
  /** The mounted session's observable. */
  readonly mounted?: SidebarRightMounted
}

/**
 * Opens and closes this plugin's tab in the right Sidebar.
 *
 * Every method is defensive: the Sidebar is another plugin's fiber, a session
 * with no mounted seat has no tab to open, and a tab strip the user already
 * closed must not reappear on its own. The plugin's failure policy applies —
 * a panel problem is logged, never thrown at the shell.
 */
export class DrawioSidebarController {
  private pending = false
  private retryQueued = false
  private warned = false
  private readonly unsubscribes: Array<() => void> = []

  /**
   * @param getFace - reads the Sidebar service inside the injected scope; it
   *   may only be touched there (see sidebar-tab.ts).
   * @param kind - the tab kind to open.
   */
  constructor(
    private readonly getFace: () => SidebarRightFace | undefined,
    private readonly kind: string,
  ) {}

  /** Whether the official right Sidebar is reachable at all. */
  get available(): boolean {
    return this.getFace() !== undefined
  }

  /** Whether the Sidebar is currently showing its panel (false while on its rail). */
  isExpanded(): boolean {
    try {
      return this.getFace()?.isExpanded?.() === true
    } catch {
      return false
    }
  }

  /**
   * Show the 画板: focus the open tab, or open one when there is none. The
   * Sidebar expands in the same step (`openTab`), so a collapsed rail becomes
   * the panel showing the board.
   */
  reveal(): void {
    const face = this.getFace()
    if (face === undefined) {
      this.warnUnavailable()
      return
    }
    try {
      face.openTab?.(this.kind)
      this.pending = false
    } catch (error) {
      // `openTab` throws while no session seat is mounted — the frame mounts
      // the conversation column ahead of the Sidebar, so a reveal triggered
      // from a session's first paint can arrive before the seat binds.
      // Remember the intent and retry on the seat's next publication.
      this.pending = true
      this.queueRetry()
      void error
    }
  }

  /** Toggle the 画板: collapse the Sidebar when it is showing, reveal it otherwise. */
  toggle(): void {
    if (this.isExpanded()) {
      try {
        const face = this.getFace()
        if (face?.toggleExpanded !== undefined) {
          face.toggleExpanded()
          return
        }
      } catch (error) {
        void error
      }
    }
    this.reveal()
  }

  /** Close the 画板 tab when it is the active one (the board's own close control). */
  close(): void {
    try {
      const face = this.getFace()
      const active = face?.active?.()
      if (active === undefined || active.kind !== this.kind) return
      face?.close?.(active.id)
    } catch (error) {
      console.warn('[dsh-drawio] closing the board failed:', error)
    }
  }

  /** Release subscriptions (plugin fiber disposal). */
  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) {
      try {
        unsubscribe()
      } catch {
        // Unsubscribing must not break teardown.
      }
    }
  }

  /**
   * Retry a reveal that arrived before the seat bound. The mounted session is
   * the only signal that a session's surface exists, so this subscribes until
   * the intent is spent — then releases itself.
   */
  private queueRetry(): void {
    if (this.retryQueued) return
    const mounted = this.getFace()?.mounted
    if (mounted === undefined) return
    this.retryQueued = true
    const unsubscribe = mounted.subscribe(() => {
      if (!this.pending) {
        unsubscribe()
        return
      }
      if (mounted.getSnapshot() === undefined) return
      this.pending = false
      unsubscribe()
      this.reveal()
    })
    this.unsubscribes.push(unsubscribe)
  }

  /** Report a missing right Sidebar once, then stay quiet. */
  private warnUnavailable(): void {
    if (this.warned) return
    this.warned = true
    console.warn('[dsh-drawio] the right Sidebar is not loaded: the 画板 tab is unavailable')
  }
}
