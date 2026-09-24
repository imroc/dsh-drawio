/**
 * Open-path hand-off between the SSE activity subscription (index.ts) and
 * the board (BoardView). The host replays recent activity right after the
 * SSE handshake — which can finish BEFORE the board React tree has mounted
 * (and before a workspace root is selected), so a plain window event would
 * be lost. The queue survives that race: entries are kept until the board
 * drains them. Live events after mount are delivered through listeners.
 *
 * An entry carries the workspace root the activity was attributed to. The
 * host watches EVERY registered workspace, so the replay can name a diagram
 * from a project the user is not looking at; the board compares the root
 * before opening a path, otherwise a session switch leaves it reporting
 * "not-found" for a file that was never in that workspace.
 *
 * @module dsh-drawio/client/open-queue
 */

/** One agent drawing activity, as the board needs it. */
export interface OpenTarget {
  /** Workspace-relative (or as-passed) path the agent touched. */
  path: string
  /** Workspace root the activity came from; undefined on hosts that omit it. */
  root?: string
}

const queue: OpenTarget[] = []
const listeners = new Set<(target: OpenTarget) => void>()

/** Remember (and notify) the file the agent is drawing. */
export function queueOpenPath(path: string, root?: string): void {
  const target: OpenTarget = typeof root === 'string' && root !== '' ? { path, root } : { path }
  queue.push(target)
  if (queue.length > 20) queue.shift()
  for (const listener of listeners) {
    try {
      listener(target)
    } catch {
      // A listener must never break the broadcast loop.
    }
  }
}

/** Take all queued targets (oldest first); the caller opens the most recent. */
export function drainOpenPaths(): OpenTarget[] {
  return queue.splice(0)
}

/** React to live open-path events (returns the disposer). */
export function subscribeOpenPath(listener: (target: OpenTarget) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
