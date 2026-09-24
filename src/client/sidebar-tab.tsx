/**
 * 画板 as a tab of the product's right Sidebar.
 *
 * Two stages, exactly as any other tab type registers (the same path
 * `dsh-embedded-browser` and the built-in guide use):
 *
 * 1. `ctx.sidebarRightTabs.register` declares what the type IS — its id, the
 *    kind `openTab` names, the chip title, and the entry it contributes to the
 *    Sidebar's guide page (the list a user opens a page from);
 * 2. two keyed `ctx.slots` registrations draw its body and its live chip,
 *    under that very same id.
 *
 * Two rules from that precedent decide the shape of this module, and both are
 * silent failures when broken:
 *
 * - **The service is read inside `ctx.inject`, never at apply time.** At apply
 *   time the Sidebar has not provided `sidebarRightTabs` yet, so a direct read
 *   comes back undefined and the tab type simply never registers — no error,
 *   no tab, no clue. `ctx.inject` waits for the declaration instead.
 * - **Slot declarations arrive with their owning plugin's fiber.** The
 *   `sidebar.right.pane.tab` seats belong to the Sidebar package, which may
 *   mount after this plugin, so the registrations go through `ctx.slots.inject`
 *   (which waits for the seat) rather than `register` (which does not).
 *
 * @module dsh-drawio/client/sidebar-tab
 */

import type { JSX } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { t } from './i18n.ts'
import { BoardView, ICON_SVG, type SessionListStore } from './board.tsx'
import type { DrawioRemote } from './api.ts'
import type { DrawioSidebarController } from './sidebar-controller.ts'

/** Tab-type identity: what `openTab` names, and the key both seats register under. */
export const TAB_ID = 'dsh-drawio/board'

/** The tab kind. Stable: a session's tab layout persists it across reloads. */
export const TAB_KIND = 'drawio-board'

/** One tab's own action face, as the seat hands it over. */
interface TabActions {
  /** Close this tab. */
  close?: () => void
}

/**
 * What a tab body receives from the Sidebar's seat.
 *
 * Typed structurally (see `sidebar-right-types.ts`) rather than imported from
 * the Sidebar package: that package is a client bundle this plugin never
 * depends on at run time, so its types would tie the plugin to one harness
 * build. The seat's contract is small and stable.
 *
 * The seat passes the tab's hooks as PROPS (`useTabInfo`), not as a
 * `hookContext` field — the hook context is the runtime's, and it is not
 * reachable from a registration's component. Probing for `hookContext` is
 * therefore exactly the wrong question; `useTabInfo` is the real marker.
 */
interface TabSeatProps {
  /** The seat's information hook: returns the live tab information. */
  useTabInfo?: () => { tab?: { actions?: TabActions } }
}

/** What `mountDrawioSidebarTab` needs to draw the board inside the tab. */
export interface DrawioTabDeps {
  /** Binds one workspace root to a fresh /dsh-drawio API client. */
  makeApi: (root: string) => DrawioRemote
  /** The session store the board reads workspace roots from. */
  sessions: SessionListStore
  /** Label font family list. */
  fontFamily: string
  /** The sidebar-tab controller, for the board's close control. */
  controller: DrawioSidebarController
}

/**
 * The tab body: the board itself, sized to the Sidebar's pane.
 *
 * The board stays mounted for as long as the tab exists (`keepMounted`), so
 * switching to another Sidebar tab and back keeps the selected file, the
 * unsaved draft and the zoom — a tab that lost its state on every switch would
 * be worse than the old column.
 *
 * The board's own toolbar close control is dropped here: the Sidebar's tab
 * strip already carries a close button for this tab, and two close buttons on
 * the same surface is one too many. It stays wired on a standalone host (no
 * seat props), where nothing else can close the board.
 *
 * @param props - the seat's props.
 * @returns the board.
 */
function TabBody(props: TabSeatProps & DrawioTabDeps): JSX.Element {
  // A seat-supplied body always carries this hook; its absence means a host
  // that mounted the board outside the Sidebar, where the board's own close
  // control is the only way out.
  const onClose = props.useTabInfo !== undefined ? undefined : (): void => { props.controller.close() }
  return (
    <BoardView
      makeApi={props.makeApi}
      sessions={props.sessions}
      fontFamily={props.fontFamily}
      onClose={onClose}
    />
  )
}

/** The board's glyph, shared by the tab chip and the guide entry. */
function DrawioGlyph(): JSX.Element {
  return <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: ICON_SVG }} />
}

/**
 * The tab chip: the board's icon and its name.
 *
 * The Sidebar falls back to the registry's `title(address)` text when a type
 * registers no live title, so this exists for the glyph, not for the word.
 *
 * @returns the chip content.
 */
function TabTitle(): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
      <DrawioGlyph />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('tab.title')}</span>
    </span>
  )
}

/**
 * Register the 画板 tab type and its two seats.
 *
 * Registration is deliberately separate from opening: declaring the type brings
 * no tab on screen. Nothing appears until the user opens it (from the header
 * control, or from the Sidebar's own new-tab list) or an agent activity
 * reveals it — the same "declare, never impose" rule the embedded browser
 * follows.
 *
 * Every registration is best-effort. An external plugin must never take the
 * web GUI down, and the Sidebar may legitimately be absent (a build without
 * it): then this contributes nothing and the plugin's tools keep working.
 *
 * @param ctx - the client context.
 * @param deps - the board's data sources and the controller.
 * @returns disposer releasing every registration.
 */
export function mountDrawioSidebarTab(ctx: ClientContext, deps: DrawioTabDeps): () => void {
  const disposers: Array<() => void> = []
  const track = (dispose: unknown): void => {
    if (typeof dispose === 'function') disposers.push(dispose as () => void)
  }

  ctx.inject(['sidebarRightTabs'], (injected) => {
    const tabs = (injected as { sidebarRightTabs?: { register: (definition: unknown) => () => void } }).sidebarRightTabs
    if (tabs === undefined) return
    try {
      track(ctx.effect(() => tabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        // One board per pane: a second open focuses the tab already there.
        multiple: false,
        // Keep the board alive through tab switches and session changes.
        keepMounted: true,
        title: () => t('tab.title'),
        guide: [{
          id: TAB_ID,
          order: 40,
          title: () => t('tab.guideTitle'),
          description: () => t('tab.guideDesc'),
          icon: DrawioGlyph,
        }],
      }), 'dsh-drawio: tab type'))
    } catch (error) {
      console.warn('[dsh-drawio] registering the tab type failed:', error)
    }
  })

  // The seat's props carry the hook context; the deps ride in through the closure.
  const body = (props: TabSeatProps): JSX.Element => <TabBody {...props} {...deps} />

  try {
    track(ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, body)))
    track(ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, TabTitle)))
  } catch (error) {
    console.warn('[dsh-drawio] registering the board seats failed:', error)
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch (error) {
        console.warn('[dsh-drawio] releasing the board tab failed:', error)
      }
    }
  }
}
