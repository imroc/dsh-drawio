/**
 * dsh-drawio, browser half: puts the 画板 in the product's right Sidebar as a
 * tab of its own, and adds the header control that opens it.
 *
 * The board used to be a hand-built grid column beside the conversation, with
 * an entry row injected into the left Sidebar. Both are gone: the Sidebar owns
 * the panel now, which is the only arrangement in which the conversation, the
 * Sidebar and the board can share a screen — see `sidebar-controller.ts` for
 * the measurement that made the old design unworkable.
 *
 * Host communication goes over the /dsh-drawio HTTP routes via plain fetch —
 * no typert remote machinery (the family pattern: dsh-ssh and
 * dsh-aionui-panel do the same). Failure policy: DOM and slot problems are
 * logged, never thrown — an external plugin must not take the web GUI down.
 *
 * @module dsh-drawio/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { subscribeDrawioEvents } from './events.ts'
import { queueOpenPath } from './open-queue.ts'
import { noteActivityRoot } from './workspace-root.ts'
import { shouldAutoOpen } from './auto-open.ts'
import { mountHeaderEntry } from './header-entry.ts'
import { mountDrawioSidebarTab, TAB_KIND } from './sidebar-tab.tsx'
import { installNarrowStyles } from './narrow-styles.ts'
import { mountNarrowEntry } from './narrow-entry.ts'
import { DrawioSidebarController, type FrameLayoutFace, type SidebarRightFace } from './sidebar-controller.ts'
import { DrawioApi, type DrawioRemote } from './api.ts'
import { ZH, EN } from './locales.ts'
import type { SessionListStore } from './board.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Drawio surface copy. */
    'drawio': string
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'drawio'

/** Plugin name: matches the package name, the graph row id, and the bundle id. */
export const name = 'dsh-drawio'

/** Services the surfaces read. */
export const inject = ['slots', 'locale', 'sessions']

/** Bind one workspace root to a fresh API client (rebuilt on session switch). */
function makeApi(root: string): DrawioRemote {
  return new DrawioApi(root)
}

/**
 * Current viewport width, read at decision time (not cached): the shells can
 * be resized or emulated after load, and the narrow-screen rule has to see
 * the width the user is actually on.
 */
function viewportWidth(): number {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY
  return window.innerWidth
}

/** The host's label font family, when it publishes one. */
function readFontFamily(): string {
  const fallback = "Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  try {
    if (typeof document === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue('--dsh-drawio-font').trim()
    return value !== '' ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * Browser plugin body: dictionaries, the 画板 tab type and its seats, the
 * header entry that opens it, and the activity subscription that reveals it
 * while the agent draws.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-drawio: dictionaries')

  // The Sidebar service is read inside `ctx.inject`: at apply time the Sidebar
  // has not provided it yet, and reading it there would silently leave the tab
  // type unregistered (see sidebar-tab.ts). The frame's panel-action face is
  // read the same way, and for the same reason.
  let face: SidebarRightFace | undefined
  let layout: FrameLayoutFace | undefined
  const controller = new DrawioSidebarController(() => face, () => layout, TAB_KIND)
  const disposers: Array<() => void> = []

  ctx.inject(['sidebarRight'], (sidebarCtx) => {
    const service = (sidebarCtx as unknown as { sidebarRight?: SidebarRightFace }).sidebarRight
    if (service === undefined) {
      console.warn('[dsh-drawio] the right Sidebar is not loaded: the 画板 has no surface')
      return
    }
    face = service
    ctx.effect(() => () => { face = undefined }, 'dsh-drawio: sidebar face')
  })

  ctx.inject(['layout'], (layoutCtx) => {
    const service = (layoutCtx as unknown as { layout?: FrameLayoutFace }).layout
    if (service === undefined) return
    layout = service
    ctx.effect(() => () => { layout = undefined }, 'dsh-drawio: frame layout face')
  })

  // Tab type + its two seats. Split from the header entry below so a failure
  // in one never costs the other.
  try {
    disposers.push(mountDrawioSidebarTab(ctx, {
      makeApi,
      sessions: ctx.sessions.list as unknown as SessionListStore,
      fontFamily: readFontFamily(),
      controller,
    }))
  } catch (error) {
    console.error('[dsh-drawio] mounting the board tab failed:', error)
  }

  try {
    disposers.push(mountHeaderEntry(controller))
  } catch (error) {
    console.error('[dsh-drawio] mounting the header entry failed:', error)
  }

  // The phone's way in. Hidden by the stylesheet wherever the header control
  // exists, so this costs a wide viewport nothing.
  try {
    disposers.push(mountNarrowEntry(controller))
  } catch (error) {
    console.error('[dsh-drawio] mounting the navigation entry failed:', error)
  }

  // The narrow-screen fix-up: the shell's mobile layout collapses the frame's
  // panel column, which is where the Sidebar's full-screen panel anchors. See
  // narrow-styles.ts.
  disposers.push(installNarrowStyles())

  // Agent drawio activity -> point the board at the file the agent is drawing,
  // and (live events only, screen permitting) reveal the board. The path goes
  // through the open queue rather than a window event: the SSE replay can
  // arrive before the board tree has mounted its listeners, and the board
  // drains the queue once a root is available.
  disposers.push(subscribeDrawioEvents(({ activity, replay }) => {
    noteActivityRoot(activity.root)
    if (typeof activity.path === 'string' && activity.path !== '') {
      queueOpenPath(activity.path, activity.root)
    }
    if (shouldAutoOpen({ replay, viewportWidth: viewportWidth() })) {
      controller.reveal()
    }
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch (error) {
        console.warn('[dsh-drawio] releasing a surface failed:', error)
      }
    }
    controller.dispose()
  }, 'dsh-drawio: surfaces')
}
