/**
 * The drawio side column: a trailing grid item appended to the shell frame
 * grid. Unlike aionui-panel (which rewrites the shared inline
 * grid-template-columns), this column rides an IMPLICIT grid track — the
 * browser auto-places the extra child in a new rightmost track sized to the
 * element's width — so no shared style is ever rewritten and there is no
 * conflict with sibling panel plugins. Width is draggable and persisted.
 *
 * On a narrow screen the side-by-side assumption does not hold: the mobile
 * shells turn the frame into a single-column flex stack, so the column lands
 * UNDER the conversation and — still carrying its desktop width — squeezes
 * the chat into half the viewport while covering the other half itself. The
 * fixed overlay stylesheet below takes it out of that flow entirely: below
 * the breakpoint the board fills the viewport beneath the shell's fixed
 * mobile header, and the conversation keeps the full screen behind it.
 *
 * @module dsh-drawio/client/drawio-col
 */

import { NARROW_VIEWPORT_PX } from './auto-open.ts'

/** Stable attribute identifying the injected column. */
export const COL_SELECTOR = '[data-dsh-drawio-col]'

/**
 * Stable attribute identifying the board's close control. It lives in the
 * board's toolbar (board.tsx), not in this column: the sidebar row that
 * toggles the board is unreachable on a phone (it sits in the drawer), and a
 * control floating over the toolbar covers the toolbar's own buttons.
 */
export const CLOSE_SELECTOR = '[data-dsh-drawio-close]'

/** Stable attribute identifying the injected drag handle. */
export const HANDLE_SELECTOR = '[data-dsh-drawio-col-handle]'

/** Width persistence key. */
export const COL_WIDTH_KEY = 'dsh-drawio-col-width-px'

/** Marks the injected narrow-screen stylesheet (idempotent injection). */
export const NARROW_STYLE_ID = 'dsh-drawio-narrow-styles'

const DEFAULT_WIDTH = 520
const MIN_WIDTH = 300
const MAX_WIDTH = 1000

/** Locate the frame grid: the `data-dsh-frame` stamp or the sidebar parent. */
function findFrame(): HTMLElement | null {
  const stamped = document.querySelector<HTMLElement>('[data-dsh-frame]')
  if (stamped !== null) return stamped
  return document.querySelector<HTMLElement>('[class*="sidebarCol"]')?.parentElement ?? null
}

/** The persisted width (bounded), or the default. */
function persistedWidth(): number {
  try {
    const raw = Number(localStorage.getItem(COL_WIDTH_KEY))
    if (Number.isFinite(raw)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw))
  } catch {
    // Storage unavailable: default.
  }
  return DEFAULT_WIDTH
}

/**
 * Inject the narrow-screen rule once. Below the breakpoint the column leaves
 * the frame's flow and becomes a viewport-filling overlay beneath the shells'
 * fixed mobile header.
 *
 * Three details matter:
 *
 * - the controller writes `width` and `display` inline, so the overlay rules
 *   need `!important` on exactly those, and only inside the media query, so
 *   the desktop geometry stays purely inline and untouched;
 * - `--dsh-mobile-header-h` is the band the mobile shells reserve for their
 *   own fixed header (dsh-bridge publishes it). The 52px fallback matches the
 *   conversation header a narrow desktop window still shows, so the overlay
 *   never hides behind either;
 * - the drag handle is hidden: the overlay's width is the viewport, so
 *   resizing it means nothing here.
 */
