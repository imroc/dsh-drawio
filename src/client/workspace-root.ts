/**
 * Workspace-root resolution for the 画板.
 *
 * The board renders in its own side column, outside every slot, so it never
 * receives "the current Session" as a prop and has to ask for it. It used to
 * ask the Session list: `sessions.list.getSnapshot().current`.
 *
 * That field is gone. deepseek-harness `6830e1460d` ("own Client Session
 * generations") moved the staged Session out of the Session Controller, and
 * the list snapshot became `{ ids, byId, phase, projectionsBySession }`. A
 * missing field does not throw — reading `.current` yielded `undefined`, the
 * lookup below it yielded `undefined`, and the resolver returned `''`, so the
 * board sat on 「未打开项目工作区」 forever and never issued a single
 * /dsh-drawio request. Nothing in the console said why.
 *
 * The Session selection now lives in ui-workspace's persisted record
 * (`dsh.sessions.current`, the same fact the host's own e2e tests read). This
 * resolver reads that record, and keeps two fallbacks so that the next time
 * the selection moves the board degrades to *some* workspace instead of a
 * silently blank panel:
 *
 *   1. the selected Session's `cwd` — the project the user is looking at;
 *   2. the workspace an agent activity event was attributed to (the drawing
 *      just happened there);
 *   3. the host's registered roots, used only when exactly one is registered
 *      (with several, picking one would show the wrong project).
 *
 * @module dsh-drawio/client/workspace-root
 */

import type { SessionListStore } from './board.ts'

/** ui-workspace's persisted "which Session is on screen" record. */
export const SESSION_SELECTION_KEY = 'dsh.sessions.current'

/** Where the current root came from (diagnostics and tests). */
export type RootSource = 'session' | 'activity' | 'host' | 'none'

/** Host route listing the registered workspace roots. */
export const WORKSPACE_ROOTS_URL = '/dsh-drawio/roots'

/**
 * How often to re-read the selection. Poking a snapshot store from another
 * package is what broke here, so this does not subscribe to ui-workspace's
 * private store: it re-reads the persisted record, which is a localStorage
 * getItem plus an object lookup. Session switches are user-paced, so a second
 * of latency is invisible.
 */
const POLL_MS = 1000

/** Backoff after a failed roots fetch (the host may still be starting). */
const HOST_RETRY_MS = 30_000

/**
 * The workspace the most recent agent activity was attributed to. The SSE
 * subscription (client/index.ts) writes it; every store reads it as fallback
 * 2. Module scope because the subscription and the board are mounted by
 * different halves of the plugin.
 */
let attributedRoot = ''

/** Record the workspace an agent drawio activity event came from. */
export function noteActivityRoot(root: unknown): void {
  if (typeof root !== 'string' || root === '') return
  attributedRoot = root
}

/** Reset the attributed workspace (tests). */
export function resetActivityRoot(): void {
  attributedRoot = ''
}

/** External stores the resolver reads (injectable for tests). */
export interface RootStoreDeps {
  /** The Session list, for one Session's `cwd`. */
  sessions: SessionListStore
  /** Persisted-record reader; defaults to `localStorage`. */
  readSelection?: () => string | null
  /** Registered-roots fetch; defaults to `fetch(WORKSPACE_ROOTS_URL)`. */
  fetchRoots?: () => Promise<string[]>
  /** Attributed-workspace reader; defaults to {@link noteActivityRoot}'s value. */
  activityRoot?: () => string
  /** Clock, for the roots-fetch backoff. */
  now?: () => number
  /** Whether the page is visible; hidden pages skip polling. */
  isVisible?: () => boolean
}

/** Resolve, and stay resolved, the workspace root the board browses. */
export class WorkspaceRootStore {
  private root = ''
  private source: RootSource = 'none'
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private unsubscribe: (() => void) | undefined
  private hostRoot: string | null = null
  private hostFetch: Promise<void> | null = null
  private hostNextTry = 0

