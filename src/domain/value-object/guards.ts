/** Type guard for plain object records (non-null, non-array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// `isNumber` / `isString` / `isOptionalString` are intentionally NOT re-exported from the public
// barrel (`value-object/mod.ts` exports only `isRecord`). `isRecord` earns a public spot because the
// naive hand-rolled check is a footgun (`typeof null === "object"`, arrays are objects); these three
// are exact synonyms for an inline `typeof`, so exporting them would add a second idiom for a check
// that already has one obvious form. Internally they're used point-free (`.every(isNumber)`, the
// `event-utils` field-validator table) where that reads better; at module boundaries, use inline
// `typeof`. Keep them internal.

/** Type guard for `number` (excludes `NaN`-free check intentionally — NIP-01 event-shape callers want `typeof` semantics, not numeric validity). */
export const isNumber = (value: unknown): value is number => typeof value === "number"

/** Type guard for `string`. */
export const isString = (value: unknown): value is string => typeof value === "string"

/** Type guard accepting `undefined` or a `string`; convenient for optional-string fields on validated record shapes. */
export const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string"
