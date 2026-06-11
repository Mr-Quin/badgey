/**
 * Framework-agnostic observable implementing Svelte's store contract (so `$store`
 * works in components) with no framework imports. Change-detection mirrors Svelte's
 * `writable`.
 */
type Subscriber<T> = (value: T) => void
type Unsubscriber = () => void

export interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void
  update(fn: (value: T) => T): void
}

/** Matches Svelte's `safe_not_equal`: always notify for objects/functions. */
function notEqual(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line no-self-compare
  return a != a
    ? b == b
    : a !== b || (a !== null && typeof a === 'object') || typeof a === 'function'
}

export function writable<T>(initial: T): Writable<T> {
  let value = initial
  const subscribers = new Set<Subscriber<T>>()

  function set(next: T): void {
    if (!notEqual(value, next)) return
    value = next
    // Snapshot so a subscriber that (un)subscribes during notify is safe.
    // oxlint-disable-next-line no-useless-spread -- the copy is the point (re-entrancy guard)
    for (const run of [...subscribers]) run(value)
  }

  function update(fn: (value: T) => T): void {
    set(fn(value))
  }

  function subscribe(run: Subscriber<T>): Unsubscriber {
    subscribers.add(run)
    run(value)
    return () => subscribers.delete(run)
  }

  return { set, update, subscribe }
}

/** Read a store's current value once (subscribe → read → unsubscribe). */
export function get<T>(store: Readable<T>): T {
  let value: T
  const unsub = store.subscribe((v) => (value = v))
  unsub()
  return value!
}
