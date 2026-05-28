/**
 * Base class for every error in the `@innis/nostr-core` package. Carries a literal `tag`
 * for exhaustive discrimination and an optional typed `cause`. Subclasses narrow `C` to
 * the specific cause type they support (e.g. `extends TaggedError<"…", SignerError>`).
 *
 * **Two subclass patterns coexist deliberately:**
 *
 * - **Single-tag subclasses** (e.g. `Nip04DecryptError extends TaggedError<"Nip04DecryptError">`):
 *   the `tag` equals the class name. Discriminate with `instanceof` — `.tag` is redundant
 *   information for these. The class identity is the type information.
 *
 * - **Tag-enum subclasses** (e.g. `SignerError extends TaggedError<SignerErrorTag>`,
 *   `JsonCryptoError`, `Nip98ValidationError`): the constructor accepts a `tag` from a
 *   kebab-case union; consumers discriminate with `error.tag === "no-signer"` etc.
 *   Used when one failure surface has many distinct, switchable sub-reasons.
 *
 * Both patterns are intentional. Don't "consolidate" the single-tag ones into a factory — the
 * type/value dual-declaration cost outweighs the eight-line saving.
 *
 * **Cause contract (uniform across both patterns):** every subclass whose role is to *wrap*
 * an upstream failure accepts an optional `cause` in its constructor and forwards it to
 * `super(...)`. Subclasses whose diagnostic *is* a typed payload field (`InvalidBrandError.raw`,
 * `PubkeyMismatchError.expected/actual`) don't expose a `cause` parameter — there's no upstream
 * to wrap; the typed fields are the diagnostic. When you add a new subclass, ask "could this be
 * thrown in response to another thrown error?" — if yes, accept `cause`. This rule is uniform
 * for single-tag and tag-enum subclasses; the wrapping behaviour does not depend on which
 * pattern you pick. (Earlier drafts left single-tag subclasses without `cause`, which silently
 * dropped the upstream error from the vendored NIP-44 codec, the AES-CBC throw inside NIP-04,
 * etc. Fixed; don't reintroduce.)
 */
export abstract class TaggedError<T extends string, C = unknown> extends Error {
  readonly tag: T
  override readonly cause?: C

  constructor(tag: T, message: string, cause?: C) {
    super(message, cause === undefined ? undefined : { cause })
    this.tag = tag
    this.name = this.constructor.name
    if (cause !== undefined) this.cause = cause
  }
}
