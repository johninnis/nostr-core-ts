import { InvalidBrandError } from "../exception/invalid-brand-error.ts"
import { hexRegex } from "./hex.ts"

/** Nominal-type primitive: `Brand<typeof someUniqueSymbol, string>` is a `string` that no plain string can be assigned to. */
export type Brand<TBrand extends symbol, TBase = string> = TBase & { readonly [K in TBrand]: TBrand }

/** Configuration for `createBrand`: the brand's error class name, the message prefix, a validator, and an optional pre-validation normaliser (defaults to `toLowerCase`). */
export interface BrandSpec<TName extends string> {
  readonly errorName: TName
  readonly errorPrefix: string
  readonly validate: (raw: string) => boolean
  readonly normalise?: (raw: string) => string
}

/** The four exports `createBrand` / `createHexBrand` produce: `parse`, `isValid`, `tryParse`, and the brand's `InvalidError` constructor. */
export interface BrandTools<T, TName extends string> {
  /** Validate `raw`, normalise it, and return the branded form. Throws `InvalidError` on failure. */
  readonly parse: (raw: string) => T
  /** Type-guard predicate: `true` if `raw` is already in canonical branded form. Does not normalise. */
  readonly isValid: (raw: unknown) => raw is T
  /** Validate-and-normalise variant that returns `null` instead of throwing. Accepts `null`/`undefined` upstream of a chain. */
  readonly tryParse: (raw: string | null | undefined) => T | null
  /** Constructor thrown by `parse` on validation failure. */
  readonly InvalidError: new (raw: string) => InvalidBrandError<TName>
}

/** Build the `parse` / `isValid` / `tryParse` / `Invalid*Error` quad for a branded string primitive. */
export const createBrand = <T, TName extends string>(spec: BrandSpec<TName>): BrandTools<T, TName> => {
  const normalise = spec.normalise ?? ((raw: string): string => raw.toLowerCase())

  class InvalidError extends InvalidBrandError<TName> {
    constructor(raw: string) {
      super(spec.errorName, spec.errorPrefix, raw)
    }
  }
  Object.defineProperty(InvalidError, "name", { value: spec.errorName })

  const isValid = (raw: unknown): raw is T => typeof raw === "string" && spec.validate(raw)

  const tryParse = (raw: string | null | undefined): T | null => {
    if (raw === null || raw === undefined) return null
    const normalised = normalise(raw)
    return isValid(normalised) ? normalised : null
  }

  const parse = (raw: string): T => {
    const branded = tryParse(raw)
    if (branded === null) throw new InvalidError(raw)
    return branded
  }

  return { parse, isValid, tryParse, InvalidError }
}

/** Configuration for `createHexBrand`: like `BrandSpec` but with `hexLength` instead of `validate` (the regex is built automatically). */
export interface HexBrandSpec<TName extends string> {
  readonly errorName: TName
  readonly errorPrefix: string
  readonly hexLength: number
}

/** Build a brand for a fixed-length lowercase-hex string. The brand normalises by lowercasing. */
export const createHexBrand = <T, TName extends string>(spec: HexBrandSpec<TName>): BrandTools<T, TName> => {
  const regex = hexRegex(spec.hexLength)
  return createBrand({
    errorName: spec.errorName,
    errorPrefix: spec.errorPrefix,
    validate: (raw) => regex.test(raw),
  })
}
