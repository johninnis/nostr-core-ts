import type { RumourParseFailure } from "../failure/rumour-parse-failure.ts"
import type { Rumour, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { EventToSign } from "./event-id.ts"
import { computeEventId } from "./event-id.ts"
import { parseEventToSign, parseUnsignedEvent } from "./event-utils.ts"
import { isRecord } from "./guards.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { extractPubkeys } from "./tags.ts"
import { kindCategory } from "../value-object/kinds.ts"

const withAddressIdentifier = <T extends UnsignedEvent>(template: T): T =>
  kindCategory(template.kind) === "addressable" && !template.tags.some(([name]) => name === "d")
    ? { ...template, tags: [...template.tags, ["d", ""]] }
    : template

/**
 * Check an event template is a NIP-01 event before it is signed, returning its four fields and no other key — the gate
 * every `Signer`'s `signEvent` runs first, so a local, extension or bunker signer refuses the same programmer error the
 * same way. Throws `InvalidArgumentError` for a `kind` that is not an integer from 0 to 65535, a `created_at` that is
 * not a non-negative safe integer, or `tags` / `content` of the wrong shape. An addressable kind with no `d` tag gains
 * `["d", ""]`, so every event signed carries its identifier (shared ADR-0007). Synchronous.
 */
export const buildUnsignedEvent = (event: UnsignedEvent): UnsignedEvent => {
  const template = parseUnsignedEvent(event)
  if (template === null) throw new InvalidArgumentError("An event to sign is not a NIP-01 event")
  return withAddressIdentifier(template)
}

const rumourOf = (fields: EventToSign): Rumour => ({ ...fields, id: computeEventId(fields) })

/**
 * Attach the computed NIP-01 `id` to an unsigned event, producing a NIP-59 rumour ready for `buildDmGiftWraps` — the
 * one gate every event this package signs or wraps passes, so nothing it hashes is an event `parseNostrEvent` refuses.
 * Only the five rumour fields are kept. Throws `InvalidArgumentError` when `event` is not a NIP-01 event: a `kind` that
 * is not an integer from 0 to 65535, a `created_at` that is not a non-negative safe integer, a `pubkey` that is not a
 * public key, or `tags` / `content` of the wrong shape. An addressable kind with no `d` tag gains `["d", ""]` before it
 * is hashed, as `buildUnsignedEvent` adds it (shared ADR-0007). Synchronous.
 */
export const buildRumour = (event: EventToSign): Rumour => {
  const fields = parseEventToSign(event)
  if (fields === null) throw new InvalidArgumentError("An event to sign is not a NIP-01 event")
  return rumourOf(withAddressIdentifier(fields))
}

/**
 * Read `value` as a NIP-59 rumour (an unsigned event with a known author pubkey). Its `id` must be present (NIP-17:
 * "Fields `id` and `created_at` are required") and equal the id computed from the other fields. Returns
 * `rumour-malformed` when the `id` is missing or any other field is invalid or missing, and `rumour-id-mismatch` when
 * the `id` is anything but the computed id, a value that is not an event id at all included. Synchronous.
 */
export const parseRumour = (value: unknown): Result<Rumour, RumourParseFailure> => {
  const fields = parseEventToSign(value)
  if (fields === null || !isRecord(value) || value.id === undefined) return failure("rumour-malformed")
  const rumour = rumourOf(fields)
  return value.id === rumour.id ? ok(rumour) : failure("rumour-id-mismatch")
}

/**
 * The members of the NIP-17 chat room `rumour` belongs to: its author and every pubkey its `p` tags name, once each and
 * sorted, so two rumours are in the same room exactly when their members are equal (NIP-17: "The set of `pubkey` + `p`
 * tags defines a chat room. If a new `p` tag is added or a current one is removed, a new room is created").
 */
export const chatRoomMembers = (rumour: Rumour): ReadonlyArray<PublicKey> =>
  [...new Set([rumour.pubkey, ...extractPubkeys(rumour.tags)])].toSorted()
