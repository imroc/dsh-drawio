/**
 * The 画板 entry in the conversation header.
 *
 * Before the board became a Sidebar tab, its only way in was a row injected
 * into the left Sidebar's navigation — which on a phone meant opening the
 * drawer, and on a desktop meant two panels growing side by side until the
 * conversation was gone. The Sidebar's own machinery now owns the panel
 * (width, collapse, fullscreen, tab strip); what it does not provide is a way
 * in that sits next to the conversation.
 *
 * The conversation header renders exactly one extension seat — its far-right
 * corner — and the Sidebar's own expand control already occupies it. A second
 * registration on a `single` slot throws, so instead of competing for the
 * seat the entry is placed beside the occupant, inside the same corner box:
 * the shell's `data-conversation-header-corner` stamp is a stable hook, and
 * the corner is laid out only while something is inside it, so the button
 * never widens an empty header.
 *
 * The injection self-heals the way the old navigation row did: a
 * MutationObserver re-inserts the button when a React re-render drops it, and
 * the container being replaced is handled by re-resolving it.
 *
 * @module dsh-drawio/client/header-entry
 */

import type { DrawioSidebarController } from './sidebar-controller.ts'
import { t } from './i18n.ts'
import { ICON_SVG } from './board.tsx'

/** Stable attribute identifying the injected header button. */
export const HEADER_ENTRY_SELECTOR = '[data-dsh-drawio-header]'

/** The conversation header's corner box (shell-owned, stable stamp). */
const CORNER_SELECTOR = '[data-conversation-header-corner]'

/** The Sidebar's own corner occupant, when it is on screen. */
const SIDEBAR_EXPAND_SELECTOR = '[data-sidebar-right-expand]'

/**
 * Where the shell's header utilities live, as the fallback anchor when the
 * corner box is absent (a shell built without the corner seat).
 */
const UTILITIES_SELECTOR = '[class*="headerUtilities"]'

/** Build the header button (detached; inserted once the header is up). */
function createEntry(controller: DrawioSidebarController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshDrawioHeader = ''
  entry.setAttribute('aria-label', t('header.aria'))
  entry.title = t('header.open')
  entry.style.cssText = [
    'width:28px',
    'height:28px',
    'flex:none',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'border:none',
    'border-radius:999px',
    'background:transparent',
    'color:var(--dsw-alias-label-secondary, currentColor)',
    'cursor:pointer',
  ].join(';')
  entry.innerHTML = ICON_SVG
  const glyph = entry.firstElementChild
  if (glyph instanceof SVGElement) {
    glyph.setAttribute('width', '16')
    glyph.setAttribute('height', '16')
  }
  entry.addEventListener('mouseenter', () => {
    entry.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.05))'
  })
  entry.addEventListener('mouseleave', () => {
    entry.style.background = 'transparent'
  })
  entry.addEventListener('click', () => {
    controller.reveal()
  })
  return entry
}

/** Resolve the box the button belongs in, or undefined while the header is not up. */
function findCorner(): HTMLElement | null {
  const corner = document.querySelector<HTMLElement>(CORNER_SELECTOR)
  if (corner !== null) return corner
  // Shells without the corner seat: sit at the right edge of the header's
  // utilities cluster instead, which is the same visual position.
  const utilities = document.querySelector<HTMLElement>(UTILITIES_SELECTOR)
  return utilities
}

/**
 * Mount the header entry, waiting for the conversation header to render and
 * self-healing on later React re-renders.
 *
 * @param controller - the controller the button reveals the board through.
 * @returns disposer removing the button and its observers.
 */
export function mountHeaderEntry(controller: DrawioSidebarController): () => void {
  const entry = createEntry(controller)
  let corner: HTMLElement | undefined
  let cornerObserver: MutationObserver | undefined

  const place = (target: HTMLElement): void => {
    // After the Sidebar's own expand control when it is there: the existing
    // control keeps the corner's leading position, and the layout reads left
    // to right in the order the user learned.
    const expand = target.querySelector<HTMLElement>(SIDEBAR_EXPAND_SELECTOR)
    const anchor = expand !== null && expand.parentElement === target ? expand.nextElementSibling : null
    target.insertBefore(entry, anchor)
  }

  const tryPlace = (): void => {
    if (corner !== undefined && !corner.isConnected) {
      cornerObserver?.disconnect()
      corner = undefined
    }
    if (corner !== undefined) {
      if (entry.parentElement === corner) return
      place(corner)
      return
    }
    const target = findCorner()
    if (target === null) return
    corner = target
    place(target)
    cornerObserver = new MutationObserver(() => {
      if (corner === undefined || !corner.isConnected) {
        tryPlace()
        return
      }
      // A re-render can drop the injected node; put it back at the end.
      if (entry.parentElement !== corner) place(corner)
    })
    cornerObserver.observe(corner, { childList: true })
  }

  // Body-level watcher: the header itself appears, disappears and is rebuilt
  // with the session, so a container-scoped observer alone is not enough.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })
  tryPlace()

  return () => {
    waitObserver.disconnect()
    cornerObserver?.disconnect()
    entry.remove()
  }
}
