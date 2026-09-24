/**
 * dsh-drawio, browser half: injects the sidebar entry row and the
 * center-column 画板 view (DOM-level surfaces following the task-board /
 * toolbox precedent). Host communication goes over the /dsh-drawio HTTP
 * routes via plain fetch — no typert remote machinery (the family pattern:
 * dsh-ssh and dsh-aionui-panel do the same). Failure policy: DOM mounting
 * problems are logged, never thrown — an external plugin must not take the
 * web GUI down.
 *
 * @module dsh-drawio/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { DrawioController } from './controller.ts'
import { DrawioCol } from './drawio-col.ts'
import { subscribeDrawioEvents } from './events.ts'
import { queueOpenPath } from './open-queue.ts'
import { noteActivityRoot } from './workspace-root.ts'
import { shouldAutoOpen } from './auto-open.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { mountDrawioView } from './view-mount.tsx'
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

/**
 * Browser plugin body: dictionaries, the sidebar entry, and the center-column
 * 画板 view.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-drawio: dictionaries')

  const controller = new DrawioController()
  // Closing goes through the controller — it owns the open state, and the
  // column plus the sidebar row's highlight both mirror it. Flipping the
  // column directly would leave that row highlighted with the board closed.
  const closeBoard = (): void => { controller.setOpen(false) }
  const col = new DrawioCol()
  col.mount()
  // The controller owns the open state (sidebar highlight); the column
  // mirrors it (widens / collapses beside the conversation).
  const syncCol = (): void => { col.setOpen(controller.getSnapshot().open) }
  const unsubscribeCol = controller.subscribe(syncCol)
  syncCol()
  // The board asks the shell to reveal the side column (e.g. after a
  // standalone-tab 弹回画板 while the column was collapsed).
  const onOpenCol = (): void => { controller.setOpen(true) }
  window.addEventListener('dsh-drawio:open-col', onOpenCol)
  const disposers: Array<() => void> = []
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
      controller.setOpen(true)
    }
  }))
  try {
    const fontFamily = typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--dsh-drawio-font')?.trim() || undefined
      : undefined
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountDrawioView(
      col,
      makeApi,
      ctx.sessions.list as unknown as SessionListStore,
      fontFamily ?? "Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      closeBoard,
    ))
  } catch (error) {
    // DOM failures degrade the 画板, never the GUI.
    console.error('[dsh-drawio] mount failed:', error)
  }

  ctx.effect(() => () => {
    unsubscribeCol()
    window.removeEventListener('dsh-drawio:open-col', onOpenCol)
    for (const dispose of disposers.splice(0)) dispose()
    col.dispose()
  }, 'dsh-drawio: surfaces')
}