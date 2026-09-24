/**
 * The narrow-screen stylesheet's invariants (see `src/client/narrow-styles.ts`).
 *
 * This exists because of a real regression: an earlier version of the sheet
 * also sized the panel's *column* (`[data-rightbar-col] { flex: none;
 * height: 100% }`) so that the absolutely positioned panel would have a
 * containing block. Under the phone shell's flex frame that stole the frame's
 * free space from the conversation column — at 390x844 the centre column
 * resolved to height 0 and the session rendered blank, with its composer at
 * y = -34. The fix was to pin the panel itself and leave the column alone.
 *
 * A rendered-DOM test would be better, but the invariant can be checked
 * statically and cheaply, and it is exactly the invariant that broke: the
 * sheet must not state any box sizing for the column the product owns.
 */
import { NARROW_CSS, NARROW_STYLE_ID } from '../lib/narrow-styles.js'

const failures = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`)
}

// Only one media query, and it must be the narrow one: a rule that leaked into
// wide layouts would change the desktop presentation this plugin must not touch.
const mediaQueries = NARROW_CSS.match(/@media[^{]*/g) ?? []
check('exactly one media query', mediaQueries.length === 1, `found ${mediaQueries.length}`)
check('the query is max-width: 767px', mediaQueries[0]?.includes('max-width: 767px') === true, mediaQueries[0] ?? '')

// The panel is pinned to the viewport, so it does not depend on any ancestor's
// height — that is what makes the column safe to leave alone.
check('the fullscreen panel is pinned to the viewport', NARROW_CSS.includes('[data-sidebar-right-panel="fullscreen"]'))
check('pinned with position: fixed', /\[data-sidebar-right-panel="fullscreen"\]\s*\{[^}]*position:\s*fixed/.test(NARROW_CSS))

// THE regression: never state sizing for the column the product owns. Its
// height belongs to the frame's layout; taking it there costs the conversation.
const columnRule = NARROW_CSS.match(/\[data-rightbar-col\][^{]*\{[^}]*\}/)?.[0]
check('no rule targets the panel column', columnRule === undefined, columnRule ?? '')
for (const property of ['height', 'flex', 'min-height', 'max-height', 'position']) {
  check(`the sheet never sets ${property} on the panel column`, !new RegExp(`\\[data-rightbar-col\\][^{]*\\{[^}]*${property}`).test(NARROW_CSS))
}

// The shell draws a fixed 52px top bar; the panel has to start below it.
check('the top offset follows the shell header variable', NARROW_CSS.includes('--dsh-mobile-header-h'))

check('the style tag id is stable', NARROW_STYLE_ID === 'dsh-drawio-narrow-styles', NARROW_STYLE_ID)

if (failures.length > 0) {
  console.error('narrow-styles FAILED:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('narrow-styles: ok')
console.log(NARROW_CSS)
