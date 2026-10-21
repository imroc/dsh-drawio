/**
 * Per-browser 画板 preferences.
 *
 * The only preference so far is whether agent drawing activity may reveal the
 * board. It has two layers, and the precedence is the point:
 *
 * 1. **The user's own toggle** (the board's toolbar button), persisted in
 *    `localStorage` — survives reloads, applies instantly, no host restart.
 * 2. **The host's `boardAutoOpen` config**, fetched once over
 *    `/dsh-drawio/config` — sets the default for a browser that never touched
 *    the toggle. Default is off: an unprompted panel that returns every time
 *    the agent touches a diagram fights the user who just closed it.
 *
 * The decision reads the store on every event instead of caching it, so a
 * toggle click takes effect for the very next diagram (no subscription
 * plumbing between the board's React tree and the SSE consumer).
 *
 * Pure module: the storage is injectable, so the node test suite exercises the
 * precedence without a DOM.
 *
 * @module dsh-drawio/client/prefs
 */

/** `localStorage` key holding the user's override ('on' / 'off'). */
export const AUTO_OPEN_STORAGE_KEY = 'dsh-drawio:board-auto-open'

/** The store subset this module needs (a `Storage`, or a test double). */
export interface PrefsStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** The host's configured default, or undefined until `/dsh-drawio/config` answers. */
let hostAutoOpen: boolean | undefined

/** Record the host default (called once when the config route answers). */
export function setHostAutoOpen(value: boolean): void {
  hostAutoOpen = value
}

/** The host default as currently known (undefined before the fetch settles). */
export function hostAutoOpenDefault(): boolean | undefined {
  return hostAutoOpen
}

/** The page's `localStorage`, or undefined where there is none (SSR, tests). */
function defaultStorage(): PrefsStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    // Access can throw when storage is disabled by policy.
    return undefined
  }
}

/** The user's stored override: true / false / undefined when never set. */
export function storedAutoOpen(storage?: PrefsStorage): boolean | undefined {
  const store = storage ?? defaultStorage()
  if (store === undefined) return undefined
  try {
    const raw = store.getItem(AUTO_OPEN_STORAGE_KEY)
    if (raw === 'on') return true
    if (raw === 'off') return false
  } catch {
    // A broken store must not decide the policy.
  }
  return undefined
}

/**
 * Whether the board may reveal itself: the user's override when set, else the
 * host default, else off.
 */
export function autoOpenEnabled(storage?: PrefsStorage): boolean {
  return storedAutoOpen(storage) ?? hostAutoOpen ?? false
}

/** Persist the user's override (the toolbar toggle). */
export function storeAutoOpen(value: boolean, storage?: PrefsStorage): void {
  const store = storage ?? defaultStorage()
  if (store === undefined) return
  try {
    store.setItem(AUTO_OPEN_STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // Quota / private mode: the in-memory host default still applies.
  }
}
