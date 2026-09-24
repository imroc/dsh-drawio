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
 * The viewport width below which the Sidebar stops being a column and becomes
 * a full-screen panel. It is the Sidebar's OWN breakpoint (`RightbarSeat`:
 * `autoFullscreen = viewportWidth < 768`), not one this plugin invents.
 */
export const SIDEBAR_FULLSCREEN_PX = 768

/**
 * The frame's panel-action face this plugin consumes (`ctx.layout`).
 *
 * Only the one action is declared: the Sidebar's own seats are what normally
 * announce "the panel wants to be shown", and this plugin has no seat of its
 * own to announce from — it borrows the frame's action to do so.
 */
export interface FrameLayoutFace {
  /**
   * Show the frame's right panel.
   * @param track - whether the panel should also claim a grid track (false for
   *   the full-screen presentation the Sidebar uses on narrow viewports).
   * @param fullscreen - whether the panel takes the viewport.
   */
  openRightbar?: (track: boolean, fullscreen: boolean) => void
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
   * @param getLayout - reads the frame's panel-action face (`ctx.layout`),
   *   which is how a panel is revealed from outside the seat.
   * @param kind - the tab kind to open.
   */
  constructor(
    private readonly getFace: () => SidebarRightFace | undefined,
    private readonly getLayout: () => FrameLayoutFace | undefined,
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
   * Show the 画板: focus the open tab, or open one when there is none.
   *
   * Two paths, because a narrow viewport needs one extra step:
   *
   * - **Width where the Sidebar is a column** (`>= 768px`): `openTab` both
   *   opens and expands — the frame gives the panel a real track, done.
   * - **Narrower than that**: the Sidebar draws itself as a *full-screen*
   *   panel (`RightbarSeat.autoFullscreen`) and takes no column track at all,
   *   so the frame's panel width solves to 0. The frame only renders that
   *   panel while it believes the column is shown, and it re-renders when its
   *   own panel state changes — `openTab` does that, but a reveal that arrives
   *   while the seat is not yet mounted has nothing to write into. So the
   *   narrow path nudges the frame directly through `ctx.layout.openRightbar`
   *   (the same call the seat makes) and retries once on the next frame.
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
    this.nudgeNarrowFrame()
  }

  /**
 * Tell the frame to show the right panel, for viewports where the Sidebar
 * itself draws full-screen and therefore owns no grid track.
 *
 * Guarded by {@link SIDEBAR_FULLSCREEN_PX} rather than called unconditionally:
 * on a wide viewport the seat's own effect already reports the presentation,
 * and nudging it there would expand a panel nobody asked to show.
 *
 * Retried once on the next frame — a reveal that fires before the seat's first
 * commit leaves nothing behind for the seat to read.
 */
  private nudgeNarrowFrame(): void {
    const layout = this.getLayout()
    if (layout?.openRightbar === undefined) return
    const width = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
    if (width >= SIDEBAR_FULLSCREEN_PX) return
    const open = (): void => {
      try {
        // `track: false` matches what the seat reports for this presentation:
        // the panel takes the viewport and claims no grid column.
        layout.openRightbar?.(false, true)
      } catch (error) {
        void error
      }
    }
    open()
    try {
      requestAnimationFrame(() => { open() })
    } catch {
      // No frame clock (a test host): the single attempt stands.
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
