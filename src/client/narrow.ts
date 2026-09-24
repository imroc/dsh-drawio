/**
 * The narrow-viewport flag, shared by the surfaces that behave differently
 * below the Sidebar's full-screen breakpoint.
 *
 * This is a presentation *decision*, not a measurement, so it cannot be left
 * to CSS alone: the board's toolbar has to render a close control on a phone
 * and omit it on a desktop (its host, the tab strip, owns a close button
 * there), and the header control has to behave differently. A CSS class could
 * hide one of two always-rendered controls, but the two presentations are not
 * the same control — and the decision is needed in JS before render.
 *
 * `matchMedia` is the source of truth: the browser watches the query and
 * notifies on every crossing, so there is no resize listener of our own to
 * leak and no polling. `SIDEBAR_FULLSCREEN_PX` mirrors the Sidebar's own
 * breakpoint rather than inventing one.
 *
 * @module dsh-drawio/client/narrow
 */

import { useEffect, useState } from 'react'
import { SIDEBAR_FULLSCREEN_PX } from './sidebar-controller.ts'

/** The media query the Sidebar itself switches presentation on. */
export const NARROW_QUERY = `(max-width: ${SIDEBAR_FULLSCREEN_PX - 1}px)`

/** Whether the viewport is currently narrower than the Sidebar's full-screen breakpoint. */
export function isNarrowViewport(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia(NARROW_QUERY).matches
  } catch {
    return window.innerWidth < SIDEBAR_FULLSCREEN_PX
  }
}

/**
 * Track the narrow-viewport flag across resizes and emulation changes.
 *
 * A test host without `matchMedia` falls back to a single measurement: the
 * flag then simply does not follow later resizes, which beats failing.
 *
 * @returns whether the viewport is narrow, re-read on every crossing.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(isNarrowViewport)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let query: MediaQueryList
    try {
      query = window.matchMedia(NARROW_QUERY)
    } catch {
      return
    }
    const sync = (): void => { setNarrow(query.matches) }
    sync()
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync)
      return () => { query.removeEventListener('change', sync) }
    }
    // Safari < 14 and old test hosts: the deprecated registration.
    query.addListener(sync)
    return () => { query.removeListener(sync) }
  }, [])
  return narrow
}
