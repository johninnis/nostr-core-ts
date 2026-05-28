import { TaggedError } from "./tagged-error.ts"

/**
 * Thrown by every branded primitive's `parse` function when the input fails validation.
 * Each brand subclasses this with a fixed `tag` (e.g. `InvalidPublicKeyError extends InvalidBrandError<"InvalidPublicKeyError">`).
 */
export class InvalidBrandError<TName extends string> extends TaggedError<TName> {
  readonly raw: string
  constructor(tag: TName, prefix: string, raw: string) {
    super(tag, `${prefix}: ${raw}`)
    this.raw = raw
  }
}
