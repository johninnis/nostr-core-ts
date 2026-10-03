/**
 * Nominal-type primitive: `Brand<typeof someUniqueSymbol, string>` is a `string` that no plain string can be assigned
 * to.
 */
export type Brand<TBrand extends symbol, TBase = string> = TBase & { readonly [K in TBrand]: TBrand }

/**
 * Configuration for `createBrand`: `canonicalise` maps raw input to the brand's one canonical string, or `null` when it
 * has none.
 */
export interface BrandSpec {
  readonly canonicalise: (raw: string) => string | null
}

/**
 * The two functions every brand exposes: `parse` brands untrusted input, `is` recognises a value already in canonical
 * form.
 */
export interface BrandTools<T> {
  /**
   * Canonicalise `raw` and return it branded, or `null` when `raw` is not a string or has no canonical form. Never
   * throws.
   */
  readonly parse: (raw: unknown) => T | null
  /**
   * Type guard: `true` exactly when `raw` is already canonical, that is when `parse(raw)` would return `raw` unchanged.
   */
  readonly is: (raw: unknown) => raw is T
}

// Deliberate: parse canonicalises untrusted input to null, is accepts only canonical input — see ADR-0006
/** Build the `parse` / `is` pair for a branded string primitive from its canonicaliser. */
export const createBrand = <T>(spec: BrandSpec): BrandTools<T> => {
  const is = (raw: unknown): raw is T => typeof raw === "string" && spec.canonicalise(raw) === raw

  // Deliberate: parse re-checks the canonical form so a non-idempotent canonicaliser cannot mint a brand — see ADR-0006
  const parse = (raw: unknown): T | null => {
    if (typeof raw !== "string") return null
    const canonical = spec.canonicalise(raw)
    return is(canonical) ? canonical : null
  }

  return { parse, is }
}

const LOWERCASE_HEX = /^[0-9a-f]*$/

/** `true` when `value` is exactly `length` lowercase hex characters. */
export const isLowercaseHex = (value: string, length: number): boolean =>
  value.length === length && LOWERCASE_HEX.test(value)

/**
 * Build a brand for a fixed-length lowercase hex string; any other input, upper-case hex included, has no canonical
 * form.
 */
export const createHexBrand = <T>(hexLength: number): BrandTools<T> => {
  return createBrand({ canonicalise: (raw) => isLowercaseHex(raw, hexLength) ? raw : null })
}
