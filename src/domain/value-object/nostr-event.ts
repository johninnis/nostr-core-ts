import type { EventId } from "./event-id.ts"
import type { PublicKey } from "./public-key.ts"
import type { Sig } from "./sig.ts"

/** A NIP-01 event tag — a non-empty tuple of strings whose first element is the tag name. */
export type Tag = readonly [string, ...ReadonlyArray<string>]

/** Type guard for the `Tag` shape: a non-empty array of strings. */
export const isValidTag = (value: unknown): value is Tag =>
  Array.isArray(value) && value.length >= 1 && value.every((cell) => typeof cell === "string")

/** Type guard for `ReadonlyArray<Tag>`: every element must satisfy `isValidTag`. */
export const isValidTagsArray = (value: unknown): value is ReadonlyArray<Tag> =>
  Array.isArray(value) && value.every(isValidTag)

/** A NIP-01 event template — every field a signer needs except `id`, `pubkey`, and `sig`. The output of every `build*` function and the input to `Signer.signEvent`. */
export interface UnsignedEvent {
  readonly kind: number
  readonly content: string
  readonly tags: ReadonlyArray<Tag>
  readonly created_at: number
}

/**
 * An event with a stable identity but no signature — `UnsignedEvent` plus `id` and `pubkey`.
 * This is the honest type for a NIP-17 rumor: unsigned by design, identified by its own computed
 * NIP-01 id. The render/transform pipeline accepts this so an unsigned rumor renders through the
 * same path as a signed event. `NostrEvent` is assignable to it — prefer `NostrEvent` everywhere an
 * event is genuinely signed; reach for `RenderableEvent` only where an unsigned rumor may appear.
 */
export interface RenderableEvent extends UnsignedEvent {
  readonly id: EventId
  readonly pubkey: PublicKey
}

/** A NIP-01 signed event — `RenderableEvent` plus the branded `sig` field produced by signing. */
export interface NostrEvent extends RenderableEvent {
  readonly sig: Sig
}
