/**
 * Workspace-root resolution + auto-open policy tests.
 *
 * Regression cover for the silent failure that made the 画板 a dead panel on
 * DSH 0.1.7: the board read `sessions.list.getSnapshot().current`, the field
 * disappeared from the list snapshot (deepseek-harness 6830e1460d), and the
 * resolver returned '' without throwing — so the board showed
 * 「未打开项目工作区」 forever and never called the host.
 */
import assert from 'node:assert/strict'
import { shouldAutoOpen, NARROW_VIEWPORT_PX } from '../lib/auto-open.js'
import {
  WorkspaceRootStore,
  noteActivityRoot,
  resetActivityRoot,
  SESSION_SELECTION_KEY,
  WORKSPACE_ROOTS_URL,
} from '../lib/workspace-root.js'

const SESSION = 'session-abc'
const CWD = '/data/dev/agents/dsh-agent'
const OTHER = '/data/dev/agents/other'

/** A Session list store shaped like the 0.1.7 one (no `current` field). */
function sessionsStore(byId = { [SESSION]: { cwd: CWD } }) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({ byId }),
  }
}

/** A store whose persisted selection record names `sessionId`. */
function makeStore(options = {}) {
  const raw = options.raw !== undefined
    ? options.raw
    : (options.sessionId === null ? null : JSON.stringify({ sessionId: options.sessionId ?? SESSION }))
  return new WorkspaceRootStore({
    sessions: options.sessions ?? sessionsStore(),
    readSelection: () => raw,
    fetchRoots: options.fetchRoots ?? (async () => []),
    activityRoot: options.activityRoot,
    isVisible: () => true,
  })
}

