export type Success<T> = { readonly success: true; readonly value: T }
export type Failure<E> = { readonly success: false; readonly error: E }
export type Result<T, E> = Success<T> | Failure<E>

/** Wrap `value` in a `Success` Result. */
export const ok = <T>(value: T): Success<T> => ({ success: true, value })

/**
 * Wrap `error` in a `Failure` Result.
 *
 * Named `failure` (not `fail`) so the factory mirrors the `Failure<E>` type one-for-one and
 * never collides with `@std/assert.fail()` or test-prose verbs. Always import bare —
 * `import { failure, ok } from "@innis/nostr-core"` — never alias.
 */
export const failure = <E>(error: E): Failure<E> => ({ success: false, error })

/** Type guard narrowing `result` to its `Success` branch; useful with `Array#filter`. */
export const isOk = <T, E>(result: Result<T, E>): result is Success<T> => result.success

/** Type guard narrowing `result` to its `Failure` branch; useful with `Array#filter`. */
export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => !result.success
