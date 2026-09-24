/**
 * When an agent activity event may reveal the board on its own.
 *
 * Two situations must not:
 *
 * - **Replayed history.** The host replays up to ten minutes of recent
 *   activity to every new SSE subscriber, so a page that loads after a
 *   drawing still catches up. Revealing the board on replay made every
 *   reload within that window re-open a panel the user had just closed —
 *   the "I refreshed and it is still there" report. Replay now only updates
 *   what the board shows; the user decides when to look.
 *
 * - **A narrow screen.** Below the mobile breakpoint the board covers the
 *   viewport, so an unprompted reveal would interrupt whatever the user is
 *   doing (usually typing). The board keeps following the drawing silently
 *   and is ready the moment they tap the entry row.
 *
 * @module dsh-drawio/client/auto-open
 */

/** The mobile breakpoint the shells' narrow layouts use. */
export const NARROW_VIEWPORT_PX = 767

/**
 * Decide whether one activity event may reveal the board.
 * @param input - whether the event is replay, and the current viewport width.
 * @returns true when the board may open itself.
 */
export function shouldAutoOpen(input: { replay: boolean; viewportWidth: number }): boolean {
  if (input.replay) return false
  return input.viewportWidth > NARROW_VIEWPORT_PX
}