/** Let the (microtask) roots fetch settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

// --- the regression: resolve from the persisted selection, not list.current
{
  const store = makeStore()
  assert.equal(store.getSnapshot(), CWD, 'resolves the selected Session cwd')
  assert.equal(store.rootSource, 'session')
  store.dispose()
}

// A Session id the list does not know resolves to no root (never throws).
{
  const store = makeStore({ sessions: { subscribe: () => () => {}, getSnapshot: () => ({ byId: {} }) } })
  assert.equal(store.getSnapshot(), '', 'unknown Session id resolves to no root')
  assert.equal(store.rootSource, 'none')
  store.dispose()
}

// --- fallback 2: the workspace an activity was attributed to
{
  resetActivityRoot()
  const store = makeStore({ sessionId: null })
  assert.equal(store.getSnapshot(), '', 'no selection, no activity: nothing yet')
  store.attributeTo(OTHER)
  assert.equal(store.getSnapshot(), OTHER, 'activity root is the fallback')
  assert.equal(store.rootSource, 'activity')
  resetActivityRoot()
  store.dispose()
}

// A real Session cwd outranks the activity fallback: another project's agent
// drawing must not drag the board away from the project the user is looking at.
{
  resetActivityRoot()
  const store = makeStore()
  store.attributeTo(OTHER)
  assert.equal(store.getSnapshot(), CWD, 'session cwd wins over the activity root')
  assert.equal(store.rootSource, 'session')
  resetActivityRoot()
  store.dispose()
}

// --- fallback 3: the host's registered roots, only when unambiguous
{
  resetActivityRoot()
  const one = makeStore({ sessionId: null, fetchRoots: async () => ['/only/root'] })
  await settle()
  assert.equal(one.getSnapshot(), '/only/root', 'a single registered workspace is unambiguous')
  assert.equal(one.rootSource, 'host')
  one.dispose()
}
{
  resetActivityRoot()
  const many = makeStore({ sessionId: null, fetchRoots: async () => ['/a', '/b'] })
  await settle()
  assert.equal(many.getSnapshot(), '', 'several workspaces must not be guessed at')
  assert.equal(many.rootSource, 'none')
  many.dispose()
}
// A host that is still starting must not break the board.
{
  resetActivityRoot()
  const store = makeStore({ sessionId: null, fetchRoots: async () => { throw new Error('ECONNREFUSED') } })
  await settle()
  assert.equal(store.getSnapshot(), '', 'a failed roots fetch means no root, not a crash')
  store.dispose()
}

// --- subscription contract: only notify when the root actually moves
{
  resetActivityRoot()
  const store = makeStore()
  let notified = 0
  const unsubscribe = store.subscribe(() => { notified += 1 })
  store.refresh()
  assert.equal(notified, 0, 'an unchanged root does not notify')
  store.attributeTo(OTHER)
  assert.equal(notified, 0, 'the activity fallback is shadowed by the session root')
  unsubscribe()
  store.dispose()

  resetActivityRoot()
  const store2 = makeStore({ sessionId: null })
  let moved = 0
  store2.subscribe(() => { moved += 1 })
  store2.attributeTo(OTHER)
  assert.equal(moved, 1, 'a listener hears about a root that actually moved')
  assert.equal(store2.getSnapshot(), OTHER)
  store2.attributeTo(OTHER)
  assert.equal(moved, 1, 'the same attribution twice is not a change')
  store2.dispose()
  resetActivityRoot()
}

// --- the module-level attribution channel the SSE consumer writes
{
  resetActivityRoot()
  const store = makeStore({ sessionId: null })
  noteActivityRoot({ kind: 'edit', path: 'x.drawio' })
  assert.equal(store.getSnapshot(), '', 'a non-string root is ignored')
  noteActivityRoot(OTHER)
  store.refresh()
  assert.equal(store.getSnapshot(), OTHER, 'the module channel feeds the store')
  resetActivityRoot()
  store.dispose()
}

// --- start/dispose are safe to call twice and need no DOM
{
  const store = makeStore()
  store.start()
  store.start()
  store.dispose()
  store.dispose()
  assert.equal(store.getSnapshot(), CWD)
}

// --- record integrity: malformed or unreadable selection never throws
for (const raw of [null, '', 'not json', '{}', '{"sessionId":42}', '{"sessionId":""}']) {
  const store = makeStore({ raw })
  assert.equal(store.getSnapshot(), '', `malformed record ${JSON.stringify(raw)} resolves to no root`)
  store.dispose()
}
{
  const store = makeStore({
    sessions: { subscribe: () => () => {}, getSnapshot: () => { throw new Error('store exploded') } },
  })
  assert.equal(store.getSnapshot(), '', 'a throwing Session store resolves to no root')
  store.dispose()
}
{
  // A store without subscribe() (an older host) still resolves.
  const store = makeStore({ sessions: { getSnapshot: () => ({ byId: { [SESSION]: { cwd: CWD } } }) } })
  store.start()
  assert.equal(store.getSnapshot(), CWD)
  store.dispose()
}

// --- exported contracts the rest of the plugin relies on
assert.equal(SESSION_SELECTION_KEY, 'dsh.sessions.current')
assert.equal(WORKSPACE_ROOTS_URL, '/dsh-drawio/roots')
assert.equal(typeof noteActivityRoot, 'function')

// --- auto-open policy
assert.equal(NARROW_VIEWPORT_PX, 767)
assert.equal(shouldAutoOpen({ replay: false, viewportWidth: 1440 }), true, 'a live event may open the board on a wide screen')
assert.equal(shouldAutoOpen({ replay: true, viewportWidth: 1440 }), false, 'a replayed event must never pop the board')
assert.equal(shouldAutoOpen({ replay: true, viewportWidth: 390 }), false)
assert.equal(shouldAutoOpen({ replay: false, viewportWidth: 390 }), false, 'a phone must not have the screen taken over')
assert.equal(shouldAutoOpen({ replay: false, viewportWidth: 768 }), true, 'the breakpoint is exclusive: 768 is a wide screen')

console.log('workspace-root: ok')
