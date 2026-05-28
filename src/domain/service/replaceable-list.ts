import type { Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { Signer } from "./signer.ts"
import { encryptJson } from "./json-crypto.ts"
import { EncryptionError } from "../exception/encryption-error.ts"
import { getTagValue } from "./tags.ts"

/** Which half of a NIP-51 list is being modified — `"public"` mutates the event's `tags` array; `"private"` mutates the decrypted entries in `content`. */
export type ListVisibility = "public" | "private"

/** Input for `buildReplaceableListEvent` — current public/private tag arrays, a transform to apply to one half (selected by `visibility`), and a signer to encrypt private entries with. */
export interface BuildReplaceableListEventInput {
  readonly kind: number
  readonly dTag?: string
  readonly visibility: ListVisibility
  readonly currentPublicTags: ReadonlyArray<Tag>
  readonly currentPrivateTags: ReadonlyArray<Tag>
  readonly currentContent: string
  readonly modifyTags: (current: ReadonlyArray<Tag>) => ReadonlyArray<Tag>
  readonly signer: Signer
  readonly authorPubkey: PublicKey
  readonly createdAt: number
}

/** Successful (non-null) output of `buildReplaceableListEvent` — the new unsigned event template to hand to a signer, plus the resulting private-tags array (carried through unchanged for `"public"` mutations). */
export interface BuildReplaceableListEventResult {
  readonly template: UnsignedEvent
  readonly nextPrivateTags: ReadonlyArray<Tag>
}

/**
 * Apply `modifyTags` to the public or private (NIP-51) entries of a replaceable list and return
 * the next event template wrapped in a `Result`.
 *
 * Outcomes:
 * - `ok(null)` — nothing changed; caller should not publish.
 * - `ok({ template, nextPrivateTags })` — a new template ready for `signer.signEvent`.
 * - `failure(EncryptionError)` — `signer.nip44Encrypt` rejected the private payload; the wrapped `JsonCryptoError` lives on `cause`.
 *
 * Returning `Result` (rather than throwing) matches the rest of the encryption-touching surface
 * — `encryptJson`, `buildDmGiftWraps`, `Signer.*` all use `Result<…, *Error>` for the same shape.
 */
export const buildReplaceableListEvent = async (
  input: BuildReplaceableListEventInput,
): Promise<Result<BuildReplaceableListEventResult | null, EncryptionError>> => {
  const {
    kind,
    dTag = "",
    visibility,
    currentPublicTags,
    currentPrivateTags,
    currentContent,
    modifyTags,
    signer,
    authorPubkey,
    createdAt,
  } = input

  const nextPublicTags = visibility === "public" ? modifyTags(currentPublicTags) : currentPublicTags
  const nextPrivateTags = visibility === "private" ? modifyTags(currentPrivateTags) : currentPrivateTags

  if (visibility === "public" && nextPublicTags === currentPublicTags) return ok(null)
  if (visibility === "private" && nextPrivateTags === currentPrivateTags) return ok(null)

  const finalPublicTags: Array<Tag> = [...nextPublicTags]
  if (dTag !== "" && getTagValue(finalPublicTags, "d") === null) finalPublicTags.unshift(["d", dTag])

  let content: string
  if (visibility === "private") {
    const enc = await encryptJson(signer, authorPubkey, nextPrivateTags)
    if (!enc.success) return failure(new EncryptionError("buildReplaceableListEvent", enc.error))
    content = enc.value
  } else {
    content = currentContent
  }

  const template: UnsignedEvent = {
    kind,
    created_at: createdAt,
    tags: finalPublicTags,
    content,
  }

  return ok({ template, nextPrivateTags })
}
