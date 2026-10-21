/**
 * The reveal preference store (see `src/client/prefs.ts`).
 *
 * The precedence is the whole contract, and getting it wrong is invisible in
 * the browser (the board simply pops open again, or never opens): the user's
 * own toggle beats the host config, and an unanswered config route means off.
 * The store is injected here, so no DOM is needed.
 */
import assert from 'node:assert/strict'
import {
  AUTO_OPEN_STORAGE_KEY,
  autoOpenEnabled,
  hostAutoOpenDefault,
  setHostAutoOpen,
  storeAutoOpen,
  storedAutoOpen,
} from '../lib/prefs.js'

const failures = []
const check = (name, fn) => {
  try {
    fn()
  } catch (error) {
    failures.push(`${name} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** A `Storage` stand-in backed by a Map. */
const memoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    dump: () => Object.fromEntries(map),
  }
}

check('storage key is stable (a rename silently drops every existing override)', () => {
  assert.equal(AUTO_OPEN_STORAGE_KEY, 'dsh-drawio:board-auto-open')
})

check('nothing configured and nothing stored means OFF', () => {
  assert.equal(hostAutoOpenDefault(), undefined)
  const store = memoryStorage()
  assert.equal(storedAutoOpen(store), undefined)
  assert.equal(autoOpenEnabled(store), false, 'an unanswered config must never pop the panel')
})

check('the host default applies when the browser never toggled', () => {
  setHostAutoOpen(true)
  assert.equal(autoOpenEnabled(memoryStorage()), true)
  setHostAutoOpen(false)
  assert.equal(autoOpenEnabled(memoryStorage()), false)
})

check('the user override beats the host default, in both directions', () => {
  setHostAutoOpen(true)
  const off = memoryStorage({ [AUTO_OPEN_STORAGE_KEY]: 'off' })
  assert.equal(autoOpenEnabled(off), false, 'a user who turned it off keeps it off')

  setHostAutoOpen(false)
  const on = memoryStorage({ [AUTO_OPEN_STORAGE_KEY]: 'on' })
  assert.equal(autoOpenEnabled(on), true, 'a user who turned it on keeps it on')
})

check('toggling writes the override the next event reads', () => {
  setHostAutoOpen(false)
  const store = memoryStorage()
  storeAutoOpen(true, store)
  assert.equal(store.dump()[AUTO_OPEN_STORAGE_KEY], 'on')
  assert.equal(autoOpenEnabled(store), true)
  storeAutoOpen(false, store)
  assert.equal(autoOpenEnabled(store), false)
})

check('garbage in storage falls through to the host default', () => {
  setHostAutoOpen(true)
  assert.equal(storedAutoOpen(memoryStorage({ [AUTO_OPEN_STORAGE_KEY]: 'yes' })), undefined)
  assert.equal(autoOpenEnabled(memoryStorage({ [AUTO_OPEN_STORAGE_KEY]: '' })), true)
})

check('a throwing store cannot crash the decision or the toggle', () => {
  setHostAutoOpen(true)
  const hostile = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('denied') },
  }
  assert.equal(autoOpenEnabled(hostile), true, 'read failure falls back to the host default')
  storeAutoOpen(false, hostile) // must not throw
})

check('no storage at all (SSR / private mode) still answers from the host default', () => {
  setHostAutoOpen(true)
  assert.equal(storedAutoOpen(null), undefined)
  assert.equal(autoOpenEnabled(null), true)
  storeAutoOpen(false, null) // must not throw
})

if (failures.length > 0) {
  console.error('prefs: FAILED')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('prefs: ok')
