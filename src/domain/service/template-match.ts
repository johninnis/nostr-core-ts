import type { SignerFailure } from "../failure/signer-failure.ts"
import type { NostrEvent, UnsignedEvent } from "../value-object/nostr-event.ts"
import { tagsEqual } from "./tags.ts"

// Deliberate: a correctly signed event is still refused unless it is the template, tags in order — see shared ADR-0049
/**
 * Checks that a signer signed the event it was asked to. `template` is the event as it was sent to the signer, the
 * output of `buildUnsignedEvent`. A NIP-07 extension "adds `id`, `pubkey` and `sig`" to it, and a NIP-46 bunker is sent
 * its four fields to sign, so a signer that changes any of them returns an event nobody asked for, however it is signed.
 * Returns `null` when `signed` carries the template's `kind`, `content` and `created_at` and the same `tags` in the same
 * order, each with the same strings, and otherwise a `sign-failed` {@link SignerFailure}. Centralises the check every
 * `Signer` adapter for an outside signer would otherwise duplicate, beside `checkPubkeyMatches`.
 */
export const checkSignedMatchesTemplate = (template: UnsignedEvent, signed: NostrEvent): SignerFailure | null => {
  const isTemplate = signed.kind === template.kind && signed.content === template.content &&
    signed.created_at === template.created_at && tagsEqual(signed.tags, template.tags)
  if (isTemplate) return null
  return {
    type: "sign-failed",
    message: "Signer returned an event that differs from the template it was asked to sign",
  }
}
