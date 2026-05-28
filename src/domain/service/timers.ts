/** A function that can be invoked later and explicitly cancelled before it fires. */
export interface CancellableScheduler<A extends ReadonlyArray<unknown> = []> {
  (...args: A): void
  readonly cancel: () => void
}

/** Wrap `fn` so it only fires `ms` after the most recent call; subsequent calls reset the timer. */
export const debounce = <A extends ReadonlyArray<unknown>>(
  fn: (...args: A) => void,
  ms: number,
): CancellableScheduler<A> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: A): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return wrapped
}

/** Schedule `fn` to run after `ms`, collapsing repeat calls during the wait into a single invocation. */
export const coalesce = (fn: () => void, ms: number): CancellableScheduler => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
  schedule.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return schedule
}