  constructor(private readonly deps: RootStoreDeps) {
    this.root = this.resolve()
  }

  /** The workspace root the board should browse ('' when none is known). */
  getSnapshot(): string {
    return this.root
  }

  /** Why the current root was chosen. */
  get rootSource(): RootSource {
    return this.source
  }

  /** Watch for changes: the Session selection (poll) and the list (cwd arrival). */
  start(): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => { this.refresh() }, POLL_MS)
    try {
      this.unsubscribe = this.deps.sessions.subscribe(() => { this.refresh() })
    } catch {
      // A store without subscribe() still works through the poll.
    }
  }

  /** Stop watching. */
  dispose(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.listeners.clear()
  }

  /** Subscribe to root changes (a `useSyncExternalStore` source). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Record the attributed workspace and re-resolve. */
  attributeTo(root: unknown): void {
    const before = this.activityRoot()
    noteActivityRoot(root)
    if (this.activityRoot() !== before) this.refresh()
  }

  private activityRoot(): string {
    return this.deps.activityRoot?.() ?? attributedRoot
  }

  /** Recompute; notify only when the resolved root actually moved. */
  refresh(): void {
    if (this.timer !== undefined && this.deps.isVisible?.() === false) return
    const next = this.resolve()
    if (next === this.root) return
    this.root = next
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // One broken subscriber must not stop the others.
      }
    }
  }

  private resolve(): string {
    const session = this.sessionRoot()
    if (session !== '') {
      this.source = 'session'
      return session
    }
    if (this.activityRoot() !== '') {
      this.source = 'activity'
      return this.activityRoot()
    }
    if (this.hostRoot !== null) {
      this.source = this.hostRoot === '' ? 'none' : 'host'
      return this.hostRoot
    }
    void this.fetchHostRoot()
    this.source = 'none'
    return ''
  }

  /** `cwd` of the Session the user has on screen, per the persisted record. */
  private sessionRoot(): string {
    let id: string | undefined
    try {
      const raw = this.readSelection()
      if (raw !== null && raw !== '') {
        const parsed = JSON.parse(raw) as { sessionId?: unknown }
        if (typeof parsed.sessionId === 'string' && parsed.sessionId !== '') id = parsed.sessionId
      }
    } catch {
      // Malformed record (or storage denied): fall through to the fallbacks.
    }
    if (id === undefined) return ''
    try {
      const cwd = this.deps.sessions.getSnapshot().byId[id]?.cwd
      return typeof cwd === 'string' ? cwd : ''
    } catch {
      return ''
    }
  }

  private readSelection(): string | null {
    if (this.deps.readSelection !== undefined) return this.deps.readSelection()
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(SESSION_SELECTION_KEY)
  }

  /** Ask the host for its registered roots: one shot, retried on a backoff. */
  private fetchHostRoot(): void {
    if (this.hostFetch !== null) return
    const now = this.deps.now?.() ?? Date.now()
    if (now < this.hostNextTry) return
    this.hostNextTry = now + HOST_RETRY_MS
    this.hostFetch = (async () => {
      try {
        const roots = await this.fetchRoots()
        // One workspace is unambiguous; several would mean guessing a project.
        this.hostRoot = roots.length === 1 ? roots[0]! : ''
      } catch {
        this.hostRoot = null // retry after the backoff
      }
      this.hostFetch = null
      this.refresh()
    })()
  }

  private async fetchRoots(): Promise<string[]> {
    if (this.deps.fetchRoots !== undefined) return this.deps.fetchRoots()
    const response = await fetch(WORKSPACE_ROOTS_URL, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`roots ${response.status}`)
    const payload = await response.json() as { value?: { roots?: unknown } }
    const roots = payload.value?.roots
    return Array.isArray(roots) ? roots.filter((r): r is string => typeof r === 'string' && r !== '') : []
  }
}
