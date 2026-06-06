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

interface AssembleListTemplateInput {
  readonly kind: number
  readonly dTag: string
  readonly visibility: ListVisibility
  readonly publicTags: ReadonlyArray<Tag>
  readonly privateTags: ReadonlyArray<Tag>
  readonly publicContent: string
  readonly signer: Signer
  readonly authorPubkey: PublicKey
  readonly createdAt: number
  readonly operation: string
}

/**
 * Shared assembly for every NIP-51 list event: ensure the `d`-tag is present, then place the entries
 * either as public `tags` (`visibility: "public"`, carrying `publicContent` verbatim) or as
 * NIP-44-encrypted `content` (`visibility: "private"`). `operation` names the caller in any
 * `EncryptionError`.
 */
const assembleListTemplate = async (
  input: AssembleListTemplateInput,
): Promise<Result<UnsignedEvent, EncryptionError>> => {
  const finalPublicTags: Array<Tag> = [...input.publicTags]
  if (input.dTag !== "" && getTagValue(finalPublicTags, "d") === null) finalPublicTags.unshift(["d", input.dTag])

  let content: string
  if (input.visibility === "private") {
    const enc = await encryptJson(input.signer, input.authorPubkey, input.privateTags)
    if (!enc.success) return failure(new EncryptionError(input.operation, enc.error))
    content = enc.value
  } else {
    content = input.publicContent
  }

  return ok({ kind: input.kind, created_at: input.createdAt, tags: finalPublicTags, content })
}

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

  const assembled = await assembleListTemplate({
    kind,
    dTag,
    visibility,
    publicTags: nextPublicTags,
    privateTags: nextPrivateTags,
    publicContent: currentContent,
    signer,
    authorPubkey,
    createdAt,
    operation: "buildReplaceableListEvent",
  })
  if (!assembled.success) return assembled

  return ok({ template: assembled.value, nextPrivateTags })
}

/** Input for `buildNewListEvent` — the kind/dTag of the new list, its initial `entries` (placed publicly or encrypted per `visibility`), and a signer to encrypt private entries with. */
export interface BuildNewListEventInput {
  readonly kind: number
  readonly dTag?: string
  readonly visibility: ListVisibility
  readonly entries?: ReadonlyArray<Tag>
  readonly signer: Signer
  readonly authorPubkey: PublicKey
  readonly createdAt: number
}

/** Successful output of `buildNewListEvent` — the new unsigned event template to hand to a signer, plus the private-tags array it encodes (empty for a `"public"` list). */
export interface BuildNewListEventResult {
  readonly template: UnsignedEvent
  readonly privateTags: ReadonlyArray<Tag>
}

/**
 * Build a brand-new NIP-51 replaceable list event from scratch — the create-side counterpart to
 * {@link buildReplaceableListEvent} (which modifies an existing list and can no-op).
 *
 * `entries` are the list's initial members: placed as public `tags` when `visibility` is `"public"`,
 * or NIP-44-encrypted into `content` when `"private"`. Omit `entries` for an empty list (a private
 * empty list still carries encrypted empty content). The `d`-tag is injected automatically.
 *
 * Returns `failure(EncryptionError)` when `signer.nip44Encrypt` rejects a private payload, matching
 * the rest of the encryption-touching surface; otherwise `ok({ template, privateTags })`.
 */
export const buildNewListEvent = async (
  input: BuildNewListEventInput,
): Promise<Result<BuildNewListEventResult, EncryptionError>> => {
  const { kind, dTag = "", visibility, entries = [], signer, authorPubkey, createdAt } = input
  const privateTags = visibility === "private" ? entries : []

  const assembled = await assembleListTemplate({
    kind,
    dTag,
    visibility,
    publicTags: visibility === "public" ? entries : [],
    privateTags,
    publicContent: "",
    signer,
    authorPubkey,
    createdAt,
    operation: "buildNewListEvent",
  })
  if (!assembled.success) return assembled

  return ok({ template: assembled.value, privateTags })
}