function ensureNarrowStyles(): void {
  if (document.getElementById(NARROW_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = NARROW_STYLE_ID
  style.textContent = [
    `@media (max-width: ${NARROW_VIEWPORT_PX}px) {`,
    `  ${COL_SELECTOR} {`,
    '    position: fixed !important;',
    '    left: 0 !important;',
    '    right: 0 !important;',
    '    top: var(--dsh-mobile-header-h, 52px) !important;',
    '    bottom: 0 !important;',
    '    width: auto !important;',
    '    height: auto !important;',
    '    min-width: 0 !important;',
    '    overflow: hidden !important;',
    '    background: var(--dsw-alias-bg-layer-1, #ffffff) !important;',
    '    z-index: 95 !important;',
    '  }',
    `  ${HANDLE_SELECTOR} { display: none !important; }`,
    '}',
  ].join('\n')
  document.head.appendChild(style)
}

/**
 * The drawio column controller: owns the column element, its width, the drag
 * handle, and the open/closed state (collapsed = width 0, kept mounted).
 */
export class DrawioCol {
  private frame: HTMLElement | null = null
  private col: HTMLDivElement | null = null
  private handle: HTMLDivElement | null = null
  private waitObserver: MutationObserver | null = null
  private width = persistedWidth()
  private open = false

  /** The column element once attached (null while the shell is not mounted). */
  get element(): HTMLElement | null {
    return this.col
  }

  /** Whether the column is currently visible. */
  get isOpen(): boolean {
    return this.open
  }

  /** Attach to the frame once it appears (self-healing on shell rebuilds). */
  mount(): void {
    ensureNarrowStyles()
    const tryAttach = (): void => {
      if (this.frame !== null && this.frame.isConnected) {
        if (!this.frame.contains(this.col)) this.attach(this.frame)
        return
      }
      const frame = findFrame()
      if (frame === null) return
      this.attach(frame)
    }
    this.waitObserver = new MutationObserver(() => { tryAttach() })
    this.waitObserver.observe(document.body, { childList: true, subtree: true })
    tryAttach()
  }

  /** Toggle the column (open ⇄ collapsed-to-zero). */
  toggle(): void {
    this.setOpen(!this.open)
  }

  /** Open or collapse the column (kept mounted either way). */
  setOpen(open: boolean): void {
    this.open = open
    if (this.col === null) return
    if (open) {
      this.col.style.width = `${this.width}px`
      this.col.style.display = 'flex'
      if (this.handle !== null) this.handle.style.display = 'block'
    } else {
      this.col.style.width = '0px'
      this.col.style.display = 'none'
      if (this.handle !== null) this.handle.style.display = 'none'
    }
  }

  /** Create the column, handle, and drag wiring. */
  private attach(frame: HTMLElement): void {
    this.frame = frame

    const col = document.createElement('div')
    col.dataset.dshDrawioCol = ''
    col.style.width = '0px'
    col.style.display = 'none'
    col.style.minWidth = '0'
    col.style.overflow = 'hidden'
    col.style.position = 'relative'
    col.style.height = '100%'
    // The shell grid has explicit tracks (sidebar/conversation + sibling
    // panels); auto-placement would drop this column into a second (0px) row.
    // Pin it to row 1, column 6 — the first implicit track right of the
    // shell's five explicit ones (3 native + 2 from aionui-panel).
    col.style.gridRow = '1'
    col.style.gridColumn = '6'
    frame.appendChild(col)
    this.col = col

    // Drag handle on the column's left edge.
    const handle = document.createElement('div')
    handle.dataset.dshDrawioColHandle = ''
    handle.style.cssText = [
      'position:absolute',
      'left:-5px',
      'top:0',
      'bottom:0',
      'width:10px',
      'cursor:col-resize',
      'z-index:80',
      'display:none',
    ].join(';')
    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = this.width
      const frameRight = frame.getBoundingClientRect().right
      const onMove = (move: PointerEvent): void => {
        // The column hugs the frame's right edge: width = right - cursor.
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, frameRight - move.clientX))
        this.width = next
        col.style.width = `${next}px`
        try {
          localStorage.setItem(COL_WIDTH_KEY, String(Math.round(next)))
        } catch {
          // Storage unavailable: keep in-memory width.
        }
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      void startX
      void startWidth
    })
    col.appendChild(handle)
    this.handle = handle

    // Apply the current open state: the frame may attach AFTER the user
    // already toggled the panel (shell mounts asynchronously).
    this.setOpen(this.open)
  }

  /** Detach observers, the viewport listener, and the injected elements. */
  dispose(): void {
    this.waitObserver?.disconnect()
    this.col?.remove()
    document.getElementById(NARROW_STYLE_ID)?.remove()
    this.col = null
    this.handle = null
    this.frame = null
  }
}