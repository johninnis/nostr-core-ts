/** Type guard for plain object records (non-null, non-array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Type guard for `number` (excludes `NaN`-free check intentionally — NIP-01 event-shape callers want `typeof` semantics, not numeric validity). */
export const isNumber = (value: unknown): value is number => typeof value === "number"

/** Type guard for `string`. */
export const isString = (value: unknown): value is string => typeof value === "string"

/** Type guard accepting `undefined` or a `string`; convenient for optional-string fields on validated record shapes. */
export const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string"
