import type { EventId } from "./event-id.ts"
import type { PublicKey } from "./public-key.ts"
import type { Sig } from "./sig.ts"

export type Tag = readonly [string, ...ReadonlyArray<string>]

/** Type guard for the `Tag` shape: a non-empty array of strings. */
export const isValidTag = (value: unknown): value is Tag =>
  Array.isArray(value) && value.length >= 1 && value.every((cell) => typeof cell === "string")

/** Type guard for `ReadonlyArray<Tag>`: every element must satisfy `isValidTag`. */
export const isValidTagsArray = (value: unknown): value is ReadonlyArray<Tag> =>
  Array.isArray(value) && value.every(isValidTag)

export interface UnsignedEvent {
  readonly kind: number
  readonly content: string
  readonly tags: ReadonlyArray<Tag>
  readonly created_at: number
}

export interface NostrEvent extends UnsignedEvent {
  readonly id: EventId
  readonly pubkey: PublicKey
  readonly sig: Sig
}
