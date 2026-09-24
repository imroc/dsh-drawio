/**
 * One narrow-screen fix-up, and why this plugin has to carry it.
 *
 * The Sidebar draws itself as a **full-screen** panel below its own 768px
 * breakpoint (`RightbarSeat.autoFullscreen`) — and in that presentation the
 * frame solves its panel column to width 0 on purpose, so the panel owns the
 * viewport instead of a track. For that to work the panel's containing block
 * has to be as tall as the frame: the panel is `position: absolute` with
 * `top: 0; bottom: 0`, so a zero-height box puts the whole panel off-screen.
 *
 * On a phone the shell (`@wenbin_wb/dsh-bridge`) turns the frame into a flex
 * row, and the panel column — having no flex sizing and only absolutely
 * positioned content — collapses to zero height. Measured at 420x844 with the
 * board open: the column resolved to height 0, the panel was laid out at
 * y = 896 (below an 844px viewport), and nothing of the board was on screen.
 *
 * The fix is two properties on the panel column, stated through the
 * **stable data attributes** the frame and the Sidebar stamp on those nodes
 * (`data-rightbar-col`, `data-sidebar-right-panel`) rather than their hashed
 * CSS-module class names — the same technique the shell's own mobile
 * stylesheet uses, and the reason a plugin can do this at all:
 *
 * - `flex: none` (plus `height: 100%`) stops the flex row from shrinking the
 *   column to nothing, which is what restores the containing block;
 * - pinning the full-screen panel to the viewport (`position: fixed`) is
 *   belt-and-braces for shells that lay the frame out differently, and it is
 *   what the panel's own CSS comment assumes.
 *
 * Everything lives inside `@media (max-width: 767px)`, so the desktop layout
 * is untouched; the panel edges are offset by the shell's own
 * `--dsh-mobile-header-h` so its fixed top bar never covers the board.
 *
 * @module dsh-drawio/client/narrow-styles
 */

import { SIDEBAR_FULLSCREEN_PX } from './sidebar-controller.ts'

/** Marks the injected stylesheet (idempotent injection). */
export const NARROW_STYLE_ID = 'dsh-drawio-narrow-styles'

/** The stylesheet text, exported so a test can assert what is applied. */
export const NARROW_CSS = [
  `@media (max-width: ${SIDEBAR_FULLSCREEN_PX - 1}px) {`,
  '  [data-rightbar-col] {',
  '    flex: none;',
  '    height: 100%;',
  '  }',
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
