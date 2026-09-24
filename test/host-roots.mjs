/**
 * Host-side workspace-root helpers.
 *
 * These are what the agent tools use to attribute a drawing to a workspace
 * (and what /dsh-drawio/roots serves as the board's last-resort fallback), so
 * they are worth pinning: a wrong answer here sends the board to the wrong
 * project, and a thrown one would take a tool call down with it.
 */
import assert from 'node:assert/strict'
import { workspaceRootOf, listWorkspaceRoots, isPathInside } from '../lib/index.js'

/** A Context stand-in carrying only the workspace registry. */
function ctxOf(...paths) {
  return { workspaceRegistry: { list: () => paths.map(path => ({ path })) } }
}

assert.deepEqual(listWorkspaceRoots(ctxOf('/a', '/b')), ['/a', '/b'])
assert.deepEqual(listWorkspaceRoots(ctxOf()), [])

assert.equal(workspaceRootOf(ctxOf('/data/ws'), '/data/ws/out/x.drawio'), '/data/ws', 'a file inside the root')
assert.equal(workspaceRootOf(ctxOf('/data/ws'), '/data/ws'), '/data/ws', 'the root itself')
assert.equal(workspaceRootOf(ctxOf('/data/ws'), '/data/other/x.drawio'), undefined, 'a path outside every root')
assert.equal(workspaceRootOf(ctxOf('/data/ws', '/data/ws/nested'), '/data/ws/nested/x.drawio'), '/data/ws/nested', 'the deepest root wins')
assert.equal(workspaceRootOf(ctxOf('/data/ws/nested', '/data/ws'), '/data/ws/nested/x.drawio'), '/data/ws/nested', 'order does not matter')
// A prefix that is not a path boundary must not match.
assert.equal(workspaceRootOf(ctxOf('/data/ws'), '/data/ws-other/x.drawio'), undefined, 'sibling prefixes are not inside')
assert.equal(isPathInside('/data/ws', '/data/ws-other'), false)
assert.equal(workspaceRootOf(ctxOf('/data/ws'), ''), undefined)
assert.equal(workspaceRootOf(ctxOf('/data/ws'), undefined), undefined)

// A registry that throws must not throw out of the helper.
const broken = { workspaceRegistry: { list: () => { throw new Error('registry down') } } }
assert.throws(() => listWorkspaceRoots(broken), 'callers gate on the registry; the helper does not swallow')

console.log('host-roots: ok')
