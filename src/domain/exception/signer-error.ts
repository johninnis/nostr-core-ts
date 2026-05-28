import { TaggedError } from "./tagged-error.ts"

/** Discriminator for `SignerError.tag` — the four switchable sub-reasons a `Signer.nipNN*` crypto call can fail (no signer wired, transport disconnected, decrypt/encrypt failure). */
export type SignerErrorTag =
  | "no-signer"
  | "disconnected"
  | "decrypt-failed"
  | "encrypt-failed"

/**
 * Failure surface for the **crypto** `Signer` methods (`nip04*` / `nip44*`). Each tag identifies
 * a distinct, switchable sub-reason; the underlying error is carried as `cause` so adapters
 * never have to stringify it into `message`.
 *
 * Deliberately narrow: user rejection and pubkey mismatch get their own classes
 * (`SignerRejectedError`, `PubkeyMismatchError`) so they can carry typed payload fields a
 * string-tag union can't. `signEvent` throws — there is no `"sign-failed"` tag because the
 * Signer contract doesn't return Result on that path. Don't widen this union to reabsorb
 * those concerns; that's the split the README §"Signer interface" locks in.
 */
export class SignerError extends TaggedError<SignerErrorTag> {
  constructor(tag: SignerErrorTag, message: string, cause?: unknown) {
    super(tag, message, cause)
  }
}
