/**
 * The 画板 entry row, for the navigation Sidebar only.
 *
 * On a wide viewport the board has two ways in already: the header control
 * that sits beside the Sidebar's own expand button, and the Sidebar's "+"
 * list. Neither survives a phone: the shell replaces the conversation header
 * with its own top bar, and the "+" list lives inside the Sidebar — which on
 * a phone is an off-canvas drawer the user has to find first. A row in that
 * drawer is the one entry a phone user is already looking at, so the board
 * gets one **only there** (the row hides itself at ≥ the Sidebar's
 * full-screen breakpoint, where it would duplicate the header control).
 *
 * The row is a plain DOM button injected after the sibling family block, the
 * same technique this plugin family uses for navigation entries — the shell
 * exposes no slot for them. Two details are load-bearing:
 *
 * - the drawer must be dismissed on tap. The mobile shells close their drawer
 *   when a tap lands on a session row, the backdrop or New Session, but not
 *   for a row a plugin injected, so without this the board opens underneath
 *   the drawer and the tap looks like it did nothing (the shells publish the
 *   state as the `dsh-drawer-open` body class, which is what shows their
 *   backdrop, so dropping it is exactly what their own handler does);
 * - the injection self-heals: a MutationObserver re-inserts the row whenever a
 *   React re-render displaces it.
 *
 * @module dsh-drawio/client/narrow-entry
 */

import type { DrawioSidebarController } from './sidebar-controller.ts'
import { t } from './i18n.ts'
import { ICON_SVG } from './board.tsx'
import styles from './board.module.css'

/** Stable attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-drawio-entry]'

/** Family rows injected by sibling plugins (kept in stable relative order). */
const FAMILY_SELECTOR = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-devtoolbox-entry]'

/** The navigation Sidebar's root element, or undefined while it is not mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

/** The New Session button: nested in the logo row on current shells. */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/**
 * Dismiss the mobile drawer after the tap.
 *
 * Best-effort by design: a shell that does not use the `dsh-drawer-open` body
 * class simply leaves the drawer as it was, and the row still works.
 */
function dismissMobileDrawer(): void {
  try {
    if (window.innerWidth > 767) return
    if (!document.body.classList.contains('dsh-drawer-open')) return
    document.body.classList.remove('dsh-drawer-open')
  } catch {
    // A shell detail must never break the entry row.
  }
}

/** Build the entry row (detached; inserted once the Sidebar is up). */
function createEntry(controller: DrawioSidebarController): HTMLButtonElement {
  const label = t('entry.label')
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshDrawioEntry = ''
  // Presentation (including the ≥768px hide) lives in the stylesheet.
  entry.className = styles.entry ?? ''
  entry.setAttribute('aria-label', label)
  entry.innerHTML = `<span class="${styles.entryIcon ?? ''}">${ICON_SVG}</span><span>${label}</span>`
  entry.addEventListener('click', () => {
    controller.reveal()
    dismissMobileDrawer()
  })
  return entry
}

/** Re-insert the row after the New Session row / sibling family block. */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement === root) return true
  const row = button.closest('[class*="logoRow"]')
  const base = (row !== null && row.parentElement === root) ? row : button
  const family = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR),
  )
  // After the whole family block (stable: never competes with siblings for
  // the first slot, so relative order cannot flip between re-renders).
  const anchor = family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling
  root.insertBefore(entry, anchor)
  return true
}

/**
 * Mount the navigation entry, waiting for the Sidebar to render and
 * self-healing on later React re-renders.
 *
 * @param controller - the controller the row reveals the board through.
 * @returns disposer removing the row and its observers.
 */
export function mountNarrowEntry(controller: DrawioSidebarController): () => void {
  const entry = createEntry(controller)
  let root: HTMLElement | undefined
  let placed = false
  let rootObserver: MutationObserver | undefined

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      rootObserver?.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver?.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) {
      rootObserver ??= new MutationObserver(() => {
        if (root === undefined || !root.isConnected) {
          placed = false
          tryPlace()
          return
        }
        if (!root.contains(entry)) placeEntry(root, entry)
      })
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  // Body-level watcher as the "whole rebuild" fallback.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })
  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver?.disconnect()
    entry.remove()
  }
}
