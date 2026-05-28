/** Return `error.message` when `error` is an `Error`, otherwise its `String()` representation. */
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Re-throw an error in the next microtask so it surfaces as an unhandled rejection. */
export const reportUnhandledError = (error: unknown): void => {
  queueMicrotask(() => {
    throw error
  })
}
