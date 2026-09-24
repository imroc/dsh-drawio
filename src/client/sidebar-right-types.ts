/**
 * The slice of the right-Sidebar slot contract this plugin registers into.
 *
 * `SlotMap` is an open interface: the Sidebar package merges its own seats
 * into it, and so can a consumer. Declaring the two seats here is what lets
 * `ctx.slots.inject('sidebar.right.pane.tab', …)` typecheck without this
 * package depending on `@deepseek-ai/dsh-client-ui-sidebar-right` — a
 * client-only bundle that arrives through Cordis at run time and is not a
 * dependency of this package at all (a value import from it would tie the
 * plugin to one harness build, and older clients do not have it).
 *
 * The shapes are structural and deliberately minimal: only the fields this
 * plugin actually reads. The authoritative contract lives in the Sidebar
 * package's own `contract/slots.d.ts`.
 *
 * @module dsh-drawio/client/sidebar-right-types
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One tab's body, dispatched with the `id` of the tab type in force for
     * `tab.kind` — here, the plugin's own {@link TAB_ID}.
     */
    'sidebar.right.pane.tab': {
      kind: 'keyed'
      scope: 'session'
      hookContext: DrawioTabHookContext
    }
    /** A tab's chip title, dispatched with the same key and hook context. */
    'sidebar.right.pane.tab.title': {
      kind: 'keyed'
      scope: 'session'
      hookContext: DrawioTabHookContext
    }
  }
}

/** The slot-supplied hook context a tab body's registration runs under. */
export interface DrawioTabHookContext {
  /**
   * The seat's information hook factory. The runtime hands the tab's own
   * hooks to the component as PROPS (`useTabInfo`), not through this context —
   * so a body reads `props.useTabInfo`, and this type only describes the seat.
   */
  readonly tabInfo?: () => () => DrawioTabInfo
}

/** The live information a tab body reads. */
export interface DrawioTabInfo {
  readonly tab?: {
    /** Whether this tab's body is on screen in the foreground session. */
    readonly visible?: boolean
    /** Actions this tab may take on itself. */
    readonly actions?: { readonly close?: () => void }
  }
}
