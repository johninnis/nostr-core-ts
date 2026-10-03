/** Type guard for plain object records (non-null, non-array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Type guard for `number`. */
export const isNumber = (value: unknown): value is number => typeof value === "number"

/** Type guard for a safe integer — the shape of a JSON integer field read without a sign constraint. */
export const isInteger = (value: unknown): value is number => Number.isSafeInteger(value)

/** Type guard for a safe integer of zero or more — the shape of an event's `kind` and `created_at`. */
export const isNonNegativeInteger = (value: unknown): value is number => isInteger(value) && value >= 0

/** Type guard for `string`. */
export const isString = (value: unknown): value is string => typeof value === "string"

/**
 * Type guard for an array whose every element satisfies `guard` (an empty array passes). The shared primitive behind
 * every "array of X" check — prefer it over hand-rolling `Array.isArray(value) && value.every(guard)`.
 */
export const isArrayOf = <T>(
  value: unknown,
  guard: (element: unknown) => element is T,
): value is ReadonlyArray<T> => Array.isArray(value) && value.every(guard)

/** Type guard for an array whose every element is a `string` (an empty array passes). */
export const isStringArray = (value: unknown): value is ReadonlyArray<string> => isArrayOf(value, isString)

/** Type guard for an array whose every element is a `number` (an empty array passes). */
export const isNumberArray = (value: unknown): value is ReadonlyArray<number> => isArrayOf(value, isNumber)
