/**
 * Browser-side subscription to the drawio activity SSE stream. The host
 * broadcasts every diagram the agent touches; the consumer can then point the
 * board at it and — on a live event, on a screen with room — reveal the board
 * so the user watches the AI draw without clicking anything.
 *
 * The host replays recent activity to each new connection. A replayed entry
 * is history, not an event: it must NOT pop the board (a reload would hijack
 * the screen every time within the replay window — that is exactly the
 * "refresh did not help" report this handling fixes). Replay only refreshes
 * what the board shows, so it is already on the newest diagram when the user
 * opens it. Reconnects skip replay entries older than this page load.
 *
 * @module dsh-drawio/client/events
 */

export interface DrawioActivityEvent {
  kind: 'edit' | 'render' | 'template'
  path?: string
  /** Registered workspace root the activity was attributed to, when known. */
  root?: string
  /** Epoch millis when the activity was broadcast (present on host events). */
  time?: number
}

/** What the consumer is told about one activity message. */
export interface DrawioActivityInfo {
  activity: DrawioActivityEvent
  /** True when the host replayed history instead of reporting a live event. */
  replay: boolean
}

/** Open the EventSource; returns a disposer. */
export function subscribeDrawioEvents(onActivity: (info: DrawioActivityInfo) => void): () => void {
  const source = new EventSource('/dsh-drawio/events')
  const pageLoadAt = Date.now()
  let openCount = 0
  source.onopen = (): void => { openCount += 1 }
  source.onmessage = (event: MessageEvent): void => {
    try {
      const parsed = JSON.parse(event.data as string) as DrawioActivityEvent
      // An entry stamped before this page load can only be replay.
      const stale = typeof parsed.time === 'number' && parsed.time < pageLoadAt
      if (openCount > 1 && stale) return
      onActivity({ activity: parsed, replay: stale })
    } catch {
      // Malformed payload: ignore.
    }
  }
  return () => { source.close() }
}
