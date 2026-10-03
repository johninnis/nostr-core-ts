import type { Tag, UnsignedEvent } from "../../domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { ok } from "../../domain/value-object/result.ts"
import type { PeerCipher } from "../../domain/service/peer-cipher.ts"
import { kindCategory } from "../../domain/value-object/kinds.ts"
import { now } from "../../domain/service/timestamp.ts"
import type { SignerFailure } from "../../domain/failure/signer-failure.ts"
import { createJsonCipher } from "./json-crypto.ts"
import { isValidAddressableRef } from "../../domain/value-object/addressable-ref.ts"
import { InvalidArgumentError } from "../../domain/exception/invalid-argument-error.ts"

/**
 * Which half of a NIP-51 list is being modified — `"public"` mutates the event's `tags` array; `"private"` mutates the
 * decrypted entries in `content`.
 */
export type ListVisibility = "public" | "private"

/** A NIP-51 list's contents: its public `tags`, its decrypted private entries, and its `content` as published. */
export interface ListContents {
  readonly publicTags: ReadonlyArray<Tag>
  readonly privateTags: ReadonlyArray<Tag>
  readonly content: string
}

/**
 * The list event being built and how to encrypt its private entries: `cipher` encrypts to `authorPubkey`, the list's
 * author. Private entries are always written with NIP-44 (NIP-51: NIP-04 "now deprecated"). `kind` and `dTag` must name
 * a coordinate ({@link isValidAddressableRef}): a replaceable kind with no `dTag`, or an addressable kind with any.
 */
export interface ListTarget {
  readonly kind: number
  readonly dTag?: string
  readonly visibility: ListVisibility
  readonly cipher: PeerCipher
  readonly authorPubkey: PublicKey
  /** Pin the `created_at`. Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

const assertListCoordinate = ({ kind, dTag = "", authorPubkey }: ListTarget): void => {
  if (isValidAddressableRef({ kind, pubkey: authorPubkey, dTag })) return
  throw new InvalidArgumentError(
    `Kind ${kind} with d tag "${dTag}" names no list: a replaceable kind takes no d tag and an addressable kind any`,
  )
}

const withDTag = (tags: ReadonlyArray<Tag>, kind: number, dTag: string): ReadonlyArray<Tag> =>
  kindCategory(kind) === "addressable" ? [["d", dTag], ...tags.filter((tag) => tag[0] !== "d")] : tags

const listContent = async (target: ListTarget, contents: ListContents): Promise<Result<string, SignerFailure>> => {
  if (target.visibility === "public") return ok(contents.content)
  return await createJsonCipher(target.cipher).encrypt(target.authorPubkey, contents.privateTags)
}

const assembleList = async (
  target: ListTarget,
  contents: ListContents,
): Promise<Result<UnsignedEvent, SignerFailure>> => {
  const content = await listContent(target, contents)
  if (!content.success) return content
  const tags = withDTag(contents.publicTags, target.kind, target.dTag ?? "")
  return ok({ kind: target.kind, created_at: target.createdAt ?? now(), tags, content: content.value })
}

/**
 * Input for `buildReplaceableListEvent` — the list's current contents, a transform for the half named by `visibility`,
 * and the author's cipher and pubkey for encrypting private entries to self.
 */
export interface BuildReplaceableListEventInput extends ListTarget {
  readonly current: ListContents
  readonly modifyTags: (current: ReadonlyArray<Tag>) => ReadonlyArray<Tag>
}

const tagsEqual = (a: ReadonlyArray<Tag>, b: ReadonlyArray<Tag>): boolean =>
  a.length === b.length &&
  a.every((tag, index) => {
    const other = b[index]
    return other !== undefined && tag.length === other.length && tag.every((value, i) => value === other[i])
  })

/**
 * Outcome of `buildReplaceableListEvent`: `unchanged` when `modifyTags` returned the same tags, else the next template
 * and private entries.
 */
export type ReplaceableListChange =
  | { readonly type: "unchanged" }
  | { readonly type: "changed"; readonly template: UnsignedEvent; readonly nextPrivateTags: ReadonlyArray<Tag> }

/**
 * Apply `modifyTags` to the public or private (NIP-51) entries of a replaceable list. Returns `unchanged` when
 * `modifyTags` hands back the same tags in the same order, compared by value (nothing to publish), otherwise the next
 * template to sign plus the resulting private entries. An addressable list's template carries `dTag` as its one `d`
 * tag, written first, in place of any `d` tag the public tags held. Fails with the signer's `SignerFailure` when
 * encrypting private entries fails; throws `InvalidArgumentError` when `kind` and `dTag` name no list.
 */
export const buildReplaceableListEvent = async (
  input: BuildReplaceableListEventInput,
): Promise<Result<ReplaceableListChange, SignerFailure>> => {
  assertListCoordinate(input)
  const { current, visibility, modifyTags } = input
  const half = visibility === "public" ? current.publicTags : current.privateTags
  const modified = modifyTags(half)
  if (tagsEqual(modified, half)) return ok({ type: "unchanged" })

  const next: ListContents = visibility === "public"
    ? { ...current, publicTags: modified }
    : { ...current, privateTags: modified }
  const template = await assembleList(input, next)
  if (!template.success) return template
  return ok({ type: "changed", template: template.value, nextPrivateTags: next.privateTags })
}

/**
 * Input for `buildNewListEvent` — the new list's kind, `d` tag and initial `entries` (public or encrypted per
 * `visibility`), plus the author's cipher and pubkey.
 */
export interface BuildNewListEventInput extends ListTarget {
  readonly entries?: ReadonlyArray<Tag>
}

/**
 * Successful output of `buildNewListEvent` — the new unsigned event template to hand to a signer, plus the private-tags
 * array it encodes (empty for a `"public"` list).
 */
export interface BuildNewListEventResult {
  readonly template: UnsignedEvent
  readonly privateTags: ReadonlyArray<Tag>
}

/**
 * Build a brand-new NIP-51 list event — the create-side counterpart to {@link buildReplaceableListEvent}. `entries` are
 * placed as public `tags` or NIP-44-encrypted into `content` per `visibility` (an empty private list still carries
 * encrypted empty content); an addressable list carries `dTag` as its one `d` tag, written first. Fails with the
 * signer's `SignerFailure` when encryption fails; throws `InvalidArgumentError` when `kind` and `dTag` name no list.
 */
export const buildNewListEvent = async (
  input: BuildNewListEventInput,
): Promise<Result<BuildNewListEventResult, SignerFailure>> => {
  assertListCoordinate(input)
  const entries = input.entries ?? []
  const isPublic = input.visibility === "public"
  const contents: ListContents = {
    publicTags: isPublic ? entries : [],
    privateTags: isPublic ? [] : entries,
    content: "",
  }
  const template = await assembleList(input, contents)
  if (!template.success) return template
  return ok({ template: template.value, privateTags: contents.privateTags })
}
