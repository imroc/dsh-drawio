/**
 * One narrow-screen fix-up, and why this plugin has to carry it.
 *
 * Below its own 768px breakpoint the Sidebar draws itself as a **full-screen**
 * panel (`RightbarSeat.autoFullscreen`), and in that presentation the frame
 * deliberately solves the panel column to width 0 — the panel owns the
 * viewport instead of a track. The panel is `position: absolute` with
 * `top: 0; bottom: 0`, so its height comes entirely from its containing block.
 *
 * On a phone the shell (`@wenbin_wb/dsh-bridge`) turns the frame into a flex
 * column, and the panel column — no flex sizing, and only absolutely
 * positioned content — collapses to zero height. The panel then lays itself
 * out below the viewport: measured at 420x844 with the board open, the column
 * resolved to height 0 and the panel landed at y = 896, off an 844px screen.
 *
 * The fix is **one** declaration, stated through the stable data attribute the
 * Sidebar stamps on the panel (`data-sidebar-right-panel`) rather than its
 * hashed CSS-module class name — the same technique the shell's own mobile
 * stylesheet uses, and the reason a plugin can do this at all: pin the
 * full-screen panel to the viewport instead of to a containing block that
 * another plugin's layout can collapse.
 *
 * **Do not add sizing to the panel's column.** An earlier version of this file
 * also set `flex: none; height: 100%` on `[data-rightbar-col]` to give the
 * panel a containing block. Under the shell's flex frame that steals the
 * frame's free space from the *conversation* column: at 390x844 the centre
 * column resolved to height 0 and the session rendered blank (its composer sat
 * at y = -34). Pinning the panel needs nothing from the column, so the column
 * is left exactly as the product laid it out.
 *
 * Everything lives inside `@media (max-width: 767px)`: the desktop layout is
 * untouched, and the top offset uses the shell's own `--dsh-mobile-header-h`
 * so its fixed top bar never covers the board.
 *
 * @module dsh-drawio/client/narrow-styles
 */

import { SIDEBAR_FULLSCREEN_PX } from './sidebar-controller.ts'

/** Marks the injected stylesheet (idempotent injection). */
export const NARROW_STYLE_ID = 'dsh-drawio-narrow-styles'

/** The stylesheet text, exported so a test can assert what is applied. */
export const NARROW_CSS = [
  `@media (max-width: ${SIDEBAR_FULLSCREEN_PX - 1}px) {`,
  '  [data-sidebar-right-panel="fullscreen"] {',
  '    position: fixed;',
  '    top: var(--dsh-mobile-header-h, 52px);',
  '    height: auto;',
  '    max-height: none;',
  '  }',
  '}',
].join('\n')

/**
 * Inject the narrow-screen fix-up once per plugin activation.
 *
 * @returns disposer removing the stylesheet.
 */
export function installNarrowStyles(): () => void {
  if (typeof document === 'undefined') return () => undefined
  if (document.getElementById(NARROW_STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = NARROW_STYLE_ID
    style.dataset.plugin = 'dsh-drawio'
    style.textContent = NARROW_CSS
    document.head.appendChild(style)
  }
  return () => {
    document.getElementById(NARROW_STYLE_ID)?.remove()
  }
}
